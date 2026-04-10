import * as THREE from 'three';
import type { SceneContext } from './scene';
import type { LoadedMirisAsset, MirisAdapter } from './mirisAdapter';

export type DepthBand = 'foreground' | 'midground' | 'background';

export interface StreamedSceneAsset {
    id: string;
    streamId: string;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    boundsMeters: THREE.Vector3;
    importance: number;
    depthBand: DepthBand;
    debugColor?: number;
}

interface RuntimeAsset {
    config: StreamedSceneAsset;
    loaded: LoadedMirisAsset;
    priorityScore: number;
}

export class Compositor {
    private readonly runtimeAssets = new Map<string, RuntimeAsset>();
    private isRunning = false;

    private readonly sceneContext: SceneContext;
    private readonly mirisAdapter: MirisAdapter;

    constructor(sceneContext: SceneContext, mirisAdapter: MirisAdapter) {
        this.sceneContext = sceneContext;
        this.mirisAdapter = mirisAdapter;
    }

    async loadAssets(assets: StreamedSceneAsset[]): Promise<void> {
        for (const asset of assets) {
            const loaded = await this.mirisAdapter.loadStream({
                id: asset.id,
                streamId: asset.streamId,
                position: asset.position,
                rotation: asset.rotation,
                scale: asset.scale,
                debugColor: asset.debugColor,
            });

            this.runtimeAssets.set(asset.id, {
                config: asset,
                loaded,
                priorityScore: 0,
            });
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
        this.animateFallbacks();

        this.sceneContext.renderer.render(
            this.sceneContext.scene,
            this.sceneContext.camera
        );
    };

    private readonly tempCameraPosition = new THREE.Vector3();

    private updatePriorities(): void {
        this.tempCameraPosition.copy(this.sceneContext.camera.position);

        for (const runtimeAsset of this.runtimeAssets.values()) {
            const distance = this.tempCameraPosition.distanceTo(runtimeAsset.loaded.root.position);
            const bandBias = this.getDepthBandBias(runtimeAsset.config.depthBand);
            const importanceBias = runtimeAsset.config.importance;
            const distanceFactor = 1 / Math.max(distance, 0.001);

            runtimeAsset.priorityScore =
                distanceFactor * 0.7 + importanceBias * 0.2 + bandBias * 0.1;
        }
    }

    private animateFallbacks(): void {
        const t = performance.now() * 0.001;
        let index = 0;

        for (const runtimeAsset of this.runtimeAssets.values()) {
            const root = runtimeAsset.loaded.root;
            root.rotation.y += 0.003 + index * 0.0005;
            root.position.y =
                runtimeAsset.config.position.y + Math.sin(t * 1.5 + index) * 0.05;
            index++;
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