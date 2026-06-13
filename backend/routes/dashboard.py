"""Dashboard stats + calendar endpoints."""
from fastapi import APIRouter, Depends

import deps
from routes.sessions import compute_progression

router = APIRouter()


@router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(deps.get_current_user)):
    total_sessions = await deps.db.sessions.count_documents({})
    sessions_actives = await deps.db.sessions.count_documents({"statut": {"$in": ["planification", "planifiee"]}})
    sessions_terminees = await deps.db.sessions.count_documents({"statut": "terminee"})
    total_apprenants = await deps.db.apprenants.count_documents({})
    total_formateurs = await deps.db.formateurs.count_documents({})
    total_entreprises = await deps.db.entreprises.count_documents({})

    # Compute CA : encaissements CPF réels (factures EDOF) + sessions hors CPF
    factures = await deps.db.factures_cpf.find({}, {"_id": 0, "montant": 1, "statut_reglement": 1}).to_list(20000)
    ca_cpf = sum(f.get("montant", 0) for f in factures if str(f.get("statut_reglement", "")).lower().startswith("vers"))
    match = {"statut": {"$in": ["planifiee", "terminee"]}}
    if ca_cpf > 0:
        cpf_financeur = await deps.db.financeurs.find_one({"type_financeur": "cpf"}, {"_id": 0, "id": 1})
        if cpf_financeur:
            match["financeur_id"] = {"$ne": cpf_financeur["id"]}
    pipeline = [
        {"$match": match},
        {"$group": {"_id": None, "ca": {"$sum": "$prix_ht"}, "cout": {"$sum": "$cout_ht"}}},
    ]
    agg = await deps.db.sessions.aggregate(pipeline).to_list(1)
    ca_sessions = float(agg[0]["ca"]) if agg else 0.0
    cout = float(agg[0]["cout"]) if agg else 0.0
    ca = ca_sessions + ca_cpf

    by_status = {}
    for s in ("brouillon", "planification", "planifiee", "terminee", "archivee"):
        by_status[s] = await deps.db.sessions.count_documents({"statut": s})

    sessions = await deps.db.sessions.find({"statut": {"$ne": "archivee"}}, {"_id": 0}).to_list(2000)
    avg_progression = 0
    if sessions:
        progs = [compute_progression(s)["percent"] for s in sessions]
        avg_progression = int(sum(progs) / len(progs))

    return {
        "total_sessions": total_sessions,
        "sessions_actives": sessions_actives,
        "sessions_terminees": sessions_terminees,
        "total_apprenants": total_apprenants,
        "total_formateurs": total_formateurs,
        "total_entreprises": total_entreprises,
        "ca": ca,
        "ca_cpf": ca_cpf,
        "marge": ca_sessions - cout,
        "taux_marge": round((ca_sessions - cout) / ca_sessions * 100, 1) if ca_sessions > 0 else 0.0,
        "by_status": by_status,
        "avg_progression": avg_progression,
    }


@router.get("/dashboard/calendar")
async def calendar(user: dict = Depends(deps.get_current_user)):
    sessions = await deps.db.sessions.find(
        {"statut": {"$in": ["planification", "planifiee", "terminee"]}, "date_debut": {"$ne": None}},
        {"_id": 0, "id": 1, "nom": 1, "code_interne": 1, "date_debut": 1, "date_fin": 1, "statut": 1, "distanciel": 1},
    ).to_list(500)
    return sessions
