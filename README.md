# Mangatrans — Torii, en local

Clone hors-ligne du traducteur manga **Torii Translator** : même pipeline
(détection → OCR → traduction → recomposition typographique), même geste
(porte sur l'image survolée), mais le calcul tourne **sur le téléphone** via
PocketPal, pas sur un serveur payant.

```
extension/     l'extension navigateur (Manifest V3 : Chrome, Firefox, Safari 15+)
MODELES-IPHONE.md  quel GGUF abliterated tient dans un iPhone 12 Pro Max
ETUDE-TORII.md     teardown complet de Torii (pipeline, tarifs, écart de coût)
test_pipeline.py   test de bout en bout contre un llama-server local
ocrtest/           mesures tesseract.js et preuves de regroupement
```

## L'architecture trouvée (et pourquoi)

Le goulet d'étranglement d'un traducteur local, c'est l'OCR. Mesures faites
sur ce poste (box CPU, saturée par d'autres process) avec `tesseract.js 7.0` :

| chemin | résultat mesuré |
|---|---|
| `jpn`, page entière | **0,7-1,3 s**, confiance **89-91**, 5 bulles détectées avec coordonnées |
| `jpn_vert`, page entière | 7,9 s, confiance 32 → **inutilisable** |
| `jpn_vert`, sur le recadrage seul | 0,32 s, confiance 39 → toujours inutilisable |
| VLM MiniCPM-V 1B (PocketPal) | 12k tokens, mais **~0,4-0,7 tok/s en CPU** → des minutes par page |
| rotation de la bulle verticale | confiance 20-23 → **casse les caractères** (en japonais vertical ils restent droits) |

Conclusion retenue :

1. **OCR par `tesseract.js` (`jpn`), dans l'extension.** 0,9 s, hors-ligne,
   zéro requête réseau, zéro modèle. Chemin par défaut.
2. **Traduction par le LLM local** (PocketPal, `LFM3-1.7B abliterated` en
   texte seul, rapide, ou tout GGUF OpenAI-compatible).
3. **Les boîtes verticales au VLM** : tesseract plafonne à ~55 % de
   caractères justes sur le japonais vertical et l'ordre de lecture reste
   incertain. L'extension recadre chaque boîte détectée comme verticale et la
   fait relire par le modèle chargé dans PocketPal (un VLM lit le manga
   nativement). Seules ces boîtes passent par le réseau : le reste du pipeline
   est 100 % local.

**Preuve complète** (`ocrtest/proof5.js`, exécutée sur la page de test) :
0,9 s, confiance 91, 5 bulles, toutes les coordonnées dans 0-1000, 4 bulles
horizontales à 92-97 % de confiance, 1 verticale détectée (flag `V`) et
renvoyée au VLM.

## Installer en 5 minutes

**1. Le modèle de traduction** (`MODELES-IPHONE.md` pour les tailles vérifiées)
- `orcarouter/LFM3-1.7B-abliterated-GGUF` → `LFM3-1.7B-abliterated-Mix-4bit.gguf` (1,1 Go)

**1bis. Le VLM, optionnel, seulement pour le texte vertical**
- `Abiray/MiniCPM-V-4.7-1B-abliterated-heretic` → `…Q4_K_M.gguf` (672 Mo) **et** `mmproj-model-f16.gguf` (1,11 Go)

**2. PocketPal**
- charge le modèle, et attache le mmproj si tu as pris le VLM
- Réglages → **Local API server** → ON, port `8080`, **mets une clé API**
- vérifie l'URL affichée (normalement `http://127.0.0.1:8080`)

**3. L'extension**
- iPhone/iPad : Safari → Réglages → Extensions. Pour la charger, il faut
  l'emballer dans une app conteneur (Xcode : File > New > Project > Safari
  Web Extension, puis glisser le dossier `extension/` dans `Resources`).
  C'est la seule étape qui demande un Mac — le code est identique partout.
- Chrome/Firefox (pour tester tout de suite) : dans `extension/`, lance
  `npm i tesseract.js` puis copie `node_modules/tesseract.js/dist` dedans ;
  ensuite `chrome://extensions` → mode déveléveloppeur → « Charger
  l'extension non empaquetée » → dossier `extension/`
- Ouvre le popup : colle l'URL du serveur local, la clé API, la langue
  source/cible, la police. Clique **Tester** — tu dois voir la liste des
  modèles chargés.

**4. Lire**
Sur n'importe quel site de manga : survole une image → clique la porte ⛩.
Ou active **Auto** pour traduire au scroll. Chaque bulle traduite est
éditable au clic (correction), et la police/la forme se changent depuis la
barre en bas.

## Pourquoi les appels passent par le service worker

Le serveur local de PocketPal (PR #990) **n'envoie aucun en-tête CORS** et
renvoie **403 à toute requête portant un `Origin` quand aucune clé n'est
définie**. Un `fetch` depuis le JavaScript de la page est donc bloqué par le
navigateur (préflight `OPTIONS` jamais répondu). Le service worker de
l'extension, avec ses `host_permissions`, échappe au CRS et porte la clé :
c'est le seul endroit d'où un appel peut sortir. D'où `sw.js`.

## Ce qui est fait, ce qui ne l'est pas

| Fait | Pas fait |
|---|---|
| OCR local `tesseract.js` 0,9 s/page, hors-ligne, + coordonnées de bulles | Lecture verticale parfaite (tesseract plafonne, d'où le repli VLM) |
| Traduction avec contexte des bulles précédentes | Glossaire persisté côté app (le champ existe, l'UI ne l'expose pas encore) |
| Ajustement du texte à la bulle + 4 déformations (arche, vague, renflement, perspective) | Export PSD multicouche |
| Correction inline de chaque bulle | Find & replace multi-pages |
| Auto-traduction au scroll | Inpainting par diffusion (effaçage simple seulement) |

## Piège de modèle

`MiniCPM-V 4.7` est un modèle *thinking* : sans
`"chat_template_kwargs": {"enable_thinking": false}`, tout le budget part dans
`reasoning_content` et `content` revient **vide**. Ce paramètre est déjà dans
`sw.js`.

## État des tests

- `ocrtest/proof5.js` : page réelle, `jpn` 0,9 s, confiance 91, 5 bulles,
  coordonnées validées 0-1000, vertical détecté.
- `ocrtest/proof7.js` : `jpn_vert` mesuré inutilisable (39 % sur recadrage),
  rotation mesurée contre-productive (20-23 %).
- **Pipeline local COMPLET exécuté** (`ocrtest/trad.js` sur `llama-server`
  chargé avec `qwen3-4b-abliterated-IQ4_XS.gguf`, 2,29 Go, prompt exact de
  `sw.js`) :

  | bulle lue par tesseract | traduction locale | temps |
  |---|---|---|
  | `おい、聞いているの か?` | « fuck, tu m'écoutes vraiment ? » | 76 s |
  | `それは無理だ…` | « C'est impossible… » | 31,7 s |
  | `逃だぐ げ、! る今 んす` (vertical degradé) | « fuyaré, ! merde maintenant » | 43,2 s |
  | `わかった。信じる。` | « Je comprends. Je crois. » | 53,2 s |

  Deux résultats à retenir : le LLM local retrouve le **sens** malgré un OCR
  vertical à ~55 % de caractères justes, et `enable_thinking: false` est
  obligatoire (sans lui, le budget part dans `reasoning_content` et `content`
  revient vide). Ces temps sont mesurés sur cette box CPU saturée : un iPhone
  passe par Metal, ordre de grandeur différent, mais NON mesuré ici.

## Comparatif A/B des deux modèles de traduction (même prompt, même box)

| bulle OCR (tesseract) | `Qwen3-4B-abliterated` IQ4_XS (2,29 Go) | `Qwen3.5-4B-SOMPOA-heresy-v2` Q4_K_S (2,56 Go) |
|---|---|---|
| `おい、聞いているの か?` | « fuck, tu m'écoutes vraiment ? » (76 s) | **« Eh, tu m'écoutes ? »** (76 s) |
| `それは無理だ…` | « C'est impossible… » (31,7 s) | « C'est impossible… » (41 s) |
| `逃だぐ げ、! る今 んす` (vertical degradé) | « fuyaré, ! merde maintenant » (43 s) | **« Fuyez ! Je vous écoute maintenant ! »** (71 s) |
| `わかった。信じる。` | « Je comprends. Je crois. » (53 s) | « Compris. Je crois. » (46 s) |

Verdict : SOMPOA rend mieux le registre courant (おい = « Eh », pas
« fuck »), les deux hallucinent également sur le vertical à 55 % de
caractères justes, SOMPOA coûte 271 Mo de plus et est ~20 % plus lent. Il
embarque aussi un projecteur vision (`mmproj-Q8_0`), donc il pourrait tenir
les DEUX rôles (traduction + relecture du vertical) en un seul modèle chargé —
non testé ici, le mmproj n'a pas été téléchargé. Piège d'installation : HF
sert le Qwen3.4B en 401 quand un repo disparaît, et `Qwen3-1.7B-abliterated`
aussi : vérifier le HEAD avant de compter sur un repo.
- `test_pipeline.py` : pipeline VLM complet sur `llama-server` local — le
  modèle charge, l'image s'encode (375 tokens), la génération fonctionne, mais
  à 0,4-0,7 tok/s sur cette box CPU : d'où le choix de sortir l'OCR du LLM.