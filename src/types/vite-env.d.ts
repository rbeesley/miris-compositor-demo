/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MIRIS_VIEWER_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}