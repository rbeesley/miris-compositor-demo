# Miris Compositor Demo

A high-fidelity spatial compositing engine built on the Miris XR streaming platform, three.js, and Vite.

## Overview

This project is a compositing engine capable of:
- **Streaming multiple high-fidelity 3D assets** via Miris XR Web SDK.
- **Hierarchical Asset Positioning**: Assets are placed in a unified three.js scene with relative spatial coordinates (parent-child transforms).
- **Dynamic Priority Scoring**: Calculates real-time priority scores based on distance to camera, asset importance, and depth bands to optimize streaming resources.
- **Built-in Animations**: Supports simple animations like rotation and vertical bouncing, defined directly in the scene configuration.
- **Modern Workflow**: Fast development using Vite and type-safe development with TypeScript.

## Architecture

The engine is built on the following stack:
- **[Miris XR Web SDK](https://miris.com)**: For adaptive, high-fidelity spatial asset streaming.
- **[three.js](https://threejs.org)**: As the 3D runtime and scene layer.
- **Vite**: For a fast development environment and optimized builds.
- **TypeScript**: For robust, type-safe development.

See the [`/docs`](./docs) folder for detailed documentation:
- [**Architecture**](./docs/architecture.md): Core components and system design.
- [**Scene Definition**](./docs/scene-definition.md): Documentation of the hierarchical scene configuration format.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Access to Miris Public Beta (for streaming capabilities and a valid `VITE_MIRIS_VIEWER_KEY`)

### Configuration
Create a `.env` file in the root directory:
```env
VITE_MIRIS_VIEWER_KEY=your_miris_viewer_key_here
```

### Installation
1. Clone the repository.
2. Install dependencies:
```bash
npm install
```

### Development
Start the local development server:
```bash
npm run dev
```

### Build
Generate a production-ready build:
```bash
npm run build
```

## Status

Active development.
- [x] Initial Vite + TypeScript setup.
- [x] three.js integration.
- [x] Miris Web SDK integration (MirisAdapter & MirisStream).
- [x] Hierarchical Compositing engine logic.
- [x] Priority-based scoring system.
- [x] Scene definition system.
