# Blade Academy CRM — Product Requirements Document
(ex-FormaPro — rebrandé Blade Academy le 11 juin 2026)

## Original Problem Statement
Plateforme web complète de gestion d'organisme de formation (français) couvrant le cycle de vie d'une formation : prospection commerciale → planification → conformité Qualiopi & BPF → gestion apprenants/formateurs → délivrance des attestations. Trois profils : admins/gestionnaires, formateurs (internes/externes), apprenants & entreprises clientes.

## User Personas
- **Admin / Gestionnaire** d'organisme de formation — pilote l'activité, suit les sessions, génère les documents Qualiopi, exporte le BPF.
- **Formateur** (interne / externe) — accède à ses sessions, documents, émargements.
- **Apprenant** — consulte programme, documents et évaluations (portail public en P1).
- **Entreprise cliente** — accède à l'espace entreprise pour conventions/factures (P1).

## Architecture
- **Backend**: FastAPI monolith (`/app/backend/server.py`) + MongoDB (motor). Auth JWT + Emergent Google OAuth.
- **Frontend**: React 19 + react-router 7, Tailwind + shadcn UI, Phosphor icons, Recharts. Fonts Cabinet Grotesk (titres) + IBM Plex Sans (corps).
- **Doc gen**: ReportLab PDF (8 types).
- **Deployment**: supervisor (backend:8001, frontend:3000), accessible via REACT_APP_BACKEND_URL.

## Tech Choices
- Auth: JWT (HS256, 8h access + 7d refresh, httpOnly cookies) + Emergent OAuth (`auth.emergentagent.com` → `/api/auth/emergent/session`).
- DB: MongoDB, custom string IDs (`user_id`, `id`), all ISO datetime strings.
- Design: **Rebrand Blade Academy (11 juin 2026)** — thème clair, sidebar navy #0B1726, accent cyan Blade (#4FC0EE→#0E7FB6, palette tailwind `brand`), logo rond "Blade." (`/public/blade-logo.png`, récupéré depuis blade-academy.fr), login hero navy style site vitrine (typographie bold uppercase, "SANS LIMITES."), favicon + titre "Blade Academy — Gestion de formation". ORG_NAME backend par défaut = "Blade Academy".

