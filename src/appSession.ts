// src/appSession.ts

import { createSceneContext } from './scene';
import { MirisAdapter } from './mirisAdapter';
import { Compositor } from './compositor';
import { getMirisConfig } from './config/mirisEnv';
import type { SceneContext } from './scene';
import { getCameraStateFromUrl, updateUrlFromCamera, debounce } from './utils/urlState';
import type { CameraState } from './utils/urlState';
import { loadSceneFromBuiltinId, loadSceneFromFile, createBlankScene } from './scene/sceneLoader';
import type { SceneDefinition } from './scene/sceneDefinition';

export type AppSession = {
    compositor: Compositor;
    sceneContext: SceneContext;
    dispose: () => void;
};

function ensureAppMount(): HTMLElement {
    let app = document.getElementById('app');

    if (!app) {
        app = document.createElement('div');
        app.id = 'app';
        document.body.appendChild(app);
        console.info('[dom] created #app mount');
    } else {
        console.info('[dom] reusing existing #app mount');
    }

    return app;
}

function addStatusBadge(message: string): void {
    let badge = document.getElementById('app-status-badge');

    setTimeout(() => {
        const badge = document.getElementById('app-status-badge');
        if (badge) {
            badge.style.opacity = '0';
            badge.style.transition = 'opacity 0.5s ease-out';
            setTimeout(() => badge.remove(), 500);
        }
    }, 4500);

    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'app-status-badge';

        Object.assign(badge.style, {
            position: 'fixed',
            bottom: '12px',
            left: '12px',
            padding: '8px 12px',
            background: 'rgba(15, 23, 42, 0.85)',
            color: '#e2e8f0',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            borderRadius: '8px',
            zIndex: '1000',
            pointerEvents: 'none',
        });

        document.body.appendChild(badge);
    }

    badge.textContent = message;
    console.info('[dom] status badge set:', message);
}

