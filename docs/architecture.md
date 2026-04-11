# Architecture Notes

## Compositing Engine Overview

The compositing engine handles multiple high-fidelity streaming assets from Miris XR. It bridges the [Miris Web SDK](https://miris.com) with [three.js](https://threejs.org) to create unified spatial scenes.

### Core Components

1.  **Scene Manager (`scene.ts`)**: Initializes the three.js environment including the `MirisScene` (which acts as the root), renderer, camera, lights, and orbit controls.
2.  **Asset Loader (`mirisAdapter.ts`)**: Wraps the Miris Web SDK. It handles `MirisStream` instantiation, attaches debug visuals (bounding boxes, labels), and manages asset lifecycles. If no stream ID is provided, it provides fallback visuals.
3.  **Compositor (`compositor.ts`)**: The heart of the engine. It manages:
    - **Hierarchical Transform Tree**: Positions, scales, and rotates assets. Supports parent-child relationships where transforms are relative.
    - **Streaming Orchestration**: Tracks when all assets in a scene are fully loaded from the Miris servers.
    - **Priority Scoring System**: Calculates real-time scores for each asset based on importance, distance, and depth band. These scores inform the Miris streaming logic to optimize performance and fidelity.
    - **Asset Animation**: Applies dynamic runtime behaviors (e.g., rotation, vertical bounce) defined in the scene configuration.

### Performance & Optimization (Priority Scoring)

The engine implements a multi-factor priority scoring system:
- **Importance (0-1)**: Author-defined base priority.
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
