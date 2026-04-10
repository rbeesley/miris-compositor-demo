# Architecture Notes

## Compositing Engine Overview

The compositing engine is designed to handle multiple high-fidelity streaming assets from Miris XR.

### Core Components

1.  **Scene Manager**: Responsible for managing the global three.js scene, camera, and renderer.
2.  **Asset Loader**: Wraps the Miris Web SDK to handle asset loading and streaming status.
3.  **Compositor**: Manages the relative spatial coordinates of loaded assets. It provides methods to position, scale, and rotate assets relative to each other or a global origin.
4.  **LOD Synchronizer**: While Miris handles LOD per asset, the synchronizer ensures that assets at similar depths maintain a consistent visual fidelity and performance profile.

## Coordinate System

The engine uses a right-handed coordinate system (standard in three.js). Assets are positioned using a relative coordinate system:
-   **Root Anchor**: A global reference point for the entire scene.
-   **Local Offsets**: Each asset has an offset relative to its parent anchor.

## Implementation Details

-   **Miris Web SDK**: Provides the underlying streaming technology for large 3D models.
-   **three.js**: Handles the final rendering of the composited scene.
