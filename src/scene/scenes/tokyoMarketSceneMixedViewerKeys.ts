import type { SceneDefinition } from '../sceneDefinition';

export const tokyoMarketScene: SceneDefinition = {
    version: "1.0.0",
    id: 'tokyo-market-demo',
    label: 'Tokyo Market Demo',
    rootNodeIds: ['tokyo-market'],
    viewerKey: 'miris-player-viewer-key',
    initialCamera: {
        position: [0.35, 1.25, 2.8],
        rotation: [-0.15, 0.1, 0],
    },
    nodes: [
        {
            id: 'tokyo-market',
            label: 'Tokyo Market',
            streamId: '1749e7b3-a1a9-4201-85f6-3448ae4504c1',
            viewerKey: 'miris-player-viewer-key',
            transform: {
                position: [0, 1, 0],
                rotation: [0, 0, 0],
                scale: [5, 5, 5],
            },
            animation: {
                rotate: true,
                rotateSpeed: 0.0015,
                bounce: false,
            },
            priority: {
                importance: 1.0,
                sceneWeight: 1.0,
                depthBand: 'foreground',
            },
            debugColor: 0x3b82f6,
        },
        {
            id: 'turbofan-engine',
            label: 'Turbofan Engine',
            streamId: 'eb7bd843-aa34-4eda-b9cf-7e22f9b96408',
            viewerKey: 'personal-viewer-key',
            parentId: 'tokyo-market',
            transform: {
                position: [-0.04, -0.195, 0.21],
                rotation: [0, Math.PI * 0.6, 0],
                scale: [0.0001, 0.0001, 0.0001],
            },
            animation: {
                rotate: false,
                bounce: false,
            },
            priority: {
                importance: 0.75,
                sceneWeight: 0.4,
                depthBand: 'midground',
            },
            debugColor: 0x10b981,
        },
        {
            id: 'koosh-ball',
            label: 'Koosh Ball',
            streamId: '8723c215-7e2d-49a1-9c69-b36fb0d92a3d',
            viewerKey: 'personal-viewer-key',
            parentId: 'tokyo-market',
            transform: {
                position: [0.034, -0.167, 0.19],
                rotation: [0, 0, 0],
                scale: [0.04, 0.04, 0.04],
            },
            animation: {
                rotate: true,
                bounce: true,
                bounceAmplitude: 0.01,
                bounceFrequency: 2.0,
                bounceAbsolute: true,
                bounceDirection: [0, 1, 0],
            },
            priority: {
                importance: 0.75,
                sceneWeight: 0.4,
                depthBand: 'midground',
            },
            debugColor: 0x10b981,
        },
        {
            id: 'destroyed-car',
            label: 'Destroyed Car',
            streamId: 'd496d140-ffd1-4bed-b0d8-812567321395',
            viewerKey: 'miris-player-viewer-key',
            parentId: 'tokyo-market',
            transform: {
                position: [-0.10, -0.18, 0.23],
                rotation: [0, Math.PI * -0.4, 0],
                scale: [0.01, 0.01, 0.01],
            },
            animation: {
                rotate: false,
                bounce: false,
            },
            priority: {
                importance: 0.75,
                sceneWeight: 0.4,
                depthBand: 'background',
            },
            debugColor: 0x10b981,
        },
    ],
};