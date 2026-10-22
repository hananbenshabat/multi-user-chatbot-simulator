import { createContext, useContext, useSyncExternalStore } from 'react';
import type { SimStore, AddPreset } from './store';
import type { User } from '../types';

export const StoreContext = createContext<SimStore | null>(null);

/** The simulator's store; the component re-renders on every change. */
export function useSim(): SimStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useSim outside the simulator');
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}

/** The store without subscribing (for components that get a revision prop instead). */
export function useSimStatic(): SimStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useSimStatic outside the simulator');
  return store;
}

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** an extra checkbox; its value is returned as `checked` */
  checkbox?: string;
}

export interface UiApi {
  openAdd(pre?: AddPreset): void;
  openEdit(user: User): void;
  openTargets(user: User): void;
  openScript(): void;
  importFile(): void;
  exportFile(): void;
  clearAll(): void;
  confirmRemove(user: User): void;
  confirmClearChat(user: User): void;
  confirm(o: ConfirmOptions): Promise<{ ok: boolean; checked: boolean }>;
}

export const UiContext = createContext<UiApi | null>(null);

export function useUi(): UiApi {
  const ui = useContext(UiContext);
  if (!ui) throw new Error('useUi outside the simulator');
  return ui;
}
