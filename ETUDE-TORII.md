# Torii Translator — teardown intégral

Étude faite sur les sources primaires du produit (toriitranslate.com, fiche
App Store `id6780277628`, fiche Chrome Web Store, page pricing, PR PocketPal
#990). Aucune Inspection de leur code propriétaire : l'architecture est
reconstruite depuis ce qu'ils documentent eux-mêmes.

---

## 1. Ce que le produit EST

Traducteur d'images manga/manhwa/webtoon/comics, **offline-first côté lecture,
cloud-first côté calcul**. Développeur solo, Discord 2000+ lecteurs et
scanlateurs, MAJ quasi hebdo. Décliné en 4 surfaces qui partagent compte,
crédits et éditeur :

| Surface | Rôle |
|---|---|
| Extension navigateur (Chrome + **Safari iOS/iPadOS**) | traduction à la volée sur les sites de lecture |
| App de bureau | même moteur |
| Web app `toriitranslate.com/image` | workspace scanlation : ZIP / PDF / chapitres entiers, export ZIP/PDF/PSD |
| Web app `/document` | light novels EPUB/TXT, vertical → horizontal |

Positionnement exact : « tap any manga page in Safari and read it in your
language ». Le produit vend **le résultat typographié**, pas la traduction.

---

## 2. Le pipeline, étape par étape

Leur page pricing nomme explicitement les 4 étapes, c'est le meilleur
témoignage de leur architecture :

1. **Text detection** — « scanning for text using advanced models ». Leur
   détecteur sait faire du **vertical comme de l'horizontal** (« vertical/
   horizontal OCR » sur la fiche Chrome), ce qui est le dur du manga/manhwa.
2. **Text extraction** — OCR visuel → texte, bulle par bulle, avec les
   coordonnées.
3. **AI inpainting** — le différentiel produit : « Torii erases the original
   lettering with AI inpainting, then sets the translation inside each bubble,
   **sized to fit**, so the page still looks like a page ». Ils ne collent PAS
   une boîte de texte par-dessus le dessin (ce que font les concurrents) : ils
   effacent la lettre originale puis recomposent.
4. **AI translation** — Claude / Gemini / GPT / DeepSeek / Grok, au choix, BYOK
   possible.
5. **Context processing** — « Bubble by bubble, AI can only guess who's
   talking. Torii works like a human translator: **it sees the page, remembers
   what just happened and knows the whole story** ». Donc : l'image entière est
   dans le contexte (pas juste la bulle), plus un historique de chapitre
   partagé entre pages, plus un glossaire, pour la cohérence des noms et
   termes.
6. **Typesetting** — texte ajusté à la bulle (`sized to fit`), déformations
   `warp` (arche, vague, renflement, perspective), **60 polices dont 44
   récentes, beaucoup spécifiques à une écriture**, téléchargées à la demande
   selon la langue du texte.

