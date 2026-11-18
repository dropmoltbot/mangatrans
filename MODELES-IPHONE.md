# Quel GGUF ouvert tourne sur un iPhone 12 Pro Max

Matériel cible : **A14 Bionic, 6 Go de RAM**. Le budget réel d'une app iOS est
plus serché que les 6 Go annoncés : entre l'OS, Safari, et le KV-cache, un
modèle doit tenir dans **~2,5-3 Go maximum**, projecteur de vision inclus.

Toutes les tailles ci-dessous sont **vérifiées sur l'API HuggingFace**
(tailles de fichiers réelles, pas les tailles annoncées).

## Le gagnant : vision + traduction en un modèle

**`Abiray/MiniCPM-V-4.7-1B-abliterated-heretic-GGUF`**
- `MiniCPM-V-4.7-1B-abliterated-heretic-Q4_K_M.gguf` — **672 Mo**
- `mmproj-model-f16.gguf` — **1 110 Mo** (projecteur vision)
- **total 1,78 Go** : tient largement dans le budget

Pourquoi lui : c'est un **VLM abliterated** (refusals retirées, donc pas de
censure sur du manga adulte ou violent). En un seul appel il **lit les bulles
directement depuis l'image** — il fusionne la détection, l'extraction OCR et la
localisation des bulles de Torii en une seule inférence. Un passage en JSON
donne les coordonnées + le texte de chaque bulle.

## Le second : texte seul, ultra rapide

**`orcarouter/LFM3-1.7B-abliterated-GGUF`**
- `LFM3-1.7B-abliterated-Mix-4bit.gguf` — **1 099 Mo**

Modèle abliterated texte. Pas de vision : il lui faut le texte (mode
« texte uniquement », exactement comme l'option de Torii qui ne facture pas le
scanning quand tu fournis le texte). En contrepartie il tourne à 10-15 tok/s
sur un A14. Idéal pour retraduire une bulle après correction, ou translator du
texte collé.

## L'option qualité, si tu acceptes le risque

**`mradermacher/Qwen3-4B-abliterated-GGUF`** (source `huihui-ai/Qwen3-4B-abliterated`, 67 likes)
- `Qwen3-4B-abliterated.IQ4_XS.gguf` — **2 286 Mo**

Qwen3-4B est le meilleur multilingue JA/KO/ZH du trio, mais 2,3 Go + KV-cache
sur 6 Go de RAM, c'est la zone où iOS commence a tuer les apps. A réserver a un
iPhone 12 Pro Max sans autre grosse app en mémoire.

## Écartés, et pourquoi

| Modèle | Raison |
|---|---|
| `huihui-ai/Huihui-gemma-4-E4B-it-qat-q4_0-...-abliterated-GGUF` | Q4_K = **5 302 Mo**, dépass le budget iPhone 6 Go malgré son archi MoE |
| `SC117/Spark-X2.6-4B-abliterated-FIT-GGUF` | 2 337-2 696 Mo, trop gros, pas meilleur que Qwen3-4B |
| `huihui-ai/DeepSeek-R1-Distill-Qwen-1.5B-abliterated` | 774 téléchargements, sûrement le plus rapide, mais un distillé de raisonnement traduit mal la langue courante |
| `huihui-ai/gemma-3-1b-it-abliterated` | **404** sur HuggingFace : n'existe pas |

## Comment les installer dans PocketPal

1. Récupère les fichiers GGUF (liens HuggingFace ci-dessus).
2. Sur iOS : AirDrop / Fichiers / iCloud Drive vers l'app PocketPal
   (« Import model »).
3. Dans PocketPal : **charge le modèle principal**, puis **le projecteur
   `mmproj`** dans les réglages du modèle (obligatoire pour MiniCPM-V, sinon
   pas de vision).
4. Active le **serveur local** : réglages → carte « Local API server » →
   toggle ON, port (`8080`), **mets une clé API** (obligatoire, voir plus bas),
   reste en loopback (n'active le LAN que si tu sais ce que tu fais).
5. L'extension se connecte sur `http://127.0.0.1:<port>`.

## Le piège à ne pas manquer

Le serveur local de PocketPal (PR #990) **n'envoie aucun en-tête CORS** et
renvoie **403 à toute requête portant un `Origin` quand aucune clé n'est
définie**. Un appel depuis le JavaScript de la page est donc impossible. D'où
l'architecture de l'extension : tous les appels passent par le **service
worker**, qui n'est pas soumis au CORS, et portent la clé API.