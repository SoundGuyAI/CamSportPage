/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INPUT_MODE?: 'pointer' | 'pose'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
