import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the project at /<repo-name>/ (spec 7); VITE_BASE overrides it (e.g. for e2e or a custom domain).
export default defineConfig(({ command }) => {
  const base = process.env.VITE_BASE ?? (command === 'build' ? '/visa-map/' : '/');
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'icons/*.png'],
        workbox: {
          // App shell only: JS/CSS/HTML, icons and the bundled TopoJSON. Visa data lives in IndexedDB (spec 7).
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
          globIgnores: ['data/**'],
          navigateFallback: `${base}index.html`,
        },
        manifest: {
          name: 'Visa Map',
          short_name: 'Visa Map',
          description: 'Интерактивная карта визовых режимов по паспорту',
          lang: 'ru',
          display: 'standalone',
          start_url: base,
          scope: base,
          theme_color: '#1f3a5f',
          background_color: '#e6eff7',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  };
});
