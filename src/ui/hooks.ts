import { createContext, useContext, useSyncExternalStore } from 'react';
import type { App } from './commands';

export const AppContext = createContext<App | null>(null);

/** Returns the app and re-renders on any editor/workspace change. */
export function useApp(): App {
  const app = useContext(AppContext);
  if (!app) throw new Error('AppContext missing');
  useSyncExternalStore(app.ws.subscribe.bind(app.ws), () => app.ws.version);
  return app;
}
