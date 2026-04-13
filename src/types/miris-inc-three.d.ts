declare module '@miris-inc/three' {
    import * as THREE from 'three';

    export class MirisScene extends THREE.Scene {
        constructor(options?: { viewerKey?: string | null });
    }

    export class MirisStream extends THREE.Group {
        constructor(options: { uuid: string; viewerKey?: string | null });
        override addEventListener(type: string, listener: (event?: any) => void): void;
        override removeEventListener(type: string, listener: (event?: any) => void): void;
        fetchAssets?(): Promise<
            Array<{
                uuid: string;
                name: string;
                tags?: string[];
                thumbnailUrl?: string;
                contentUrl?: string;
                createdAt?: string;
                updatedAt?: string;
                views?: number;
            }>
        >;
        isLoaded?: boolean;
    }
}