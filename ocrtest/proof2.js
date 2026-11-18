
global.self = global;
require("/home/dropxtor/mangatrans/extension/ocr.js");
const Tesseract = require("tesseract.js");
(async () => {
  const file = "/home/dropxtor/mangatrans/test_page.png";
  // dimensions reelles via sharp-less : utiliser createImageBitmap? Node a fs,
  // l'extension les tire du canvas. Ici on simule avec les dims connues.
  const { createCanvas } = (() => { try { return require("canvas"); } catch { return {}; } })();
  const T = await Tesseract.createWorker("jpn", 1, { logger: () => {} });
  let t = Date.now();
  const { data } = await T.recognize(file, {}, { blocks: true, tsv: true, text: true });
  const dt = ((Date.now() - t) / 1000).toFixed(1);
  const rows = data.tsv.split("\n").slice(1);
  const seen = {}; let maxR = 0, maxB = 0;
  for (const r of rows) { const c = r.split("\t"); seen[c[0]] = (seen[c[0]]||0)+1;
    if (c[0] === "4" || c[0] === "5") { maxR = Math.max(maxR, +c[6] + +c[8]); maxB = Math.max(maxB, +c[7] + +c[9]); } }
  console.log("[ocr] %ss | confiance %.1f | niveaux %s | bbox max (%d,%d)",
              dt, data.confidence, JSON.stringify(seen), maxR, maxB);
  // dimensions : on les deduit du plus grand bbox + marge, pis on sait que la page est 900x1300
  const W = 900, H = 1300;
  const lines = [];
  for (const row of rows) {
    const c = row.split("\t");
    if (c.length < 12 || c[0] !== "4") continue;
    const [l, tp, w, h, cf] = [+c[6], +c[7], +c[8], +c[9], +c[10]];
    const text = c.slice(11).join("\t").trim();
    if (!text || w <= 0 || h <= 0) continue;
    lines.push({ bbox: { x0: l, y0: tp, x1: l + w, y1: tp + h }, text, confidence: cf });
  }
  console.log("lignes TSV niveau 4 :", lines.length);
  const out = global.self.OCR.groupLines(lines, W, H);
  console.log("\n=== groupLines -> %d bulles ===", out.bubbles.length);
  for (const b of out.bubbles)
    console.log("  x=%-4d y=%-4d w=%-4d h=%-4d conf=%-3d %r", b.x, b.y, b.w, b.h, b.conf, b.text.slice(0, 40));
  await T.terminate();
})();
