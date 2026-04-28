// src/mirisAdapter.ts

import * as THREE from 'three';
import { MirisScene, MirisStream } from '@miris-inc/three';

export interface MirisLoadRequest {
    id: string;
    streamId?: string;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    viewerKey?: string;
    debugColor?: number;
}

export interface LoadedMirisAsset {
    id: string;
    root: THREE.Group;
    placeholder: THREE.Object3D;
    outline?: THREE.LineSegments;
    stream?: MirisStream;
    usingFallback: boolean;
    metadata?: any;
}

export class MirisAdapter {
    private static readonly DEFAULT_DEBUG_COLOR = 0x22c55e;
    private static readonly FALLBACK_BOX_SIZE = 1;
    private static readonly FALLBACK_WIREFRAME_SIZE = 1.04;
    private static readonly FALLBACK_POLE_HEIGHT = 0.8;
    private static readonly LABEL_CANVAS_WIDTH = 256;
    private static readonly LABEL_CANVAS_HEIGHT = 96;
    private static readonly OUTLINE_PADDING = 0.02;

    private readonly scene: MirisScene;

    constructor(scene: MirisScene) {
        this.scene = scene;
    }

    public createPlaceholder(request: MirisLoadRequest): LoadedMirisAsset {
        const streamUuid = request.streamId;

        if (!streamUuid) {
            const root = this.createRoot(request);
            const placeholder = new THREE.Object3D(); // Invisible placeholder for groups
            root.add(placeholder);

            const outline = this.createOutline();
            root.add(outline);
            outline.visible = false;

            console.info(`Creating empty group node for ${request.id}`);

            return {
                id: request.id,
                root,
                placeholder,
                outline,
                stream: undefined,
                usingFallback: false, // It's a group, not a fallback
            };
        }

        const root = this.createRoot(request);
        const placeholder = this.createFallbackVisual(
            request.id,
            request.debugColor ?? MirisAdapter.DEFAULT_DEBUG_COLOR,
        );
        root.add(placeholder);

        const outline = this.createOutline();
        root.add(outline);
        outline.visible = false;

        return {
            id: request.id,
            root,
            placeholder,
            outline,
            stream: undefined,
            usingFallback: false,
        };
    }

    public async attachStream(asset: LoadedMirisAsset, request: MirisLoadRequest): Promise<void> {
        const streamUuid = request.streamId;
        const viewerKey = request.viewerKey;

        if (!streamUuid) {
            return;
        }

        try {
            // Use MirisStream directly as a child of the root group
            // This ensures the root group (which children attach to) never changes identity
            const streamOptions: any = {
                uuid: streamUuid,
            };

            if (viewerKey) {
                streamOptions.viewerKey = viewerKey;
            }

            const stream = new MirisStream(streamOptions) as MirisStream;

            stream.name = `miris-stream:${request.id}`;
            // Identity transform since it's a child of the root group that already has the transform
            stream.position.set(0, 0, 0);
            stream.rotation.set(0, 0, 0);
            stream.scale.set(1, 1, 1);

            asset.root.add(stream);
            asset.stream = stream;

            let metadata: any = undefined;
            if (typeof stream.fetchAssets === 'function') {
                stream.fetchAssets().then(assets => {
                    if (assets && assets.length > 0) {
                        metadata = assets[0];
                    }
                }).catch(err => console.warn(`Failed to fetch metadata for ${request.id}`, err));
            }

            console.info(`Creating Miris stream for ${request.id}`, {
                streamId: request.streamId,
                hasViewerKey: Boolean(viewerKey),
            });

            if (typeof stream.addEventListener === 'function') {
                stream.addEventListener('streamloaded', (event: any) => {
                    asset.placeholder.visible = false;
                    console.info(`[Miris ${request.id}] streamloaded`, event);
                });

                stream.addEventListener('error', (event: any) => {
                    console.error(`[Miris ${request.id}] error`, event);
                });

                // Check if already loaded
                if (stream.isLoaded) {
                    asset.placeholder.visible = false;
                    console.info(`[Miris ${request.id}] already loaded`);
                }
            }

            // Define metadata getter on the asset if it doesn't exist
            Object.defineProperty(asset, 'metadata', {
                get() { return metadata; },
                configurable: true
            });

            console.info(`Miris stream attached for ${request.id}`);
        } catch (error) {
            console.warn(`Failed to load Miris stream for ${request.id}:`, error);
            asset.usingFallback = true;
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
                MirisAdapter.FALLBACK_BOX_SIZE,
            ),
            new THREE.MeshStandardMaterial({
                color,
                transparent: true,
                opacity: 0.1,
                metalness: 0.1,
                roughness: 0.8,
            }),
        );
        box.position.y = 0.5;
        return box;
    }

    private createFallbackWireframe(): THREE.LineSegments {
        const material = new THREE.LineBasicMaterial({
            color: 0x0f172a,
            depthTest: true,
            depthWrite: true,
        });
        const wire = new THREE.LineSegments(
            new THREE.EdgesGeometry(
                new THREE.BoxGeometry(
                    MirisAdapter.FALLBACK_WIREFRAME_SIZE,
                    MirisAdapter.FALLBACK_WIREFRAME_SIZE,
                    MirisAdapter.FALLBACK_WIREFRAME_SIZE,
                ),
            ),
            material,
        );
        wire.position.y = 0.5;
        return wire;
    }

    private createFallbackPole(): THREE.Mesh {
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, MirisAdapter.FALLBACK_POLE_HEIGHT),
            new THREE.MeshStandardMaterial({ color: 0x475569 }),
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
            depthTest: true,
            depthWrite: true,
        });

        const sprite = new THREE.Sprite(material);
        sprite.renderOrder = 10;
        sprite.scale.set(1.8, 0.675, 1);

        return sprite;
    }

    private createOutline(): THREE.LineSegments {
        // Outline based on a box. We use 1.0 size as base (same as fallback box),
        // or we could use bounding boxes if streams provide them.
        // For now, let's use a 1.1x box for the aura/selection.
        const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1 + MirisAdapter.OUTLINE_PADDING, 1 + MirisAdapter.OUTLINE_PADDING, 1 + MirisAdapter.OUTLINE_PADDING));
        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: false,
            depthTest: true,
            depthWrite: true,
        });
        const outline = new THREE.LineSegments(geometry, material);
        outline.renderOrder = 5;
        outline.position.y = 0.5;
        outline.name = 'asset-outline';
        return outline;
    }

    public setOutlineState(asset: LoadedMirisAsset, state: 'none' | 'hover' | 'selected'): void {
        if (!asset.outline) return;

        const outline = asset.outline;
        const material = outline.material as THREE.LineBasicMaterial;

        switch (state) {
            case 'none':
                outline.visible = false;
                break;
            case 'hover':
                outline.visible = true;
                material.transparent = true;
                material.opacity = 0.5;
                material.color.set(0x3b82f6); // Blueish aura
                // Partial wireframe effect is harder with LineSegments directly,
                // but we can adjust opacity or use a custom shader if needed.
                // For now, let's keep it simple with opacity.
                break;
            case 'selected':
                outline.visible = true;
                material.transparent = false;
                material.opacity = 1.0;
                material.color.set(0xffffff); // White solid
                break;
        }
    }
}