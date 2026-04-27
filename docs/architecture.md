# Architecture Notes

## Compositing Engine Overview

The compositing engine handles multiple high-fidelity streaming assets from Miris XR. It bridges the [Miris Web SDK](https://miris.com) with [three.js](https://threejs.org) to create unified spatial scenes.

### Core Components

1.  **Scene Manager (`scene.ts`)**: Initializes the three.js environment including the `MirisScene` (which acts as the root), renderer, camera, lights, and custom `CameraControls`.
2.  **Asset Loader (`mirisAdapter.ts`)**: Wraps the Miris Web SDK. It handles `MirisStream` instantiation, fetches asset metadata from the API, attaches debug visuals (bounding boxes, labels), and manages asset lifecycles. If no stream ID is provided, it provides fallback visuals.
3.  **Compositor (`compositor.ts`)**: The heart of the engine. It manages:
    - **Hierarchical Transform Tree**: Positions, scales, and rotates assets. Supports parent-child relationships where transforms are relative.
    - **Streaming Orchestration**: Tracks when all assets in a scene are fully loaded from the Miris servers.
    - **Priority Scoring System**: Calculates real-time scores for each asset based on importance, distance, and depth band. These scores inform the Miris streaming logic to optimize performance and fidelity.
    - **Selection & Interaction**: Implements a selection system that centers the camera on assets, highlights them with an outline, and displays a dynamic information panel with live metadata (Created, Updated, Tags, etc.) fetched from the Miris API.
    - **Asset Animation**: Applies dynamic runtime behaviors (e.g., rotation, bounce) defined in the scene configuration. The bounce animation supports customizable directions and absolute/clipped oscillation modes.

### Camera System & Anchoring

The engine features a custom `CameraControls` class that provides a first-person-like navigation experience with two distinct modes:

- **World Navigation**: When the camera is attached to the scene root, movement (WASD) and rotation are relative to the world axes.
- **Anchored Navigation**: When an asset is selected and "focused," the camera's anchor point can be attached directly to the asset's coordinate system. This allows the camera to follow the asset if it moves or rotates, with all navigation (WASD) then becoming relative to the asset's local coordinate space.

### State Persistence & URL Sharing

The engine includes a state persistence system that synchronizes the application state with the browser's URL hash. This allows for:
- **Bookmarking & Sharing**: Users can share a specific view, including camera position, orientation, anchored asset, and selected asset.
- **Dynamic Restoration**: On page load or manual URL changes, the engine automatically restores the specified state.
- **Partial State Updates**: The system supports partial updates, allowing for focused links (e.g., `#aid=my-asset` to anchor and look at an asset without specifying exact coordinates).

The camera system also includes smooth easing when focusing on a new asset, automatically aligning the view to the asset's center.

### Viewer Key Authentication & Inheritance

To support complex scenes spanning multiple private asset collections, the engine implements a hierarchical viewer key resolution system:
- **Environment Defaults**: Uses `VITE_MIRIS_VIEWER_KEY` as the primary key for the `MirisScene` and default stream authentication.
- **Scene-Level Keys**: `SceneDefinition` can specify a default `viewerKey` and a map of `viewerKeys` (groups).
- **Hierarchical Inheritance**: Nodes inherit viewer keys from their parent nodes or the scene root.
- **Key Groups & Literals**: References can be either literal keys or named groups defined in the environment or scene definition.
- **SDK Integration**: If no explicit key is provided for a stream, the engine lets the SDK automatically use the key from the `MirisScene`.

*Note: The multi-key/group mapping is a compositor-level feature. While the system is designed to support different keys for different streams, native SDK support for this is pending.*

### Performance & Optimization (Priority Scoring)

The engine implements a multifactor priority scoring system:
- **Importance (0–1)**: Author-defined base priority.
- **Distance to Camera**: Assets closer to the user receive higher priority.
- **Depth Band Bias**: Assets can be assigned to `foreground`, `midground`, or `background` bands, each providing a multiplier to the final score.
- **Scene Weight**: Used to prioritize large "root scene" or context-heavy assets.

## Coordinate System

The engine uses a right-handed coordinate system (standard in three.js). Assets are positioned using a relative coordinate system:
- **Global Origin**: The `MirisScene` root.
- **Local Offsets**: Each asset has an offset (`position`), `rotation`, and `scale` relative to its parent.

## Integration Details

- **Miris Web SDK**: Provides the underlying streaming technology for large 3D models via `MirisStream`.
- **three.js**: The rendering runtime. `MirisScene` and `MirisStream` extend `THREE.Scene` and `THREE.Group` respectively, allowing for seamless integration.
