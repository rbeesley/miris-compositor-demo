// src/scene/sceneValidation.ts

import type { SceneDefinition } from './sceneDefinition';

export function assertSceneDefinition(value: unknown): asserts value is SceneDefinition {
    if (!value || typeof value !== 'object') {
        throw new Error('Scene must be an object.');
    }

    const scene = value as Partial<SceneDefinition>;

    if (typeof scene.version !== 'string') {
        throw new Error('Scene is missing string field "version".');
    }

    if (typeof scene.id !== 'string') {
        throw new Error('Scene is missing string field "id".');
    }

    if (typeof scene.label !== 'string') {
        throw new Error('Scene is missing string field "label".');
    }

    if (!Array.isArray(scene.rootNodeIds)) {
        throw new Error('Scene is missing array field "rootNodeIds".');
    }

    if (!Array.isArray(scene.nodes)) {
        throw new Error('Scene is missing array field "nodes".');
    }
}
