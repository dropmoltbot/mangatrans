
global.self = global;
const Tesseract = require("tesseract.js");
(async () => {
  const T = await Tesseract.createWorker("jpn", 1, { logger: () => {} });
  const { data } = await T.recognize("/home/dropxtor/mangatrans/test_page.png", {}, { blocks: true, tsv: true, text: true });
  const rows = data.tsv.split("\n");
  console.log("nb lignes tsv:", rows.length);
  rows.slice(0, 8).forEach((r, i) => console.log(i + ": " + JSON.stringify(r.slice(0, 120))));
  console.log("--- cles de data:", Object.keys(data).join(","));
  console.log("--- blocks null?", data.blocks === null, "| hocr len:", (data.hocr||"").length);
  await T.terminate();
})();
