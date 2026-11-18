
global.self = global;
const Tesseract = require("tesseract.js");
(async () => {
  for (const lang of ["jpn", "jpn_vert"]) {
    const T = await Tesseract.createWorker(lang, 1, { logger: () => {} });
    const t0 = Date.now();
    const { data } = await T.recognize("/home/dropxtor/mangatrans/ocrtest/vbulb_raw.png", {}, { text: true, tsv: true });
    const dt = ((Date.now() - t0) / 1000).toFixed(2);
    console.log("crop brut / " + lang.padEnd(9) + " " + dt + "s conf=" + (data.confidence||0).toFixed(1)
                + " | " + JSON.stringify((data.text||"").replace(/\s+/g, "").trim()));
    await T.terminate();
  }
  // et la page entiere en jpn_vert pour memoire
  const T2 = await Tesseract.createWorker("jpn_vert", 1, { logger: () => {} });
  const { data } = await T2.recognize("/home/dropxtor/mangatrans/test_page.png", {}, { text: true });
  console.log("page entiere / jpn_vert  conf=" + (data.confidence||0).toFixed(1)
              + " | " + JSON.stringify((data.text||"").replace(/\s+/g, "").trim().slice(0, 40)));
  await T2.terminate();
})();