## Implemented (v1.0 — June 8 2026)
- Authentication: JWT login/register/logout/me/refresh + Emergent Google OAuth callback.
- **Sessions module** (cœur): Kanban 5 colonnes (brouillons/planification/planifiée/terminée/archivée) + Liste, filtres (search, type d'action), création guidée 4 étapes, fiche 4 onglets (Progression Qualiopi avec 8 checks, Paramètres, Gestion docs, Portail apprenants mock).
- **Données** (référentiel): CRUD complet Apprenants, Formateurs (interne/externe), Entreprises clientes, Financeurs (OPCO/CPF/…), Lieux (présentiel/distanciel).
- **Dashboard**: KPIs (sessions actives, apprenants, CA, marge, progression moyenne) + chart répartition Kanban + calendrier des sessions.
- **Production documentaire**: génération PDF de 8 types de documents (convention, contrat, convocation, attestation, facture, émargement, programme, évaluation) via ReportLab.
- **Paramètres**: 8 sections (identité, marque, intégrations mock, Qualiopi/BPF, modèles doc/email, notifications, accessibilité EDOF).
- Seed automatique (3 entreprises, 3 formateurs, 5 apprenants, 3 financeurs, 3 lieux, 4 sessions de démo).

## Rebrand Blade Academy (v1.1 — 11 juin 2026)
- Identité visuelle reprise de https://blade-academy.fr/ (choix utilisateur : thème clair + sidebar navy + accent cyan).
- Fichiers touchés : `tailwind.config.js` (palettes `brand` + `navy`), `index.css` (vars --brand, --primary, .blade-hero), `Layout.jsx`, `Login.jsx`, `Register.jsx`, `index.html`, remplacement global `blue-*` → `brand-*` dans pages/, `server.py` (ORG_NAME, titres API, pied de page PDF).
- DB : `users.organisme` → "Blade Academy", admin renommé "Admin Blade Academy". **Credentials migrés (11 juin) : admin@blade-academy.fr / admin123** (migration idempotente au démarrage dans `seed()` — fonctionne aussi en production au prochain redéploiement ; l'ancien admin@formapro.fr n'existe plus). Données démo nettoyées (emails formateurs, lieu "Centre Blade Academy Paris"). `.env` backend : ADMIN_EMAIL/ADMIN_NAME/ORG_NAME mis à jour (DB_NAME inchangé).
- Sous-domaine : l'utilisateur veut crm.blade-academy.fr (DNS CNAME vers déploiement Emergent, site principal reste sur Webflow) — instructions données, action côté utilisateur.

## Infos légales organisme + PDF (v1.2 — 11 juin 2026)
- Collection `organisme_settings` (doc singleton, clé "organisme"), pré-remplie au seed avec les vraies infos légales de Blade Academy (source : blade-academy.fr/mentions-legales) : SAS, SIRET 984 617 654 00012, RCS Soissons, APE 85.59A, TVA FR50984617654, NDA 32020170602 (Hauts-de-France), Qualiopi N° 338511-1 (CERTIF OPAC), 26 Rue Jules Lefebvre 02130 Fère-en-Tardenois, blade.academy@hotmail.com, +33 (0)6 51 21 84 87.
- Endpoints : `GET/PUT /api/parametres/organisme` (auth requis).
- PDF rebrandés : bandeau navy #0B1726 + liseré cyan, coordonnées en en-tête, pied de page légal complet (SIRET/RCS/TVA, mention NDA réglementaire, N° Qualiopi + certificateur). `build_pdf(title, lines, org)`.
- Paramètres > "Identité de l'organisme" : section fonctionnelle (16 champs, GET au chargement, PUT à l'enregistrement, data-testid `org-{champ}` + `org-save-btn`).
- Testé : login, GET/PUT, 4 types de PDF générés (HTTP 200), extraction texte PDF vérifiée (8 mentions légales présentes), UI vérifiée par screenshot.

## Backlog (Next Priorities)
### P0 (Next iteration)
- Module **Gestion commerciale** : pipeline d'opportunités (CRM), enrôlements, archivage opportunités.
- Génération PDF avancée (templates personnalisables, en-tête organisme, signature électronique mock → vraie intégration Yousign).
- Filtres avancés Sessions : admin, formateur, dates, programme, catégorie, niveau de progression.
- Portail apprenants public (route `/portail/:id`) avec consultation programme, documents, évaluations.

### P1
- Module **Bibliothèque** : programmes réutilisables, évaluations, archivage.
- Module **E-learning** : cours, activités, import SCORM réel.
- Import/Export Excel des entités (xlsx).
- Champs personnalisables (custom fields) sur entités principales.
- Multi-langue contenu + multi-fuseaux.
- Notifications temps réel + centre de notifications fonctionnel.

### P2
- Espace formateur / espace entreprise dédiés (multi-portails).
- Catalogue en ligne public + formulaire d'inscription individuelle.
- BPF export officiel CERFA.
- Intégration signature électronique réelle (Yousign/DocuSign).
- Intégration emails transactionnels (Resend/SendGrid).
- Freemium + abonnement Stripe (free / pro / premium).
- Multi-organismes (tenant isolation) pour SaaS multi-clients.

## Documents PDF juridiques complets (v1.3 — 11 juin 2026)
- Nouveau module `/app/backend/documents.py` : moteur de rendu par blocs (titres avec liseré cyan, paragraphes avec retour à la ligne auto, multi-pages avec pied de page légal sur chaque page, blocs de signature double cadre).
- 8 modèles enrichis conformes Code du travail :
  - **Convention** (L.6353-1/2) : 9 articles — objet/nature/durée, lieu, effectif (stagiaires listés), moyens pédagogiques, suivi/sanction, prix HT/TVA/TTC, règlement (D.441-5), dédit/annulation (>10j : 0%, <10j : 50%, abandon : 100%), litiges + double signature.
  - **Contrat** (L.6353-3 à 7) : rétractation 10 jours, acompte max 30%, interruption prorata temporis.
  - **Convocation** : horaires, consignes, référent handicap, stagiaires listés.
  - **Attestation** (L.6353-1 al.2) : nature, durée, objectifs, résultats des acquis.
  - **Facture** : n° FAC-{code}, HT/TVA 20%/TTC, échéance 30j, pénalités + indemnité 40 €, subrogation financeur.
  - **Émargement** : lignes matin/après-midi par stagiaire, contreseing formateur.
  - **Programme** : objectifs, prérequis, méthodes, évaluation, accessibilité handicap, tarif, délai d'accès (Qualiopi).
  - **Évaluation à chaud** : 6 critères échelle 1-5, recommandation, commentaires.
- Les documents résolvent les entités liées (lieu, formateurs, apprenants, entreprise, financeur) pour un contenu nominatif.
- ⚠️ TVA 20% appliquée par défaut — si l'organisme est exonéré (art. 261-4-4°-a CGI), adapter `_prix_lignes` dans documents.py.
- Testé : 8 PDF HTTP 200, mots-clés juridiques vérifiés par extraction, mise en page validée visuellement (analyse PDF).

## Import EDOF / CPF (v1.4 — 11 juin 2026)
- Nouveau module `/app/backend/import_edof.py` : parsing CSV (séparateurs ;/,/tab, encodages utf-8/cp1252/latin-1) et Excel .xlsx (openpyxl), détection automatique des colonnes EDOF standard (mots-clés normalisés sans accents), parsing dates FR (dd/mm/yyyy…) et montants FR ("1 495,00 €").
- Endpoints : `POST /api/import/edof/preview` (upload multipart → colonnes + mapping auto + lignes) et `POST /api/import/edof/commit` (rows + mapping + create_sessions).
- Logique commit : dédoublonnage apprenants par email (sinon nom+prénom, insensible casse), notes "Importé depuis EDOF… Dossier CPF n° X", lignes annulées/refusées ignorées (reportées), regroupement par (formation, date début, date fin) → création sessions (statut auto : terminee si passée / planifiee / brouillon, prix_ht = somme des dossiers, financeur CPF find-or-create type_financeur=cpf, apprenants rattachés). Ré-import idempotent (sessions complétées, pas de doublons).
- Frontend : `ImportEdofDialog.jsx` (3 étapes : fichier → mappage corrigeable + aperçu 5 lignes + case "créer les sessions" → résultat avec stats et lignes ignorées). Bouton "Importer EDOF (CPF)" sur la page Apprenants via prop `extraActions` ajoutée à CrudPage.
- data-testid : edof-import-btn, edof-file-input, edof-mapping-{champ}, edof-create-sessions, edof-commit-btn, edof-result, edof-close-btn.
- Testé e2e : CSV cp1252 + XLSX, mapping auto 10/10, commit (4 apprenants, 3 sessions, 1 annulé ignoré, doublon email fusionné), ré-import idempotent, UI vérifiée par screenshots (fix overflow modal min-w-0). Données de test nettoyées.

## Module Facturation CPF (v1.5 — 11 juin 2026)
- Contexte : l'utilisateur a fourni son export EDOF **Factures** réel (237 factures 2025, toutes "Versé", 889 480 €) — fichier sans données nominatives (pas de nom/email/formation), donc inutilisable pour créer des stagiaires (l'export **Dossiers** EDOF reste nécessaire pour ça).
- Backend : `map_facture_columns()` dans import_edof.py (détection NUMERO_DOSSIER, NUMERO_FACTURE, TYPE, DATE_EMISSION, MONTANT_REGLEMENT, STATUT_REGLEMENT, DATE_REGLEMENT, EN CONTROLE O/N). Endpoints : `POST /api/factures-cpf/import` (upload direct, dédoublonnage par n° facture, ré-import = mise à jour), `GET /api/factures-cpf?q=` (recherche n° dossier/facture, lien stagiaire via `apprenants.dossier_cpf`), `GET /api/factures-cpf/stats` (nb, total, versé, attente, par_mois).
- Champ `dossier_cpf` ajouté à ApprenantPayload + renseigné par l'import EDOF Dossiers → les factures se relient automatiquement aux stagiaires une fois l'export Dossiers importé.
- Frontend : page `/facturation` (Facturation.jsx) — 4 KPIs, graphique Recharts versé/mois, tableau (n° facture, dossier, stagiaire, montant, badge statut, dates, contrôle), recherche, bouton import direct. Entrée "Facturation CPF" dans la sidebar (groupe Pilotage). Champ "N° dossier CPF" ajouté au CRUD Apprenants.
- Testé avec le vrai fichier : 237 importées / ré-import 237 maj 0 doublon / stats exactes / recherche OK / UI vérifiée par screenshot. Les 237 factures réelles sont en base de PREVIEW — l'utilisateur devra réimporter le fichier en production après redéploiement.

## Pagination 20/50/100 (v1.6 — 11 juin 2026)
- Composant réutilisable `Pagination.jsx` (sélecteur 20/50/100 par page, navigation précédent/suivant, compteur "X–Y sur N"). Pagination côté client.
- Intégré dans `CrudPage.jsx` (toutes les pages Données : Apprenants, Formateurs, Entreprises, Financeurs, Lieux — reset page à la recherche) et `Facturation.jsx` (tableau des 237 factures).
- data-testid : `{testid}-pagination(-size/-info/-prev/-next)`, `factures-pagination*`.
- Testé : Facturation 1–20 sur 237 → 100/page → page 2 (101–200), Apprenants 1–5 sur 5. ⚠️ Leçon : ne pas lancer plusieurs search_replace en parallèle sur le MÊME fichier (conflit d'écriture constaté et corrigé).

## Qualité des données — doublons (v1.7 — 11 juin 2026)
- Endpoint `GET /api/qualite/doublons` : apprenants groupés par email identique et par nom+prénom identique (dédupliqué si même email déjà signalé), factures CPF groupées par n° de facture identique, + info dossiers CPF multi-factures (souvent normal).
- UI : section "Qualité des données" dans Paramètres (bouton "Analyser les doublons", résultat vert si propre / blocs ambre détaillés sinon). data-testid : doublons-analyse-btn, doublons-result, doublons-aucun.
- Vérifié en préversion : 0 doublon (5 apprenants seed, 237 factures réelles). Détection testée par insertion/suppression de doublons artificiels (email + n° facture détectés).
- Rappel donné à l'utilisateur : recherche déjà présente partout (barre globale topbar → sessions, champ recherche sur chaque page de liste, recherche factures par n° dossier/facture).

## Fiche apprenant + documents + fusion (v1.8 — 11 juin 2026)
- **Stockage de fichiers persistant** : intégration Emergent Object Storage (`/app/backend/storage.py`, httpx async, init avec EMERGENT_LLM_KEY ajoutée au backend/.env, retry sur 403, préfixe `blade-academy-crm/`). Persiste entre déploiements.
- **Documents apprenants** (collection `apprenant_documents`) : 11 catégories (certificat ExAssess, convocation certification, facture, attestation d'assiduité, relevé de connexion, contrat, émargement présentiel, DPC, convention, suivi des communications, autre). Endpoints : `GET/POST /api/apprenants/{id}/documents` (upload multipart, max 10 Mo, catégorie validée), `GET /api/documents-apprenants/{doc_id}/download` (inline, auth cookie), `DELETE` (soft delete).
- **Fiche apprenant** : nouvelle page `/apprenants/:id` (ApprenantDetail.jsx) — en-tête (avatar initiales, email, tél, badge dossier CPF, compteur docs), sessions suivies (liens), grille des 11 catégories avec upload/téléchargement/suppression par fichier. Lignes des listes CrudPage cliquables via prop `rowHref` (boutons edit/delete avec stopPropagation).
- **Fusion de doublons** : `POST /api/apprenants/fusionner {apprenant_ids}` — conserve la fiche la plus ancienne, hérite des champs manquants (email, tél, dossier_cpf, adresse, date naissance, entreprise), concatène les notes, réaffecte sessions + documents, supprime les doublons. Boutons "Fusionner" (ambre) sur chaque groupe de doublons dans Paramètres > Qualité des données.
- Testé e2e : upload/download/delete réels via Object Storage (contenu vérifié), validation catégorie (400), fusion complète (dossier CPF hérité, 1 session + 1 doc réaffectés, doublon supprimé), UI fiche apprenant + upload via navigateur vérifiés. Données de test nettoyées.

## Endpoints (résumé)
- `POST /api/auth/{register,login,logout}`, `GET /api/auth/me`, `POST /api/auth/emergent/session`
- `GET|POST|PUT|DELETE /api/{apprenants,formateurs,entreprises,financeurs,lieux}[/{id}]`
- `GET|POST|PUT|DELETE /api/sessions[/{id}]`, `PATCH /api/sessions/{id}/{statut,progression}`
- `GET /api/dashboard/{stats,calendar}`
- `GET /api/documents/session/{id}/{type}` → PDF inline
