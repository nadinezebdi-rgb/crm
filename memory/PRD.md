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

## Itération 4 (14 Jan 2026) — Reset + Export EDOF + PDF + Extraction IA
- ✅ Backend NEW : /api/dossiers-admin/export?format=csv|xlsx&scope=all|active|closed (CSV BOM + Excel stylé)
- ✅ Backend NEW : /api/dossiers/{id}/pdf (génération PDF via reportlab : Identité + Formation + Financement + Documents)
- ✅ Backend NEW : /api/dossiers/extract-pdf (preview) + /api/dossiers/{id}/extract-and-fill (auto-remplissage)
- ✅ Extraction IA via Claude Haiku 4.5 (emergentintegrations) + fallback regex robuste
- ✅ Détection auto du niveau Anglais (A1/A2/B1/B2/C1/C2) + normalisation date YYYY-MM-DD
- ✅ Politique de remplissage : champs vides uniquement (préserve donnée existante) SAUF formation (écrasée si niveau Anglais détecté)
- ✅ Frontend : 4 boutons sur Kanban (Importer EDOF / Export EDOF vert / Reset rouge / Nouveau stagiaire)
- ✅ Frontend : Reset renommé (confirmation par saisie « RESET »)
- ✅ Frontend : DossierDrawer avec boutons « Charger PDF » (violet, IA) + « PDF » (gris, download)
- ✅ Frontend : datalist niveaux Anglais sur champs Formation (Onboarding + Drawer)
- ✅ Tests : 21/21 backend pytest PASS + E2E frontend complet (xlsx download capturé, PDF généré, RESET validé)
- 🧹 Nettoyage : suppression des stubs locaux /app/backend/emergentintegrations et /app/backend/litellm qui shadowed le vrai package


## Itération 5 (15 juin 2026) — Facture CPF importée comptée dans le drawer
- ✅ Bug fix : les factures CPF importées (EDOF) liées à un dossier via `financeur_nom = numero_dossier` apparaissent désormais comme pseudo-documents dans le drawer d'apprenant (slot "Facture")
- ✅ `DossierDrawer.jsx` : `refreshDocs()` fait désormais 2 appels en parallèle (`/dossiers/{id}/documents` + `/dossiers/{id}/factures-cpf`) puis fusionne les factures CPF comme pseudo-docs de type "facture" (sans bouton download/delete, badge "Importée EDOF · Statut")
- ✅ Le compteur 4/4 prend en compte la facture CPF importée, ce qui active le bouton "Envoyer vers Dossiers Clôturés" dès que les 4 docs sont présents
- ✅ Vérifié par curl + screenshot (dossier DUPONT DOSS-2026-001) : 1/4 → 4/4 quand les 3 autres types sont uploadés, bouton archivage activé



## Itération 8 (18 juin 2026) — Triple fix : 4-docs min pour archivage + PDF library visibles dans dossiers + EDOF source archivé
**Demandes utilisateur** : 1) un dossier ne doit passer en clôturés que s'il a ≥4 documents, 2) les vrais PDF de factures (`facture BA-2036.pdf`, `NF-BA-38 facture NEO.pdf`) doivent apparaître dans les dossiers clôturés, 3) le fichier Excel EDOF importé doit rester consultable.

**Fix 1 — Archivage requiert 4 documents** (`routes/dossiers.py`) :
- ✅ Nouveau helper `_dossier_doc_types_count(dossier)` qui compte les types distincts (devis_signe, attestation, facture, justificatif_paiement) en incluant les factures CPF importées comme satisfaisant le slot "facture".
- ✅ `sync_dossier_statuses_from_factures()` : si une facture "Réglée" existe MAIS <4 types de docs présents → bloqué à `facture`, jamais `regle`. Nouveau compteur retourné : `blocked_missing_docs`.
- ✅ Test : DUPONT avec 0 doc + facture Réglée → reste à `facture` (pas archivé). Après upload 3 docs → 4/4 (3 uploaded + 1 CPF metadata) → passe à `regle`.

