// compositor.ts
import * as THREE from 'three';
import type { SceneContext } from './scene';
import type { LoadedMirisAsset, MirisAdapter } from './mirisAdapter';
import type { SceneDefinition } from './scene/sceneDefinition';
import type { SceneNodeDefinition, DepthBand } from './scene/sceneTypes';

interface RuntimeAsset {
    config: SceneNodeDefinition;
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
    private allStreamsLoadedOnce = false;
    private readyResolve?: () => void;
    readonly ready: Promise<void>;

    constructor(sceneContext: SceneContext, mirisAdapter: MirisAdapter) {
        this.sceneContext = sceneContext;
        this.mirisAdapter = mirisAdapter;

        this.ready = new Promise<void>((resolve) => {
            this.readyResolve = resolve;
            // Robustness: also resolve after a timeout if SDK events are missed
            setTimeout(() => {
                if (this.readyResolve) {
                    console.warn('[compositor] ready timed out (missed SDK events), proceeding');
                    this.readyResolve();
                    this.readyResolve = undefined;
                }
            }, 8000);
        });

        this.attachMirisSceneListeners();
    }

    private checkAllMirisReady(): void {
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
        const mirisScene: any = this.sceneContext.mirisScene;

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

    async loadScene(sceneDef: SceneDefinition): Promise<void> {
        // Clear existing assets
        for (const asset of this.runtimeAssets.values()) {
            this.mirisAdapter.unload(asset.loaded);
        }
        this.runtimeAssets.clear();

        // Load all nodes
        const nodeById = new Map<string, SceneNodeDefinition>();
        for (const node of sceneDef.nodes) {
            nodeById.set(node.id, node);
        }

        for (const node of sceneDef.nodes) {
            const [px, py, pz] = node.transform.position;
            const [rx, ry, rz] = node.transform.rotation;
            const [sx, sy, sz] = node.transform.scale;

            const loaded = await this.mirisAdapter.loadStream({
                id: node.id,
                streamId: node.streamId,
                position: new THREE.Vector3(px, py, pz),
                rotation: new THREE.Euler(rx, ry, rz),
                scale: new THREE.Vector3(sx, sy, sz),
                debugColor: node.debugColor,
            });

            this.runtimeAssets.set(node.id, {
                config: node,
                loaded,
                priorityScore: 0,
                streamLoaded: false,
            });

            if (loaded.stream) {
                this.pendingStreamLoads.add(node.id);
                const stream = loaded.stream as any;
                if (stream.isLoaded) {
                    console.info(`[compositor] stream for ${node.id} already loaded`);
                    this.runtimeAssets.get(node.id)!.streamLoaded = true;
                    this.pendingStreamLoads.delete(node.id);
                }
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

        // Attach per-stream loaded handlers
        for (const [id, runtimeAsset] of this.runtimeAssets) {
            const { loaded } = runtimeAsset;
            const stream = loaded.stream as any;

            if (stream && typeof stream.addEventListener === 'function') {
                stream.addEventListener('streamloaded', (event: unknown) => {
                    console.info(`[compositor/miris] streamloaded for ${id}`, event);
                    runtimeAsset.streamLoaded = true;
                    this.pendingStreamLoads.delete(id);
                    this.checkAllMirisReady();
                });
            }
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

        for (const asset of this.runtimeAssets.values()) {
            this.mirisAdapter.unload(asset.loaded);
        }

        this.runtimeAssets.clear();
        this.sceneContext.dispose();
    }

    private tick = (): void => {
        if (!this.isRunning) return;

        this.sceneContext.timer.update();
        requestAnimationFrame(this.tick);

        this.sceneContext.controls.update();
        this.updatePriorities();
        this.animateNodes();

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
            }

            if (anim.bounce) {
                const baseY = config.transform.position[1];
                const amp = anim.bounceAmplitude ?? 0.05;
                const freq = anim.bounceFrequency ?? 1.5;
                root.position.y = baseY + Math.sin(t * freq) * amp;
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
}