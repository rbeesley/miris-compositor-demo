import { createSceneContext } from './scene';
import { MirisAdapter } from './mirisAdapter';
import { Compositor } from './compositor';
import { getMirisConfig } from './config/mirisEnv';
import type { SceneContext } from './scene';
// import { tokyoMarketScene } from './scene/scenes/tokyoMarketScene';
import { tokyoMarketScene } from './scene/scenes/tokyoMarketSceneMirisPlayer';
// import { tokyoMarketScene } from './scene/scenes/tokyoMarketSceneMixedViewerKeys';
import { getCameraStateFromUrl, updateUrlFromCamera, debounce } from './utils/urlState';
import type { CameraState } from './utils/urlState';

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
            badge.remove();
        }
    }, 5000);

    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'app-status-badge';

        Object.assign(badge.style, {
            position: 'fixed',
            top: '12px',
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

    try {
        const config = getMirisConfig();
        const resolvedKeys: Record<string, string> = {};
        if (config.viewerKeys) {
            Object.assign(resolvedKeys, config.viewerKeys);
        }
        if (tokyoMarketScene.viewerKeys) {
            for (const group of tokyoMarketScene.viewerKeys) {
                Object.assign(resolvedKeys, group);
            }
        }

        // Helper to resolve a key from literal or group
        const resolveKey = (key: string | undefined): string | undefined => {
            if (!key) return undefined;
            // If the key exists in our map, use the mapped value
            if (resolvedKeys[key]) return resolvedKeys[key];
            // Otherwise, it might be a literal key
            return key;
        };

        const sceneViewerKey = resolveKey(tokyoMarketScene.viewerKey) || config.viewerKey;

        console.info('[config] resolved', {
            configViewerKey: config.viewerKey,
            sceneViewerKey: sceneViewerKey,
            resolvedKeysCount: Object.keys(resolvedKeys).length,
            config,
        });

        const mount = ensureAppMount();
        console.info('[dom] clearing mount');
        mount.innerHTML = '';

        addStatusBadge(
            sceneViewerKey
                ? 'Miris compositor: viewer key configured'
                : 'Miris compositor: fallback only, set VITE_MIRIS_VIEWER_KEY',
        );

        console.time('[session] createSceneContext');
        const sceneContext = createSceneContext(mount, sceneViewerKey);
        console.timeEnd('[session] createSceneContext');
        console.info('[scene] context created', sceneContext);

        console.time('[session] mirisReady');
        console.info('[session] awaiting mirisReady...');
        await sceneContext.mirisReady;
        console.timeEnd('[session] mirisReady');
        console.info('[session] Miris context is ready');

        console.time('[session] createMirisAdapter');
        const mirisAdapter = new MirisAdapter(sceneContext.scene);
        console.timeEnd('[session] createMirisAdapter');
        console.info('[miris] adapter created', mirisAdapter);

        console.time('[session] createCompositor');
        const compositor = new Compositor(sceneContext, mirisAdapter);
        console.timeEnd('[session] createCompositor');
        console.info('[compositor] created', compositor);

        console.time('[session] addDebugGround');
        compositor.addDebugGround();
        console.timeEnd('[session] addDebugGround');
        console.info('[compositor] debug ground added');

        console.time('[session] loadScene');
        await compositor.loadScene(tokyoMarketScene);
        console.timeEnd('[session] loadScene');
        console.info('[compositor] scene loaded');

        console.time('[session] start');
        compositor.start();
        console.timeEnd('[session] start');
        console.info('[compositor] started');

        console.time('[session] compositor.ready');
        await compositor.ready;
        console.timeEnd('[session] compositor.ready');
        console.info('[session] Miris scene + streams fully ready');

        const onHashChange = () => {
            if (isApplyingUrlState) return;
            const state = getCameraStateFromUrl();
            if (state) {
                applyState(state);
            }
        };
        
        let isApplyingUrlState = false;
        const applyState = (state: CameraState) => {
            console.log('[session] applyState', state);
            isApplyingUrlState = true;
            
            const hasCoordinates = state.cx !== undefined && state.cy !== undefined && state.cz !== undefined &&
                                 state.qx !== undefined && state.qy !== undefined && state.qz !== undefined && state.qw !== undefined;

            // 1. Establish anchor (aid)
            if (state.aid) {
                // If we have coordinates, we just want to force the anchor without focusing
                // If we don't have coordinates, we want to simulate a link click (anchor + focus)
                const smooth = !hasCoordinates;
                const requestLock = !hasCoordinates;
                compositor.selectAsset(state.aid, smooth, requestLock, true);
            } else if (hasCoordinates || state.sid) {
                // If coordinates are present but no aid, or if sid is present but no aid, ensure we are decoupled
                // if aid is explicitly missing in a partial state that has sid, we might not want to decouple if we were anchored?
                // The user said: "If it is only an sid, aid remains the same as it currently is, but we select the sid asset."
                // So if state.aid is undefined, we DO NOT call selectAsset(null) unless it's explicitly 'null' or if we are applying a full state without aid.
                if (hasCoordinates && !state.aid) {
                    compositor.selectAsset(null, false, false, true);
                }
            } else if (state.aid === null) {
                compositor.selectAsset(null, false, false, true);
            }

            // 2. Apply explicit selection if present (sid)
            if (state.sid !== undefined && state.sid !== state.aid) {
                compositor.selectAsset(state.sid || null, false, false, false);
            }

            // 3. Apply coordinates if all are present
            if (hasCoordinates) {
                sceneContext.camera.position.set(state.cx!, state.cy!, state.cz!);
                sceneContext.camera.quaternion.set(state.qx!, state.qy!, state.qz!, state.qw!).normalize();
                sceneContext.camera.updateMatrixWorld();
                sceneContext.controls.getEuler().setFromQuaternion(sceneContext.camera.quaternion);
            }
            
            // Re-sync URL immediately if we're now anchored to ensure any rounding is captured
            updateUrlFromCamera(sceneContext.camera, sceneContext.cameraAnchor, compositor.getSelectedAssetId());
            isApplyingUrlState = false;
        };
        // Restore camera state if present in URL
        const cameraState = getCameraStateFromUrl();
        if (cameraState) {
            console.info('[session] restoring camera state from URL', cameraState);
            applyState(cameraState);
        }

        // Setup URL sync
        const debouncedUpdateUrl = debounce(() => {
            if (isApplyingUrlState) return;
            updateUrlFromCamera(sceneContext.camera, sceneContext.cameraAnchor, compositor.getSelectedAssetId());
        }, 500);
        sceneContext.controls.setOnChange(debouncedUpdateUrl);
        compositor.setOnSelectionChanged(() => {
            debouncedUpdateUrl();
        });

        window.addEventListener('hashchange', onHashChange);

        const dispose = () => {
            console.group('[session] dispose');
            window.removeEventListener('hashchange', onHashChange);
            try {
                console.info('[compositor] disposing');
                compositor.dispose();
            } catch (error) {
                console.error('[compositor] dispose failed', error);
            }

            try {
                console.info('[scene] disposing');
                sceneContext.dispose();
            } catch (error) {
                console.error('[scene] dispose failed', error);
            }
            console.groupEnd();

            const badge = document.getElementById('app-status-badge');
            if (badge) {
                badge.remove();
            }
        };

        return { compositor, sceneContext, dispose };
    } catch (error) {
        console.error('[session] start failed', error);
        throw error;
    } finally {
        console.timeEnd('[session] total');
        console.groupEnd();
    }
}