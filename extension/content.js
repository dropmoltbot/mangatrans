/* Mangatrans — content script.
   Porte (bouton) sur l'image survolee, traduction a la volee au scroll,
   puis RECOMPOSITION du texte dans les bulles : boite ajustee, deformation,
   police. Deux chemins d'OCR :
     - defaut : OCR LOCAL (tesseract.js, ocr.js) — 2.7s/page, zero reseau ;
     - secours : le VLM charge dans PocketPal (via le service worker).
   Le texte revient toujours au meme endroit : sendMessage -> sw.js. */

(() => {
  if (document.getElementById("mt-root")) return;

  const state = { auto: false, busy: false, history: [], settings: {} };
  const root = document.createElement("div");
  root.id = "mt-root";
  document.documentElement.appendChild(root);

  const style = document.createElement("style");
  style.textContent = `
    #mt-btn{position:fixed;z-index:2147483646;width:34px;height:34px;border-radius:8px;
      background:#0d0d0f;border:1px solid #2b2b33;color:#7ee0ff;font:600 15px/1 ui-monospace,monospace;
      display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 14px #0008}
    #mt-btn.on{display:flex}
    #mt-bar{position:fixed;left:8px;bottom:8px;z-index:2147483646;display:none;gap:6px;
      background:#0d0d0fee;border:1px solid #2b2b33;border-radius:10px;padding:6px}
    #mt-bar.on{display:flex}
    #mt-bar button{background:#16161c;color:#cfe9f5;border:1px solid #2b2b33;border-radius:6px;
      padding:4px 8px;font:12px ui-sans-serif,system-ui;cursor:pointer}
    #mt-bar button:hover{border-color:#7ee0ff55}
    .mt-layer{position:absolute;pointer-events:none}
    .mt-box{position:absolute;pointer-events:auto;background:#fff;color:#111;
      border-radius:6px;padding:3px 6px;text-align:center;line-height:1.12;
      box-shadow:inset 0 0 0 1px #0002;cursor:text}
    .mt-box:focus{outline:2px solid #7ee0ff}
    .mt-img-wrap{position:relative;display:inline-block}
    .mt-badge{position:absolute;top:4px;right:4px;background:#0d0d0fcc;color:#7ee0ff;
      font:10px ui-monospace,monospace;padding:2px 5px;display:none;border-radius:4px}
    .mt-img-wrap.mt-busy .mt-badge{display:block}
  `;
  document.head.appendChild(style);

  const btn = document.createElement("div");
  btn.id = "mt-btn"; btn.textContent = "⛩"; btn.title = "Traduire cette image";
  root.appendChild(btn);

  const bar = document.createElement("div");
  bar.id = "mt-bar";
  bar.innerHTML = `<button data-a="auto">Auto: off</button>
    <button data-a="wipe">Effacer</button>
    <button data-a="font">Police</button>
    <button data-a="warp">Forme</button>`;
  root.appendChild(bar);

  /* ---------------- reseau ---------------- */
  function send(msg) { return new Promise((r) => chrome.runtime.sendMessage(msg, r)); }

  async function loadSettings() {
    state.settings = await new Promise((r) => chrome.storage.local.get(null, r));
    return state.settings;
  }

  /* ---------------- coeur ---------------- */
  async function translateImage(img) {
    if (state.busy) return null;
    state.busy = true;
    const wrap = img.closest(".mt-img-wrap") || (() => {
      const w = document.createElement("span");
      w.className = "mt-img-wrap";
      img.parentNode.insertBefore(w, img);
      w.appendChild(img);
      return w;
    })();
    wrap.classList.add("mt-busy");
    try {
      const settings = await loadSettings();
      let bubbles = [], engine = "";
      const dataUrl = await toDataURL(img);

      // Chemin 1 (defaut) : OCR local dans l'extension. Mesure reelle :
      // 2.7 s par page, confiance 89, sans aucun appel reseau.
      if (settings.vision === false && self.OCR) {
        engine = "tesseract";
        const c = toCanvas(img);
        const r = await self.OCR.read(await toBlob(img), settings.sourceLang, c.width, c.height);
        bubbles = r.bubbles || [];
        if (!bubbles.length && r.raw) {
          // repli : une seule boite pour la page entiere (mieux que rien)
          bubbles = [{ x: 60, y: 60, w: 880, h: 880, vertical: false, text: r.raw, conf: 0 }];
        }
      }
      // Chemin 2 (secours) : le VLM charge dans PocketPal lit l'image.
      if (settings.vision !== false || (settings.vision === false && !self.OCR)) {
        engine = "vlm";
        const ocr = await send({ type: "OCR", dataUrl, lang: settings.sourceLang });
        if (!ocr || !ocr.ok) throw new Error((ocr && ocr.error) || "OCR echoue");
        bubbles = ocr.bubbles;
      }
      if (!bubbles.length) throw new Error("aucune bulle trouvee");
      wrap.dataset.mtEngine = engine;

      // Les boites verticales : tesseract les lit a ~55% de caracteres justes
      // et dans un ordre incertain (mesure). Un VLM lit le manga nativement,
      // donc on recadre chaque boite verticale et on la fait relire par le
      // modele charge dans PocketPal. Seulement ces boites : le reste du
      // pipeline reste 100% local et instant.
      const verticals = bubbles.filter((b) => b.vertical);
      if (verticals.length && settings.vision !== false && self.OCR) {
        const c = toCanvas(img);
        for (const b of verticals) {
          const cx = (b.x / 1000) * c.width, cy = (b.y / 1000) * c.height;
          const cw = (b.w / 1000) * c.width, ch = (b.h / 1000) * c.height;
          const pad = 10;
          const cc = document.createElement("canvas");
          cc.width = Math.max(2, Math.round(cw + pad * 2));
          cc.height = Math.max(2, Math.round(ch + pad * 2));
          cc.getContext("2d").drawImage(c,
            Math.max(0, Math.round(cx - pad)), Math.max(0, Math.round(cy - pad)),
            cc.width, cc.height, 0, 0, cc.width, cc.height);
          const r = await send({ type: "OCR_CROP", dataUrl: cc.toDataURL("image/png"),
                                 lang: settings.sourceLang, vertical: true });
          if (r && r.ok && r.text && r.text.trim()) b.text = r.text.trim();
        }
      }

      const layer = getLayer(wrap);
      const prev = state.history.slice(-4).join(" | ");
      for (const b of bubbles) {
        const t = await send({ type: "TRANSLATE", text: b.text, from: settings.sourceLang,
          to: settings.targetLang, prev, glossary: settings.glossary || "" });
        const txt = (t && t.ok && t.text) || b.text;
        state.history.push(txt);
        drawBox(layer, b, txt, settings);
      }
      return bubbles.length;
    } catch (e) {
      wrap.querySelector(".mt-badge")?.remove();
      const badge = document.createElement("div");
      badge.className = "mt-badge"; badge.textContent = "! " + String(e.message).slice(0, 60);
      wrap.appendChild(badge);
      return null;
    } finally {
      wrap.classList.remove("mt-busy");
      state.busy = false;
    }
  }

  function toCanvas(img) {
    const c = document.createElement("canvas");
    const max = 1600;  // au-dela, inutile pour lire des bulles
    const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * r));
    c.height = Math.max(1, Math.round(img.naturalHeight * r));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function toDataURL(img) { return toCanvas(img).toDataURL("image/jpeg", 0.85); }

  function toBlob(img) {
    return new Promise((res, rej) => toCanvas(img).toBlob(
      (b) => (b ? res(b) : rej(new Error("canvas -> blob vide"))), "image/png"));
  }

  function getLayer(wrap) {
    let layer = wrap.querySelector(".mt-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "mt-layer";
      wrap.appendChild(layer);
    }
    return layer;
  }

  function drawBox(layer, b, text, settings) {
    const wrap = layer.parentElement;
    const W = wrap.clientWidth || 1, H = wrap.clientHeight || 1;
    const x = (b.x / 1000) * W, y = (b.y / 1000) * H;
    const w = Math.max(20, (b.w / 1000) * W), h = Math.max(14, (b.h / 1000) * H);
    const font = settings.font || "Comic Neue";
    const box = document.createElement("div");
    box.className = "mt-box";
    box.dataset.src = b.text || "";
    box.style.left = x + "px"; box.style.top = y + "px";
    box.style.width = w + "px";
    box.style.fontFamily = font;
    box.dataset.lines = wrapText(text, Math.max(4, Math.floor(w / 8)));
    box.style.fontSize = (self.TYPESET ? self.TYPESET.fit(text, w - 12, h, font) : 14) + "px";
    const zone = document.createElement("div");
    zone.contentEditable = "true"; zone.spellcheck = false;
    zone.textContent = text;
    box.appendChild(zone);
    if (self.TYPESET) self.TYPESET.warp(box, settings.warp || "arch");
    zone.addEventListener("blur", () => {
      box.dataset.lines = wrapText(zone.textContent, Math.max(4, Math.floor(w / 8)));
      if (self.TYPESET) self.TYPESET.warp(box, settings.warp || "arch");
    });
    layer.appendChild(box);
    return box;
  }

  function wrapText(text, perLine) {
    const words = String(text).split(/\s+/);
    const lines = []; let cur = "";
    for (const word of words) {
      if ((cur + " " + word).trim().length > perLine && cur) { lines.push(cur); cur = word; }
      else cur = (cur + " " + word).trim();
    }
    if (cur) lines.push(cur);
    return lines.join("\n");
  }

  /* ---------------- auto : au scroll ---------------- */
  const io = new IntersectionObserver((entries) => {
    if (!state.auto || state.busy) return;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const img = e.target;
      if (img.dataset.mtBusy) continue;
      img.dataset.mtBusy = "1";
      translateImage(img).then((n) => { if (n) img.dataset.mtBusy = String(n); });
    }
  }, { rootMargin: "120px" });

  function armAuto(on) {
    state.auto = on;
    if (on) {
      document.querySelectorAll("img").forEach((img) => {
        if (!img.dataset.mtArmed) { img.dataset.mtArmed = "1"; io.observe(img); }
      });
    } else {
      io.disconnect();
    }
    bar.querySelector('[data-a="auto"]').textContent = "Auto: " + (on ? "on" : "off");
  }

  /* ---------------- UI ---------------- */
  let hoverImg = null;
  document.addEventListener("mouseover", (e) => {
    const img = e.target.closest && e.target.closest("img");
    if (img && img.src && !img.dataset.mtBusy) {
      hoverImg = img;
      btn.style.left = Math.min(window.innerWidth - 44, e.clientX + 12) + "px";
      btn.style.top = Math.max(8, e.clientY - 40) + "px";
      btn.classList.add("on");
    }
  });
  document.addEventListener("mouseout", (e) => { if (!e.relatedTarget) btn.classList.remove("on"); });

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    btn.classList.remove("on");
    if (hoverImg) await translateImage(hoverImg);
  });

  bar.addEventListener("click", async (e) => {
    const a = e.target.dataset && e.target.dataset.a;
    if (a === "auto") armAuto(!state.auto);
    if (a === "wipe") document.querySelectorAll(".mt-layer").forEach((l) => {
      l.querySelectorAll(".mt-box").forEach((b) => b.remove());
    });
    if (a === "font") cycleFont();
    if (a === "warp") cycleWarp();
  });

  async function cycleFont() {
    const fonts = ["Comic Neue", "Bangers", "ui-rounded", "Hiragino Maru Gothic ProN", "serif"];
    const s = await loadSettings();
    const i = fonts.indexOf(s.font || "Comic Neue");
    const next = fonts[(i + 1) % fonts.length];
    await new Promise((r) => chrome.storage.local.set({ font: next }, r));
    document.querySelectorAll(".mt-box").forEach((b) => { b.style.fontFamily = next; });
    bar.querySelector('[data-a="font"]').textContent = "Police: " + next;
  }

  async function cycleWarp() {
    const modes = ["none", "arch", "wave", "bulge", "perspective"];
    const s = await loadSettings();
    const i = modes.indexOf(s.warp || "arch");
    const next = modes[(i + 1) % modes.length];
    await new Promise((r) => chrome.storage.local.set({ warp: next }, r));
    document.querySelectorAll(".mt-box").forEach((b) => { b.dataset.warpMode = next; });
    bar.querySelector('[data-a="warp"]').textContent = "Forme: " + next;
  }

  const obs = new MutationObserver(() => {
    if (document.querySelector(".mt-box")) bar.classList.add("on");
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === "MT_AUTO") armAuto(!!m.on);
  });
})();