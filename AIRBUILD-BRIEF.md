# Brief AirBuild — empaqueter Mangatrans en app iOS

*air.build est en waitlist (invite). Ce document est prêt à être collé dès que
l'invite arrive : le repo GitHub est `github.com/dropmoltbot/mangatrans`, la
voie d'import documentée est « Import a project from GitHub ».*

## Ce qu'on veut

Le dossier `extension/` de ce repo est une **extension web Manifest V3 complète
et déjà testée** (OCR `tesseract.js` 0,9 s par page, traduction via un LLM
local, recomposition typographique dans les bulles). Ce qui manque : **l'app
conteneur native iOS** qui l'emballe en *Safari Web Extension*, parce que
l'empaquetage demande Xcode et un Mac.

C'est exactement le travail d'AirBuild.

## Prompt à coller dans « I'd like to build an app that... »

> Wrap an existing Manifest V3 browser extension into a native iOS Safari Web
> Extension app. The complete, working extension source is already in this
> repository under `extension/` (manifest.json, sw.js, content.js, ocr.js,
> typeset.js, prompts.js, popup). Build the minimal Xcode project around it:
> an iOS app target whose only job is to host the extension, plus a Safari
> Extension target that bundles the web files. Do not rewrite the extension,
> do not port it to Swift, do not replace it with native code. Ship it
> unsigned for device testing first, then signed for TestFlight. The app is a
> personal tool, not a product: no landing page, no App Store listing, no
> marketing.

## Les 5 points techniques qui doivent être respectés

1. **Le code web ne change pas.** `extension/` est livré et prouvé (voir
   `README.md` pour les mesures). Les agents ajoutent l'Xcode autour, c'est
   tout.

2. **`tesseract.js` doit être embarqué.** `ocrtest/package.json` en dépend.
   Dans le build script : `npm i tesseract.js` puis copier
   `node_modules/tesseract.js/dist` dans les ressources de l'extension. Sans
   ça l'OCR ne marche plus hors-ligne. Les données de langue `jpn` doivent
   être embarquées ou mises en cache au premier lancement.

3. **Le réseau local est le point sensible.** L'extension appelle
   `http://127.0.0.1:8080` (le serveur local de PocketPal, sur le même
   téléphone). Le conteneur doit donc avoir : `NSLocalNetworkUsageDescription`
   renseigné dans le `Info.plist`, et l'extension doit pouvoir faire des
   requêtes vers l'hôte local. **Tous les appels réseau partent du service
   worker** (`sw.js`), jamais de la page : le serveur de PocketPal n'envoie
   aucun en-tête CORS et refuse toute requête portant un `Origin` sans clé API
   (c'est déjà le cas dans le code, ne pas le « simplifier »).

4. **PocketPal doit tourner en parallèle.** L'app ne fait aucun calcul
   elle-même : elle fournit l'interface, PocketPal fournit le modèle. Pas de
   modèle embarqué, pas de téléchargement de GGUF dans l'app.

5. **Test attendu** (les commandes `simulator` et `runtest` existent chez eux) :
   ouvrir une page avec une image manga, cliquer la porte, vérifier qu'une
   bulle traduite apparaît. Si le simulateur ne peut pas atteindre `127.0.0.1`,
   le tester sur un build device réel avec PocketPal installé.

## Ce que les agents NE doivent PAS faire

- ne pas « moderniser » l'extension en Vue/React/SwiftUI
- ne pas ajouter de compte utilisateur, de télémétrie, d'analytics
- ne pas ajouter de SDK de pub ou de paiement
- ne pas soumettre à l'App Store sans demande explicite (build device
  unsigned suffit)
- ne pas toucher à `sw.js` / `ocr.js` sans raison : ils contiennent des pièges
  corrigés (le parseur TSV de tesseract.js 7, la détection verticale, le
  `enable_thinking: false`)

## Rappel du pipeline (pour que les agents comprennent le produit)

```
page manga → tesseract.js (local, 0,9 s) → bulles + texte
           → verticales : recadrage → VLM PocketPal (optionnel)
           → tout le texte → LLM PocketPal (traduction)
           → typeset dans la bulle (police, déformation)
```

Tout tourne sur le téléphone. Aucun serveur payant.