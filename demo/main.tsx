// The demo page: `npm run dev`, then open the printed URL.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatbotSimulator, demo, httpJson, type Controller } from '../src/index';
// Imported here too: package.json marks only CSS as having side effects, so a production build can
// skip src/index.ts (it only re-exports) and its stylesheet import with it. Apps import style.css directly.
import '../src/ui/styles.css';

declare global {
  interface Window {
    /** the controller, for trying things from the browser console */
    app?: Controller;
  }
}

const root = document.getElementById('app');
if (!root) throw new Error('index.html needs <div id="app">');

createRoot(root).render(
  <StrictMode>
    <ChatbotSimulator
      title="Multi-User Chatbot Simulator"
      storageKey="chatbot-sim-demo"
      // the dev server answers every path with this page, so clean URLs work (/settings/adapters);
      // GitHub Pages doesn't, so the hosted demo uses #/ URLs that survive a reload
      routing={import.meta.env.MODE === 'pages' ? 'hash' : 'browser'}
      profile="team"
      adapters={[demo(), httpJson({ type: 'http', label: 'Local server' })]}
      onReady={(app: Controller) => {
        window.app = app;
      }}
    />
  </StrictMode>,
);
