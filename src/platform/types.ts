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
  openTextFile(accept: string[]): Promise<OpenedFile | null>;
  saveFile(req: SaveRequest): Promise<{ name: string; path?: string } | null>;
  /** Called when the window is about to close; return true to allow. Only used by Electron. */
  onCloseRequest?(handler: () => Promise<boolean>): void;
}
