declare module '@miris-inc/three' {
    import * as THREE from 'three';

    export class MirisScene extends THREE.Scene {
        constructor(options?: { viewerKey?: string | null });
        fetchAssets?(): Promise<
            Array<{
                uuid: string;
                name: string;
                tags?: string[];
                thumbnailUrl?: string;
                contentUrl?: string;
            }>
        >;
    }

    export class MirisStream extends THREE.Group {
        constructor(options: { uuid: string; viewerKey?: string | null });
        addEventListener?(type: string, listener: (event?: unknown) => void): void;
        removeEventListener?(type: string, listener: (event?: unknown) => void): void;
    }

    export class MirisControls {
        constructor(
            camera: THREE.Camera,
            domElement: HTMLElement,
            objects?: Set<THREE.Object3D> | null
        );

        enabled: boolean;
        objects: Set<THREE.Object3D>;
        update?(): void;
        dispose?(): void;
    }
}