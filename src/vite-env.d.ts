/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INPUT_MODE?: 'pointer' | 'pose' | 'camera'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
