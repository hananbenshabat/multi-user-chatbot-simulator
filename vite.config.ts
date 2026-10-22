import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite`                          the demo page (index.html → demo/main.tsx)
// `vite build`                    dist/index.js (+ core.js, script.js, adapters/): ES modules for React apps and Node
// `vite build --mode standalone`  dist/chatbot-sim.js: one script with React inside, for any page
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  return {
    plugins: [react()],
    server: { port: 8765, strictPort: true },
    define: standalone ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
    build: {
      emptyOutDir: !standalone,
      sourcemap: true,
      lib: standalone
        ? {
            entry: 'src/standalone.ts',
            formats: ['iife'],
            name: 'ChatbotSim',
            fileName: () => 'chatbot-sim.js',
            cssFileName: 'chatbot-sim',
          }
        : {
            // one file per package export; core, script and the adapters need no React and run in Node
            entry: {
              index: 'src/index.ts',
              core: 'src/core/index.ts',
              script: 'src/script/index.ts',
              'adapters/demo': 'src/adapters/demo.ts',
              'adapters/http-json': 'src/adapters/http-json.ts',
            },
            formats: ['es'],
            fileName: (_format, name) => name + '.js',
            cssFileName: 'chatbot-sim',
          },
      // React and React Router stay external so an app's own copies are shared (one router context)
      rollupOptions: standalone ? {} : { external: [/^react($|\/)/, /^react-dom($|\/)/, /^react-router($|\/)/] },
    },
  };
});
