
global.self = global;
require("/home/dropxtor/mangatrans/extension/ocr.js");
const Tesseract = require("tesseract.js");
(async () => {
  const T = await Tesseract.createWorker("jpn", 1, { logger: () => {} });
  const t0 = Date.now();
  const { data } = await T.recognize("/home/dropxtor/mangatrans/test_page.png", {}, { blocks: true, tsv: true, text: true });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const seen = {}; const rows = data.tsv.split("\n");
  for (const r of rows) { if (!r) continue; const c = r.split("\t"); seen[c[0]] = (seen[c[0]]||0)+1; }
  let mx = 0, my = 0;
  for (const r of rows) { const c = r.split("\t"); if (c[0]==="5") { mx = Math.max(mx, +c[6]+ +c[8]); my = Math.max(my, +c[7]+ +c[9]); } }
  console.log("OCR " + dt + "s | confiance " + (data.confidence||0).toFixed(1) + " | niveaux " + JSON.stringify(seen) + " | mots jusqu a " + mx + "x" + my);

  const lines = []; let cur = null, dims = [0, 0];
  for (const row of rows) {
    if (!row) continue;
    const c = row.split("\t"); if (c.length < 12) continue;
    const lvl = c[0]; const [l, t, w, h, cf] = [+c[6], +c[7], +c[8], +c[9], +c[10]];
    if (lvl === "1") { dims = [w || dims[0], h || dims[1]]; continue; }
    if (lvl === "4") { cur = null; continue; }
    if (lvl !== "5") continue;
    const text = c.slice(11).join("\t").trim(); if (!text || w <= 0 || h <= 0) continue;
    if (cur) { cur.bbox.x1 = Math.max(cur.bbox.x1, l + w); cur.bbox.y0 = Math.min(cur.bbox.y0, t);
               cur.bbox.y1 = Math.max(cur.bbox.y1, t + h); cur.text += text; }
    else { cur = { bbox: { x0: l, y0: t, x1: l + w, y1: t + h }, text, confidence: cf }; lines.push(cur); }
  }
  console.log("dims deduites du TSV: " + dims.join("x") + " | lignes: " + lines.length);
  const g = global.self.OCR.groupLines(lines, dims[0], dims[1]);
  console.log("\n=== " + g.length + " BULLES (0-1000) ===");
  for (const b of g)
    console.log("  x=" + String(b.x).padEnd(4) + " y=" + String(b.y).padEnd(4) + " w=" + String(b.w).padEnd(4)
                + " h=" + String(b.h).padEnd(4) + " conf=" + String(b.conf).padEnd(3) + " | " + JSON.stringify(b.text.slice(0, 40)));
  const ok = g.every(b => b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x + b.w <= 1000 && b.y + b.h <= 1000);
  console.log("\ntoutes les coordonnees dans 0-1000: " + (ok ? "OUI" : "NON"));
  await T.terminate();
})();
