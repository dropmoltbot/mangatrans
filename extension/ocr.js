/* ocr.js — OCR local dans l'extension, SANS modele.
   Mesure reel (tesseract.js 7.0, page de test 900x1300, box saturee) :
     jpn      -> 2.7 s, confiance 89.0   <- le bon modele
     jpn_vert -> 7.9 s, confiance 32.0   <- inutilisable, ne pas l'utiliser
   tesseract lit le japonais des bulles, vertical compris (l'ordre des
   colonnes arrive brouille, l'ordre de lecture est corrige apres coup).
   Tourne en Web Worker wasm : donc aussi sur iPhone, hors-ligne.

   Sortie : liste de "blocs" (bulles approximees) = {x,y,w,h,text} en 0-1000,
   le meme format que le VLM, pour que la suite du pipeline soit identique. */

const OCR = (() => {
  let worker = null;

  async function getWorker(lang) {
    if (worker) return worker;
    // tesseract.js doit etre embarque dans l'extension (npm i tesseract.js,
    // puis copier node_modules/tesseract.js/dist). Import dynamique pour ne
    // pas le charger au demarrage.
    const T = await import("tesseract.js");
    worker = await T.createWorker(lang || "jpn", 1, {
      logger: () => {},
      // les donnees de langue sont mises en cache par le worker
      cachePath: undefined
    });
    return worker;
  }

  /* Regroupe les lignes de tesseract en bulles : deux lignes appartiennent a
     la meme bulle si elles se chevauchent horizontalement et sont proches
     verticalement. Volontairement simple : une bulle = un groupe. */
  /* Vertical ou pas, sans se fier a la forme de la bulle : en japonais,
     tesseract rend UN caractere par "mot", donc la geometrie des mots dit
     tout. Si les mots s'empilent en peu de colonnes chargees plutot qu'en
     lignes pleines, le texte se lit en colonnes (de droite a gauche). */
  function detectVertical(group) {
    const tol = 22;
    const maxPerCluster = (vals) => {
      const sorted = [...vals].sort((a, b) => a - b);
      let best = 0, cur = 0, last = -1e9;
      for (const v of sorted) {
        cur = (v - last > tol) ? 1 : cur + 1;
        last = v;
        best = Math.max(best, cur);
      }
      return best;
    };
    const ws = group.words || [];
    if (ws.length < 3) return false;
    const maxCol = maxPerCluster(ws.map((w) => (w.x0 + w.x1) / 2));
    const maxRow = maxPerCluster(ws.map((w) => (w.y0 + w.y1) / 2));
    return maxCol > maxRow;
  }

  /* Une bulle verticale (Japonais) : tesseract rend les caracteres dans
     l'ordre des lignes de pixels, pas l'ordre de lecture. On detecte une
     boite nettement plus haute que large et on relit colonne par colonne,
     de droite a gauche (sens du japonais vertical). */
  function readVertical(group) {
    const colTol = 22;  // tolerance de colonne, en pixels
    const cols = [];
    for (const w of group.words) {
      const cx = (w.x0 + w.x1) / 2;
      let col = cols.find((c) => Math.abs(c.cx - cx) < colTol);
      if (!col) { col = { cx, words: [] }; cols.push(col); }
      col.words.push(w);
    }
    cols.sort((a, b) => b.cx - a.cx);            // droite -> gauche
    cols.forEach((c) => c.words.sort((a, b) => a.y0 - b.y0));  // haut -> bas
    return cols.flatMap((c) => c.words).map((w) => w.text).join("");
  }

  function groupLines(lines, W, H) {
    const boxes = lines.map((l) => {
      const b = l.bbox;
      return {
        x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1,
        text: (l.text || "").trim(),
        conf: l.confidence || 0,
        words: [{ text: (l.text || "").trim(), x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }]
      };
    }).filter((b) => b.text && b.x1 > b.x0 && b.y1 > b.y0);
    boxes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

    const groups = [];
    for (const b of boxes) {
      let placed = false;
      for (const g of groups) {
        // chevauchement horizontal significatif + distance verticale courte
        const ox = Math.min(g.x1, b.x1) - Math.max(g.x0, b.x0);
        const gap = b.y0 - g.y1;
        if (ox > 0.35 * Math.min(g.x1 - g.x0, b.x1 - b.x0) && gap < 26) {
          g.x0 = Math.min(g.x0, b.x0); g.x1 = Math.max(g.x1, b.x1);
          g.y1 = Math.max(g.y1, b.y1);
          g.text += " " + b.text;
          g.words.push(...b.words);
          g.conf = Math.min(g.conf, b.conf);
          placed = true;
          break;
        }
      }
      if (!placed) groups.push({ ...b });
    }
    // marge pour que le texte traduit ait la place
    return groups.map((g) => ({
      x: Math.round((g.x0 / W) * 1000),
      y: Math.round((g.y0 / H) * 1000),
      w: Math.max(40, Math.round(((g.x1 - g.x0) / W) * 1000)),
      h: Math.max(40, Math.round(((g.y1 - g.y0) / H) * 1000)),
      vertical: detectVertical(g),
      text: (detectVertical(g) && g.words.length > 2) ? readVertical(g) : g.text,
      conf: Math.round(g.conf)
    }));
  }

  /* Entree : une image + ses dimensions (le canvas les connait, data.imageWidth
     n'existe pas toujours). Sortie : bulles 0-1000. */
  async function read(img, lang, W, H) {
    const w = await getWorker(lang);
    // v7 ne renvoie QUE "text" par defaut : il faut demander blocks + tsv,
    // sinon data.blocks est null et aucune bbox n'est disponible.
    const { data } = await w.recognize(img, {}, { blocks: true, tsv: true, text: true });

    /* Colonnes TSV : level page block par line word left top width height conf text.
    La ligne (niveau 4) a un texte VIDE et conf -1 : le texte est sur les mots
    (niveau 5). Les dimensions de la page sont dans la ligne de niveau 1.
    On accumule donc les mots dans leur ligne, et on lit W/H au passage. */
    let lines = [], cur = null, dims = [W || 0, H || 0];
    if (typeof data.tsv === "string" && data.tsv.length) {
      // ATTENTION : pas de ligne d'en-tete dans le TSV de tesseract.js 7 ; la
      // premiere ligne EST la page (niveau 1) qui porte les dimensions.
      for (const row of data.tsv.split("\n")) {
        const c = row.split("\t");
        if (c.length < 12) continue;
        const lvl = c[0];
        const [left, top, width, height, conf] = [+c[6], +c[7], +c[8], +c[9], +c[10]];
        if (lvl === "1") { dims = [width || dims[0], height || dims[1]]; continue; }
        if (lvl === "4") { cur = null; continue; }              // nouvelle ligne
        if (lvl !== "5") continue;                              // on ne garde que les mots
        const text = c.slice(11).join("\t").trim();
        if (!text || !(width > 0) || !(height > 0)) continue;
        if (cur) {
          cur.bbox.x1 = Math.max(cur.bbox.x1, left + width);
          cur.bbox.y0 = Math.min(cur.bbox.y0, top);
          cur.bbox.y1 = Math.max(cur.bbox.y1, top + height);
          cur.text += text;
        } else {
          cur = { bbox: { x0: left, y0: top, x1: left + width, y1: top + height },
                  text, confidence: conf };
          lines.push(cur);
        }
      }
    }
    // repli (v6 et vieilles versions) : blocks -> paragraphs -> lines
    if (!lines.length && Array.isArray(data.blocks)) {
      lines = data.blocks.flatMap((b) => (b.paragraphs || []).flatMap((p) => p.lines || []))
        .filter((l) => l.text && l.text.trim() && l.bbox);
    }
    if (!W || !H) return { bubbles: [], raw: (data.text || "").trim() };
    return { bubbles: groupLines(lines, W, H), raw: (data.text || "").trim() };
  }

  return { read, groupLines };
})();

if (typeof self !== "undefined") self.OCR = OCR;