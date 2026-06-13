# Blade Academy — CRM

Plateforme de pilotage des formations de Blade Academy (organisme certifié Qualiopi).
Application web : back-end Python / FastAPI / MongoDB, front-end React.

---

## Journal des changements

### Import EDOF (CPF) — fiche apprenant enrichie

Refonte de l'import des dossiers EDOF / Mon Compte Formation pour rattacher la
formation directement à chaque apprenant.

**Fonctionnalités**

- À l'import, la fiche de l'apprenant est renseignée à partir de la ligne d'export :
  intitulé de la formation, date de début et date de fin.
- Détection automatique du niveau CECRL (A1, A2, B1, B2, C1, C2), stocké dans un
  champ `niveau` séparé, uniquement lorsque l'intitulé de la formation contient « anglais ».
- Mise à jour des apprenants existants : un ré-import met à jour la formation, le
  niveau et les dates au lieu de créer un doublon.
- Fin de la création automatique de sessions à l'import : les apprenants entrant
  en formation à des dates individuelles, les informations de formation et de dates
  sont désormais portées par l'apprenant lui-même.
- Bouton « Effacer les imports EDOF » : permet de supprimer les apprenants et les
  sessions issus d'un import EDOF (marqueur `source: "edof"`) afin de repartir d'un
  import propre et de réimporter les données.
- Liste des apprenants : ajout des colonnes Formation, Début et Fin.
- Fiche apprenant : affichage de la formation, du niveau et des dates de formation.

**Détails techniques**

- `backend/import_edof.py` : ajout de `detect_niveau_anglais()` et de la liste `NIVEAUX_CECRL`.
- `backend/models.py` : `ApprenantPayload` reçoit `formation`, `niveau`, `date_debut`, `date_fin`.
- `backend/routes/imports.py` : `edof_commit` renseigne la fiche et met à jour si l'apprenant
  existe ; nouvelle route `DELETE /import/edof/reset` (`edof_reset`).
- `frontend/src/pages/Apprenants.jsx` : bouton d'effacement, colonnes et champs formation/niveau/dates.
- `frontend/src/pages/ApprenantDetail.jsx` : affichage formation, niveau et dates sur la fiche.
- `frontend/src/components/ImportEdofDialog.jsx` : retrait des options de création de sessions.

> Remarque : la détection du niveau s'appuie sur la présence du code CECRL (ex. « Anglais B1 »)
> dans l'intitulé de la formation.
