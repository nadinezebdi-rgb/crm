"""Bibliothèque centrale de documents (factures, devis, etc.)

Stockage unifié dans la collection `dossier_documents` :
- `dossier_id = None` → document libre (en attente de rattachement)
- `dossier_id = "xxx"` → document attaché à un dossier stagiaire

Endpoints :
- GET    /api/library              → liste filtrable (attached, unattached, type, search)
- POST   /api/library/upload       → upload (avec dossier_id optionnel)
- PATCH  /api/library/{id}/attach  → rattacher à un dossier stagiaire
- PATCH  /api/library/{id}/detach  → détacher (retirer le dossier_id)
- DELETE /api/library/{id}         → suppression
- GET    /api/library/{id}/download → téléchargement
"""
import shutil
from pathlib import Path
from typing import Optional, Literal, List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, Body
from fastapi.responses import FileResponse
from pydantic import BaseModel

import deps

router = APIRouter()

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads_dossiers"
UPLOAD_DIR.mkdir(exist_ok=True)

DocTypeLiteral = Literal["devis_signe", "attestation", "facture", "justificatif_paiement", "autre"]

DOC_TYPE_LABEL = {
    "devis_signe": "Devis signé",
    "attestation": "Attestation",
    "facture": "Facture",
    "justificatif_paiement": "Justificatif de paiement",
    "autre": "Autre",
}


class AttachPayload(BaseModel):
    dossier_id: str


async def _enrich_with_stagiaire(docs: List[dict]) -> List[dict]:
    """Ajoute les infos stagiaire (nom, prénom) sur chaque document attaché."""
    dossier_ids = list({d["dossier_id"] for d in docs if d.get("dossier_id")})
    if not dossier_ids:
        return docs
    dossiers = await deps.db.dossiers.find(
        {"id": {"$in": dossier_ids}}, {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "financeur_type": 1}
    ).to_list(2000)
    mapping = {d["id"]: d for d in dossiers}
    for doc in docs:
        did = doc.get("dossier_id")
        if did and did in mapping:
            d = mapping[did]
            doc["stagiaire"] = {
                "id": d["id"],
                "nom": d.get("nom"),
                "prenom": d.get("prenom"),
                "financeur_type": d.get("financeur_type"),
            }
        else:
            doc["stagiaire"] = None
    return docs


@router.get("/library")
async def list_library(
    scope: str = Query("all", regex="^(all|unattached|attached)$"),
    type: Optional[str] = None,
    q: Optional[str] = None,
    user: dict = Depends(deps.get_current_user),
):
    """Liste les documents avec recherche multi-champs :
    - nom de fichier
    - nom / prénom du stagiaire rattaché
    - n° de dossier CPF du stagiaire (financeur_nom)
    - n° de facture (via collection factures_cpf liée par dossier_cpf)
    """
    import re as _re

    base_query: dict = {}
    if scope == "unattached":
        base_query["$or"] = [{"dossier_id": None}, {"dossier_id": {"$exists": False}}]
    elif scope == "attached":
        base_query["dossier_id"] = {"$nin": [None, ""]}
    if type and type in DOC_TYPE_LABEL:
        base_query["type"] = type

    docs = await deps.db.dossier_documents.find(base_query, {"_id": 0}).sort("uploaded_at", -1).to_list(5000)

    if q:
        term = q.strip().lower()
        # Récupère les dossiers stagiaires qui matchent le terme (nom, prénom, financeur_nom)
        dossier_match_ids = set()
        async for d in deps.db.dossiers.find(
            {"$or": [
                {"nom": {"$regex": _re.escape(q), "$options": "i"}},
                {"prenom": {"$regex": _re.escape(q), "$options": "i"}},
                {"financeur_nom": {"$regex": _re.escape(q), "$options": "i"}},
            ]},
            {"_id": 0, "id": 1},
        ):
            dossier_match_ids.add(d["id"])

        # Récupère les n° de dossier CPF depuis les factures_cpf qui matchent le numero_facture
        # Liaison facture → apprenant.dossier_cpf → dossier (financeur_nom)
        cpf_dossier_numbers = set()
        async for f in deps.db.factures_cpf.find(
            {"$or": [
                {"numero_facture": {"$regex": _re.escape(q), "$options": "i"}},
                {"numero_dossier": {"$regex": _re.escape(q), "$options": "i"}},
            ]},
            {"_id": 0, "numero_dossier": 1},
        ):
            if f.get("numero_dossier"):
                cpf_dossier_numbers.add(f["numero_dossier"])

        # Mappe les n° dossier CPF vers les dossiers stagiaires (via financeur_nom)
        if cpf_dossier_numbers:
            async for d in deps.db.dossiers.find(
                {"financeur_nom": {"$in": list(cpf_dossier_numbers)}},
                {"_id": 0, "id": 1},
            ):
                dossier_match_ids.add(d["id"])

        filtered = []
        for doc in docs:
            fname = (doc.get("original_filename") or "").lower()
            did = doc.get("dossier_id")
            if term in fname:
                filtered.append(doc)
            elif did and did in dossier_match_ids:
                filtered.append(doc)
        docs = filtered

    return await _enrich_with_stagiaire(docs)


@router.get("/library-stats")
async def library_stats(user: dict = Depends(deps.get_current_user)):
    total = await deps.db.dossier_documents.count_documents({})
    attached = await deps.db.dossier_documents.count_documents({"dossier_id": {"$nin": [None, ""]}})
    unattached = total - attached
    by_type = {}
    for t in DOC_TYPE_LABEL.keys():
        by_type[t] = await deps.db.dossier_documents.count_documents({"type": t})
    total_size = 0
    async for d in deps.db.dossier_documents.find({}, {"_id": 0, "size": 1}):
        total_size += d.get("size") or 0
    return {
        "total": total,
        "attached": attached,
        "unattached": unattached,
        "by_type": by_type,
        "total_size_bytes": total_size,
    }


