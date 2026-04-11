import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MirisScene } from '@miris-inc/three';

type MirisSceneWithEvents = MirisScene & {
    addEventListener?: (type: string, listener: (event?: unknown) => void) => void;
    isLoaded?: boolean;
};

export interface SceneContext {
    scene: THREE.Scene;
    mirisScene: MirisSceneWithEvents;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
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
    const scene = mirisScene as unknown as THREE.Scene;

    const mirisReady = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
            console.warn('[MirisScene] mirisReady timed out after 5 seconds, proceeding anyway');
            resolve();
        }, 5000);

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

    scene.background = new THREE.Color(0xe5e7eb);

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(1.5, 1.5, 2.5);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);
    controls.update();

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.25);
    keyLight.position.set(8, 12, 6);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9ec5ff, 0.75);
    fillLight.position.set(-6, 6, -8);
    scene.add(fillLight);

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
        scene,
        mirisScene,
        camera,
        renderer,
        controls,
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