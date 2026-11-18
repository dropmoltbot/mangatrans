/* Test tesseract.js sur une page manga : vitesse + qualite, horizontal ET vertical.
   C'est le chemin qui remplacerait le VLM sur iPhone (OCR dans l'extension). */
const Tesseract = require("tesseract.js");
const fs = require("fs");

(async () => {
  const file = process.argv[2] || "/home/dropxtor/mangatrans/test_page.png";
  for (const lang of ["jpn", "jpn_vert"]) {
    let t = Date.now();
    try {
      const r = await Tesseract.recognize(file, lang, {
        logger: (m) => { if (m.status === "recognizing text") process.stdout.write("."); }
      });
      const dt = ((Date.now() - t) / 1000).toFixed(1);
      const txt = (r.data.text || "").replace(/\s+/g, " ").trim();
      console.log("\n[" + lang + "] " + dt + "s conf=" + (r.data.confidence || 0).toFixed(1));
      console.log("   texte: " + txt.slice(0, 220));
    } catch (e) {
      console.log("\n[" + lang + "] ECHEC " + e.message.slice(0, 150));
    }
  }
})();