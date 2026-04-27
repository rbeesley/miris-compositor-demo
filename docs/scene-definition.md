# Scene Definition

The Miris Compositor Demo uses a hierarchical, JSON-like scene definition format to configure how assets are streamed and positioned.

## Scene Structure

A `SceneDefinition` contains basic metadata and a collection of `nodes`.

```typescript
interface SceneDefinition {
  id: string;          // Unique identifier for the scene
  label: string;       // Human-readable name
  viewerKey?: string;  // Default viewer key or group name for the entire scene
  viewerKeys?: ViewerKeyMap[]; // Array of viewer key groups (see Viewer Keys section)
  rootNodeIds: string[]; // IDs of the nodes that should be treated as entry points
  nodes: SceneNodeDefinition[]; // All nodes in the scene
  initialCamera?: SceneCameraDefinition; // Starting camera view
}
```

## Viewer Keys

Viewer keys allow the scene to load assets that aren't publicly available. The compositor supports **viewer key groups**, **multiple keys**, and **hierarchical inheritance**.

### Key Resolution and Inheritance

Viewer keys are resolved in the following order of priority:
1. **Node Override**: If a node has a `viewerKey` defined.
2. **Parent Inheritance**: If a node doesn't have a key, it inherits from its parent node.
3. **Scene Default**: If no node or ancestor has a key, the `SceneDefinition.viewerKey` is used.
4. **Environment Default**: If the scene doesn't define a key, `VITE_MIRIS_VIEWER_KEY` from the environment is used.

If a `viewerKey` (at any level) matches a group name defined in the `viewerKeys` map (or in `VITE_MIRIS_VIEWER_KEYS`), the corresponding key from the group is used. Otherwise, it is treated as a literal key.

### Key Mapping

You can define a map of viewer keys at the scene level or in the environment:

```typescript
viewerKeys: [
  { 'external-assets-group': '4YIGMPUj5...' },
  { 'private-collection-group': '6XJH...' }
]
```

These groups can then be referenced by individual nodes or the scene:

```typescript
// Scene definition
export const myScene: SceneDefinition = {
  viewerKey: 'external-assets-group', // Scene-wide default group
  // ...
  nodes: [
    {
      id: 'node-a',
      // Inherits 'external-assets-group' from scene
    },
    {
      id: 'node-b',
      viewerKey: 'private-collection-group', // Overrides with a different group
    },
    {
       id: 'node-c',
       viewerKey: '4YIGMPUj5...', // Literal key
    }
  ]
}
```

### SDK Support Note

> [!IMPORTANT]
> As of the publication of this project, the **Miris SDK does not yet support multiple viewer keys or key groups natively**. The compositor implements this logic manually by mapping keys to specific streams before initializing them. It may still be valuable to use the group identifiers as this makes it possible to quickly change them with different environment files. 

## Node Definition

Each `SceneNodeDefinition` represents a single Miris asset or a logical grouping within the scene.

```typescript
interface SceneNodeDefinition {
  id: string;          // Unique identifier for the node
  label: string;       // Human-readable name
  streamId?: string;   // Miris Stream UUID (optional if viewerKey is used)
  viewerKey?: string;  // Miris Viewer Key (optional override or for specific assets)
  parentId?: string;   // Optional parent node ID for hierarchical transforms
  transform: {
    position: [number, number, number]; // [x, y, z]
    rotation: [number, number, number]; // [x, y, z] (radians)
    scale: [number, number, number];    // [x, y, z]
  };
  animation?: {
    rotate?: boolean;        // If true, the node rotates continuously
    rotateSpeed?: number;    // Rotation speed (default: 0.003)
    bounce?: boolean;        // If true, the node bounces/oscillates
    bounceAmplitude?: number; // Bounce distance (default: 0.05)
    bounceFrequency?: number; // Bounce speed (default: 1.5)
    bounceAbsolute?: boolean; // If true, use absolute sine wave (no descending below base position)
    bounceClip?: boolean;     // If true, clip negative values of the sine wave (stops at base position)
    bounceDirection?: [number, number, number]; // Direction of bounce (default: [0, 1, 0])
  };
  priority?: {
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
