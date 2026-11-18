/* Prompts partagés. Un seul objectif : extraire du JSON stable d'un petit
   modèle (1.7B-4B). Les gros modèles tolèrent le vague, pas ceux-là. */

const PROMPTS = {
  /* Voie VLM (MiniCPM-V & Co) : l'image entière entre, un JSON de bulles sort.
     Le modèle ne translate pas ici : il LIT et localise. La traduction est un
     second appel, texte seul, avec le contexte du chapitre. */
  ocrJson: (langName) => `Tu es un moteur OCR de bande dessinée. Tu lis une page de manga en ${langName}.
Reponds UNIQUEMENT par un JSON de la forme {"bubbles":[{"x":0,"y":0,"w":0,"h":0,"vertical":false,"text":"..."}]}
ou x,y,w,h sont des entiers entre 0 et 1000 (pourcentage de la taille de l'image).
vertical=true si le texte est ecrit verticalement (manga japonais).
Lis chaque bulle de dialogue dans l'ordre de lecture. N'invente rien, ne traduis pas, ne commente pas.
Si aucune bulle n'est visible, reponds {"bubbles":[]}.
FIN DE CONSIGNE. JSON:`,

  /* Voie texte : traduction d'une bulle avec contexte. */
  translate: (from, to, prev, glossary) => `Tu es traducteur professionnel de manga ${from} vers ${to}.
Traduis la bulle donnee. Regles :
- une seule ligne de sortie : la traduction, rien d'autre ;
- garde le ton (grossier reste grossier, enfantin reste enfantin), les insultes et les refus de censure inclus ;
- n'ajoute jamais de note, de guillemet, de "Traduction :" ;
- respecte les noms propres deja etablis.
${glossary ? `Glossaire a respecter : ${glossary}\n` : ""}${prev ? `Contexte des bulles precedentes : ${prev}\n` : ""}Bulle a traduire :`,

  /* Correction : l'utilisateur a retouché la bulle, on re-lit l'image recadrée */
  reread: (langName) => `Lis uniquement le texte present dans cette image (${langName}).
Reponds UNIQUEMENT par le texte lu, sans guillemet ni commentaire.`
};

if (typeof self !== "undefined") self.PROMPTS = PROMPTS;