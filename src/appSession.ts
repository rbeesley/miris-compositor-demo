import { createSceneContext } from './scene';
import { MirisAdapter } from './mirisAdapter';
import { Compositor } from './compositor';
import { getMirisConfig } from './config/mirisEnv';
import type { SceneContext } from './scene';
import { tokyoMarketScene } from './scene/scenes/tokyoMarketScene';

export type AppSession = {
    compositor: Compositor;
    sceneContext: SceneContext;
    dispose: () => void;
};

function ensureAppMount(): HTMLElement {
    let app = document.getElementById('app');

    if (!app) {
        app = document.createElement('div');
        app.id = 'app';
        document.body.appendChild(app);
        console.info('[dom] created #app mount');
    } else {
        console.info('[dom] reusing existing #app mount');
    }

    return app;
}

function addStatusBadge(message: string): void {
    let badge = document.getElementById('app-status-badge');

    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'app-status-badge';

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

    badge.textContent = message;
    console.info('[dom] status badge set:', message);
}

export async function startAppSession(): Promise<AppSession> {
    console.group('[session] start');
    console.time('[session] total');

    try {
        const config = getMirisConfig();
        console.info('[config] resolved', {
            hasViewerKey: !!config.viewerKey,
            config,
        });

        const mount = ensureAppMount();
        console.info('[dom] clearing mount');
        mount.innerHTML = '';

        addStatusBadge(
            config.viewerKey
                ? 'Miris compositor: viewer key configured'
                : 'Miris compositor: fallback only, set VITE_MIRIS_VIEWER_KEY',
        );

        console.time('[session] createSceneContext');
        const sceneContext = createSceneContext(mount, config.viewerKey);
        console.timeEnd('[session] createSceneContext');
        console.info('[scene] context created', sceneContext);

        console.time('[session] mirisReady');
        console.info('[session] awaiting mirisReady...');
        await sceneContext.mirisReady;
        console.timeEnd('[session] mirisReady');
        console.info('[session] Miris context is ready');

        console.time('[session] createMirisAdapter');
        const mirisAdapter = new MirisAdapter(sceneContext.scene);
        console.timeEnd('[session] createMirisAdapter');
        console.info('[miris] adapter created', mirisAdapter);

        console.time('[session] createCompositor');
        const compositor = new Compositor(sceneContext, mirisAdapter);
        console.timeEnd('[session] createCompositor');
        console.info('[compositor] created', compositor);

        console.time('[session] addDebugGround');
        compositor.addDebugGround();
        console.timeEnd('[session] addDebugGround');
        console.info('[compositor] debug ground added');

        console.time('[session] loadScene');
        await compositor.loadScene(tokyoMarketScene);
        console.timeEnd('[session] loadScene');
        console.info('[compositor] scene loaded');

        console.time('[session] start');
        compositor.start();
        console.timeEnd('[session] start');
        console.info('[compositor] started');

        console.time('[session] compositor.ready');
        await compositor.ready;
        console.timeEnd('[session] compositor.ready');
        console.info('[session] Miris scene + streams fully ready');

        const dispose = () => {
            console.group('[session] dispose');
            try {
                console.info('[compositor] disposing');
                compositor.dispose();
            } catch (error) {
                console.error('[compositor] dispose failed', error);
            }

            try {
                console.info('[scene] disposing');
                sceneContext.dispose();
            } catch (error) {
                console.error('[scene] dispose failed', error);
            }
            console.groupEnd();
        };

        return { compositor, sceneContext, dispose };
    } catch (error) {
        console.error('[session] start failed', error);
        throw error;
    } finally {
        console.timeEnd('[session] total');
        console.groupEnd();
    }
}