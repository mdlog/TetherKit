/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIGNALING_URL?: string;
  readonly VITE_ICE_SERVERS?: string;
  readonly VITE_PUBLIC_ORIGIN?: string;
  readonly VITE_SIBLING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
