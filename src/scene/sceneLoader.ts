// src/scene/sceneLoader.ts

import type { SceneDefinition } from './sceneDefinition';
import { assertSceneDefinition } from './sceneValidation';

interface ManifestEntry {
    id: string;
    label: string;
    file: string;
}

let manifestPromise: Promise<ManifestEntry[]> | null = null;

async function getManifest(): Promise<ManifestEntry[]> {
    if (manifestPromise) return manifestPromise;

    manifestPromise = (async () => {
        const response = await fetch('./scenes/manifest.json');
        if (!response.ok) {
            console.warn('Failed to load scenes manifest, falling back to direct ID mapping');
            return [];
        }
        return response.json();
    })();

    return manifestPromise;
}

export async function loadSceneFromBuiltinId(sceneId: string): Promise<SceneDefinition> {
    const manifest = await getManifest();
    const entry = manifest.find(e => e.id === sceneId);
    
    const filename = entry ? entry.file : `${sceneId.replace(/[^a-zA-Z0-9-_]/g, '')}.json`;
    const response = await fetch(`./scenes/${filename}`);

    if (!response.ok) {
        throw new Error(`Failed to load scene "${sceneId}" (file: ${filename}): ${response.status} ${response.statusText}`);
    }

    const scene = await response.json();
    assertSceneDefinition(scene);
    return scene;
}

export async function loadSceneFromFile(file: File): Promise<SceneDefinition> {
    const text = await file.text();
    const scene = JSON.parse(text);
    assertSceneDefinition(scene);
    return scene;
}

export function createBlankScene(): SceneDefinition {
    return {
        version: '1.0.0',
        id: 'blank',
        label: 'Blank Scene',
        rootNodeIds: [],
        nodes: [],
    };
}