export async function startAppSession(): Promise<AppSession> {
    console.group('[session] start');
    console.time('[session] total');

    let currentAppSession: AppSession | null = null;
    let currentSceneId: string | null = null;
    let currentViewerKey: string | undefined = undefined;

    const config = getMirisConfig();

    async function loadSceneDefinition(state: CameraState | null): Promise<SceneDefinition> {
        if (state?.scene) {
            currentSceneId = state.scene;
            try {
                return await loadSceneFromBuiltinId(state.scene);
            } catch (e) {
                console.error(`[session] failed to load scene from hash: ${state.scene}`, e);
            }
        }

        const defaultSceneId = config.defaultScene;
        if (defaultSceneId) {
            try {
                const scene = await loadSceneFromBuiltinId(defaultSceneId);
                currentSceneId = defaultSceneId;
                return scene;
            } catch (e) {
                console.error(`[session] failed to load default scene: ${defaultSceneId}`, e);
            }
        }

        currentSceneId = null;
        return createBlankScene();
    }

    const uiPromise = createSceneUI(async (file) => {
        const newScene = await loadSceneFromFile(file);
        currentSceneId = null;
        initSession(newScene);
    }, async (id) => {
        currentSceneId = id;
        try {
            const newScene = await loadSceneFromBuiltinId(id);
            initSession(newScene);
        } catch (e) {
            console.error(`[session] failed to load scene: ${id}`, e);
            initSession(createBlankScene());
        }
    });

    async function initSession(sceneDefinition: SceneDefinition, initialState?: CameraState) {
        if (currentAppSession) {
            currentAppSession.dispose();
            currentAppSession = null;
        }

        const resolvedKeys: Record<string, string> = {};
        if (config.viewerKeys) {
            Object.assign(resolvedKeys, config.viewerKeys);
        }
        if (sceneDefinition.viewerKeys) {
            for (const group of sceneDefinition.viewerKeys) {
                Object.assign(resolvedKeys, group);
            }
        }

        const resolveKey = (key: string | undefined): string | undefined => {
            if (!key) return undefined;
            if (resolvedKeys[key]) return resolvedKeys[key];
            
            // If the key is not in the map, it might be a raw viewer key itself.
            // Miris keys are typically base64-like strings around 43-44 characters.
            // If it looks like a key, we use it directly.
            if (key.length >= 40) {
                return key;
            }

            // Otherwise, it's likely an alias that we don't have a value for,
            // so we return undefined to fall back to config.viewerKey.
            return undefined;
        };

        const sceneViewerKey = resolveKey(sceneDefinition.viewerKey) || config.viewerKey;
        currentViewerKey = sceneViewerKey;

        console.info('[config] resolved', {
            configViewerKey: config.viewerKey,
            sceneViewerKey: sceneViewerKey,
            resolvedKeysCount: Object.keys(resolvedKeys).length,
            config,
        });

        const mount = ensureAppMount();
        mount.innerHTML = '';

        addStatusBadge(
            sceneViewerKey
                ? 'Miris compositor: viewer key configured'
                : 'Miris compositor: fallback only, set VITE_MIRIS_VIEWER_KEY',
        );

        // Ensure UI is initialized (waits for createSceneUI to finish if it's the first call)
        await uiPromise;

        // Immediately update URL to reflect the new scene ID if we have one
        if (currentSceneId) {
            updateUrlFromCamera(null as any, null as any, null, currentSceneId);
        }

        const sceneContext = createSceneContext(mount, sceneViewerKey);
        await sceneContext.mirisReady;

        const mirisAdapter = new MirisAdapter(sceneContext.scene);
        const compositor = new Compositor(sceneContext, mirisAdapter);

        compositor.setOnStatusChanged((message) => {
            if (message) {
                addStatusBadge(message);
            }
        });

        compositor.addDebugGround();
        
        try {
            await compositor.loadScene(sceneDefinition);
        } catch (error) {
            console.error('[session] failed to fully load scene assets', error);
            addStatusBadge('Failed to load some scene assets');
        } finally {
            compositor.start();
            try {
                await compositor.ready;
            } catch (readyError) {
                console.warn('[session] compositor.ready failed, but continuing', readyError);
            }
        }

        const debouncedUpdateUrl = debounce(() => {
            if (isApplyingUrlState) return;
            console.log('[session] debounced update url, currentSceneId:', currentSceneId);
            updateUrlFromCamera(sceneContext.camera, sceneContext.cameraAnchor, compositor.getSelectedAssetId(), currentSceneId);
        }, 500);

        sceneContext.controls.setOnChange(debouncedUpdateUrl);
        compositor.setOnSelectionChanged(() => {
            debouncedUpdateUrl();
        });

        let isApplyingUrlState = false;
        const applyState = (state: CameraState) => {
            console.log('[session] applyState', state);
            isApplyingUrlState = true;
            
            try {
                const hasCoordinates = state.cx !== undefined && state.cy !== undefined && state.cz !== undefined &&
                                     state.qx !== undefined && state.qy !== undefined && state.qz !== undefined && state.qw !== undefined;

                if (state.aid) {
                    const smooth = !hasCoordinates;
                    const requestLock = !hasCoordinates;
                    compositor.selectAsset(state.aid, smooth, requestLock, true);
                } else if (hasCoordinates || state.sid) {
                    if (hasCoordinates && !state.aid) {
                        compositor.selectAsset(null, false, false, true);
                    }
                } else if (state.aid === null) {
                    compositor.selectAsset(null, false, false, true);
                }

                if (state.sid !== undefined && state.sid !== state.aid) {
                    compositor.selectAsset(state.sid || null, false, false, false);
                }

                if (hasCoordinates) {
                    sceneContext.camera.position.set(state.cx!, state.cy!, state.cz!);
                    sceneContext.camera.quaternion.set(state.qx!, state.qy!, state.qz!, state.qw!).normalize();
                    sceneContext.camera.updateMatrixWorld();
                    sceneContext.controls.getEuler().setFromQuaternion(sceneContext.camera.quaternion);
                }
            } catch (e) {
                console.warn('[session] error in applyState selection/camera sync:', e);
            } finally {
                updateUrlFromCamera(sceneContext.camera, sceneContext.cameraAnchor, compositor.getSelectedAssetId(), currentSceneId);
                isApplyingUrlState = false;
            }
        };

        if (initialState) {
            applyState(initialState);
        } else {
             // If no explicit state but scene has initial camera, use it
             if (sceneDefinition.initialCamera) {
                const { position, rotation } = sceneDefinition.initialCamera;
                sceneContext.camera.position.set(position[0], position[1], position[2]);
                sceneContext.camera.rotation.set(rotation[0], rotation[1], rotation[2]);
                sceneContext.camera.updateMatrixWorld();
                sceneContext.controls.getEuler().setFromQuaternion(sceneContext.camera.quaternion);
            }
            // Ensure hash is updated even if no initialState was provided
            updateUrlFromCamera(sceneContext.camera, sceneContext.cameraAnchor, compositor.getSelectedAssetId(), currentSceneId);
        }

        const onHashChange = async () => {
            if (isApplyingUrlState) return;
            const state = getCameraStateFromUrl();
            if (!state) return;

            // If scene changed in hash
            if (state.scene !== undefined && state.scene !== currentSceneId) {
                const newScene = await loadSceneDefinition(state);
                
                // Check if we need to reload context due to viewer key change
                const newResolvedKeys: Record<string, string> = {};
                if (config.viewerKeys) Object.assign(newResolvedKeys, config.viewerKeys);
                if (newScene.viewerKeys) {
                    for (const group of newScene.viewerKeys) Object.assign(newResolvedKeys, group);
                }
                const newSceneViewerKey = (newScene.viewerKey && newResolvedKeys[newScene.viewerKey]) || newScene.viewerKey || config.viewerKey;

                if (newSceneViewerKey !== currentViewerKey) {
                    console.info('[session] viewer key changed, full reload');
                    initSession(newScene, state);
                    return;
                } else {
                    console.info('[session] scene changed, updating compositor');
                    currentSceneId = state.scene || null;
                    try {
                        await compositor.loadScene(newScene);
                    } catch (e) {
                        console.error('[session] failed to load scene into existing compositor', e);
                    }
                    applyState(state);
                    return;
                }
            }

            applyState(state);
        };

        window.addEventListener('hashchange', onHashChange);

        const dispose = () => {
            console.group('[session] dispose');
            window.removeEventListener('hashchange', onHashChange);
            try {
                compositor.dispose();
            } catch (error) {
                console.error('[compositor] dispose failed', error);
            }
            try {
                sceneContext.dispose();
            } catch (error) {
                console.error('[scene] dispose failed', error);
            }
            console.groupEnd();

            const badge = document.getElementById('app-status-badge');
            if (badge) badge.remove();
            
            // We don't remove the UI on dispose anymore to avoid it disappearing during scene reloads
            // const ui = document.getElementById('scene-ui-container');
            // if (ui) ui.remove();
        };

        currentAppSession = { compositor, sceneContext, dispose };
    }

    try {
        const initialState = getCameraStateFromUrl();
        const initialScene = await loadSceneDefinition(initialState);
        await initSession(initialScene, initialState || undefined);

        return {
            get compositor() { return currentAppSession!.compositor; },
            get sceneContext() { return currentAppSession!.sceneContext; },
            dispose: () => currentAppSession?.dispose(),
        };
    } catch (error) {
        console.error('[session] start failed', error);
        throw error;
    } finally {
        console.timeEnd('[session] total');
        console.groupEnd();
    }
}

