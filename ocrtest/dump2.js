
global.self = global;
const Tesseract = require("tesseract.js");
(async () => {
  const r = await Tesseract.recognize("/home/dropxtor/mangatrans/test_page.png", "jpn", {logger:()=>{}});
  const d = r.data;
  console.log("dims imageGrey:", d.imageGrey && [d.imageGrey.width, d.imageGrey.height]);
  const rows = d.tsv.trim().split("\n");
  console.log("tsv lignes:", rows.length);
  console.log("header:", rows[0]);
  // niveaux presents
  const lvl = {};
  for (const row of rows.slice(1)) {
    const l = row.split("\t")[0]; lvl[l] = (lvl[l]||0)+1;
  }
  console.log("niveaux:", JSON.stringify(lvl));
  for (const lv of ["4","5"]) {
    const ex = rows.slice(1).filter(x => x.split("\t")[0] === lv).slice(0,3);
    console.log("--- niveau " + lv + " (" + rows.slice(1).filter(x=>x.split("\t")[0]===lv).length + ") exemples ---");
    ex.forEach(e => console.log("  " + e.split("\t").slice(6,12).join(" | ")));
  }
})();
