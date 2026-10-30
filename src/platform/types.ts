import type { FontSource } from '../core/text';

export interface OpenedFile {
  name: string;
  path?: string;
  text: string;
}

export interface SaveRequest {
  suggestedName: string;
  /** Existing path to overwrite without prompting (Electron only). */
  path?: string;
  data: string | Uint8Array;
  mime: string;
  /** Extension without dot, e.g. "vstudio". */
  ext: string;
  /** Always show the dialog (Save As). */
  forceDialog?: boolean;
}

/** Everything the app needs from the host: Electron on Windows, plain browser for development and tests. */
export interface Platform {
  kind: 'electron' | 'browser';
  /** System fonts, when the host can provide them. */
  fontSource?: FontSource;
  openTextFile(accept: string[]): Promise<OpenedFile | null>;
  /** Pick several files (or a whole folder, non-recursive in Electron / recursive in browsers) and read them as text. */
  openTextFiles(accept: string[], folder?: boolean): Promise<OpenedFile[] | null>;
  openBinaryFile(accept: string[]): Promise<{ name: string; bytes: Uint8Array } | null>;
  saveFile(req: SaveRequest): Promise<{ name: string; path?: string } | null>;
  /** Save several files at once (batch export). Electron asks for one folder; browsers download them one after another. Returns the saved names. */
  saveFiles(files: { name: string; data: string | Uint8Array; mime: string }[]): Promise<string[] | null>;
  /** Called when the window is about to close; return true to allow. Only used by Electron. */
  onCloseRequest?(handler: () => Promise<boolean>): void;
}
