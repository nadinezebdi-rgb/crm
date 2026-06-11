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

## Endpoints (résumé)
- `POST /api/auth/{register,login,logout}`, `GET /api/auth/me`, `POST /api/auth/emergent/session`
- `GET|POST|PUT|DELETE /api/{apprenants,formateurs,entreprises,financeurs,lieux}[/{id}]`
- `GET|POST|PUT|DELETE /api/sessions[/{id}]`, `PATCH /api/sessions/{id}/{statut,progression}`
- `GET /api/dashboard/{stats,calendar}`
- `GET /api/documents/session/{id}/{type}` → PDF inline
