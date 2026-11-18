
global.self = global;
const Tesseract = require("tesseract.js");
(async () => {
  const T = await Tesseract.createWorker("jpn", 1, { logger: () => {} });
  for (const f of ["vbulb_raw.png", "vbulb_rot.png"]) {
    const t0 = Date.now();
    const { data } = await T.recognize("/home/dropxtor/mangatrans/ocrtest/" + f, {}, { text: true, tsv: true });
    const dt = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(f.padEnd(14) + " " + dt + "s conf=" + (data.confidence||0).toFixed(1)
                + " | " + JSON.stringify((data.text||"").replace(/\s+/g, "").trim()));
  }
  await T.terminate();
})();
