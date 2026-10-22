// The demo page: `npm run dev`, then open the printed URL.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatbotSimulator, demo, httpJson, type Controller } from '../src/index';

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
      // the dev server answers every path with this page, so clean URLs work (/settings/adapters)
      routing="browser"
      profile="team"
      adapters={[demo(), httpJson({ type: 'http', label: 'Local server' })]}
      onReady={(app: Controller) => {
        window.app = app;
      }}
    />
  </StrictMode>,
);
