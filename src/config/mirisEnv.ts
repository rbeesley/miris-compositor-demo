export interface MirisConfig {
    viewerKey?: string;
    viewerKeys?: Record<string, string>; // Parsed from VITE_MIRIS_VIEWER_KEYS
}

export function getMirisConfig(): MirisConfig {
    const defaultKey = import.meta.env.VITE_MIRIS_VIEWER_KEY?.trim() || undefined;
    const keysRaw = import.meta.env.VITE_MIRIS_VIEWER_KEYS?.trim() || '';
    
    let viewerKeys: Record<string, string> | undefined;
    if (keysRaw) {
        try {
            // Support JSON format: {"group-a": "key-a"} OR [{"group-a": "key-a"}, {"group-b": "key-b"}]
            const parsed = JSON.parse(keysRaw);
            if (Array.isArray(parsed)) {
                viewerKeys = {};
                for (const item of parsed) {
                    Object.assign(viewerKeys, item);
                }
            } else if (typeof parsed === 'object' && parsed !== null) {
                viewerKeys = parsed;
            }
            console.info('[config] Loaded viewer keys:', Object.keys(viewerKeys || {}).length);
        } catch (e) {
            console.error('[config] Failed to parse VITE_MIRIS_VIEWER_KEYS. Expected JSON.', e);
        }
    }

    return {
        viewerKey: defaultKey,
        viewerKeys,
    };
}