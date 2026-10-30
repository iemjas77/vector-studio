import type { OpenedFile, Platform, SaveRequest } from './types';

interface VsElectronApi {
  openTextFile(accept: string[]): Promise<OpenedFile | null>;
  openBinaryFile(accept: string[]): Promise<{ name: string; bytes: Uint8Array } | null>;
  openTextFiles(accept: string[], folder?: boolean): Promise<OpenedFile[] | null>;
  saveFile(req: Omit<SaveRequest, 'data'> & { data: string | Uint8Array }): Promise<{ name: string; path?: string } | null>;
  saveFiles(files: { name: string; data: string | Uint8Array; mime: string }[]): Promise<string[] | null>;
  listFonts(): Promise<{ key: string; family: string; weight: number; italic: boolean }[]>;
  readFont(key: string): Promise<Uint8Array>;
  onCloseRequest(handler: () => Promise<boolean>): void;
}

declare global {
  interface Window { vsElectron?: VsElectronApi }
}

export function getElectronPlatform(): Platform | null {
  const api = window.vsElectron;
  if (!api) return null;
  return { kind: 'electron', fontSource: { list: () => api.listFonts(), load: async (k) => new Uint8Array(await api.readFont(k)) }, openTextFile: (a) => api.openTextFile(a), openTextFiles: (a, f) => api.openTextFiles(a, f), openBinaryFile: async (a) => { const r = await api.openBinaryFile(a); return r ? { name: r.name, bytes: new Uint8Array(r.bytes) } : null; }, saveFile: (r) => api.saveFile(r), saveFiles: (f) => api.saveFiles(f), onCloseRequest: (h) => api.onCloseRequest(h) };
}
