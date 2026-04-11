# Scene Definition

The Miris Compositor Demo uses a hierarchical, JSON-like scene definition format to configure how assets are streamed and positioned.

## Scene Structure

A `SceneDefinition` contains basic metadata and a collection of `nodes`.

```typescript
interface SceneDefinition {
  id: string;          // Unique identifier for the scene
  label: string;       // Human-readable name
  rootNodeIds: string[]; // IDs of the nodes that should be treated as entry points
  nodes: SceneNodeDefinition[]; // All nodes in the scene
}
```

## Node Definition

Each `SceneNodeDefinition` represents a single Miris asset or a logical grouping within the scene.

```typescript
interface SceneNodeDefinition {
  id: string;          // Unique identifier for the node
  label: string;       // Human-readable name
  streamId: string;    // Miris Stream UUID
  parentId?: string;   // Optional parent node ID for hierarchical transforms
  transform: {
    position: [number, number, number]; // [x, y, z]
    rotation: [number, number, number]; // [x, y, z] (radians)
    scale: [number, number, number];    // [x, y, z]
  };
  animation?: {
    rotate?: boolean;        // If true, the node rotates continuously
    rotateSpeed?: number;    // Rotation speed (default: 0.003)
    bounce?: boolean;        // If true, the node bounces vertically
    bounceAmplitude?: number; // Bounce distance (default: 0.05)
    bounceFrequency?: number; // Bounce speed (default: 1.5)
  };
  priority: {
    importance: number;      // Base importance (0 to 1)
    depthBand: 'foreground' | 'midground' | 'background'; // Priority category
    sceneWeight?: number;    // Weight for large, static context assets
  };
  debugColor?: number;       // Hex color for fallback/debug visuals
}
```

## Hierarchy and Transforms

The compositor supports **relative transforms**. If a node has a `parentId`, its `position`, `rotation`, and `scale` are applied relative to that parent. This allows for complex scenes where assets are logically grouped together.

## Example Scene

```typescript
export const myScene: SceneDefinition = {
  id: 'my-scene',
  label: 'My Demo Scene',
  rootNodeIds: ['main-environment'],
  nodes: [
    {
      id: 'main-environment',
      label: 'Main Environment',
      streamId: '...', // Miris Stream UUID
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      priority: {
        importance: 1.0,
        depthBand: 'background',
        sceneWeight: 1.0,
      },
    },
    {
      id: 'floating-asset',
      label: 'Floating Asset',
      streamId: '...',
      parentId: 'main-environment',
      transform: {
        position: [0, 2, 0], // 2 meters above parent
        rotation: [0, 0, 0],
        scale: [0.5, 0.5, 0.5],
      },
      animation: {
        rotate: true,
        bounce: true,
      },
      priority: {
        importance: 0.8,
        depthBand: 'midground',
      },
    },
  ],
};
```
