// src/tools/generate-roses.ts

import { generateHemispherePoints, rotationFromNormal } from '../src/utils/roseGeometry';

function generateRoseAssets(count: number) {
    const radius = 1.5;
    const points: number[][] = generateHemispherePoints(count, radius);

    return points.map((p: number[], index: number) => {
        const [x, y, z] = p;
        const rotation = rotationFromNormal(x, y, z);

        return {
            id: `rose-${index + 1}`,
            label: `Rose ${index + 1}`,
            parentId: 'tree',
            streamId: '9613e95e-d36b-49fc-830b-22f4a7d07f8f',
            transform: {
                position: [x, y, z],
                rotation,
                scale: [1, 1, 1],
            },
            animation: {
                rotate: false,
                bounce: false,
            },
        };
    });
}

// @ts-ignore
const count = Number(process.argv[2] ?? 12);
const result = generateRoseAssets(count);

console.log(JSON.stringify(result, null, 2));
