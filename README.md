# Miris Compositor Demo

A high-fidelity spatial compositing engine built on the Miris XR streaming platform, three.js, and Vite.

## Overview

This project demonstrates a compositing engine capable of:
- Streaming multiple high-fidelity 3D assets via Miris XR.
- Positioning assets in a unified three.js scene with relative spatial coordinates.
- Leveraging native streaming Level-of-Detail (LOD) for consistent rendering across different depths.
- A fast, modern development workflow using Vite and TypeScript.

## Architecture

The engine is built on the following stack:
- **[Miris XR Web SDK](https://miris.com)**: For adaptive, high-fidelity spatial asset streaming.
- **[three.js](https://threejs.org)**: As the 3D runtime and scene layer.
- **Vite**: For a fast development environment and optimized builds.
- **TypeScript**: For robust, type-safe development.

See the [`/docs`](./docs) folder for detailed architecture notes and screenshots.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Access to Miris Public Beta (for streaming capabilities)

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

Currently in early development/initial configuration phase.
- [x] Initial Vite + TypeScript setup.
- [x] three.js integration.
- [ ] Miris Web SDK integration.
- [ ] Compositing engine logic implementation.
