// src/scene/sceneTypes.ts

export type DepthBand = 'foreground' | 'midground' | 'background';
export type SceneNodeId = string;
export type Vec3 = [number, number, number];

export interface SceneCameraDefinition {
    position: Vec3;
    rotation: Vec3; // Radians (X, Y, Z)
    zoom?: number;
}

export interface SceneNodeAnimation {
    rotate?: boolean;
    bounce?: boolean;
    rotateSpeed?: number;
    bounceAmplitude?: number;
    bounceFrequency?: number;
    bounceAbsolute?: boolean; // Absolute sine wave (no descending below base position)
    bounceClip?: boolean;     // Clip negative values of sine wave
    bounceDirection?: Vec3;   // Direction of bounce, defaults to [0, 1, 0]
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

export type ViewerKeyMap = Record<string, string>;

export interface SceneNodeDefinition {
    id: SceneNodeId;
    label: string;
    streamId?: string;
    viewerKey?: string; // Hardcoded key or reference to a group in SceneDefinition
    parentId?: SceneNodeId;
    transform: SceneNodeTransform;
    animation?: SceneNodeAnimation;
    priority?: SceneNodePriority;
    debugColor?: number;
}
