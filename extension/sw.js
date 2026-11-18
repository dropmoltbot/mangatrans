/* Service worker : SEUL endroit autorise a parler a PocketPal.
   Pourquoi : le serveur local de PocketPal n'envoie AUCUN en-tete CORS
   ("No CORS headers are sent, so browser pages can't use it", PR #990) et
   refuse tout requete portant un Origin quand aucune cle n'est definie
   ("requests carrying Origin get 403"). Un fetch depuis la page est donc
   voue a l'echec (preflight OPTIONS jamais repondu).
   Le service worker, lui, beneficie des host_permissions : il n'est pas
   soumis au CORS. Il porte aussi la cle API obligatoire.
   Il est maintenu en vie par un port long-vie ouvert par le content script
   (les workers MV3 sont sinon tetus a tuer en plein requete). */

const DEFAULTS = {
  endpoint: "http://127.0.0.1:8080",
  apiKey: "",            // OBLIGATOIRE : sans cle, toute requete avec Origin = 403
  model: "MiniCPM-V",    // nom renvoye par GET /v1/models du serveur local
  sourceLang: "japonais",
  targetLang: "francais",
  font: "Comic Neue",
  warp: "arch",
  autoTranslate: false,
  vision: false          // false = OCR local tesseract.js (defaut, 2.7s/page) ; true = VLM PocketPal
};

const PORTS = new Set();

chrome.runtime.onConnect.addListener((port) => {
  PORTS.add(port);
  port.onDisconnect.addListener(() => PORTS.delete(port));
});

function cfg() {
  return new Promise((res) => chrome.storage.local.get(Object.keys(DEFAULTS), (s) => {
    res({ ...DEFAULTS, ...s });
  }));
}

async function localServer(path, body, timeoutMs = 180000) {
  const c = await cfg();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(c.endpoint.replace(/\/$/, "") + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (c.apiKey || "mangatrans")  // la cle reste requise
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const text = await r.text();
    if (!r.ok) {
      let msg = text.slice(0, 300);
      if (r.status === 403) {
        msg = "403 — mets une cle API dans la carte 'Local API server' de PocketPal " +
              "(sans cle, toute requete avec Origin est refusee) et verifie le port.";
      } else if (r.status === 401) {
        msg = "401 — cle API incorrecte pour le serveur local de PocketPal.";
      } else if (r.status === 404) {
        msg = "404 — endpoint introuvable : verifie que le serveur local est actif " +
              "et que le modele est charge dans PocketPal.";
      }
      throw new Error(msg);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/* Extrait le JSON d'une reponse de petit modele : ils bavardent avant/apres. */
function extractJson(raw) {
  if (!raw) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

async function chat(messages, maxTokens = 700, temperature = 0.1) {
  const c = await cfg();
  const d = await localServer("/v1/chat/completions", {
    model: c.model,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
    // MiniCPM-V 4.7 est un modele "thinking" : sans ca, tout le budget part
    // dans reasoning_content et content revient VIDE (finish_reason: length).
    // Verifie en vrai sur llama-server local : enable_thinking=false ->
    // content net + reasoning:None + finish:stop.
    chat_template_kwargs: { enable_thinking: false }
  });
  return (d.choices && d.choices[0] && d.choices[0].message || {}).content || "";
}

/* ---- handlers de messages ---- */

async function onOcr(msg) {
  const bubbles = [];
  try {
    const raw = await chat([
      { role: "user", content: [
        { type: "text", text: self.PROMPTS.ocrJson(msg.lang || "japonais") },
        { type: "image_url", image_url: { url: msg.dataUrl } }
      ] }
    ], 900, 0.05);
    const parsed = extractJson(raw);
    if (!parsed) return { ok: false, error: "JSON illisible du modele : " + raw.slice(0, 120) };
    return { ok: true, bubbles: parsed.bubbles || [] };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/* Recadrage d'une boite verticale : tesseract plafonne a ~55% de caracteres
   justes la-dessus (mesure), un VLM lit le manga nativement. */
async function onOcrCrop(msg) {
  try {
    const out = await chat([{ role: "user", content: [
      { type: "text", text:
        "Cette image est un recadrage d'une bulle de manga" +
        (msg.vertical ? " au texte ECRIT VERTICALEMENT (japonais vertical)" : "") +
        ". Lis le texte et transcris-le dans l'ordre de lecture naturel. " +
        "Reponds UNIQUEMENT par le texte lu, sans guillemet, sans note." },
      { type: "image_url", image_url: { url: msg.dataUrl } }] }], 300, 0.05);
    const text = out.trim().split("\n").filter(Boolean).slice(-1)[0] || out.trim();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function onTranslate(msg) {
  try {
    const out = await chat([
      { role: "user", content: self.PROMPTS.translate(
        msg.from || "japonais", msg.to || "francais", msg.prev || "", msg.glossary || "") +
        "\n" + msg.text } ], 400, 0.2);
    return { ok: true, text: out.trim().split("\n").filter(Boolean).slice(-1)[0] || out.trim() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function onPing() {
  try {
    const c = await cfg();
    const r = await fetch(c.endpoint.replace(/\/$/, "") + "/v1/models", {
      headers: { "Authorization": "Bearer " + (c.apiKey || "mangatrans") }
    });
    if (!r.ok) return { ok: false, code: r.status, error: "serveur local inaccessible" };
    const d = await r.json();
    return { ok: true, models: (d.data || []).map((m) => m.id) };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const job = (async () => {
    switch (msg.type) {
      case "PING": return onPing();
      case "OCR": return onOcr(msg);
      case "OCR_CROP": return onOcrCrop(msg);
      case "TRANSLATE": return onTranslate(msg);
      default: return { ok: false, error: "type inconnu " + msg.type };
    }
  })();
  job.then(sendResponse);
  return true; // reponse asynchrone
});