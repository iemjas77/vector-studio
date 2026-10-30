import type { OpenedFile, Platform, SaveRequest } from './types';

interface VsElectronApi {
  openTextFile(accept: string[]): Promise<OpenedFile | null>;
  saveFile(req: Omit<SaveRequest, 'data'> & { data: string | Uint8Array }): Promise<{ name: string; path?: string } | null>;
  onCloseRequest(handler: () => Promise<boolean>): void;
}

declare global {
  interface Window { vsElectron?: VsElectronApi }
}

export function getElectronPlatform(): Platform | null {
  const api = window.vsElectron;
  if (!api) return null;
  return { kind: 'electron', openTextFile: (a) => api.openTextFile(a), saveFile: (r) => api.saveFile(r), onCloseRequest: (h) => api.onCloseRequest(h) };
}
