# CRM Formation — PRD

## Problème initial
Construire un CRM pour la gestion individualisée de stagiaires en formation, avec:
- Sidebar à 2 zones (Espace Actif / Espace Historique)
- Tableau de bord Kanban à 5 colonnes (Devis en attente → Devis validé → En action de formation → Fin d'action de formation → Facturé)
- Cartes avec badge couleur financeur (🔵 OPCO / 🟢 CPF / 🟡 Privé), nom du formateur, date d'entrée
- Module Onboarding rapide
- Dossiers Clôturés avec barre de recherche ultra-rapide (par nom, OPCO, formateur) + documents (devis signé, attestation, facture, justificatif de paiement)
- Auto-archivage dès statut "Réglé"

## Choix utilisateur
- Aucune authentification
- Upload réel de fichiers (stockage local /app/backend/uploads)
- CRUD complet des formateurs
- Démarrer vide (aucune donnée seed)
- Design moderne et professionnel

## Architecture
- **Backend** : FastAPI + MongoDB (Motor) + UUID IDs. Routes dans /app/backend/server.py.
- **Frontend** : React 19 + react-router-dom + Tailwind + lucide-react + sonner.
- **Stockage docs** : Fichiers sur disque dans /app/backend/uploads/, métadonnées en Mongo.
- **Design** : Swiss & High-Contrast (Manrope headings + IBM Plex Sans body), palette slate + accents bleu/vert/ambre pour financeurs.

## Routes API
- `GET/POST/PUT/DELETE /api/formateurs[/{id}]`
- `GET/POST/PUT/DELETE /api/stagiaires[/{id}]`
- `GET /api/stagiaires/active` — Kanban (statut ≠ regle)
- `GET /api/stagiaires/closed?q=…` — Archives (statut = regle)
- `PATCH /api/stagiaires/{id}/status` — Workflow Kanban + auto-archivage
- `POST /api/stagiaires/{id}/documents` (multipart) — Upload
- `GET /api/documents/{id}/download` — Download
- `DELETE /api/documents/{id}` — Suppression doc
- `GET /api/stats` — Compteurs dashboard

## Implémenté (13 Jan 2026)
- ✅ Backend complet : Formateurs CRUD, Stagiaires CRUD, workflow statut, archivage auto, upload/download/delete documents
- ✅ Frontend : 5 pages (Dashboard Kanban, Onboarding, Actions de Formation, Formateurs, Dossiers Clôturés)
- ✅ Sidebar 3 zones (Actif / Administration / Historique)
- ✅ Drag & drop Kanban + boutons "Avancer" / "Marquer comme réglé"
- ✅ Panel détail stagiaire (édition inline + upload des 4 types de documents)
- ✅ Recherche ultra-rapide dossiers clôturés (nom, prénom, OPCO, formateur, formation)
- ✅ Tests backend pytest 12/12 + tests frontend E2E 8/8

## Backlog
- P1 : Authentification (JWT ou Emergent Google) si déploiement multi-utilisateur
- P2 : Export CSV/Excel des dossiers clôturés
- P2 : Stats avancées (CA par financeur, durée moyenne par étape)
- P2 : Relances automatiques par email pour devis en attente
- P3 : Pièces jointes par drag-and-drop sur les cartes Kanban
- P3 : Mode dark