Puis la couche **éditeur**, leur second différentiel : tout se corrige dans la
page, sans sortir du navigateur — déplacer/redimensionner/pivoter/restyler
chaque bloc, effacer/peindre/**AI-inpaint au pinceau + prompt**, find &
replace multi-pages, multi-sélection, raccourcis clavier, undo global,
pinceau OCR manuel (re-lire une bulle ratée), outil ligne avec aimant 45°,
export **PSD multicouche**.

**Perf annoncée** : un chapitre de 21 747 pixels traduit en moins de 8 secondes,
toutes bulles incluses.

---

## 3. Le modèle économique, et pourquoi il est discutable

```
1 crédit ≈ 1 page manga  (coût de "scanning")
+ coût AI proportionnel à la longueur du texte traduit
```

Packs (promo Black Friday -20%, sinon ~+25 %) :

| Pack | Prix | Pour 1000 crédits | Soit par page |
|---|---|---|---|
| 2 500 | 5,99 $ | 2,40 $ | 0,0024 $ |
| 6 000 | 12,99 $ | 2,16 $ | 0,0022 $ |
| 15 000 | 29,99 $ | 1,92 $ | 0,0019 $ |

Crédits sans expiration, pas d'abonnement, BYOK qui ne fait payer que le
scanning.

**Le calcul qui fâche.** Coût réel des fournisseurs amont, aujourd'hui :

- OCR/vision d'une page (Gemini Flash-Lite, image ~1500-3000 tokens) :
  **~0,0003 $**
- traduction de ~200 mots (Flash-Lite) : **~0,0001 $**
- **total ~0,0004 $ par page**

Torii facture 0,0019-0,0024 $ la page, soit **5 à 6 fois le coût de ses
propres fournisseurs**, et avec BYOK vous payez encore 0,002 $ la page pour
un service dont le prix de revient machine est un détecteur + un OCR. La
marge n'est pas scandaleuse dans l'absolu, mais la structure l'est
structurellement :

- le cache ne dure qu'**une semaine** : relire un chapitre = repayer ;
- la facturation est par combinaison **image + réglages** : changer la police
  ou la langue = nouveau crédit ;
- la liste des pays de paiement et les processeurs (Lemon Squeezy + Dodo, USDC
  inclus) montrent un produit optimisé pour l'encaissement, pas pour le
  lecteur ;
- les emails jetables sont bloqués explicitement pour proteger le tier gratuit.

**Ordre de grandeur lecteur :** 5 chapitures de 20 pages par semaine =
400 crédits = **~0,86 $/semaine ≈ 45 $/an**, pour lire dans son navigateur ce
qu'un modèle local de 1,1 Go fait gratuitement sur le même téléphone.

---

## 4. La faille : PocketPal rend le pipeline local

Le composant qui manquait pour cloner Torii sans cloud existe depuis le
**17 octobre 2026** : PR PocketPal #990, fusionné. Un serveur OpenAI-compatible
**optionnel et local** (`GET /v1/models`, `POST /v1/chat/completions`, streamé
ou non) qui expose le modèle GGUF chargé dans l'app iOS aux autres apps.
Toggle dans les réglages, port au choix, loopback par défaut, LAN optionnel,
clé API optionnelle.

**Le piège à connaître** (documenté dans le PR) :

> « With no key, requests carrying `Origin` get 403. No CORS headers are sent,
> so browser pages can't use it. »

Conséquences d'architecture, non négociables :

1. **Les appels ne peuvent PAS partir du content script** (contexte de la page
   web) : pas d'en-têtes CORS, préflight `OPTIONS` non répondu → le navigateur
   bloque. Tout passe par le **service worker de l'extension** (MV3), qui avec
   `host_permissions` sur `http://127.0.0.1:*/*` n'est pas soumis au CORS.
2. **Il faut mettre une clé** dans la carte « Local API server » de PocketPal,
   sinon toute requête portant un `Origin` (ce que fait un fetch d'extension)
   prend un 403.
3. Boucle fermée : chaque processus lit la requête en entier puis vérifie une
   fois. Pas de CORS = le navigateur ne laisse personne d'autre que le
   background passer.

C'est exactement l'inverse de Torii : chez eux le serveur est à eux, ici il
est dans la poche.

---

## 5. Ce qu'on clone, et ce qu'on ne clone pas

| Composante Torii | Clone local | Écart assumé |
|---|---|---|
| Détection + OCR vertical/horizontal | **Modèle VLM 1 B** (MiniCPM-V abliterated) : lit la bulle directement depuis l'image, fusionne détection + extraction en une seule inférence | précision inférieure à leur détecteur dédié |
| Inpainting IA | segmentation par couleur + voisinage (le fond de bulle est quasi uniforme), reconstruction morphologique | pas de diffusion : les bulles propres passent, les bulles sur artwork chargé laissent des résidus |
| Traduction | GGUF abliterated 1,7 B-4 B sur PocketPal | un 4 B ne traduit pas comme Opus, mais une bulle de 20 mots n'en a pas besoin |
| Contexte de chapitre | file de contexte dans le stockage de l'extension (les 3 dernières bulles + glossaire) | pas de « voit la page entière » |
| Typesetting + warp + 60 polices | ajustement à la bulle + modes de déformation + sélecteur de police locale | le nombre de polices |
| Éditeur complet | survol + clic + ré-édition texte, remplacement de police, ré-inpainting au pinceau | PSD, find & replace, multi-sélection |

---

## 6. Verdict

Torii est un bon produit d'ingénierie (inpainting + re-lettrage, pas de
surcouche) vendu à un prix qui reflète leur infra cloud, pas leur coût. Le
pipeline est entièrement reproductible sur un iPhone 12 Pro Max : la brique
manquante — un serveur local OpenAI-compatible dans PocketPal — vient
d'arriver. Ce qui reste à faire soi-même est le typesetting et l'extension,
et c'est exactement ce que fait ce dépôt.

Sources : toriitranslate.com/pricing · toriitranslate.com · App Store
id6780277628 · Chrome Web Store `gkdekajjngdkocgiealohleibhdjhoed` ·
github.com/a-ghorbani/pocketpal-ai/pull/990