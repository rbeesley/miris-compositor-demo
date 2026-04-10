import './style.css';
import * as THREE from 'three';
import { createSceneContext } from './scene';
import { MirisAdapter } from './mirisAdapter';
import { Compositor, type StreamedSceneAsset } from './compositor';
import { getMirisConfig } from './config';
import type { SceneContext } from './scene';

function ensureAppMount(): HTMLElement {
  let app = document.getElementById('app');

  if (!app) {
    app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);
  }

  return app;
}

function addStatusBadge(message: string): void {
  const badge = document.createElement('div');
  badge.textContent = message;

  Object.assign(badge.style, {
    position: 'fixed',
    top: '12px',
    left: '12px',
    padding: '8px 12px',
    background: 'rgba(15, 23, 42, 0.85)',
    color: '#e2e8f0',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
    borderRadius: '8px',
    zIndex: '1000',
    pointerEvents: 'none',
  });

  document.body.appendChild(badge);
}

let activeCompositor: Compositor | null = null;
let activeSceneContext: SceneContext | null = null;

async function main() {
  if (activeCompositor) {
    activeCompositor.dispose();
    activeCompositor = null;
  }
  if (activeSceneContext) {
    activeSceneContext.dispose();
    activeSceneContext = null;
  }

  const config = getMirisConfig();
  const mount = ensureAppMount();
  
  // Clear the mount in case something was left from a previous run
  mount.innerHTML = '';

  addStatusBadge(
      config.viewerKey
          ? 'Miris compositor: viewer key configured'
          : 'Miris compositor: fallback only, set MIRIS_VIEWER_KEY'
  );

  const sceneContext = createSceneContext(mount, config.viewerKey);
  const mirisAdapter = new MirisAdapter(sceneContext.scene);
  const compositor = new Compositor(sceneContext, mirisAdapter);

  activeSceneContext = sceneContext;
  activeCompositor = compositor;

  const assets: StreamedSceneAsset[] = [
    {
      id: 'asset-a',
      streamId: config.assetAId || '',
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      boundsMeters: new THREE.Vector3(1, 1, 1),
      importance: 1.0,
      depthBand: 'foreground',
      debugColor: 0x3b82f6,
    },
    {
      id: 'asset-b',
      streamId: config.assetBId || '',
      position: new THREE.Vector3(2.5, 0, -2.5),
      rotation: new THREE.Euler(0, Math.PI * 0.2, 0),
      scale: new THREE.Vector3(1, 1, 1),
      boundsMeters: new THREE.Vector3(1, 1, 1),
      importance: 0.75,
      depthBand: 'midground',
      debugColor: 0x10b981,
    },
    {
      id: 'asset-c',
      streamId: config.assetCId || '',
      position: new THREE.Vector3(-3, 0, -5),
      rotation: new THREE.Euler(0, -Math.PI * 0.15, 0),
      scale: new THREE.Vector3(1, 1, 1),
      boundsMeters: new THREE.Vector3(1, 1, 1),
      importance: 0.5,
      depthBand: 'background',
      debugColor: 0xf59e0b,
    },
  ];

  compositor.addDebugGround();
  await compositor.loadAssets(assets);
  compositor.start();
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    if (activeCompositor) {
      activeCompositor.dispose();
      activeCompositor = null;
    }
    if (activeSceneContext) {
      activeSceneContext.dispose();
      activeSceneContext = null;
    }
  });
}

main().catch((error) => {
  console.error('Failed to start app:', error);
});