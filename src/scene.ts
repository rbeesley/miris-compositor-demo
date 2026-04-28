// src/scene.ts

import * as THREE from 'three';
import { CameraControls } from './controls/CameraControls';
import { MirisScene } from '@miris-inc/three';

type MirisSceneWithEvents = MirisScene & {
    addEventListener?: (type: string, listener: (event?: unknown) => void) => void;
    isLoaded?: boolean;
};

export interface SceneContext {
    scene: MirisSceneWithEvents;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: CameraControls;
    cameraAnchor: THREE.Object3D;
    timer: THREE.Timer;
    mount: HTMLElement;
    mirisReady: Promise<void>;
    dispose: () => void;
}

export function createSceneContext(
    mount: HTMLElement,
    viewerKey?: string,
): SceneContext {
    const mirisScene = new MirisScene({ viewerKey: viewerKey ?? null }) as MirisSceneWithEvents;

    const mirisReady = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
            console.warn('[MirisScene] mirisReady timed out after 1 second, proceeding anyway');
            resolve();
        }, 1000);

        if (typeof mirisScene.addEventListener === 'function') {
            mirisScene.addEventListener('sceneloaded', (event) => {
                console.info('[MirisScene] sceneloaded', event);
                clearTimeout(timeout);
                resolve();
            });
            // Also check if already loaded
            if (mirisScene.isLoaded) {
                console.info('[MirisScene] already loaded');
                clearTimeout(timeout);
                resolve();
            }
        } else {
            console.warn('[MirisScene] no addEventListener, resolving mirisReady immediately');
            clearTimeout(timeout);
            resolve();
        }
    });

    mirisScene.background = new THREE.Color(0xe5e7eb);

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const cameraAnchor = new THREE.Object3D();
    mirisScene.add(cameraAnchor);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(1.5, 1.5, 2.5);
    cameraAnchor.add(camera);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    mount.appendChild(renderer.domElement);

    const controls = new CameraControls(camera, renderer.domElement, cameraAnchor);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
    mirisScene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.25);
    keyLight.position.set(8, 12, 6);
    mirisScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9ec5ff, 0.75);
    fillLight.position.set(-6, 6, -8);
    mirisScene.add(fillLight);

    const timer = new THREE.Timer();

    function onResize(): void {
        const nextWidth = mount.clientWidth || window.innerWidth;
        const nextHeight = mount.clientHeight || window.innerHeight;

        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight);
    }

    window.addEventListener('resize', onResize);

    return {
        scene: mirisScene,
        camera,
        renderer,
        controls,
        cameraAnchor,
        timer,
        mount,
        mirisReady,
        dispose: () => {
            window.removeEventListener('resize', onResize);
            controls.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        },
    };
}