import type { SceneNodeDefinition, SceneNodeId, SceneCameraDefinition, ViewerKeyMap } from './sceneTypes';

export interface SceneDefinition {
    version: string;
    id: string;
    label: string;
    viewerKey?: string; // Default key for the scene (literal or group name)
    viewerKeys?: ViewerKeyMap[]; // Array of groups, e.g., [{'group-a': 'key-a'}, {'group-b': 'key-b'}]
    rootNodeIds: SceneNodeId[];
    nodes: SceneNodeDefinition[];
    initialCamera?: SceneCameraDefinition;
}