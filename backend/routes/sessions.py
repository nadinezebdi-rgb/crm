"""Sessions endpoints: list with filters, CRUD, status & progression transitions."""
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends

import deps
from models import SessionPayload

router = APIRouter()


def compute_progression(session: dict) -> dict:
    """Compute the Qualiopi-style checklist progression."""
    checks = {
        "dates_creneaux": bool(session.get("date_debut") and session.get("date_fin")),
        "contrats_conventions": bool(session.get("entreprise_id") or session.get("financeur_id")),
        "parametres": bool(session.get("programme") and session.get("administrateurs")),
        "emargements": bool(session.get("apprenants") and session.get("formateurs")),
        "convocations": session.get("convocations_envoyees", False),
        "evaluations": session.get("evaluations_envoyees", False),
        "factures": session.get("factures_emises", False),
        "attestations": session.get("attestations_emises", False),
    }
    done = sum(1 for v in checks.values() if v)
    total = len(checks)
    return {"checks": checks, "done": done, "total": total, "percent": int(done * 100 / total) if total else 0}


def with_progression(s: dict) -> dict:
    s["progression"] = compute_progression(s)
    revenue = float(s.get("prix_ht", 0) or 0)
    cost = float(s.get("cout_ht", 0) or 0)
    s["ca"] = revenue
    s["marge"] = revenue - cost
    s["taux_marge"] = round((revenue - cost) / revenue * 100, 1) if revenue > 0 else 0.0
    return s


@router.get("/sessions")
async def list_sessions(
    statut: Optional[str] = None,
    type_action: Optional[str] = None,
    administrateur: Optional[str] = None,
    formateur: Optional[str] = None,
    q: Optional[str] = None,
    user: dict = Depends(deps.get_current_user),
):
    query = {}
    if statut:
        query["statut"] = statut
    if type_action:
        query["type_action"] = type_action
    if administrateur:
        query["administrateurs"] = administrateur
    if formateur:
        query["formateurs"] = formateur
    if q:
        query["$or"] = [
            {"nom": {"$regex": q, "$options": "i"}},
            {"code_interne": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    items = await deps.db.sessions.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [with_progression(s) for s in items]


@router.post("/sessions")
async def create_session(payload: SessionPayload, user: dict = Depends(deps.get_current_user)):
    doc = payload.model_dump()
    doc["id"] = deps.new_id()
    doc["code_interne"] = doc.get("code_interne") or f"SES-{deps.now_utc().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    doc["created_at"] = deps.now_utc().isoformat()
    doc["updated_at"] = doc["created_at"]
    doc["convocations_envoyees"] = False
    doc["evaluations_envoyees"] = False
    doc["factures_emises"] = False
    doc["attestations_emises"] = False
    await deps.db.sessions.insert_one(doc)
    doc.pop("_id", None)
    return with_progression(doc)


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(deps.get_current_user)):
    doc = await deps.db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return with_progression(doc)


@router.put("/sessions/{session_id}")
async def update_session(session_id: str, payload: SessionPayload, user: dict = Depends(deps.get_current_user)):
    doc = payload.model_dump()
    doc["updated_at"] = deps.now_utc().isoformat()
    result = await deps.db.sessions.update_one({"id": session_id}, {"$set": doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session introuvable")
    updated = await deps.db.sessions.find_one({"id": session_id}, {"_id": 0})
    return with_progression(updated)


@router.patch("/sessions/{session_id}/statut")
async def update_session_status(session_id: str, body: dict, user: dict = Depends(deps.get_current_user)):
    statut = body.get("statut")
    if statut not in ("brouillon", "planification", "planifiee", "terminee", "archivee"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    result = await deps.db.sessions.update_one({"id": session_id}, {"$set": {"statut": statut, "updated_at": deps.now_utc().isoformat()}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session introuvable")
    updated = await deps.db.sessions.find_one({"id": session_id}, {"_id": 0})
    return with_progression(updated)


@router.patch("/sessions/{session_id}/progression")
async def update_session_progression(session_id: str, body: dict, user: dict = Depends(deps.get_current_user)):
    """Mark a progression flag (convocations_envoyees, evaluations_envoyees, factures_emises, attestations_emises)."""
    allowed = {"convocations_envoyees", "evaluations_envoyees", "factures_emises", "attestations_emises"}
    updates = {k: bool(v) for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="Aucun champ valide")
    updates["updated_at"] = deps.now_utc().isoformat()
    await deps.db.sessions.update_one({"id": session_id}, {"$set": updates})
    updated = await deps.db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return with_progression(updated)


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(deps.get_current_user)):
    result = await deps.db.sessions.delete_one({"id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return {"ok": True}
