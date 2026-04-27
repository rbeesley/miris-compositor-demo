// src/utils/roseGeometry.ts

import * as THREE from 'three';

export function generateHemispherePoints(count: number, radius = 1.5) :number[][] {
    const points = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    let i = 0;
    let attempts = 0;

    while (points.length < count && attempts < count * 3) {
        const y = 1 - (i / (count * 2)) * 2; // from 1 → -1
        const r = Math.sqrt(1 - y * y);
        const theta = goldenAngle * i;

        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;

        if (y >= 0) {
            points.push([x * radius, y * radius, z * radius]);
        }

        i++;
        attempts++;
    }

    return points;
}

export function rotationFromNormal(nx: number, ny: number, nz: number): number[] {
    const normal = new THREE.Vector3(nx, ny, nz).normalize();

    // The rose's true forward direction is +Y
    const modelForward = new THREE.Vector3(0, 1, 0);

    // Rotate +Y → normal
    const q = new THREE.Quaternion().setFromUnitVectors(modelForward, normal);

    // Base offset so that top rose has rotation [0,0,0]
    const base = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, 0, 0)
    );

    // Apply base offset first
    q.premultiply(base);

    const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');

    return [euler.x, euler.y, euler.z];
}
