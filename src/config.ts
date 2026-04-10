export interface MirisConfig {
    viewerKey?: string;
    assetAId?: string;
    assetBId?: string;
    assetCId?: string;
}

export function getMirisConfig(): MirisConfig {
    return {
        viewerKey: import.meta.env.VITE_MIRIS_VIEWER_KEY?.trim() || undefined,
        assetAId: import.meta.env.VITE_MIRIS_ASSET_A_ID?.trim() || undefined,
        assetBId: import.meta.env.VITE_MIRIS_ASSET_B_ID?.trim() || undefined,
        assetCId: import.meta.env.VITE_MIRIS_ASSET_C_ID?.trim() || undefined,
    };
}

export function hasMirisViewerConfig(config: MirisConfig): boolean {
    return Boolean(config.viewerKey && config.assetAId);
}

export function validateMirisConfig(config: MirisConfig): boolean {
    return Boolean(config.viewerKey && config.assetAId);
}