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
                // Чанк страницы глобуса (three + globe.gl + гео-данные) > 2 MiB;
                // без этого workbox отказывается его прекешировать и сборка падает.
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
            },
            manifest: {
                name: 'Earth Orbit Live',
                short_name: 'OrbitLive',
                description: 'Real-time satellite tracking application',
                theme_color: '#F4F1EA',
                background_color: '#F4F1EA',
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