async function createSceneUI(onFilePick: (file: File) => void, onBuiltinPick: (id: string) => void) {
    let container = document.getElementById('scene-ui-container');
    if (container) container.remove();

    container = document.createElement('div');
    container.id = 'scene-ui-container';
    Object.assign(container.style, {
        position: 'fixed',
        top: '12px',
        left: '12px',
        zIndex: '1000',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: 'flex-start',
    });

    const btn = document.createElement('button');
    btn.textContent = 'Load Scene';
    Object.assign(btn.style, {
        padding: '8px 16px',
        background: '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: 'bold',
    });

    const menu = document.createElement('div');
    Object.assign(menu.style, {
        display: 'none',
        background: 'white',
        border: '1px solid #ccc',
        borderRadius: '6px',
        padding: '8px',
        flexDirection: 'column',
        gap: '4px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        maxHeight: '400px',
        overflowY: 'auto',
    });

    try {
        const response = await fetch('./scenes/manifest.json');
        if (!response.ok) throw new Error('Failed to load scenes manifest');
        const publicScenes = await response.json() as { id: string, label: string }[];

        publicScenes.forEach(scene => {
            const item = document.createElement('button');
            item.textContent = scene.label;
            Object.assign(item.style, {
                color: 'black',
                padding: '4px 8px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
            });
            item.onmouseover = () => item.style.background = '#f3f4f6';
            item.onmouseout = () => item.style.background = 'none';
            item.onclick = () => {
                onBuiltinPick(scene.id);
                menu.style.display = 'none';
            };
            menu.appendChild(item);
        });
    } catch (e) {
        console.error('[ui] failed to load public scenes', e);
        const errorMsg = document.createElement('div');
        errorMsg.textContent = 'Failed to load scenes';
        errorMsg.style.color = 'red';
        errorMsg.style.fontSize = '10px';
        menu.appendChild(errorMsg);
    }

    const divider = document.createElement('div');
    divider.style.height = '1px';
    divider.style.background = '#ccc';
    divider.style.margin = '4px 0';
    menu.appendChild(divider);

    const fileBtn = document.createElement('button');
    fileBtn.textContent = 'Open Local File...';
    Object.assign(fileBtn.style, {
        color: 'black',
        padding: '4px 8px',
        textAlign: 'left',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontStyle: 'italic',
    });
    fileBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) onFilePick(file);
        };
        input.click();
        menu.style.display = 'none';
    };
    menu.appendChild(fileBtn);

    btn.onclick = (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    };

    btn.onpointerdown = (e) => e.stopPropagation();
    btn.onmousedown = (e) => e.stopPropagation();

    menu.onpointerdown = (e) => e.stopPropagation();
    menu.onmousedown = (e) => e.stopPropagation();
    menu.onclick = (e) => e.stopPropagation();

    container.appendChild(btn);
    container.appendChild(menu);
    document.body.appendChild(container);
}