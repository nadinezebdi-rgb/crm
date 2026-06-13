# Blade Academy CRM — PRD

## Problème initial
Le CRM Blade Academy existant (https://github.com/nadinezebdi-rgb/crm) doit être conservé et ENRICHI avec un module de pilotage des dossiers stagiaires (workflow Kanban + Onboarding rapide + Archive intelligente), sans casser l'existant.

## Choix utilisateur (itération 2)
- Garder TOUT l'existant (sessions, apprenants, formateurs, etc.) du repo Blade Academy
- Ajouter par-dessus : sidebar 2 zones, Tableau de Bord Kanban, Onboarding rapide, Dossiers Clôturés
- Auth existante (JWT + Emergent Google) conservée
- Upload réel de fichiers (stockage disque dans /app/backend/uploads_dossiers/)

## Architecture
- **Backend** : FastAPI + MongoDB. Code existant inchangé, ajout de `routes/dossiers.py` (nouvelle collection `dossiers` + `dossier_documents`).
- **Frontend** : React 19. Layout existant modifié pour 4 zones (Actif / Données / Historique / Config). 4 nouvelles pages.

## Workflow Kanban
Statuts : `devis_attente` → `devis_valide` → `en_formation` → `fin_formation` → `facture` → `regle` (archive auto).
Dates auto-renseignées :
- `en_formation` → `date_debut_formation`
- `fin_formation` → `date_fin_formation`
- `regle` → `date_cloture` + sortie du Kanban

## Routes NOUVELLES (toutes auth requise)
- `POST /api/dossiers` — Onboarding
- `GET /api/dossiers/active` — Kanban
- `GET /api/dossiers/closed?q=…` — Archives (recherche multi-champs)
- `GET/PUT/DELETE /api/dossiers/{id}`
- `PATCH /api/dossiers/{id}/status`
- `POST /api/dossiers/{id}/documents` (multipart)
- `GET /api/dossiers/{id}/documents`
- `GET /api/dossier-documents/{id}/download`
- `DELETE /api/dossier-documents/{id}`

## Implémenté (13 Jan 2026)
- ✅ Restauration du repo Blade Academy GitHub
- ✅ Backend `routes/dossiers.py` : CRUD + workflow + upload local
- ✅ Sidebar 4 zones (Espace Actif bleu / Données / Espace Historique ambre / Config)
- ✅ Page `/kanban` — 5 colonnes drag & drop + boutons Avancer / Marquer réglé
- ✅ Page `/onboarding` — formulaire rapide (14 champs)
- ✅ Page `/actions` — fiches individuelles + drawer édition + upload docs
- ✅ Page `/archives` — recherche ultra-rapide + drawer readonly
- ✅ Composant `DossierDrawer` partagé (mode edit / readonly)
- ✅ Tests : 26/26 pytest backend + E2E frontend complet (login → onboarding → kanban → avancer×4 → réglé → archives → recherche)

## Backlog (suggestions du testing agent)
- Dénormaliser `formateur_nom` sur le dossier pour accélérer `/dossiers/closed?q=`
- Remplacer le date input HTML5 par le composant Calendar shadcn (cohérence UX)
- Limiter taille/MIME des uploads (DoS hardening)
- Pagination des `/dossiers/*` lorsque > 5000 dossiers

## Itération 3 (13 Jan 2026) — Import EDOF + Vider
- ✅ Backend : POST /api/dossiers-admin/import-edof (parse CSV/XLSX, auto-mappe 9 colonnes, défauts formateur/financeur/formation)
- ✅ Backend : DELETE /api/dossiers-admin/clear?scope=all|active|closed (supprime dossiers + documents + fichiers disque)
- ✅ Backend : 3 formateurs auto-seedés au démarrage : NEO FORMATION, HIGH SKILLS, VIRGINIA DERFEUIL
- ✅ Backend : parser EDOF étendu pour reconnaître `date_naissance` et `adresse`
- ✅ Frontend : EdofImportDialog (drop-zone, défauts financeur/formation/formateur, preview mapping)
- ✅ Frontend : ClearDossiersDialog (3 scopes, confirmation par saisie « SUPPRIMER »)
- ✅ Frontend : 2 nouveaux boutons sur le Tableau de Bord à côté de "Nouveau stagiaire"
- ✅ Tests : 35/35 pytest backend (9 nouveaux + 26 régression)
