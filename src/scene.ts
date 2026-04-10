import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MirisScene } from '@miris-inc/three';

export interface SceneContext {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    timer: THREE.Timer;
    mount: HTMLElement;
    dispose: () => void;
}

export function createSceneContext(
    mount: HTMLElement,
    viewerKey?: string,
): SceneContext {
    const scene = new MirisScene({ viewerKey: viewerKey ?? null }) as THREE.Scene;
    scene.background = new THREE.Color(0xe5e7eb);

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(6, 5, 8);

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
        camera,
        renderer,
        controls,
        timer,
        mount,
        dispose: () => {
            window.removeEventListener('resize', onResize);
            controls.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        },
    };
}