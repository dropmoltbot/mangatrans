
const http = require("http");
function chat(body) {
  return new Promise((res, rej) => {
    const r = http.request({host:"127.0.0.1",port:8789,path:"/v1/chat/completions",method:"POST",
      headers:{"Content-Type":"application/json"}}, (s) => {
      let d = ""; s.on("data", c => d += c); s.on("end", () => res(JSON.parse(d)));
    });
    r.on("error", rej); r.end(JSON.stringify(body));
  });
}
const TR = (from, to, prev, text) =>
  `Tu es traducteur professionnel de manga ${from} vers ${to}.
Traduis la bulle donnee. Regles :
- une seule ligne de sortie : la traduction, rien d'autre ;
- garde le ton (grossier reste grossier, enfantin reste enfantin), les insultes incluses ;
- n'ajoute jamais de note, de guillemet, de "Traduction :" ;
- respecte les noms propres deja etablis.
Contexte des bulles precedentes : ${prev}
Bulle a traduire :
${text}`;
(async () => {
  // les bulles lues par tesseract sur la page de test
  const bulles = [
    {text: "おい、聞いているの か?", prev: ""},
    {text: "それは無理だ…", prev: "Hé, tu m'ecoutes ?"},
    {text: "逃だぐ げ、! る今 んす", prev: "Hé, tu m'ecoutes ? | C'est impossible…"},
    {text: "わかった。信じる。", prev: "Hé, tu m'ecoutes ? | C'est impossible… | Fuis, maintenant !"}
  ];
  let prevs = [];
  for (const b of bulles) {
    const t0 = Date.now();
    try {
      const d = await chat({model: "qwen3-4b-abliterated-IQ4_XS.gguf", max_tokens: 120,
        temperature: 0.2, stream: false, chat_template_kwargs: {enable_thinking: false},
        messages: [{role: "user", content: TR("japonais", "francais", prevs.slice(-3).join(" | "), b.text)}]});
      const m = (d.choices && d.choices[0] && d.choices[0].message) || {};
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const out = (m.content || "").trim();
      if (out) prevs.push(out);
      console.log(b.text.slice(0, 22).padEnd(24) + " -> " + JSON.stringify(out.slice(0, 60)) + "  (" + dt + "s)");
    } catch (e) { console.log(b.text, "ERREUR", String(e).slice(0, 100)); }
  }
})();
