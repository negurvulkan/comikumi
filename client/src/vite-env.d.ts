/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute origin of the API server (e.g. "https://comikumi.example.com" or
   * "http://192.168.1.20:3001"), no trailing slash — see src/api/apiBase.ts. Unset by
   * default (client + server assumed to share an origin, the normal setup). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
