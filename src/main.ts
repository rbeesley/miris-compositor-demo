import './style.css';
import { startAppSession, type AppSession } from './appSession';

console.group('[boot]');
console.info('time', new Date().toISOString());
console.info('href', window.location.href);
console.info('readyState', document.readyState);
console.info('mode', import.meta.env.MODE);
console.info('dev', import.meta.env.DEV);
console.groupEnd();

window.addEventListener('DOMContentLoaded', () => {
  console.info('[lifecycle] DOMContentLoaded');
});

window.addEventListener('load', () => {
  console.info('[lifecycle] window.load');
});

window.addEventListener('error', (event) => {
  console.error('[window.error]', event.message, event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason);
});

let activeSession: AppSession | null = null;
let bootId = 0;

function disposeActiveSession(reason: string): void {
  console.info('[boot] disposeActiveSession:', reason);

  if (!activeSession) {
    console.info('[boot] no active session to dispose');
    return;
  }

  try {
    activeSession.dispose();
  } finally {
    activeSession = null;
  }
}

async function bootstrap(): Promise<void> {
  const currentBootId = ++bootId;
  console.group(`[boot:${currentBootId}]`);
  console.time(`[boot:${currentBootId}] total`);

  try {
    disposeActiveSession('before bootstrap');

    console.info(`[boot:${currentBootId}] starting app session`);
    activeSession = await startAppSession();
    console.info(`[boot:${currentBootId}] app session started`);
  } catch (error) {
    console.error(`[boot:${currentBootId}] failed`, error);
    throw error;
  } finally {
    console.timeEnd(`[boot:${currentBootId}] total`);
    console.groupEnd();
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.info('[hmr] dispose triggered');
    disposeActiveSession('hmr dispose');
  });

  import.meta.hot.accept((newModule) => {
    console.info('[hmr] accept triggered', newModule);
  });
}

void bootstrap().catch((error) => {
  console.error('[boot] fatal startup failure', error);
});