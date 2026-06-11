"""Paramètres organisme (infos légales) + purge des données de démonstration."""
from fastapi import APIRouter, Depends

from deps import db, now_utc, get_current_user
from models import OrganismeSettings, DEFAULT_ORGANISME

router = APIRouter()


async def get_organisme() -> dict:
    doc = await db.organisme_settings.find_one({"key": "organisme"}, {"_id": 0, "key": 0})
    return doc or dict(DEFAULT_ORGANISME)


@router.get("/parametres/organisme")
async def read_organisme(user: dict = Depends(get_current_user)):
    return await get_organisme()


@router.put("/parametres/organisme")
async def update_organisme(payload: OrganismeSettings, user: dict = Depends(get_current_user)):
    await db.organisme_settings.update_one(
        {"key": "organisme"}, {"$set": payload.model_dump()}, upsert=True
    )


DEMO_SESSION_CODES = ["SES-2026-AGILE-01", "SES-2026-CYBER-02", "SES-2026-BILAN-03", "SES-2026-MGT-04"]
DEMO_APPRENANT_EMAILS = ["j.petit@acme.fr", "e.rousseau@acme.fr", "l.bertrand@solaris.fr", "m.faure@solaris.fr", "h.robin@nordique.fr"]
DEMO_FORMATEUR_EMAILS = ["c.lefebvre@blade-academy.fr", "a.moreau@externe.fr", "i.garcia@blade-academy.fr"]
DEMO_ENTREPRISE_SIRETS = ["12345678900012", "98765432100018", "45678912300026"]
DEMO_FINANCEUR_NOMS = ["OPCO Atlas", "OPCO EP"]
DEMO_LIEU_NOMS = ["Centre Blade Academy Paris", "Espace Lyon Confluence", "Distanciel - Zoom"]


@router.post("/parametres/purge-demo")
async def purge_demo(user: dict = Depends(get_current_user)):
    """Supprime les données de démonstration insérées au premier démarrage."""
    res = {
        "sessions": (await db.sessions.delete_many({"code_interne": {"$in": DEMO_SESSION_CODES}})).deleted_count,
        "apprenants": (await db.apprenants.delete_many({"email": {"$in": DEMO_APPRENANT_EMAILS}})).deleted_count,
        "formateurs": (await db.formateurs.delete_many({"email": {"$in": DEMO_FORMATEUR_EMAILS}})).deleted_count,
        "entreprises": (await db.entreprises.delete_many({"siret": {"$in": DEMO_ENTREPRISE_SIRETS}})).deleted_count,
        "financeurs": (await db.financeurs.delete_many({"nom": {"$in": DEMO_FINANCEUR_NOMS}})).deleted_count,
        "lieux": (await db.lieux.delete_many({"nom": {"$in": DEMO_LIEU_NOMS}})).deleted_count,
    }
    await db.meta.update_one({"key": "demo_purged"}, {"$set": {"key": "demo_purged", "at": now_utc().isoformat()}}, upsert=True)
    return res
