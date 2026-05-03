// src/compositor.ts

import * as THREE from 'three';
import type { SceneContext } from './scene';
import type { LoadedMirisAsset, MirisAdapter } from './mirisAdapter';
import type { SceneDefinition } from './scene/sceneDefinition';
import type { SceneNodeDefinition, DepthBand, SceneNodePriority } from './scene/sceneTypes';

import { getMirisConfig } from './config/mirisEnv';

interface ResolvedSceneNodeDefinition extends SceneNodeDefinition {
    priority: SceneNodePriority;
}

interface RuntimeAsset {
    config: ResolvedSceneNodeDefinition;
    loaded: LoadedMirisAsset;
    priorityScore: number;
    streamLoaded: boolean;
}

export class Compositor {
    private readonly runtimeAssets = new Map<string, RuntimeAsset>();
    private isRunning = false;

    private readonly sceneContext: SceneContext;
    private readonly mirisAdapter: MirisAdapter;
    private mirisSceneLoaded = false;
    private readonly pendingStreamLoads = new Set<string>();
    private readonly streamQueue: string[] = [];
    private allStreamsLoadedOnce = false;
    private sceneLoadStartTime = 0;
    private hasReportedTimeout = false;
    private readyResolve?: () => void;
    readonly ready: Promise<void>;

    private hoveredAssetId: string | null = null;
    private selectedAssetId: string | null = null;
    private anchorAssetId: string | null = null;
    private onSelectionChanged: ((id: string | null) => void) | null = null;
    private onStatusChanged: ((message: string | null) => void) | null = null;
    private lastClickTime = 0;
    private static readonly DOUBLE_CLICK_THRESHOLD = 300;
    private readonly raycaster = new THREE.Raycaster();
    private readonly mouse = new THREE.Vector2();
    private isPointerLocked = false;

    private lastMouseMoveTime = 0;
    private readonly HOVER_FADE_DELAY = 1500; // ms before hover fades

    // Selection thresholding
    private isMouseDown = false;
    private selectionCancelled = false;
    private readonly mouseDownPosition = new THREE.Vector2();
    private readonly SELECTION_MOVE_THRESHOLD = 5; // pixels
    private isClickInUI = false;

    constructor(sceneContext: SceneContext, mirisAdapter: MirisAdapter) {
        this.sceneContext = sceneContext;
        this.mirisAdapter = mirisAdapter;

        this.ready = new Promise<void>((resolve) => {
            this.readyResolve = resolve;
        });

        this.attachMirisSceneListeners();
        this.addEventListeners();
        this.createFocusUI();
        this.createCameraDebugUI();
    }

    private readonly onPointerLockChange = (): void => {
        const canvas = this.sceneContext.mount.querySelector('canvas');
        this.isPointerLocked = document.pointerLockElement === canvas;
    };

    private addEventListeners(): void {
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mouseup', this.onMouseUp);
        window.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
    }

    private removeEventListeners(): void {
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    }

    private readonly onMouseMove = (event: MouseEvent): void => {
        this.lastMouseMoveTime = performance.now();
        if (this.isPointerLocked || this.isClickInUI) return;

        const rect = this.sceneContext.mount.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (this.isMouseDown && !this.selectionCancelled) {
            const dx = event.clientX - this.mouseDownPosition.x;
            const dy = event.clientY - this.mouseDownPosition.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > this.SELECTION_MOVE_THRESHOLD) {
                this.selectionCancelled = true;
            }
        }
        
