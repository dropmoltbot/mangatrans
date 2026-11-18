/* PREUVE : les vraies lignes de tesseract.js passees dans le groupLines de
   l'extension. Vérifie que le pipeline local produit des bulles plausibles
   (coordonnees 0-1000 + texte), sans aucun modele. */
global.self = global;
require("/home/dropxtor/mangatrans/extension/ocr.js");
const Tesseract = require("tesseract.js");

(async () => {
  const file = "/home/dropxtor/mangatrans/test_page.png";
  let t = Date.now();
  const r = await Tesseract.recognize(file, "jpn", { logger: () => {} });
  const dt = ((Date.now() - t) / 1000).toFixed(1);
  const d = r.data;
  const W = d.imageWidth, H = d.imageHeight;
  const lines = (d.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p => p.lines || []));
  console.log("[tesseract jpn] %ss, %d lignes, image %dx%d, confiance %.1f",
              dt, lines.length, W, H, d.confidence || 0);
  console.log("lignes avec bbox:", lines.filter(l => l.bbox).length);
  const out = global.self.OCR.groupLines(lines, W, H);
  console.log("\n=== groupLines -> %d bulles (0-1000) ===", out.bubbles.length);
  for (const b of out.bubbles) {
    console.log("  x=%-4d y=%-4d w=%-4d h=%-4d conf=%-3d %r",
                b.x, b.y, b.w, b.h, b.conf, b.text.slice(0, 46));
  }
  const sane = out.bubbles.every(b =>
    b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x + b.w <= 1000 && b.y + b.h <= 1000);
  console.log("\ncoordonnees toutes dans 0-1000:", sane ? "OUI" : "NON");
})();