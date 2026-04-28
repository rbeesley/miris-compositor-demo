// src/scene/sceneLoader.ts

import type { SceneDefinition } from './sceneDefinition';
import { assertSceneDefinition } from './sceneValidation';

export async function loadSceneFromBuiltinId(sceneId: string): Promise<SceneDefinition> {
    const safeSceneId = sceneId.replace(/[^a-zA-Z0-9-_]/g, '');
    const response = await fetch(`./scenes/${safeSceneId}.json`);

    if (!response.ok) {
        throw new Error(`Failed to load scene "${sceneId}": ${response.status} ${response.statusText}`);
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
