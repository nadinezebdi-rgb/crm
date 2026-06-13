"""Dossiers stagiaires : workflow Kanban (devis → réglé) avec documents.

Workflow:
- devis_attente → devis_valide → en_formation → fin_formation → facture → regle (archivé)

Un dossier = un parcours stagiaire individuel (1 apprenant + 1 formateur + 1 financeur).
Dès qu'il passe à "regle", il sort du tableau actif et entre dans les dossiers clôturés.
"""
import os
import shutil
import uuid
from pathlib import Path
from typing import List, Optional, Literal
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import deps

router = APIRouter()

# Stockage local des documents de dossier (séparé du stockage objet Emergent)
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads_dossiers"
UPLOAD_DIR.mkdir(exist_ok=True)


StatusLiteral = Literal[
    "devis_attente",
    "devis_valide",
    "en_formation",
    "fin_formation",
    "facture",
    "regle",
]

FinanceurType = Literal["OPCO", "CPF", "Privé"]
DocTypeLiteral = Literal["devis_signe", "attestation", "facture", "justificatif_paiement"]

STATUS_ORDER = ["devis_attente", "devis_valide", "en_formation", "fin_formation", "facture", "regle"]


class DossierCreate(BaseModel):
    """Création d'un dossier via le module Onboarding (création à la volée)."""
    nom: str
    prenom: str
    date_naissance: Optional[str] = None
    adresse: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    formateur_id: Optional[str] = None
    financeur_type: FinanceurType
    financeur_nom: Optional[str] = None  # ex: « Atlas », « EP », nom client privé
    formation: Optional[str] = None
    notes: Optional[str] = None


class DossierUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    date_naissance: Optional[str] = None
    adresse: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    formateur_id: Optional[str] = None
    financeur_type: Optional[FinanceurType] = None
    financeur_nom: Optional[str] = None
    formation: Optional[str] = None
    date_debut_formation: Optional[str] = None
    date_fin_formation: Optional[str] = None
    notes: Optional[str] = None


class StatusUpdate(BaseModel):
    status: StatusLiteral


async def attach_formateur(d: dict) -> dict:
    """Calcule le nom du formateur à partir de formateur_id."""
    fid = d.get("formateur_id")
    if fid:
        f = await deps.db.formateurs.find_one({"id": fid}, {"_id": 0})
        if f:
            d["formateur_nom"] = f"{f.get('prenom', '')} {f.get('nom', '')}".strip()
        else:
            d["formateur_nom"] = None
    else:
        d["formateur_nom"] = None
    return d


@router.post("/dossiers")
async def create_dossier(payload: DossierCreate, user: dict = Depends(deps.get_current_user)):
    """Crée un dossier (Onboarding rapide d'un stagiaire)."""
    doc = payload.model_dump()
    doc["id"] = deps.new_id()
    doc["status"] = "devis_attente"
    doc["date_entree"] = deps.now_utc().isoformat()
    doc["date_cloture"] = None
    doc["date_debut_formation"] = None
    doc["date_fin_formation"] = None
    doc["created_at"] = doc["date_entree"]
    doc["updated_at"] = doc["date_entree"]
    await deps.db.dossiers.insert_one(doc)
    doc.pop("_id", None)
    return await attach_formateur(doc)


@router.get("/dossiers/active")
async def list_active_dossiers(user: dict = Depends(deps.get_current_user)):
    """Liste les dossiers en cours (statut != regle) pour le tableau Kanban."""
    items = await deps.db.dossiers.find(
        {"status": {"$ne": "regle"}}, {"_id": 0}
    ).sort("created_at", -1).to_list(5000)
    for d in items:
        await attach_formateur(d)
    return items


@router.get("/dossiers/closed")
async def list_closed_dossiers(q: Optional[str] = None, user: dict = Depends(deps.get_current_user)):
    """Liste les dossiers clôturés avec recherche par nom/prénom/financeur/formation."""
    query: dict = {"status": "regle"}
    if q:
        regex = {"$regex": q, "$options": "i"}
        query["$or"] = [
            {"nom": regex},
            {"prenom": regex},
            {"financeur_nom": regex},
            {"formation": regex},
        ]
    items = await deps.db.dossiers.find(query, {"_id": 0}).sort("date_cloture", -1).to_list(5000)
    for d in items:
        await attach_formateur(d)
    # Recherche complémentaire sur le nom du formateur
    if q:
        ql = q.lower()
        existing_ids = {d["id"] for d in items}
        all_closed = await deps.db.dossiers.find({"status": "regle"}, {"_id": 0}).to_list(5000)
        for d in all_closed:
            await attach_formateur(d)
            if d.get("formateur_nom") and ql in d["formateur_nom"].lower() and d["id"] not in existing_ids:
                items.append(d)
    return items


