export type DepthBand = 'foreground' | 'midground' | 'background';
export type SceneNodeId = string;
export type Vec3 = [number, number, number];

export interface SceneNodeAnimation {
    rotate?: boolean;
    bounce?: boolean;
    rotateSpeed?: number;
    bounceAmplitude?: number;
    bounceFrequency?: number;
}

export interface SceneNodePriority {
    importance: number;   // author intent, 0..1
    depthBand: DepthBand;
    sceneWeight?: number; // use for large “root scene” assets
}

export interface SceneNodeTransform {
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
}

export interface SceneNodeDefinition {
    id: SceneNodeId;
    label: string;
    streamId: string;
    parentId?: SceneNodeId;
    transform: SceneNodeTransform;
    animation?: SceneNodeAnimation;
    priority: SceneNodePriority;
    debugColor?: number;
}
