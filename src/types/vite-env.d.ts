/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MIRIS_VIEWER_KEY: string;
  readonly VITE_MIRIS_ASSET_A_ID: string;
  readonly VITE_MIRIS_ASSET_B_ID: string;
  readonly VITE_MIRIS_ASSET_C_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}