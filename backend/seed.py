"""Seed data: rebranding migration + admin user + demo entities (idempotent)."""
import os

from deps import db, now_utc, new_id, hash_password, verify_password
from models import DEFAULT_ORGANISME


async def seed():
    # --- Migration idempotente de rebranding (FormaPro -> Blade Academy) ---
    old_admin = await db.users.find_one({"email": "admin@formapro.fr"})
    if old_admin and not await db.users.find_one({"email": "admin@blade-academy.fr"}):
        await db.users.update_one(
            {"email": "admin@formapro.fr"},
            {"$set": {"email": "admin@blade-academy.fr", "name": "Admin Blade Academy"}},
        )
    await db.users.update_many(
        {"organisme": {"$in": ["FormaPro", "FormaPro Académie"]}},
        {"$set": {"organisme": "Blade Academy"}},
    )
    await db.lieux.update_many({"nom": "Centre FormaPro Paris"}, {"$set": {"nom": "Centre Blade Academy Paris"}})
    async for f in db.formateurs.find({"email": {"$regex": "@formapro\\.fr$"}}):
        await db.formateurs.update_one(
            {"id": f["id"]},
            {"$set": {"email": f["email"].replace("@formapro.fr", "@blade-academy.fr")}},
        )

    # Infos légales de l'organisme
    if not await db.organisme_settings.find_one({"key": "organisme"}):
        await db.organisme_settings.insert_one({"key": "organisme", **DEFAULT_ORGANISME})

    # Admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@blade-academy.fr")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "user_id": new_id("usr_"),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": os.environ.get("ADMIN_NAME", "Admin"),
            "role": "admin",
            "auth_provider": "local",
            "organisme": os.environ.get("ORG_NAME", "Blade Academy"),
            "created_at": now_utc().isoformat(),
        })
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    # Si l'utilisateur a purgé la démo, on ne ré-insère jamais
    if await db.meta.find_one({"key": "demo_purged"}):
        return

    if await db.entreprises.count_documents({}) == 0:
        await db.entreprises.insert_many([
            {"id": new_id(), "raison_sociale": "Acme Industries", "siret": "12345678900012", "ville": "Paris", "email": "contact@acme.fr", "contact_nom": "Sophie Bernard", "created_at": now_utc().isoformat()},
            {"id": new_id(), "raison_sociale": "Solaris Tech", "siret": "98765432100018", "ville": "Lyon", "email": "rh@solaris.fr", "contact_nom": "Marc Dubois", "created_at": now_utc().isoformat()},
            {"id": new_id(), "raison_sociale": "Nordique Conseil", "siret": "45678912300026", "ville": "Lille", "email": "contact@nordique.fr", "contact_nom": "Léa Martin", "created_at": now_utc().isoformat()},
        ])

    if await db.formateurs.count_documents({}) == 0:
        await db.formateurs.insert_many([
            {"id": new_id(), "nom": "Lefebvre", "prenom": "Camille", "email": "c.lefebvre@blade-academy.fr", "interne": True, "specialites": ["Gestion de projet", "Agile"], "tarif_journalier": 850, "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Moreau", "prenom": "Antoine", "email": "a.moreau@externe.fr", "interne": False, "specialites": ["Cybersécurité"], "tarif_journalier": 1200, "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Garcia", "prenom": "Inès", "email": "i.garcia@blade-academy.fr", "interne": True, "specialites": ["Communication", "Management"], "tarif_journalier": 950, "created_at": now_utc().isoformat()},
        ])

    if await db.apprenants.count_documents({}) == 0:
        await db.apprenants.insert_many([
            {"id": new_id(), "nom": "Petit", "prenom": "Julien", "email": "j.petit@acme.fr", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Rousseau", "prenom": "Émilie", "email": "e.rousseau@acme.fr", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Bertrand", "prenom": "Lucas", "email": "l.bertrand@solaris.fr", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Faure", "prenom": "Manon", "email": "m.faure@solaris.fr", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Robin", "prenom": "Hugo", "email": "h.robin@nordique.fr", "created_at": now_utc().isoformat()},
        ])

    if await db.financeurs.count_documents({}) == 0:
        await db.financeurs.insert_many([
            {"id": new_id(), "nom": "OPCO Atlas", "type_financeur": "opco", "code": "ATLAS", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "OPCO EP", "type_financeur": "opco", "code": "EP", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "CPF Direct", "type_financeur": "cpf", "code": "CPF", "created_at": now_utc().isoformat()},
        ])

    if await db.lieux.count_documents({}) == 0:
        await db.lieux.insert_many([
            {"id": new_id(), "nom": "Centre Blade Academy Paris", "adresse": "12 rue de la République", "code_postal": "75011", "ville": "Paris", "capacite": 20, "distanciel": False, "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Espace Lyon Confluence", "adresse": "5 cours Charlemagne", "code_postal": "69002", "ville": "Lyon", "capacite": 15, "distanciel": False, "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Distanciel - Zoom", "capacite": 100, "distanciel": True, "created_at": now_utc().isoformat()},
        ])

    if await db.sessions.count_documents({}) == 0:
        admin_user = await db.users.find_one({"email": admin_email}, {"_id": 0})
        admin_id = admin_user["user_id"] if admin_user else ""
        formateurs = await db.formateurs.find({}, {"_id": 0}).to_list(10)
        apprenants = await db.apprenants.find({}, {"_id": 0}).to_list(10)
        entreprises = await db.entreprises.find({}, {"_id": 0}).to_list(10)
        lieux = await db.lieux.find({}, {"_id": 0}).to_list(10)

        demo_sessions = [
            {
                "id": new_id(), "nom": "Initiation Scrum Master", "code_interne": "SES-2026-AGILE-01",
                "type_session": "formation_professionnelle", "type_action": "formation",
                "statut": "planifiee", "formation_interne": False, "sous_traitance": False, "retire_catalogue": False,
                "fuseau_horaire": "Europe/Paris", "date_debut": "2026-03-10", "date_fin": "2026-03-12",
                "lieu_id": lieux[0]["id"] if lieux else None, "distanciel": False,
                "administrateurs": [admin_id], "formateurs": [formateurs[0]["id"]] if formateurs else [],
                "apprenants": [a["id"] for a in apprenants[:3]],
                "entreprise_id": entreprises[0]["id"] if entreprises else None,
                "programme": "Scrum & Agile", "categorie": "Management", "niveau": "Débutant",
                "prix_ht": 4500.0, "cout_ht": 2400.0, "inclus_bpf": True,
                "description": "Formation Scrum Master sur 3 jours pour équipes produit.",
                "convocations_envoyees": True, "evaluations_envoyees": False,
                "factures_emises": True, "attestations_emises": False,
                "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
            },
            {
                "id": new_id(), "nom": "Cybersécurité — Fondamentaux", "code_interne": "SES-2026-CYBER-02",
                "type_session": "formation_professionnelle", "type_action": "formation",
                "statut": "planification", "formation_interne": False, "sous_traitance": False, "retire_catalogue": False,
                "fuseau_horaire": "Europe/Paris", "date_debut": "2026-04-05", "date_fin": "2026-04-07",
                "lieu_id": lieux[2]["id"] if len(lieux) > 2 else None, "distanciel": True,
                "administrateurs": [admin_id], "formateurs": [formateurs[1]["id"]] if len(formateurs) > 1 else [],
                "apprenants": [a["id"] for a in apprenants[2:5]],
                "entreprise_id": entreprises[1]["id"] if len(entreprises) > 1 else None,
                "programme": "Cyber 101", "categorie": "Sécurité", "niveau": "Intermédiaire",
                "prix_ht": 6800.0, "cout_ht": 4100.0, "inclus_bpf": True,
                "description": "Formation distancielle sur les fondamentaux de la cybersécurité.",
                "convocations_envoyees": False, "evaluations_envoyees": False,
                "factures_emises": False, "attestations_emises": False,
                "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
            },
            {
                "id": new_id(), "nom": "Bilan de Compétences", "code_interne": "SES-2026-BILAN-03",
                "type_session": "conseil", "type_action": "bilan_competences",
                "statut": "terminee", "formation_interne": False, "sous_traitance": False, "retire_catalogue": False,
                "fuseau_horaire": "Europe/Paris", "date_debut": "2026-01-15", "date_fin": "2026-02-28",
                "lieu_id": lieux[1]["id"] if len(lieux) > 1 else None, "distanciel": False,
                "administrateurs": [admin_id], "formateurs": [formateurs[2]["id"]] if len(formateurs) > 2 else [],
                "apprenants": [apprenants[4]["id"]] if len(apprenants) > 4 else [],
                "entreprise_id": entreprises[2]["id"] if len(entreprises) > 2 else None,
                "programme": "Bilan 24h", "categorie": "Conseil RH", "niveau": "Tous niveaux",
                "prix_ht": 2400.0, "cout_ht": 1200.0, "inclus_bpf": True,
                "description": "Accompagnement individuel sur 24h réparties sur 6 semaines.",
                "convocations_envoyees": True, "evaluations_envoyees": True,
                "factures_emises": True, "attestations_emises": True,
                "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
            },
            {
                "id": new_id(), "nom": "Brouillon — Management 360°", "code_interne": "SES-2026-MGT-04",
                "type_session": "formation_professionnelle", "type_action": "formation",
                "statut": "brouillon", "formation_interne": True, "sous_traitance": False, "retire_catalogue": True,
                "fuseau_horaire": "Europe/Paris", "date_debut": None, "date_fin": None,
                "lieu_id": None, "distanciel": False,
                "administrateurs": [admin_id], "formateurs": [], "apprenants": [],
                "entreprise_id": None, "programme": "Management avancé", "categorie": "Management", "niveau": "Avancé",
                "prix_ht": 0.0, "cout_ht": 0.0, "inclus_bpf": False,
                "description": "À planifier - parcours Management 360° pour cadres dirigeants.",
                "convocations_envoyees": False, "evaluations_envoyees": False,
                "factures_emises": False, "attestations_emises": False,
                "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
            },
        ]
        await db.sessions.insert_many(demo_sessions)