        this.updateHover();
    };

    private readonly onMouseDown = (event: MouseEvent): void => {
        if (event.button !== 0) return; // Only LMB
        if (this.isPointerLocked) return;

        // Ignore clicks originating from the UI
        const target = event.target as HTMLElement;
        if (target.closest('#focus-info-panel')) {
            this.isClickInUI = true;
            return;
        }
        
        this.isClickInUI = false;
        this.isMouseDown = true;
        this.selectionCancelled = false;
        this.mouseDownPosition.set(event.clientX, event.clientY);
    };

    private readonly onMouseUp = (event: MouseEvent): void => {
        if (event.button !== 0) return;
        
        if (this.isClickInUI) {
            this.isClickInUI = false;
            return;
        }

        if (!this.isMouseDown) return;
        
        const wasCancelled = this.selectionCancelled;
        this.isMouseDown = false;
        this.selectionCancelled = false;

        if (wasCancelled) return;

        // Threshold check: if mouse moved significantly, it's a drag/navigation, not a click
        const dx = event.clientX - this.mouseDownPosition.x;
        const dy = event.clientY - this.mouseDownPosition.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.SELECTION_MOVE_THRESHOLD) return;

        // WASD check: if any movement key is pressed, don't select
        if (this.sceneContext.controls.isMoving()) return;

        const now = performance.now();
        const isDoubleClick = (now - this.lastClickTime) < Compositor.DOUBLE_CLICK_THRESHOLD;
        this.lastClickTime = now;

        if (this.hoveredAssetId) {
            if (isDoubleClick) {
                console.log(`[compositor] double click on ${this.hoveredAssetId}`);
                // Double click: anchor to the asset and smooth pan look at it
                this.selectAsset(this.hoveredAssetId, true, false);
            } else {
                // Single click: update selection and highlight, but don't change anchor or smooth pan
                console.log(`[compositor] single click on ${this.hoveredAssetId}`);
                this.selectAsset(this.hoveredAssetId, false, false);
            }
        } else {
            // Clicked empty space: clear the selection
            // ONLY if we were not already empty. This avoids redundant calls.
            if (this.selectedAssetId !== null) {
                console.log('[compositor] clicked empty space');
                this.selectAsset(null);
            }
        }
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (this.isMouseDown) {
            if (event.code === 'KeyW' || event.code === 'KeyS' || event.code === 'KeyA' || event.code === 'KeyD' || event.code === 'Escape') {
                this.selectionCancelled = true;
            }
        }

        if (event.code === 'Escape') {
            if (!this.isMouseDown) {
                this.anchorAssetId = null;
                this.selectAsset(null);
            }
        } else if (event.code === 'Backspace') {
            if (this.selectedAssetId) {
                const current = this.runtimeAssets.get(this.selectedAssetId);
                if (current?.config.parentId) {
                    this.selectAsset(current.config.parentId, true, false);
                } else {
                    this.anchorAssetId = null;
                    this.selectAsset(null);
                }
            }
        }
    };

    private updateHover(): void {
        this.raycaster.setFromCamera(this.mouse, this.sceneContext.camera);

        const candidates: { id: string; distanceToCenter: number; zDepth: number }[] = [];
        
        for (const [id, asset] of this.runtimeAssets) {
            const intersects = this.raycaster.intersectObject(asset.loaded.root, true);
            
            if (intersects.length > 0) {
                const first = intersects[0];
                const worldCenter = new THREE.Vector3();
                asset.loaded.root.getWorldPosition(worldCenter);
                const distanceToCenter = this.raycaster.ray.distanceToPoint(worldCenter);
                
                candidates.push({
                    id,
                    distanceToCenter,
                    zDepth: first.distance
                });
            }
        }

        if (candidates.length === 0) {
            this.setHovered(null);
            return;
        }

        candidates.sort((a, b) => {
            if (Math.abs(a.distanceToCenter - b.distanceToCenter) < 0.01) {
                return a.zDepth - b.zDepth;
            }
            return a.distanceToCenter - b.distanceToCenter;
        });

        this.setHovered(candidates[0].id);
    }

    private setHovered(id: string | null): void {
        if (this.hoveredAssetId === id) {
            // If already hovered, and we're just refreshing due to mouse move,
            // we'll reset the fade in the tick loop.
            return;
        }

        if (this.hoveredAssetId && this.hoveredAssetId !== this.selectedAssetId) {
            const prev = this.runtimeAssets.get(this.hoveredAssetId);
            if (prev) this.mirisAdapter.setOutlineState(prev.loaded, 'none');
        }

        this.hoveredAssetId = id;

        if (this.hoveredAssetId && this.hoveredAssetId !== this.selectedAssetId) {
            const current = this.runtimeAssets.get(this.hoveredAssetId);
            if (current) this.mirisAdapter.setOutlineState(current.loaded, 'hover');
        }
    }

    public selectAsset(id: string | null, smooth = false, requestLock = false, forceAnchor = false): void {
        const isDoubleClick = smooth && !requestLock; // Our convention from onMouseUp
        const isLinkClick = smooth && requestLock;    // Our convention from UI links
        
        const selectionChanged = id !== this.selectedAssetId;

        // Double-click or link click on different asset triggers anchoring
        const shouldUpdateAnchor = forceAnchor || isDoubleClick || (isLinkClick && id !== this.anchorAssetId);
        const shouldFocus = isDoubleClick || isLinkClick;
        console.log(`[compositor] id: ${id}, forceAnchor: ${forceAnchor}, isDoubleClick: ${isDoubleClick}, isLinkClick: ${isLinkClick}, shouldUpdateAnchor: ${shouldUpdateAnchor}, shouldFocus: ${shouldFocus}`);

        if (this.selectedAssetId && this.selectedAssetId !== id) {
            const prev = this.runtimeAssets.get(this.selectedAssetId);
            if (prev) {
                this.mirisAdapter.setOutlineState(prev.loaded, 'none');
                if (this.hoveredAssetId === this.selectedAssetId) {
                    this.mirisAdapter.setOutlineState(prev.loaded, 'hover');
                }
            }
        }
        
        const oldAnchorId = this.anchorAssetId;
        if (shouldUpdateAnchor) {
            this.anchorAssetId = id;
        }

        const anchor = this.sceneContext.cameraAnchor;
        const isCurrentlyAnchored = anchor.parent !== this.sceneContext.scene;
        const isActuallyChangingAnchor = shouldUpdateAnchor || (id !== this.selectedAssetId && isCurrentlyAnchored && !this.anchorAssetId);

        if (isActuallyChangingAnchor && oldAnchorId) {
            console.log(`[compositor] decoupling anchor: oldAnchorId=${oldAnchorId}, newId=${id}`);
            this.decoupleAnchor();
            // restore if we just cleared it but intended to set a new one
            this.anchorAssetId = shouldUpdateAnchor ? id : null;
        }

        this.selectedAssetId = id;
        console.log(`[compositor] selectAsset(${id}, smooth=${smooth}, lock=${requestLock}) - anchored=${isCurrentlyAnchored}, changingAnchor=${isActuallyChangingAnchor}, anchorAsset=${this.anchorAssetId}`);

        if (selectionChanged && this.onSelectionChanged) {
            this.onSelectionChanged(id);
        }

        if (this.selectedAssetId) {
            const current = this.runtimeAssets.get(this.selectedAssetId);
            console.log(`[compositor] shouldUpdateAnchor ${shouldUpdateAnchor}, shouldFocus ${shouldFocus}`);
            if (current) {
                this.mirisAdapter.setOutlineState(current.loaded, 'selected');

                if (shouldUpdateAnchor) {
                    console.log(`[compositor] setting camera anchor to ${id}`);
                    const anchorParent = current.loaded.root;
                    const camera = this.sceneContext.camera;

                    // Before changing parent, we must preserve world transform
                    const worldPos = new THREE.Vector3();
                    const worldQuat = new THREE.Quaternion();
                    camera.getWorldPosition(worldPos);
                    camera.getWorldQuaternion(worldQuat);

                    anchorParent.add(anchor);
                    
                    anchor.position.set(0, 0, 0);
                    anchor.quaternion.set(0, 0, 0, 1);
                    
                    const parentScale = new THREE.Vector3();
                    anchorParent.getWorldScale(parentScale);

                    anchor.scale.set(
                        parentScale.x !== 0 ? 1 / parentScale.x : 1,
                        parentScale.y !== 0 ? 1 / parentScale.y : 1,
                        parentScale.z !== 0 ? 1 / parentScale.z : 1
                    );

                    anchorParent.updateMatrixWorld(true);
                    anchor.updateMatrixWorld(true);

                    anchor.worldToLocal(worldPos);
                    camera.position.copy(worldPos);
                    
                    const parentWorldQuat = new THREE.Quaternion();
                    anchor.getWorldQuaternion(parentWorldQuat);
                    camera.quaternion.copy(parentWorldQuat.invert().multiply(worldQuat));
                    
                    this.anchorAssetId = id; // Ensure this is set
                }

                // Smooth pan look at the selected asset (can be different from anchor)
                // We pass false for requestLock because we don't want to hide the mouse
                if (shouldFocus) {
                    console.log(`[compositor] setting focus target to ${id}`);
                    this.sceneContext.controls.setFocusTarget(current.loaded.root, smooth, false);
                }

                const container = document.getElementById('focus-info-panel');
                if (container) {
                    container.style.display = 'block';
                    const width = container.offsetWidth || 320;
                    this.sceneContext.controls.setSideOffset(width / 2);
                }
            }
            this.updateFocusUI(id);
        } else {
            this.anchorAssetId = null;
            this.decoupleAnchor();
            this.sceneContext.controls.setFocusTarget(null, false, false);
            this.sceneContext.controls.setSideOffset(0);
            this.updateFocusUI(null);
        }
    }

    public getSelectedAssetId(): string | null {
        return this.selectedAssetId;
    }

    public setOnSelectionChanged(callback: ((id: string | null) => void) | null): void {
        this.onSelectionChanged = callback;
    }

    public setOnStatusChanged(callback: (message: string | null) => void): void {
        this.onStatusChanged = callback;
    }

    private decoupleAnchor(): void {
        const anchor = this.sceneContext.cameraAnchor;
        const camera = this.sceneContext.camera;
        
        // If not parented to something other than scene, nothing to decouple
        if (anchor.parent === this.sceneContext.scene) {
            return;
        }
        
        console.log(`[compositor] decoupling anchor to world space`);

        // Before changing parent, we must preserve world transform
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        camera.getWorldPosition(worldPos);
        camera.getWorldQuaternion(worldQuat);

        // Attach anchor back to scene
        this.sceneContext.scene.add(anchor);
        anchor.position.set(0, 0, 0);
        anchor.quaternion.set(0, 0, 0, 1);
        anchor.scale.set(1, 1, 1);

        // Restore camera world transform (which is now local to anchor/scene)
        camera.position.copy(worldPos);
        camera.quaternion.copy(worldQuat);
    }

    private reportErrors(): void {
        const errorAssets: string[] = [];
        const timeoutAssets: string[] = [];
        const now = performance.now();
        const isTimeout = this.sceneLoadStartTime > 0 && (now - this.sceneLoadStartTime > 8000);

        for (const asset of this.runtimeAssets.values()) {
            if (asset.loaded.error) {
                errorAssets.push(asset.config.label || asset.config.id);
            } else if (isTimeout && asset.config.streamId && asset.loaded.placeholder.visible) {
                // If after 8 seconds the placeholder is still visible for a streamable asset,
                // and no explicit error was caught, consider it a timeout/SDK failure.
                timeoutAssets.push(asset.config.label || asset.config.id);
            }
        }

        if (errorAssets.length > 0 || timeoutAssets.length > 0) {
            if (this.onStatusChanged) {
                const totalFailed = errorAssets.length + timeoutAssets.length;
                this.onStatusChanged(`Warning: ${totalFailed} asset(s) failed to load (check viewer key)`);
            }
            
            if (timeoutAssets.length > 0) {
                console.warn('[compositor] Assets failed to replace placeholders (timeout):', timeoutAssets);
            }
        }
    }

    private checkLoadingTimeouts(): void {
        if (this.allStreamsLoadedOnce || this.hasReportedTimeout || this.sceneLoadStartTime === 0) return;

        const now = performance.now();
        if (now - this.sceneLoadStartTime > 8000) {
            this.hasReportedTimeout = true;
            this.reportErrors();
            
            // Even if not all streams loaded, we resolve ready so the app can continue
            console.warn('[compositor] loading timeout reached, resolving ready state anyway');
            if (this.readyResolve) {
                this.readyResolve();
                this.readyResolve = undefined;
            }
        }
    }

    private checkAllMirisReady(): void {
        // Check for explicitly recorded stream load errors
        this.reportErrors();

        if (this.allStreamsLoadedOnce) return;
        if (!this.mirisSceneLoaded) {
            console.debug('[compositor] still waiting for mirisSceneLoaded');
            return;
        }
        if (this.pendingStreamLoads.size > 0) {
            console.debug('[compositor] still waiting for streams:', Array.from(this.pendingStreamLoads));
            return;
        }

        this.allStreamsLoadedOnce = true;
        console.info('[compositor] all Miris streams loaded and MirisScene sceneloaded');

        if (this.readyResolve) {
            this.readyResolve();
            this.readyResolve = undefined;
        }
    }

    private attachMirisSceneListeners(): void {
        const mirisScene = this.sceneContext.scene;

        if (mirisScene && typeof mirisScene.addEventListener === 'function') {
            mirisScene.addEventListener('sceneloaded', (event: unknown) => {
                console.info('[compositor/mirisScene] sceneloaded', event);
                this.mirisSceneLoaded = true;
                this.checkAllMirisReady();
            });
            // If it already loaded before we attached (though we await in appSession now)
            if (mirisScene.isLoaded) {
                console.info('[compositor/mirisScene] already loaded');
                this.mirisSceneLoaded = true;
                this.checkAllMirisReady();
            }
        } else {
            console.warn('[compositor] mirisScene has no addEventListener; treating as always loaded');
            this.mirisSceneLoaded = true;
        }
    }

    async loadScene(sceneDef: SceneDefinition, skipInitialCamera = false): Promise<void> {
        this.sceneLoadStartTime = performance.now();
        this.hasReportedTimeout = false;
        this.allStreamsLoadedOnce = false;

        // Clear existing assets
        for (const asset of this.runtimeAssets.values()) {
            this.mirisAdapter.unload(asset.loaded);
        }
        this.runtimeAssets.clear();

        // Resolve viewer keys: Environment keys, then Scene definition keys
        const config = getMirisConfig();
        const resolvedKeys: Record<string, string> = {};
        if (config.viewerKeys) {
            Object.assign(resolvedKeys, config.viewerKeys);
        }
        if (sceneDef.viewerKeys) {
            for (const group of sceneDef.viewerKeys) {
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

        // Determine scene-level viewer key (inherited by nodes)
        const sceneViewerKey = resolveKey(sceneDef.viewerKey) || config.viewerKey;

        console.info('[compositor] resolving keys', {
            sceneViewerKey: sceneViewerKey ? (sceneViewerKey.length > 8 ? sceneViewerKey.substring(0, 8) + '...' : sceneViewerKey) : 'none',
            resolvedKeysCount: Object.keys(resolvedKeys).length
        });

        // Set initial camera if provided and not skipped
        if (!skipInitialCamera && sceneDef.initialCamera) {
            const cam = sceneDef.initialCamera;
            if (cam.position != undefined && (cam.position.length === 3) && (cam.position[0] != undefined) && (cam.position[1] != undefined) && (cam.position[2] != undefined)) {
                this.sceneContext.camera.position.set(cam.position[0], cam.position[1], cam.position[2]);
            }
            if (cam.zoom !== undefined) {
                this.sceneContext.camera.zoom = cam.zoom;
            }
            if (cam.quaternion != undefined && (cam.quaternion.length === 4) && (cam.quaternion[0] !== undefined) && (cam.quaternion[1] !== undefined) && (cam.quaternion[2] !== undefined) && (cam.quaternion[3] !== undefined)) {
                this.sceneContext.camera.quaternion.set(cam.quaternion[0], cam.quaternion[1], cam.quaternion[2], cam.quaternion[3]).normalize();
            } else if (cam.rotation != undefined && (cam.rotation.length === 3) && (cam.rotation[0] !== undefined) && (cam.rotation[1] !== undefined) && (cam.rotation[2] !== undefined)) {
                this.sceneContext.camera.rotation.set(cam.rotation[0], cam.rotation[1], cam.rotation[2]);
            }
            this.sceneContext.camera.updateMatrixWorld();
            this.sceneContext.camera.updateProjectionMatrix();
            // Sync internal euler state of controls
            // @ts-ignore
            this.sceneContext.controls.euler.setFromQuaternion(this.sceneContext.camera.quaternion);
        }

        // Load all nodes
        const nodeById = new Map<string, SceneNodeDefinition>();
        for (const node of sceneDef.nodes) {
            nodeById.set(node.id, node);
        }

        for (const node of sceneDef.nodes) {
            const [px, py, pz] = node.transform.position;
            const [rx, ry, rz] = node.transform.rotation;
            const [sx, sy, sz] = node.transform.scale;

            // Resolve inherited properties: priority, debugColor, and viewerKey
            let resolvedPriority = node.priority;
            let resolvedDebugColor = node.debugColor;
            let resolvedViewerKey = resolveKey(node.viewerKey);

            let currentParentId = node.parentId;
            while ((!resolvedPriority || resolvedDebugColor === undefined || !resolvedViewerKey) && currentParentId) {
                const parentNode = nodeById.get(currentParentId);
                if (!parentNode) break;

                if (!resolvedPriority && parentNode.priority) {
                    resolvedPriority = parentNode.priority;
                }
                if (resolvedDebugColor === undefined && parentNode.debugColor !== undefined) {
                    resolvedDebugColor = parentNode.debugColor;
                }
                if (!resolvedViewerKey && parentNode.viewerKey) {
                    resolvedViewerKey = resolveKey(parentNode.viewerKey);
                }
                currentParentId = parentNode.parentId;
            }

            // Finally fallback to scene-level key if still not resolved
            if (!resolvedViewerKey) {
                resolvedViewerKey = sceneViewerKey;
            }

            const loaded = this.mirisAdapter.createPlaceholder({
                id: node.id,
                streamId: node.streamId,
                position: new THREE.Vector3(px, py, pz),
                rotation: new THREE.Euler(rx, ry, rz),
                scale: new THREE.Vector3(sx, sy, sz),
                viewerKey: resolvedViewerKey,
                debugColor: resolvedDebugColor,
            });

            this.runtimeAssets.set(node.id, {
                config: {
                    ...node,
                    priority: (resolvedPriority || { importance: 0.5, depthBand: 'midground' }) as SceneNodePriority,
                    debugColor: resolvedDebugColor,
                    viewerKey: resolvedViewerKey, // Store the fully resolved key
                },
                loaded,
                priorityScore: 0,
                streamLoaded: false,
            });

            if (node.streamId) {
                this.pendingStreamLoads.add(node.id);
                this.streamQueue.push(node.id);
            }
        }

        // Attach roots according to parentId
        for (const runtimeAsset of this.runtimeAssets.values()) {
            const node = runtimeAsset.config;
            const parentId = node.parentId;
            const root = runtimeAsset.loaded.root;

            if (!parentId) {
                this.sceneContext.scene.add(root);
            } else {
                const parentRuntime = this.runtimeAssets.get(parentId);
                if (parentRuntime) {
                    parentRuntime.loaded.root.add(root);
                } else {
                    console.warn(
                        `Parent "${parentId}" not found for "${node.id}", attaching to scene root.`,
                    );
                    this.sceneContext.scene.add(root);
                }
            }
        }

        // Apply initial camera anchor if specified and not skipped
        if (!skipInitialCamera && sceneDef.initialCamera && sceneDef.initialCamera.anchor) {
            const anchorId = sceneDef.initialCamera.anchor;
            const runtimeAsset = this.runtimeAssets.get(anchorId);
            if (runtimeAsset) {
                console.info(`[compositor] anchoring initial camera to: ${anchorId}`);
                const anchorObject = runtimeAsset.loaded.root;
                const cameraAnchor = this.sceneContext.cameraAnchor;
                
                anchorObject.add(cameraAnchor);
                cameraAnchor.position.set(0, 0, 0);
                cameraAnchor.quaternion.set(0, 0, 0, 1);

                // Inverse the parent's world scale for the anchor to keep camera scale 1,1,1
                const parentScale = new THREE.Vector3();
                anchorObject.getWorldScale(parentScale);
                cameraAnchor.scale.set(
                    parentScale.x !== 0 ? 1 / parentScale.x : 1,
                    parentScale.y !== 0 ? 1 / parentScale.y : 1,
                    parentScale.z !== 0 ? 1 / parentScale.z : 1
                );
                
                this.anchorAssetId = anchorId;
            } else {
                console.warn(`[compositor] initialCamera anchor "${anchorId}" not found in nodes.`);
            }
        }

        this.updatePriorities();
        await this.processStreamQueue();
    }

    private isProcessingQueue = false;

    private async processStreamQueue(): Promise<void> {
        if (this.streamQueue.length === 0 || this.isProcessingQueue) return;

        this.isProcessingQueue = true;
        try {
            console.info(`[compositor] processing stream queue (${this.streamQueue.length} items).`);

        // Sort queue by priority score (highest first)
        this.streamQueue.sort((a, b) => {
            const assetA = this.runtimeAssets.get(a);
            const assetB = this.runtimeAssets.get(b);
            if (!assetA || !assetB) return 0;
            return assetB.priorityScore - assetA.priorityScore;
        });

        // Helper to check if a node's streamed ancestors are loaded
        const canAttachStream = (id: string): boolean => {
            const asset = this.runtimeAssets.get(id);
            if (!asset) return true;

            let parentId = asset.config.parentId;
            while (parentId) {
                const parentAsset = this.runtimeAssets.get(parentId);
                if (!parentAsset) break;

                // If the parent is supposed to be a stream but isn't loaded yet,
                // we should wait to attach this child stream to avoid reparenting issues.
                if (parentAsset.config.streamId && !parentAsset.streamLoaded) {
                    return false;
                }
                parentId = parentAsset.config.parentId;
            }
            return true;
        };

        // Load eligible nodes
        const remaining = [...this.streamQueue];
        for (const id of remaining) {
            if (!canAttachStream(id)) {
                // Skip for now, will be processed in a future updatePriorities/processStreamQueue tick
                continue;
            }

            const runtimeAsset = this.runtimeAssets.get(id);
            if (!runtimeAsset) continue;

            const node = runtimeAsset.config;
            const [px, py, pz] = node.transform.position;
            const [rx, ry, rz] = node.transform.rotation;
            const [sx, sy, sz] = node.transform.scale;

            // Determine viewer key again
            const viewerKey = runtimeAsset.config.viewerKey;

            console.info(`[compositor] loading stream ${id} (priority: ${runtimeAsset.priorityScore.toFixed(3)})`);

            await this.mirisAdapter.attachStream(runtimeAsset.loaded, {
                id: node.id,
                streamId: node.streamId,
                position: new THREE.Vector3(px, py, pz),
                rotation: new THREE.Euler(rx, ry, rz),
                scale: new THREE.Vector3(sx, sy, sz),
                viewerKey,
                debugColor: runtimeAsset.config.debugColor,
            });

            const stream = runtimeAsset.loaded.stream;
            if (stream) {
                if (stream.isLoaded) {
                    runtimeAsset.streamLoaded = true;
                    this.pendingStreamLoads.delete(id);
                    // If it was already loaded, it might unlock children immediately
                    await this.processStreamQueue();
                } else if (typeof stream.addEventListener === 'function') {
                    stream.addEventListener('streamloaded', () => {
                        runtimeAsset.streamLoaded = true;
                        this.pendingStreamLoads.delete(id);
                        this.checkAllMirisReady();
                        // Re-trigger queue processing when an ancestor finishes loading
                        this.processStreamQueue();
                    });
                }
            } else {
                // If attachStream failed or didn't produce a stream, we should probably mark it as "loaded" so we don't wait forever
                this.pendingStreamLoads.delete(id);
            }

            // Remove from queue
            const index = this.streamQueue.indexOf(id);
            if (index > -1) this.streamQueue.splice(index, 1);
        }

        this.checkAllMirisReady();
        } finally {
            this.isProcessingQueue = false;
        }
    }

    addDebugGround(): void {
        const grid = new THREE.GridHelper(40, 40, 0x64748b, 0xcbd5e1);
        this.sceneContext.scene.add(grid);

        const axes = new THREE.AxesHelper(2);
        this.sceneContext.scene.add(axes);
    }

    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.tick();
    }

    stop(): void {
        this.isRunning = false;
    }

    dispose(): void {
        this.stop();
        this.removeEventListeners();

        const focusPanel = document.getElementById('focus-info-panel');
        if (focusPanel) {
            focusPanel.remove();
        }

        const cameraPanel = document.getElementById('camera-debug-panel');
        if (cameraPanel) {
            cameraPanel.remove();
        }

        for (const asset of this.runtimeAssets.values()) {
            this.mirisAdapter.unload(asset.loaded);
        }

        this.runtimeAssets.clear();
        // this.sceneContext.dispose(); // Do not dispose sceneContext here as it's managed by appSession
    }

    private tick = (): void => {
        if (!this.isRunning) return;

        this.sceneContext.timer.update();
        const deltaTime = this.sceneContext.timer.getDelta();

        // Manual navigation may clear focus look-at behavior in the controls,
        // but it should NOT detach the camera anchor.
        // The anchor is only cleared explicitly via selection reset / Escape / Backspace.

        const now = performance.now();
        // Hover fades out if mouse stationary
        if (now - this.lastMouseMoveTime > this.HOVER_FADE_DELAY) {
            this.setHovered(null);
        }

        requestAnimationFrame(this.tick);

        this.animateNodes();
        this.sceneContext.controls.update(deltaTime);
        this.updatePriorities();
        
        if (this.selectedAssetId) {
            this.updateLiveUI(this.selectedAssetId);
        }

        this.updateCameraUI();
        this.checkLoadingTimeouts();

        this.sceneContext.renderer.render(
            this.sceneContext.scene,
            this.sceneContext.camera,
        );
    };

    private readonly tempCameraPosition = new THREE.Vector3();

    private updatePriorities(): void {
        this.tempCameraPosition.copy(this.sceneContext.camera.position);

        for (const runtimeAsset of this.runtimeAssets.values()) {
            const { config, loaded } = runtimeAsset;

            const distance = this.tempCameraPosition.distanceTo(
                loaded.root.position,
            );
            const bandBias = this.getDepthBandBias(config.priority.depthBand);
            const importanceBias = config.priority.importance;
            const sceneWeight = config.priority.sceneWeight ?? 0;
            const distanceFactor = 1 / Math.max(distance, 0.001);

            runtimeAsset.priorityScore =
                distanceFactor * 0.45 +
                importanceBias * 0.25 +
                sceneWeight * 0.2 +
                bandBias * 0.1;
        }
    }

    private animateNodes(): void {
        const t = performance.now() * 0.001;

        for (const runtimeAsset of this.runtimeAssets.values()) {
            const { config, loaded } = runtimeAsset;
            const anim = config.animation;
            if (!anim) continue;

            const root = loaded.root;

            if (anim.rotate) {
                const speed = anim.rotateSpeed ?? 0.003;
                root.rotation.y += speed;
                root.rotation.y %= Math.PI * 2;
            }

            if (anim.bounce) {
                const amp = anim.bounceAmplitude ?? 0.05;
                const freq = anim.bounceFrequency ?? 1.5;
                const direction = anim.bounceDirection ?? [0, 1, 0];
                
                let bounceValue = Math.sin(t * freq);
                
                if (anim.bounceAbsolute) {
                    bounceValue = Math.abs(bounceValue);
                } else if (anim.bounceClip) {
                    bounceValue = Math.max(0, bounceValue);
                }
                
                const offset = bounceValue * amp;

                // Position is updated based on base position + offset * direction
                const base = config.transform.position;
                root.position.set(
                    base[0] + direction[0] * offset,
                    base[1] + direction[1] * offset,
                    base[2] + direction[2] * offset
                );
            }
        }
    }

    private getDepthBandBias(depthBand: DepthBand): number {
        switch (depthBand) {
            case 'foreground':
                return 1.0;
            case 'midground':
                return 0.6;
            case 'background':
                return 0.3;
            default:
                return 0.3;
        }
    }

    private updateFocusUI(id: string | null): void {
        const container = document.getElementById('focus-info-panel');
        if (!container) {
            this.createFocusUI();
            this.updateFocusUI(id);
            return;
        }

        if (!id) {
            container.style.display = 'none';
            container.innerHTML = ''; // Clear content
            this.sceneContext.controls.setSideOffset(0);
            return;
        }

        const asset = this.runtimeAssets.get(id);
        if (!asset) return;

        const { config, loaded } = asset;
        const meta = loaded.metadata || {};

        container.style.display = 'block';
        container.innerHTML = `
            <div style="padding: 20px; color: #f8fafc; font-family: system-ui, sans-serif;">
                <h2 style="margin: 0 0 5px 0; font-size: 1.25rem;">${meta.name || config.label}</h2>
                ${meta.name && meta.name !== config.label ? `<div style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 10px;">${config.label}</div>` : ''}
                ${meta.thumbnailUrl ? `<img src="${meta.thumbnailUrl}" alt="${meta.name || id}" style="width: 100%; border-radius: 8px; margin-bottom: 15px; border: 1px solid #334155;">` : ''}
                
                <div style="background: #1e293b; border-radius: 8px; padding: 12px; margin-bottom: 15px; font-size: 0.85rem;">
                    <div style="color: #94a3b8; margin-bottom: 4px;">Stream ID</div>
                    <div style="font-family: monospace; word-break: break-all;">${config.streamId}</div>
                    ${meta.uuid && meta.uuid !== config.streamId ? `
                        <div style="color: #94a3b8; margin: 8px 0 4px 0;">Asset UUID</div>
                        <div style="font-family: monospace; word-break: break-all; opacity: 0.8;">${meta.uuid}</div>
                    ` : ''}
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; font-size: 0.8rem;">
                    ${meta.createdAt ? `
                        <div>
                            <div style="color: #94a3b8;">Created</div>
                            <div>${meta.createdAt}</div>
                        </div>
                    ` : ''}
                    ${meta.updatedAt ? `
                        <div>
                            <div style="color: #94a3b8;">Updated</div>
                            <div>${meta.updatedAt}</div>
                        </div>
                    ` : ''}
                    ${meta.views !== undefined ? `
                        <div>
                            <div style="color: #94a3b8;">Views</div>
                            <div>${meta.views}</div>
                        </div>
                    ` : ''}
                </div>

                ${meta.tags && meta.tags.length > 0 ? `
                    <div style="margin-bottom: 15px;">
                        <div style="color: #94a3b8; font-size: 0.8rem; margin-bottom: 5px;">Tags</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                            ${meta.tags.map((t: string) => `<span style="background: #334155; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;">${t}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}

                ${meta.contentUrl ? `
                    <div style="margin-bottom: 15px;">
                        <div style="color: #94a3b8; font-size: 0.8rem; margin-bottom: 5px;">Content URL</div>
                        <a href="${meta.contentUrl}" target="_blank" style="color: #3b82f6; text-decoration: none; font-size: 0.75rem; word-break: break-all; display: block;">${meta.contentUrl}</a>
                    </div>
                ` : ''}

                <hr style="border: 0; border-top: 1px solid #334155; margin: 15px 0;">

                <h3 style="margin: 0 0 10px 0; font-size: 0.9rem; color: #cbd5e1;">Scene Properties</h3>
                <div style="font-size: 0.8rem; color: #94a3b8;">
                    <div style="margin-bottom: 4px;">Node ID: <span style="color: #f8fafc;">${config.id}</span></div>
                    <div style="margin-bottom: 4px;">Parent ID: <span style="color: #f8fafc;">${config.parentId || 'None'}</span></div>
                    <div style="margin-bottom: 10px;">Priority: <span style="color: #f8fafc;">${config.priority.depthBand} (${config.priority.importance})</span></div>
                    
                    <div style="color: #94a3b8; font-size: 0.75rem; margin-bottom: 2px;">Position (Relative)</div>
                    <div id="live-pos-rel" style="margin-bottom: 4px; color: #f8fafc;">---</div>
                    
                    <div style="color: #94a3b8; font-size: 0.75rem; margin-bottom: 2px;">Position (World)</div>
                    <div id="live-pos-world" style="margin-bottom: 4px; color: #f8fafc;">---</div>

                    <div style="color: #94a3b8; font-size: 0.75rem; margin-bottom: 2px;">Rotation</div>
                    <div id="live-rot" style="margin-bottom: 4px; color: #f8fafc;">---</div>
                    
                    ${this.getParentHtml(config)}
                    ${this.getChildrenHtml(config.id)}
                </div>
            </div>
        `;

        container.querySelectorAll('[data-id-link]').forEach(el => {
            el.addEventListener('click', (e) => {
                const targetId = (e.currentTarget as HTMLElement).getAttribute('data-id-link');
                console.log(`[compositor] clicked link to ${targetId}`);
                if (targetId) this.selectAsset(targetId, true, false); // Use smooth easing for dialog clicks
            });
            el.addEventListener('mouseenter', (e) => {
                const targetId = (e.currentTarget as HTMLElement).getAttribute('data-id-link');
                console.log(`[compositor] hovering over link to ${targetId}`);
                if (targetId) this.setHovered(targetId);
            });
            el.addEventListener('mouseleave', () => {
                this.setHovered(null);
            });
        });

        // Initialize live fields immediately
        this.updateLiveUI(id);
    }

    private updateLiveUI(id: string): void {
        const asset = this.runtimeAssets.get(id);
        if (!asset) return;

        const relPosEl = document.getElementById('live-pos-rel');
        const worldPosEl = document.getElementById('live-pos-world');
        const rotEl = document.getElementById('live-rot');

        if (relPosEl) {
            const p = asset.loaded.root.position;
            relPosEl.textContent = `[${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}]`;
        }
        if (worldPosEl) {
            const wp = new THREE.Vector3();
            asset.loaded.root.getWorldPosition(wp);
            worldPosEl.textContent = `[${wp.x.toFixed(3)}, ${wp.y.toFixed(3)}, ${wp.z.toFixed(3)}]`;
        }
        if (rotEl) {
            const r = asset.loaded.root.rotation;
            rotEl.textContent = `[${THREE.MathUtils.radToDeg(r.x).toFixed(1)}°, ${THREE.MathUtils.radToDeg(r.y).toFixed(1)}°, ${THREE.MathUtils.radToDeg(r.z).toFixed(1)}°]`;
        }
    }

    private getParentHtml(childConfig: any): string {
        if (!childConfig.parentId) return '';
        const parent = this.runtimeAssets.get(childConfig.parentId);
        if (!parent) return '';

        return `
            <div style="margin-top: 10px;">
                <div style="color: #94a3b8; margin-bottom: 5px;">Parent</div>
                <div style="color: #f8fafc;">
                    ${parent.config.label} (<span data-id-link="${parent.config.id}" style="color: #3b82f6; cursor: pointer; text-decoration: underline;">${parent.config.id}</span>)
                </div>
            </div>
        `;
    }

    private getChildrenHtml(parentId: string): string {
        const children = Array.from(this.runtimeAssets.values())
            .filter(a => a.config.parentId === parentId);
        
        if (children.length === 0) return '';

        return `
            <div style="margin-top: 10px;">
                <div style="color: #94a3b8; margin-bottom: 5px;">Children</div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    ${children.map(c => `
                        <div style="color: #f8fafc;">
                            ${c.config.label} (<span data-id-link="${c.config.id}" style="color: #3b82f6; cursor: pointer; text-decoration: underline;">${c.config.id}</span>)
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    private createFocusUI(): void {
        if (document.getElementById('focus-info-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'focus-info-panel';
        Object.assign(panel.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            width: '320px',
            maxHeight: 'calc(100% - 40px)',
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #334155',
            borderRadius: '12px',
            overflowY: 'auto',
            zIndex: '1000',
            display: 'none',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            boxSizing: 'border-box'
        });
        document.body.appendChild(panel);
    }

    private createCameraDebugUI(): void {
        if (document.getElementById('camera-debug-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'camera-debug-panel';
        Object.assign(panel.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '320px',
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '20px',
            color: '#f8fafc',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '0.85rem',
            zIndex: '1000',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none',
            boxSizing: 'border-box'
        });
        document.body.appendChild(panel);
    }

    private updateCameraUI(): void {
        const panel = document.getElementById('camera-debug-panel');
        if (!panel) return;

        const info = this.sceneContext.controls.getDebugInfo();
        const { worldPosition: wp, worldRotation: wr, zoom, frustum, isAnchored, anchorId, relativePosition: rp, relativeRotation: rr } = info;

        panel.innerHTML = `
            <div style="font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; font-size: 0.7rem;">Camera Debug</div>
            
            <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 8px 12px;">
                <div style="color: #94a3b8;">World Pos</div>
                <div style="font-family: monospace;">[${wp.x.toFixed(2)}, ${wp.y.toFixed(2)}, ${wp.z.toFixed(2)}]</div>
                
                <div style="color: #94a3b8;">World Rot</div>
                <div style="font-family: monospace;">[${THREE.MathUtils.radToDeg(wr.x).toFixed(1)}°, ${THREE.MathUtils.radToDeg(wr.y).toFixed(1)}°, ${THREE.MathUtils.radToDeg(wr.z).toFixed(1)}°]</div>
                
                <div style="color: #94a3b8;">Zoom / FOV</div>
                <div style="font-family: monospace;">${zoom.toFixed(2)} / ${frustum.fov.toFixed(1)}°</div>
                
                <div style="color: #94a3b8;">Frustum</div>
                <div style="font-family: monospace;">N: ${frustum.near} F: ${frustum.far}</div>
            </div>

            ${isAnchored ? `
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #334155;">
                    <div style="color: #3b82f6; font-weight: 600; margin-bottom: 8px;">Anchored to: ${anchorId}</div>
                    <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 8px 12px;">
                        <div style="color: #94a3b8;">Local Pos</div>
                        <div style="font-family: monospace;">[${rp?.x.toFixed(3)}, ${rp?.y.toFixed(3)}, ${rp?.z.toFixed(3)}]</div>
                        <div style="color: #94a3b8;">Local Rot</div>
                        <div style="font-family: monospace;">[${THREE.MathUtils.radToDeg(rr?.x || 0).toFixed(1)}°, ${THREE.MathUtils.radToDeg(rr?.y || 0).toFixed(1)}°, ${THREE.MathUtils.radToDeg(rr?.z || 0).toFixed(1)}°]</div>
                    </div>
                </div>
            ` : ''}
        `;

        // Ensure Selected Asset panel doesn't overlap if screen is too small
        const assetPanel = document.getElementById('focus-info-panel');
        if (assetPanel && assetPanel.style.display !== 'none') {
            const cameraHeight = panel.offsetHeight || 150;
            const gap = 20; // Minimum margin between panels
            assetPanel.style.maxHeight = `calc(100% - ${cameraHeight + 20 + 20 + gap}px)`;
        } else if (assetPanel) {
            assetPanel.style.maxHeight = 'calc(100% - 40px)';
        }
    }
}