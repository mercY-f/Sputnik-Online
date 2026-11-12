import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
        },
    },
    server: {
        host: '127.0.0.1',
    },
    plugins: [
        laravel({
            input: 'resources/js/app.js',
            refresh: true,
        }),
        vue({
            template: {
                transformAssetUrls: {
                    base: null,
                    includeAbsolute: false,
                },
            },
        }),
        VitePWA({
            outDir: 'public/build', // Must output to build folder for Laravel Vite
            buildBase: '/build/', // To properly reference assets in the build folder
            registerType: 'autoUpdate',
            workbox: {
                runtimeCaching: [
                    {
                        urlPattern: /\/textures\/.*\.(?:png|jpg|jpeg|svg|webp|avif)$/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'globe-textures-cache',
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                            },
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                        },
                    },
                ],
            },
            manifest: {
                name: 'Earth Orbit Live',
                short_name: 'OrbitLive',
                description: 'Real-time satellite tracking application',
                theme_color: '#050505',
                background_color: '#050505',
                display: 'standalone',
                icons: [
                    {
                        src: '/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            }
        })
    ],
});
