/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** 'true' shows the reference-only AI photo similarity area on match cards. Off by default. */
  readonly VITE_FEATURE_AI_PHOTO_SIMILARITY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
