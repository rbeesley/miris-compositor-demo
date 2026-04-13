export interface MirisConfig {
    viewerKey?: string;
}

export function getMirisConfig(): MirisConfig {
    return {
        viewerKey: import.meta.env.VITE_MIRIS_VIEWER_KEY?.trim() || undefined,
    };
}