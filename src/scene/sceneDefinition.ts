import type { SceneNodeDefinition, SceneNodeId } from './sceneTypes';

export interface SceneDefinition {
    id: string;
    label: string;
    rootNodeIds: SceneNodeId[];
    nodes: SceneNodeDefinition[];
}