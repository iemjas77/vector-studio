import { runBatch, type BatchOptions } from './batch';

const HELP = `Vector Studio batch exporter

Usage: node dist-cli/main.js [options] file.vstudio [more files...]

  --out DIR            output folder (default ./export)
  --format FMT         png | jpeg | pdf | svg (default png)
  --artboard NAME|all  which artboard(s) (default all)
  --sizes "WxH,WxH"    re-target the design to each size first (content scaled to fit)
  --mode fit|fill|none how --sizes scales content (default fit)
  --actions FILE.json  apply an action list (cleanup, reduceColors, ...) before export
  --transparent        PNG with transparent background
  --scale N | --width PX   raster size (ignored with --sizes)
  --ppi N              resolution written into the file (default: the document's)
  --quality 1-100      JPEG quality (default 92)
`;

function parse(argv: string[]): BatchOptions | null {
  const o: BatchOptions = { inputs: [], outDir: 'export', format: 'png' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    switch (a) {
      case '-h': case '--help': return null;
      case '--out': o.outDir = val(); break;
      case '--format': { const f = val(); if (!['png', 'jpeg', 'pdf', 'svg'].includes(f)) throw new Error(`Unknown format "${f}"`); o.format = f as BatchOptions['format']; break; }
      case '--artboard': o.artboard = val(); break;
      case '--sizes': o.sizes = val(); break;
      case '--mode': { const m = val(); if (!['fit', 'fill', 'none'].includes(m)) throw new Error(`Unknown mode "${m}"`); o.mode = m as BatchOptions['mode']; break; }
      case '--actions': o.actionsFile = val(); break;
      case '--transparent': o.transparent = true; break;
      case '--scale': o.scale = +val(); break;
      case '--width': o.width = +val(); break;
      case '--ppi': o.ppi = +val(); break;
      case '--quality': o.quality = +val() / 100; break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
        o.inputs.push(a);
    }
  }
  return o;
}

try {
  const o = parse(process.argv.slice(2));
  if (!o) { console.log(HELP); process.exit(0); }
  const files = await runBatch(o);
  console.log(`Wrote ${files.length} file(s):\n${files.map((f) => '  ' + f).join('\n')}`);
} catch (e) {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
}
