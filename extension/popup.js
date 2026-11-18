/* Popup de reglages. C'est ici qu'on donne au service worker l'adresse du
   serveur local PocketPal et la cle OBLIGATOIRE (voir sw.js : sans cle, toute
   requete portant un Origin prend un 403). */

const DEFAULTS = {
  endpoint: "http://127.0.0.1:8080",
  apiKey: "",
  model: "MiniCPM-V",
  sourceLang: "japonais",
  targetLang: "francais",
  font: "Comic Neue",
  warp: "arch",
  vision: false,
  autoTranslate: false
};

const $ = (id) => document.getElementById(id);

function save() {
  const s = {
    endpoint: $("endpoint").value.trim(),
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim(),
    sourceLang: $("sourceLang").value,
    targetLang: $("targetLang").value,
    font: $("font").value,
    warp: $("warp").value,
    vision: $("vision").checked,
    autoTranslate: $("auto").checked
  };
  chrome.storage.local.set(s, () => status("Enregistre."));
}

function status(msg, ok = true) {
  $("status").textContent = msg;
  $("status").style.color = ok ? "#7ee0ff" : "#ff8a8a";
}

async function load() {
  const s = await new Promise((r) => chrome.storage.local.get(Object.keys(DEFAULTS), r));
  const c = { ...DEFAULTS, ...s };
  Object.keys(DEFAULTS).forEach((k) => {
    const el = $(k);
    if (!el) return;
    if (el.type === "checkbox") el.checked = !!c[k]; else el.value = c[k];
  });
}

async function probe() {
  status("Test du serveur local...");
  const r = await chrome.runtime.sendMessage({ type: "PING" });
  if (r && r.ok) {
    status("OK — modeles charges : " + (r.models || []).join(", "));
    const sel = $("model");
    sel.innerHTML = "";
    (r.models || []).forEach((m) => {
      const o = document.createElement("option");
      o.value = m; o.textContent = m; sel.appendChild(o);
    });
  } else {
    status("Echec : " + ((r && r.error) || "inconnu") + " — verifie le port, la cle, et que le serveur est actif.", false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  $("save").addEventListener("click", save);
  $("probe").addEventListener("click", probe);
});