**Fix 2 — PDF library visibles dans le drawer du dossier** (`routes/dossiers.py`, `routes/library.py`, `DossierDrawer.jsx`) :
- ✅ `GET /dossiers/{id}/documents` merge désormais les library docs cross-linkés via `auto_attach_meta.numero_dossier == financeur_nom`.
- ✅ Auto-attach (upload + bulk) sauvegarde TOUJOURS `auto_attach_meta` dès qu'une facture CPF correspondante est trouvée (même si pas d'apprenant matching), pour permettre le cross-link.
- ✅ Normaliseur amélioré : reconnaît `facture BA-2036.pdf`, `NF-BA-38 facture NEO.pdf`, `Facture-BA-1077.pdf`. Strip des préfixes descriptifs "facture/invoice/note/scan" + accepte 3 segments alpha (NF-BA-38). Pattern digits 2-8.
- ✅ DossierDrawer affiche les library docs avec badge violet "Bibliothèque" + bouton download fonctionnel via `/library/{id}/download`. Suppression = détachement seulement (PATCH `detach-apprenant`).

**Fix 3 — Fichier Excel EDOF archivé dans la bibliothèque** (`routes/imports.py`) :
- ✅ `POST /factures-cpf/import` archive maintenant le fichier source dans Object Storage + dossier_documents avec `is_edof_source: true` et `edof_import_stats: {importees, mises_a_jour, ignorees}`.
- ✅ Badge **"Source EDOF"** indigo sur la page Documents pour identifier ces fichiers historiques.

**Tests** : 14/14 pytest PASS. Test e2e curl + screenshot : DUPONT en archives avec 4/4 docs, section Facture affiche `facture BA-2036.pdf` (badge Bibliothèque, téléchargeable) + 2 lignes EDOF metadata.


## Itération 7 (15 juin 2026) — Auto-statut dossier depuis factures CPF + Export Excel rapport + Navigation Facturation→Apprenant
**Demande utilisateur** : 1) auto-passage du statut dossier en `regle` quand la facture EDOF est "Réglée" (ou `facture` sinon), 2) export Excel du rapport d'auto-rattachement, 3) cliquer sur un apprenant dans Facturation CPF doit ouvrir sa fiche scrollée sur la carte Facture.

**Backend** (`/app/backend/routes/dossiers.py`, `/app/backend/routes/imports.py`, `/app/backend/routes/library.py`) :
- ✅ Helper `_is_facture_payee(statut)` : reconnaît "Réglée", "Versée", "Payée", "Encaissée" (et variantes accent/casse).
- ✅ `sync_dossier_statuses_from_factures()` : parcourt tous les dossiers avec `financeur_nom`, regroupe les factures, applique la règle d'upgrade (jamais downgrade) :
   - ≥1 facture payée → status=`regle` + date_cloture
   - ≥1 facture mais aucune payée → status≥`facture`
   - 0 facture → inchangé
- ✅ `POST /dossiers-admin/sync-status-factures` : endpoint manuel.
- ✅ Intégration automatique dans `POST /factures-cpf/import` : à chaque import, retour enrichi `{importees, mises_a_jour, dossiers_passes_regle, dossiers_passes_facture}`.
- ✅ `POST /library/auto-attach/export-xlsx` : génère un Excel 4 feuilles (Synthèse / Rattachements / Anomalies / Ignorés) à partir du rapport JSON.

**Frontend** :
- ✅ `pages/Facturation.jsx` : nouveau bouton violet **"Sync statuts"** (re-synchro manuelle). Toast d'import enrichi avec compteurs dossiers→facture / dossiers→réglé. Liens cliquables sur N° dossier CPF + Stagiaire (apprenant) → `/apprenants/{id}#facture`.
- ✅ `pages/ApprenantDetail.jsx` : détecte le hash `#facture` → scroll automatique + anneau bleu brand-400 pendant 2.3s sur la carte concernée.
- ✅ `components/AutoAttachReportDialog.jsx` : bouton vert **"Exporter Excel"** (téléchargement via fetch, headers Content-Length).

