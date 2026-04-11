export interface MirisConfig {
    viewerKey?: string;
}

export function getMirisConfig(): MirisConfig {
    return {
        viewerKey: import.meta.env.VITE_MIRIS_VIEWER_KEY?.trim() || undefined,
    };
}

export function hasMirisViewerConfig(config: MirisConfig): boolean {
    return Boolean(config.viewerKey);
}

export function validateMirisConfig(config: MirisConfig): boolean {
    return Boolean(config.viewerKey);
}