@router.post("/library/upload")
async def upload_library(
    file: UploadFile = File(...),
    type: DocTypeLiteral = Form("facture"),
    dossier_id: Optional[str] = Form(None),
    user: dict = Depends(deps.get_current_user),
):
    """Upload un document dans la bibliothèque. dossier_id facultatif pour rattacher direct."""
    # Validation taille (max 25 Mo)
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 25 Mo)")

    if dossier_id:
        existing = await deps.db.dossiers.find_one({"id": dossier_id}, {"_id": 0, "id": 1})
        if not existing:
            raise HTTPException(400, "Dossier stagiaire introuvable")

    doc_id = deps.new_id()
    ext = Path(file.filename or "").suffix or ""
    stored_name = f"{doc_id}{ext}"
    file_path = UPLOAD_DIR / stored_name
    file_path.write_bytes(content)

    document = {
        "id": doc_id,
        "dossier_id": dossier_id,
        "type": type,
        "filename": stored_name,
        "original_filename": file.filename or stored_name,
        "content_type": file.content_type or "application/octet-stream",
        "size": len(content),
        "uploaded_at": deps.now_utc().isoformat(),
    }
    await deps.db.dossier_documents.insert_one(dict(document))
    document.pop("_id", None)
    enriched = await _enrich_with_stagiaire([document])
    return enriched[0]


@router.patch("/library/{document_id}/attach")
async def attach_document(
    document_id: str,
    payload: AttachPayload,
    user: dict = Depends(deps.get_current_user),
):
    """Rattache un document à un dossier stagiaire."""
    doc = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0, "id": 1})
    if not doc:
        raise HTTPException(404, "Document introuvable")
    dossier = await deps.db.dossiers.find_one({"id": payload.dossier_id}, {"_id": 0, "id": 1})
    if not dossier:
        raise HTTPException(400, "Dossier stagiaire introuvable")
    await deps.db.dossier_documents.update_one(
        {"id": document_id}, {"$set": {"dossier_id": payload.dossier_id}}
    )
    updated = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    enriched = await _enrich_with_stagiaire([updated])
    return enriched[0]


@router.patch("/library/{document_id}/detach")
async def detach_document(document_id: str, user: dict = Depends(deps.get_current_user)):
    """Détache un document de son dossier (devient libre)."""
    doc = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0, "id": 1})
    if not doc:
        raise HTTPException(404, "Document introuvable")
    await deps.db.dossier_documents.update_one(
        {"id": document_id}, {"$set": {"dossier_id": None}}
    )
    updated = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    enriched = await _enrich_with_stagiaire([updated])
    return enriched[0]


@router.patch("/library/{document_id}")
async def update_document(
    document_id: str,
    payload: dict = Body(...),
    user: dict = Depends(deps.get_current_user),
):
    """Met à jour le type d'un document."""
    updates = {}
    if "type" in payload and payload["type"] in DOC_TYPE_LABEL:
        updates["type"] = payload["type"]
    if not updates:
        raise HTTPException(400, "Aucune mise à jour valide")
    res = await deps.db.dossier_documents.update_one({"id": document_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Document introuvable")
    updated = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    enriched = await _enrich_with_stagiaire([updated])
    return enriched[0]


@router.delete("/library/{document_id}")
async def delete_library_doc(document_id: str, user: dict = Depends(deps.get_current_user)):
    doc = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable")
    fpath = UPLOAD_DIR / (doc.get("filename") or "")
    if fpath.exists():
        try:
            fpath.unlink()
        except Exception:
            pass
    await deps.db.dossier_documents.delete_one({"id": document_id})
    return {"deleted": 1}


@router.delete("/library/bulk")
async def delete_library_bulk(payload: dict = Body(...), user: dict = Depends(deps.get_current_user)):
    ids = payload.get("ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(400, "Liste 'ids' requise et non vide")
    docs = await deps.db.dossier_documents.find({"id": {"$in": ids}}, {"_id": 0}).to_list(5000)
    for d in docs:
        fpath = UPLOAD_DIR / (d.get("filename") or "")
        if fpath.exists():
            try:
                fpath.unlink()
            except Exception:
                pass
    res = await deps.db.dossier_documents.delete_many({"id": {"$in": ids}})
    return {"deleted": res.deleted_count}


@router.get("/library/{document_id}/download")
async def download_library_doc(document_id: str, user: dict = Depends(deps.get_current_user)):
    doc = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable")
    fpath = UPLOAD_DIR / doc["filename"]
    if not fpath.exists():
        raise HTTPException(404, "Fichier manquant sur le disque")
    return FileResponse(
        path=str(fpath),
        media_type=doc.get("content_type", "application/octet-stream"),
        filename=doc.get("original_filename", doc["filename"]),
    )


@router.get("/library/{document_id}/preview")
async def preview_library_doc(document_id: str, user: dict = Depends(deps.get_current_user)):
    """Renvoie le fichier en mode inline (pour aperçu navigateur, PDF/image)."""
    doc = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable")
    fpath = UPLOAD_DIR / doc["filename"]
    if not fpath.exists():
        raise HTTPException(404, "Fichier manquant sur le disque")
    return FileResponse(
        path=str(fpath),
        media_type=doc.get("content_type", "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{doc.get("original_filename", doc["filename"])}"'},
    )
