/* Typesetting : faire tenir un texte dans une bulle, et le deformer
   (arche / vague / renflement / perspective) comme le "warp" de Torii. */

const TYPESET = (() => {
  /* Ajustement police -> largeur de bulle. On part de la plus grande taille
     qui fait tenir le texte, puis on descend jusqu'a ce que ca passe. */
  function fit(text, boxW, boxH, fontFamily, startPx = 34, minPx = 6) {
    const probe = document.createElement("span");
    probe.style.cssText =
      "position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:-9999px;" +
      `font-family:${fontFamily};font-size:${startPx}px;line-height:1.12;`;
    probe.textContent = text;
    document.documentElement.appendChild(probe);
    let size = startPx;
    const w0 = probe.getBoundingClientRect().width / startPx;  // largeur par px
    probe.remove();
    if (!w0) return minPx;
    const w = w0 * size;
    if (w <= boxW && size <= boxH) return size;
    size = Math.min(boxW / w0, (boxH * 1.12) / Math.max(1, text.length / 12), startPx);
    return Math.max(minPx, Math.floor(size));
  }

  /* Deformation : chaque segment de ligne suit un chemin (sinus pour la vague,
     arc de cercle pour l'arche). Implementation par segments + rotation. */
  function warp(textEl, mode) {
    if (mode === "none") { textEl.style.transform = ""; return; }
    const lines = (textEl.dataset.lines || "").split("\n");
    textEl.innerHTML = "";
    const host = document.createElement("div");
    host.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:1px;";
    lines.forEach((line, i) => {
      const seg = document.createElement("span");
      seg.textContent = line;
      seg.style.display = "inline-block";
      const t = lines.length > 1 ? (i - (lines.length - 1) / 2) : 0;
      if (mode === "arch")   { seg.style.transform = `translateY(${(t * t) * 1.1}px)`; }
      if (mode === "wave")   { seg.style.transform = `translateY(${Math.sin(t) * 4}px)`; }
      if (mode === "bulge")  { seg.style.transform = `scale(1, ${1.08 - Math.abs(t) * 0.05})`; }
      if (mode === "perspective") { seg.style.transform = `perspective(120px) rotateX(${t * 5}deg)`; }
      host.appendChild(seg);
    });
    textEl.appendChild(host);
  }

  return { fit, warp };
})();

if (typeof self !== "undefined") self.TYPESET = TYPESET;