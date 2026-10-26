# Cap sur mes 40 ans

Application Vite (JavaScript, sans framework) contenant ma feuille de route d'octobre 2026 à mai 2031 et mon suivi spirituel quotidien. Elle propose le journal du jour, le calendrier, le bilan de l'année, le registre, le compte rendu WhatsApp et l'export CSV ou texte.

Les données sont stockées dans **Supabase**, qui sert de base de données et gère la connexion par lien magique envoyé par e-mail. Je peux ainsi retrouver mon suivi sur mon téléphone comme sur mon ordinateur. Sans configuration Supabase, l'application fonctionne en mode local, avec les données dans le navigateur.

## Structure

```
index.html            la page (les deux vues)
src/main.js           toute la logique : journal, bilans, registre, export, synchro
src/style.css         le style (thème clair et sombre)
supabase/schema.sql   la table et ses règles d'accès (RLS)
.env.example          les deux variables à renseigner
```

## 1. Lancer en local

```bash
npm install
npm run dev
```

Ouvre http://localhost:5173. Tant que le fichier `.env.local` n'existe pas, l'application est en mode local.

## 2. Créer la base Supabase

1. Crée un projet sur https://supabase.com. L'offre gratuite suffit.
2. Ouvre **SQL Editor**, colle le contenu de `supabase/schema.sql` et exécute-le.
3. Récupère les clés dans **Connect**, ou dans **Settings → API Keys** : l'URL du projet et la clé **publishable** (`sb_publishable_…`).
4. Dans **Authentication → URL Configuration** :
   - **Site URL** : l'adresse Vercel, par exemple `https://cap40.vercel.app`. Tu la complètes après l'étape 4.
   - **Redirect URLs** : ajoute `http://localhost:5173` et l'adresse Vercel.
5. Copie `.env.example` en `.env.local` et remplis les deux valeurs. Relance `npm run dev` : la barre du haut propose alors la connexion.

La clé *publishable* peut être dans le navigateur, c'est prévu pour. Les règles RLS du fichier SQL garantissent que chaque compte ne lit et n'écrit que ses propres lignes. Ne mets **jamais** la clé *secret* dans ce projet.

## 3. Pousser sur GitHub

```bash
git init
git add .
git commit -m "Cap sur mes 40 ans"
git branch -M main
git remote add origin https://github.com/<ton-compte>/cap-sur-mes-40-ans.git
git push -u origin main
```

Le fichier `.env.local` n'est pas envoyé, car il est ignoré par `.gitignore`.

## 4. Déployer sur Vercel

1. Sur https://vercel.com, clique sur **Add New → Project**, puis importe le dépôt GitHub.
2. Vercel détecte **Vite**. Garde les réglages par défaut : build `npm run build`, dossier `dist`.
3. Dans **Environment Variables**, ajoute :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Clique sur **Deploy**, puis reporte l'adresse obtenue dans Supabase (étape 2.4).

Chaque `git push` sur `main` redéploie l'application. Les variables `VITE_` sont lues au moment du build : si tu les modifies, relance un déploiement.

Tu peux aussi déployer en ligne de commande : `npx vercel`, puis `npx vercel --prod`.

## Comment les données sont rangées

La table `suivi_docs` contient une ligne JSON par « document » et par utilisateur :

| id | contenu |
|---|---|
| `m-2027-03` | le journal de mars 2027, avec une entrée par jour : RDQD, chapitres, prière, culte, LB, LLC, PG, jeûne, note… |
| `y-2027` | le registre de 2027 (réunions, sièges, livres, retraites, dons) et les jeûnes de l'année |
| `jalons` | les jalons cochés de la feuille de route |
| `reglages` | le préalable « sevré du sucre » |

À la première connexion, ce qui a déjà été saisi en mode local est envoyé sur ton compte. Ensuite, les données se rechargent à chaque fois que tu reviens sur l'onglet.
