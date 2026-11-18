
global.self = global;
const Tesseract = require("tesseract.js");
(async () => {
  const r = await Tesseract.recognize("/home/dropxtor/mangatrans/test_page.png", "jpn", {logger:()=>{}});
  const d = r.data;
  console.log("cles de data:", Object.keys(d).join(", "));
  console.log("types: blocks=" + (d.blocks && d.blocks.length), "lines=" + (d.lines && d.lines.length),
              "words=" + (d.words && d.words.length), "paragraphs=" + (d.paragraphs && d.paragraphs.length),
              "symbols=" + (d.symbols && d.symbols.length));
  if (d.lines && d.lines.length) {
    const l = d.lines[0];
    console.log("exemple ligne:", JSON.stringify({text:l.text, bbox:l.bbox, confidence:l.confidence}));
  }
  if (d.words && d.words.length) {
    const w = d.words[0];
    console.log("exemple mot:", JSON.stringify({text:w.text, bbox:w.bbox}));
  }
  console.log("dimensions:", d.imageWidth, d.imageHeight, "| taille texte:", (d.text||"").length);
})();