**Validation** :
- ✅ Tests curl : promotion `en_formation`→`facture` puis `facture`→`regle` confirmées. No-downgrade vérifié (sophie déjà `regle` reste `regle`). Idempotent : 2e run = 0 changement.
- ✅ Excel export : 4 feuilles correctement remplies (Synthèse / Rattachements / Anomalies / Ignorés), headers Cloudflare-compatible.
- ✅ Screenshots : "Sync statuts" visible, "Exporter Excel" visible dans dialog, navigation `DOSS-J-001` → fiche Jean Dupont avec carte Facture highlightée.

## Itération 6 (15 juin 2026) — Auto-rattachement PDF facture → apprenant
**Demande utilisateur** : 240 PDF de factures (ex. BA-1077.pdf) dans la bibliothèque centrale étaient non-rattachés. Logique métier : extraire le n° depuis le nom de fichier → chercher la facture CPF correspondante → lire son n° de dossier CPF → rattacher l'apprenant ayant ce dossier_cpf.

**Backend** (`/app/backend/routes/library.py`, `/app/backend/routes/documents.py`) :
- ✅ Helper `_normalize_invoice_number(filename)` : normalise `BA-1077`, `B-A1077`, `BA 1077`, `ba_1077` → clé canonique `BA1077`. Retourne `None` pour `Rapport.xlsx`, `document.pdf`, `Facture-BA-1077.pdf`. Regex stricte : 1-3 lettres + (sep + 1 lettre)? + sep? + 3-8 chiffres + FIN.
- ✅ Helper `_match_apprenant_for_filename(filename)` : retourne `{status: ok|unparseable|invoice_not_found|no_apprenant, ...}`.
- ✅ `POST /library/upload` : auto-attach automatique si type=facture + fichier PDF/image (xlsx/xls/csv/doc/docx exclus via extension-gate).
- ✅ `POST /library/auto-attach` : traitement bulk renvoyant `{total_examined, attached, successes[], anomalies[], skipped[]}`.
- ✅ `PATCH /library/{id}/attach-apprenant` + `/detach-apprenant` : gestion manuelle.
- ✅ Schéma : nouveaux champs `apprenant_id`, `auto_attached`, `auto_attach_meta` sur `dossier_documents`.
- ✅ `GET /apprenants/{id}/documents` merge désormais les library docs (`apprenant_id == id` → mappés en `categorie: 'facture'` + `source: 'library'`).
- ✅ `GET /library` enrichit chaque doc avec `apprenant: {id, nom, prenom, dossier_cpf}`. Scope `unattached` = ni dossier_id ni apprenant_id.

**Frontend** :
- ✅ `pages/Documents.jsx` : bouton violet **"Rattacher tout"** (MagicWand) + dialog de rapport.
- ✅ `components/AutoAttachReportDialog.jsx` : nouveau dialog 3 sections (✓ Rattachements / ⚠ Anomalies / ↷ Ignorés) + filtre.
- ✅ `pages/Documents.jsx` : colonne "Stagiaire rattaché" affiche apprenant avec badge **AUTO** violet.
- ✅ `pages/ApprenantDetail.jsx` : carte **Facture** affiche les PDF library avec badge **Auto** ; download via `/library/{id}/download` ; détachement via `/library/{id}/detach-apprenant`.

**Tests** : 12/12 pytest PASS (`/app/backend/tests/test_library_auto_attach.py`) — couvre normalizer, upload auto-attach, bulk endpoint, merge, scope, detach. Bug spec-violation `xlsx auto-attaché à l'upload` détecté par testing agent + corrigé.

## Itération 5 (15 juin 2026) — Recherche apprenants par n° dossier CPF + Factures dans drawer
- ✅ `routes/crud.py` : ajout de `dossier_cpf` dans les champs cherchés par `GET /apprenants?q=…` (validé curl).
- ✅ `DossierDrawer.jsx` : factures CPF importées comptent dans le compteur 4/4 (déjà en place avant ce fork).
