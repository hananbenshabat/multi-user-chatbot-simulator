import { createRoot } from 'react-dom/client';
import type { Controller, SimulatorOptions } from '../types';
import { SimStore } from './store';
import { SimulatorView } from './Simulator';

/**
 * Render a simulator into `el` (any page, no React needed by the host) and return its
 * controller right away. `controller.destroy()` saves, stops polling and unmounts.
 */
export function mount(el: HTMLElement, options: SimulatorOptions): Controller {
  const store = new SimStore(options);
  const root = createRoot(el);
  store.onDestroy = () => root.unmount();
  root.render(<SimulatorView store={store} />);
  return store.controller;
}
