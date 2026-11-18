#!/usr/bin/env python3
"""Test de bout en bout du pipeline Mangatrans contre le serveur local.
Reproduit exactement ce que fait le service worker de l'extension :
1) OCR d'une page -> JSON de bulles (modele VLM)
2) traduction de chaque bulle (modele local)
Usage: test_pipeline.py <image.png>"""
import base64, json, sys, time, urllib.request

ENDPOINT = "http://127.0.0.1:8788"
MODEL = "MiniCPM-V-4.7-1B-abl-hert-Q4_K_M.gguf"


def chat(messages, max_tokens=450, temperature=0.05, timeout=520):
    body = json.dumps({"model": MODEL, "messages": messages,
                       "max_tokens": max_tokens, "temperature": temperature,
                       "stream": False,
                       "chat_template_kwargs": {"enable_thinking": False}}).encode()
    req = urllib.request.Request(ENDPOINT + "/v1/chat/completions", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)["choices"][0]["message"]["content"]


def extract_json(raw):
    s, e = raw.find("{"), raw.rfind("}")
    if s < 0 or e <= s:
        return None
    try:
        return json.loads(raw[s:e + 1])
    except Exception:
        return None


img_path = sys.argv[1] if len(sys.argv) > 1 else "/home/dropxtor/mangatrans/test_page.png"
b64 = base64.b64encode(open(img_path, "rb").read()).decode()
data_url = "data:image/png;base64," + b64

OCR_PROMPT = """Tu es un moteur OCR de bande dessinee. Tu lis une page de manga en japonais.
Reponds UNIQUEMENT par un JSON de la forme {"bubbles":[{"x":0,"y":0,"w":0,"h":0,"vertical":false,"text":"..."}]}
ou x,y,w,h sont des entiers entre 0 et 1000 (pourcentage de la taille de l'image).
vertical=true si le texte est ecrit verticalement (manga japonais).
Lis chaque bulle de dialogue dans l'ordre de lecture. N'invente rien, ne traduis pas, ne commente pas.
Si aucune bulle n'est visible, reponds {"bubbles":[]}.
FIN DE CONSIGNE. JSON:"""

t0 = time.time()
raw = chat([{"role": "user", "content": [
    {"type": "text", "text": OCR_PROMPT},
    {"type": "image_url", "image_url": {"url": data_url}}]}])
t1 = time.time()
print("=== reponse OCR brute (%.1fs) ===" % (t1 - t0))
print(raw[:800])
parsed = extract_json(raw)
if not parsed:
    print("\n!! JSON non extractible")
    sys.exit(1)

bubbles = parsed.get("bubbles", [])
print("\n=== %d bulles detectees ===" % len(bubbles))
for b in bubbles:
    print("  x=%-4s y=%-4s w=%-4s h=%-4s vert=%-5s %r" %
          (b.get("x"), b.get("y"), b.get("w"), b.get("h"), b.get("vertical"), b.get("text")))

TR_PROMPT = """Tu es traducteur professionnel de manga japonais vers francais.
Traduis la bulle donnee. Regles :
- une seule ligne de sortie : la traduction, rien d'autre ;
- garde le ton (grossier reste grossier, enfantin reste enfantin) ;
- n'ajoute jamais de note, de guillemet, de "Traduction :" ;
- respecte les noms propres deja etablis.
Contexte des bulles precedentes : %s
Bulle a traduire :
%s"""

prev, prevs = [], []
for i, b in enumerate(bubbles):
    t = chat([{"role": "user", "content": TR_PROMPT % (" | ".join(prevs[-3:]), b.get("text", ""))}],
             max_tokens=300, temperature=0.2)
    out = t.strip().split("\n")[-1].strip()
    prevs.append(out)
    print("\n[bulle %d] %s" % (i + 1, b.get("text")))
    print("   -> %s" % out)
print("\ntermine en %.1fs au total" % (time.time() - t0))