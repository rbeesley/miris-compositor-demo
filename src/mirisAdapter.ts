import * as THREE from 'three';
import { MirisStream } from '@miris-inc/three';
import { getMirisConfig } from './config';

export interface MirisLoadRequest {
    id: string;
    streamId: string;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    debugColor?: number;
}

export interface LoadedMirisAsset {
    id: string;
    root: THREE.Group;
    placeholder: THREE.Object3D;
    stream?: THREE.Object3D;
    usingFallback: boolean;
}

type UntypedMirisStream = THREE.Group & {
    isStream?: true;
    addEventListener?: (type: string, listener: (event?: unknown) => void) => void;
};

export class MirisAdapter {
    private static readonly DEFAULT_DEBUG_COLOR = 0x22c55e;
    private static readonly FALLBACK_BOX_SIZE = 1;
    private static readonly FALLBACK_WIREFRAME_SIZE = 1.04;
    private static readonly FALLBACK_POLE_HEIGHT = 0.8;
    private static readonly LABEL_CANVAS_WIDTH = 256;
    private static readonly LABEL_CANVAS_HEIGHT = 96;

    private readonly scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    async loadStream(request: MirisLoadRequest): Promise<LoadedMirisAsset> {
        const root = this.createRoot(request);
        const placeholder = this.createFallbackVisual(
            request.id,
            request.debugColor ?? MirisAdapter.DEFAULT_DEBUG_COLOR
        );

        root.add(placeholder);
        this.scene.add(root);

        const config = getMirisConfig();
        const streamUuid = request.streamId || (request.id === 'asset-a' ? config.assetAId : undefined);

        if (!streamUuid) {
            console.warn(`No asset UUID configured for ${request.id}; using fallback.`);
            return {
                id: request.id,
                root,
                placeholder,
                stream: undefined,
                usingFallback: true,
            };
        }

        if (!config.viewerKey) {
            console.warn(`Miris viewer key missing; using fallback for ${request.id}`);
            return {
                id: request.id,
                root,
                placeholder,
                stream: undefined,
                usingFallback: true,
            };
        }

        try {
            const stream = new MirisStream({uuid: streamUuid}) as UntypedMirisStream;

            stream.position.set(0, 0.5, 0);
            stream.rotation.set(0, 0, 0);
            stream.scale.set(1, 1, 1);

            if (typeof stream.addEventListener === 'function') {
                stream.addEventListener('streamloaded', () => {
                    placeholder.visible = false;
                    console.info(`Miris stream loaded for ${request.id}`);
                });
            }

            root.add(stream);

            return {
                id: request.id,
                root,
                placeholder,
                stream,
                usingFallback: false,
            };
        } catch (error) {
            console.warn(`Failed to load Miris stream for ${request.id}:`, error);
            return {
                id: request.id,
                root,
                placeholder,
                stream: undefined,
                usingFallback: true,
            };
        }
    }

    unload(asset: LoadedMirisAsset): void {
        this.scene.remove(asset.root);
    }

    private createRoot(request: MirisLoadRequest): THREE.Group {
        const root = new THREE.Group();
        root.name = `miris-asset:${request.id}`;
        root.position.copy(request.position);
        root.rotation.copy(request.rotation);
        root.scale.copy(request.scale);

        return root;
    }

    private createFallbackVisual(id: string, color: number): THREE.Group {
        const group = new THREE.Group();
        group.add(this.createFallbackBox(color));
        group.add(this.createFallbackWireframe());
        group.add(this.createFallbackPole());
        group.add(this.createFallbackLabel(id, color));

        return group;
    }

    private createFallbackBox(color: number): THREE.Mesh {
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(
                MirisAdapter.FALLBACK_BOX_SIZE,
                MirisAdapter.FALLBACK_BOX_SIZE,
                MirisAdapter.FALLBACK_BOX_SIZE
            ),
            new THREE.MeshStandardMaterial({
                color,
                metalness: 0.1,
                roughness: 0.8,
            })
        );
        box.position.y = 0.5;

        return box;
    }

    private createFallbackWireframe(): THREE.LineSegments {
        const wire = new THREE.LineSegments(
            new THREE.EdgesGeometry(
                new THREE.BoxGeometry(
                    MirisAdapter.FALLBACK_WIREFRAME_SIZE,
                    MirisAdapter.FALLBACK_WIREFRAME_SIZE,
                    MirisAdapter.FALLBACK_WIREFRAME_SIZE
                )
            ),
            new THREE.LineBasicMaterial({color: 0x0f172a})
        );
        wire.position.y = 0.5;

        return wire;
    }

    private createFallbackPole(): THREE.Mesh {
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, MirisAdapter.FALLBACK_POLE_HEIGHT),
            new THREE.MeshStandardMaterial({color: 0x475569})
        );
        pole.position.set(0, 1.5, 0);

        return pole;
    }

    private createFallbackLabel(id: string, color: number): THREE.Sprite {
        const label = this.createTextSprite(id, color);
        label.position.set(0, 2.1, 0);

        return label;
    }

    private createTextSprite(text: string, color: number): THREE.Sprite {
        const canvas = document.createElement('canvas');
        canvas.width = MirisAdapter.LABEL_CANVAS_WIDTH;
        canvas.height = MirisAdapter.LABEL_CANVAS_HEIGHT;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Could not create canvas context for label sprite');
        }

        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 24px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1.8, 0.675, 1);

        return sprite;
    }
}