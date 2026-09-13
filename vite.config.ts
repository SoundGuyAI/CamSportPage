import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Project Pages URL: https://SoundGuyAI.github.io/CamSportPage/
export default defineConfig({
  plugins: [react()],
  base: '/CamSportPage/',
})