@router.get("/dossiers/{dossier_id}")
async def get_dossier(dossier_id: str, user: dict = Depends(deps.get_current_user)):
    d = await deps.db.dossiers.find_one({"id": dossier_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dossier introuvable")
    return await attach_formateur(d)


@router.put("/dossiers/{dossier_id}")
async def update_dossier(dossier_id: str, payload: DossierUpdate, user: dict = Depends(deps.get_current_user)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Aucune donnée à mettre à jour")
    updates["updated_at"] = deps.now_utc().isoformat()
    result = await deps.db.dossiers.update_one({"id": dossier_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(404, "Dossier introuvable")
    d = await deps.db.dossiers.find_one({"id": dossier_id}, {"_id": 0})
    return await attach_formateur(d)


@router.patch("/dossiers/{dossier_id}/status")
async def update_status(dossier_id: str, payload: StatusUpdate, user: dict = Depends(deps.get_current_user)):
    d = await deps.db.dossiers.find_one({"id": dossier_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dossier introuvable")
    new_status = payload.status
    updates = {"status": new_status, "updated_at": deps.now_utc().isoformat()}
    # Auto-renseignement des dates en fonction du statut
    if new_status == "regle" and d.get("status") != "regle":
        updates["date_cloture"] = deps.now_utc().isoformat()
    if new_status == "en_formation" and not d.get("date_debut_formation"):
        updates["date_debut_formation"] = deps.now_utc().isoformat()
    if new_status == "fin_formation" and not d.get("date_fin_formation"):
        updates["date_fin_formation"] = deps.now_utc().isoformat()
    await deps.db.dossiers.update_one({"id": dossier_id}, {"$set": updates})
    d = await deps.db.dossiers.find_one({"id": dossier_id}, {"_id": 0})
    return await attach_formateur(d)


@router.delete("/dossiers/{dossier_id}")
async def delete_dossier(dossier_id: str, user: dict = Depends(deps.get_current_user)):
    # Supprime aussi les documents associés
    docs = await deps.db.dossier_documents.find({"dossier_id": dossier_id}, {"_id": 0}).to_list(500)
    for doc in docs:
        fpath = UPLOAD_DIR / doc.get("filename", "")
        if fpath.exists():
            try:
                fpath.unlink()
            except Exception:
                pass
    await deps.db.dossier_documents.delete_many({"dossier_id": dossier_id})
    result = await deps.db.dossiers.delete_one({"id": dossier_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Dossier introuvable")
    return {"ok": True}


@router.get("/dossiers/{dossier_id}/documents")
async def list_documents(dossier_id: str, user: dict = Depends(deps.get_current_user)):
    items = await deps.db.dossier_documents.find(
        {"dossier_id": dossier_id}, {"_id": 0}
    ).sort("uploaded_at", -1).to_list(500)
    return items


@router.post("/dossiers/{dossier_id}/documents")
async def upload_document(
    dossier_id: str,
    type: DocTypeLiteral = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(deps.get_current_user),
):
    d = await deps.db.dossiers.find_one({"id": dossier_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dossier introuvable")
    doc_id = deps.new_id()
    ext = Path(file.filename or "").suffix or ""
    stored_name = f"{doc_id}{ext}"
    file_path = UPLOAD_DIR / stored_name
    with file_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    size = file_path.stat().st_size
    document = {
        "id": doc_id,
        "dossier_id": dossier_id,
        "type": type,
        "filename": stored_name,
        "original_filename": file.filename or stored_name,
        "content_type": file.content_type or "application/octet-stream",
        "size": size,
        "uploaded_at": deps.now_utc().isoformat(),
    }
    await deps.db.dossier_documents.insert_one(document)
    document.pop("_id", None)
    return document


@router.get("/dossier-documents/{document_id}/download")
async def download_document(document_id: str, user: dict = Depends(deps.get_current_user)):
    d = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Document introuvable")
    file_path = UPLOAD_DIR / d["filename"]
    if not file_path.exists():
        raise HTTPException(404, "Fichier manquant sur le disque")
    return FileResponse(
        path=str(file_path),
        media_type=d.get("content_type", "application/octet-stream"),
        filename=d.get("original_filename", d["filename"]),
    )


@router.delete("/dossier-documents/{document_id}")
async def delete_document(document_id: str, user: dict = Depends(deps.get_current_user)):
    d = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Document introuvable")
    file_path = UPLOAD_DIR / d["filename"]
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception:
            pass
    await deps.db.dossier_documents.delete_one({"id": document_id})
    return {"ok": True}


@router.get("/dossiers-stats")
async def dossiers_stats(user: dict = Depends(deps.get_current_user)):
    by_status = {}
    for s in STATUS_ORDER:
        by_status[s] = await deps.db.dossiers.count_documents({"status": s})
    total = await deps.db.dossiers.count_documents({})
    return {"total": total, "actifs": total - by_status.get("regle", 0), "by_status": by_status}
