import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Logic tests run in Node; files under test/ui/ render React in happy-dom.
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: 'logic', include: ['test/*.test.ts'], environment: 'node' } },
      {
        extends: true,
        test: { name: 'ui', include: ['test/ui/**/*.test.tsx'], environment: 'happy-dom', setupFiles: ['test/ui/setup.ts'] },
      },
    ],
  },
});
