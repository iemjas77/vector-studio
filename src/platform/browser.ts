import type { OpenedFile, Platform, SaveRequest } from './types';

/** Browser implementation: <input type=file> for open, anchor download for save. */
export const browserPlatform: Platform = {
  kind: 'browser',
  openTextFile(accept) {
    return new Promise<OpenedFile | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept.join(',');
      input.style.display = 'none';
      let settled = false;
      const finish = (v: OpenedFile | null) => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(v);
      };
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        if (!f) { finish(null); return; }
        settled = true; // a late 'cancel' must not win over a real selection
        input.remove();
        resolve({ name: f.name, text: await f.text() });
      });
      // Defensive: a 'cancel' may be dispatched shortly before a 'change' on some browsers, so give a real selection a moment to win.
      input.addEventListener('cancel', () => { setTimeout(() => finish(null), 600); });
      document.body.appendChild(input);
      input.click();
    });
  },
  openBinaryFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept.join(',');
      input.style.display = 'none';
      let settled = false;
      const finish = (v: { name: string; bytes: Uint8Array } | null) => { if (!settled) { settled = true; input.remove(); resolve(v); } };
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        if (!f) { finish(null); return; }
        settled = true;
        input.remove();
        resolve({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      });
      input.addEventListener('cancel', () => { setTimeout(() => finish(null), 600); });
      document.body.appendChild(input);
      input.click();
    });
  },
  async saveFiles(files) {
    const saved: string[] = [];
    for (const f of files) {
      const dot = f.name.lastIndexOf('.');
      const r = await browserPlatform.saveFile({ suggestedName: f.name.slice(0, dot), ext: f.name.slice(dot + 1), data: f.data, mime: f.mime });
      if (r) saved.push(r.name);
      await new Promise((res) => setTimeout(res, 150)); // browsers drop downloads that fire in the same tick
    }
    return saved;
  },
  async saveFile(req: SaveRequest) {
    const name = req.suggestedName.endsWith('.' + req.ext) ? req.suggestedName : `${req.suggestedName}.${req.ext}`;
    const blob = new Blob([req.data as BlobPart], { type: req.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { name };
  },
};
