// src/utils/urlState.ts

import * as THREE from 'three';

export type CameraState = {
    cx?: number;
    cy?: number;
    cz?: number;
    qx?: number;
    qy?: number;
    qz?: number;
    qw?: number;
    aid?: string;
    sid?: string;
    scene?: string;
};

export function updateUrlFromCamera(camera: THREE.Camera, cameraAnchor: THREE.Object3D, selectedAssetId?: string | null, sceneId?: string | null): void {
    const params = new URLSearchParams(window.location.hash.substring(1));

    if (camera && cameraAnchor) {
        const isAnchored = cameraAnchor.parent !== null && 
                           cameraAnchor.parent.type !== 'Scene' &&
                           cameraAnchor.parent.parent !== null;
        
        let pos: THREE.Vector3;
        let quat: THREE.Quaternion;

        if (isAnchored) {
            // When anchored, we want coordinates relative to the anchor (which is the parent of cameraAnchor)
            // camera.position is already relative to cameraAnchor, and cameraAnchor.position is (0,0,0) relative to its parent.
            // So camera.position IS the relative position to the anchor.
            pos = camera.position;
            quat = camera.quaternion;
        } else {
            // When not anchored, we want world coordinates
            pos = new THREE.Vector3();
            quat = new THREE.Quaternion();
            camera.getWorldPosition(pos);
            camera.getWorldQuaternion(quat);
        }

        params.set('cx', pos.x.toFixed(3));
        params.set('cy', pos.y.toFixed(3));
        params.set('cz', pos.z.toFixed(3));

        params.set('qx', quat.x.toFixed(6));
        params.set('qy', quat.y.toFixed(6));
        params.set('qz', quat.z.toFixed(6));
        params.set('qw', quat.w.toFixed(6));

        if (isAnchored && cameraAnchor.parent) {
            // In this project, anchor parents are named 'miris-asset:ID'
            const aid = cameraAnchor.parent.name.replace('miris-asset:', '');
            params.set('aid', aid);
        } else {
            params.delete('aid');
        }
    }

    if (selectedAssetId) {
        params.set('sid', selectedAssetId);
    } else {
        params.delete('sid');
    }

    if (sceneId) {
        params.set('scene', sceneId);
    } else {
        params.delete('scene');
    }

    const newHash = '#' + params.toString();
    if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', newHash);
    }
}

export function getCameraStateFromUrl(): CameraState | null {
    const hash = window.location.hash.substring(1);
    if (!hash) return null;

    const params = new URLSearchParams(hash);

    const state: CameraState = {};

    const cx = params.get('cx');
    const cy = params.get('cy');
    const cz = params.get('cz');
    const qx = params.get('qx');
    const qy = params.get('qy');
    const qz = params.get('qz');
    const qw = params.get('qw');

    if (cx !== null && cy !== null && cz !== null && qx !== null && qy !== null && qz !== null && qw !== null) {
        state.cx = Number(cx);
        state.cy = Number(cy);
        state.cz = Number(cz);
        state.qx = Number(qx);
        state.qy = Number(qy);
        state.qz = Number(qz);
        state.qw = Number(qw);

        const values = [state.cx, state.cy, state.cz, state.qx, state.qy, state.qz, state.qw];
        if (values.some((value) => !Number.isFinite(value))) {
            return null;
        }
    }

    const aid = params.get('aid');
    if (aid) state.aid = aid;

    const sid = params.get('sid');
    if (sid) state.sid = sid;

    const scene = params.get('scene');
    if (scene) state.scene = scene;

    // Only return state if it has at least one valid parameter
    if (Object.keys(state).length === 0) {
        return null;
    }

    return state;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    return (...args: Parameters<T>) => {
        if (timeout !== undefined) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
            fn(...args);
        }, delay);
    };
}
