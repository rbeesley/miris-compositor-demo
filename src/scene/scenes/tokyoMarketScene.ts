import type { SceneDefinition } from '../sceneDefinition';

export const tokyoMarketScene: SceneDefinition = {
    id: 'tokyo-market-demo',
    label: 'Tokyo Market Demo',
    rootNodeIds: ['tokyo-market'],
    nodes: [
        {
            id: 'tokyo-market',
            label: 'Tokyo Market',
            streamId: '4307bd04-9059-4000-aaa1-2ff81ec46ad0',
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
            parentId: 'tokyo-market',
            transform: {
                position: [-0.04, -0.18, 0.2],
                rotation: [0, Math.PI * 0.2, 0],
                scale: [0.02, 0.02, 0.02],
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
            parentId: 'tokyo-market',
            transform: {
                position: [0.034, -0.167, 0.19],
                rotation: [0, 0, 0],
                scale: [0.04, 0.04, 0.04],
            },
            animation: {
                rotate: true,
                bounce: false,
            },
            priority: {
                importance: 0.75,
                sceneWeight: 0.4,
                depthBand: 'midground',
            },
            debugColor: 0x10b981,
        },
    ],
};