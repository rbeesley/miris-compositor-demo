import { defineConfig } from 'vite'

export default defineConfig({
    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,
    },
    build: {
        sourcemap: true,
    },
    resolve: {
        // Ensuring Three.js is always bundled consistently to avoid multiple versions
        alias: {
            'three': 'three',
        }
    },
    optimizeDeps: {
        // Forcing Three.js and Miris adapter to be pre-bundled
        include: ['three', '@miris-inc/three'],
    }
})