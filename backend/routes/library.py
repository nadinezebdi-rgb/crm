"""Bibliothèque centrale de documents (factures, devis, etc.)

Stockage : Emergent Object Storage (persistant entre les déploiements).
"""
import logging
from pathlib import Path
from typing import Optional, Literal, List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, Body
from fastapi.responses import Response
from pydantic import BaseModel

import deps
from storage import APP_PREFIX, put_object, get_object

logger = logging.getLogger("crm.library")
router = APIRouter()

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


async def _fetch_bytes(doc: dict) -> tuple:
    """Récupère les bytes + content_type d'un document depuis le stockage objet."""
    path = doc.get("storage_path")
    if not path:
        raise HTTPException(404, "Fichier introuvable (storage_path manquant — document antérieur à la migration objet)")
    try:
        data, ctype = await get_object(path)
    except Exception:
        logger.exception("Échec de lecture du stockage objet")
        raise HTTPException(502, "Stockage indisponible, réessayez dans un instant")
    return data, ctype or doc.get("content_type", "application/octet-stream")


async def _enrich_with_stagiaire(docs: List[dict]) -> List[dict]:
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
            doc["stagiaire"] = {"id": d["id"], "nom": d.get("nom"), "prenom": d.get("prenom"), "financeur_type": d.get("financeur_type")}
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
            if term in fname or (did and did in dossier_match_ids):
                filtered.append(doc)
        docs = filtered
    return await _enrich_with_stagiaire(docs)


@router.get("/library-stats")
async def library_stats(user: dict = Depends(deps.get_current_user)):
    total = await deps.db.dossier_documents.count_documents({})
    attached = await deps.db.dossier_documents.count_documents({"dossier_id": {"$nin": [None, ""]}})
    by_type = {}
    for t in DOC_TYPE_LABEL.keys():
        by_type[t] = await deps.db.dossier_documents.count_documents({"type": t})
    total_size = 0
    async for d in deps.db.dossier_documents.find({}, {"_id": 0, "size": 1}):
        total_size += d.get("size") or 0
    return {"total": total, "attached": attached, "unattached": total - attached, "by_type": by_type, "total_size_bytes": total_size}


@router.post("/library/upload")
async def upload_library(
    file: UploadFile = File(...),
    type: DocTypeLiteral = Form("facture"),
    dossier_id: Optional[str] = Form(None),
    user: dict = Depends(deps.get_current_user),
):
    content = await file.read()
    if not content:
        raise HTTPException(400, "Fichier vide")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 25 Mo)")
    if dossier_id:
        if not await deps.db.dossiers.find_one({"id": dossier_id}, {"_id": 0, "id": 1}):
            raise HTTPException(400, "Dossier stagiaire introuvable")
    doc_id = deps.new_id()
    ext = Path(file.filename or "").suffix.lstrip(".") or "bin"
    path = f"{APP_PREFIX}/library/{doc_id}.{ext}"
    try:
        result = await put_object(path, content, file.content_type or "application/octet-stream")
    except Exception:
        logger.exception("Échec d'upload vers le stockage objet")
        raise HTTPException(502, "Stockage indisponible, réessayez dans un instant")
    document = {
        "id": doc_id,
        "dossier_id": dossier_id,
        "type": type,
        "filename": path.split("/")[-1],  # back-compat affichage
        "original_filename": file.filename or path.split("/")[-1],
        "content_type": file.content_type or "application/octet-stream",
        "size": result.get("size", len(content)),
        "storage_path": result.get("path", path),
        "uploaded_at": deps.now_utc().isoformat(),
    }
    await deps.db.dossier_documents.insert_one(dict(document))
    document.pop("_id", None)
    enriched = await _enrich_with_stagiaire([document])
    return enriched[0]


@router.patch("/library/{document_id}/attach")
async def attach_document(document_id: str, payload: AttachPayload, user: dict = Depends(deps.get_current_user)):
    if not await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Document introuvable")
    if not await deps.db.dossiers.find_one({"id": payload.dossier_id}, {"_id": 0, "id": 1}):
        raise HTTPException(400, "Dossier stagiaire introuvable")
    await deps.db.dossier_documents.update_one({"id": document_id}, {"$set": {"dossier_id": payload.dossier_id}})
    updated = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    enriched = await _enrich_with_stagiaire([updated])
    return enriched[0]


@router.patch("/library/{document_id}/detach")
async def detach_document(document_id: str, user: dict = Depends(deps.get_current_user)):
    if not await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Document introuvable")
    await deps.db.dossier_documents.update_one({"id": document_id}, {"$set": {"dossier_id": None}})
    updated = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    enriched = await _enrich_with_stagiaire([updated])
    return enriched[0]


@router.patch("/library/{document_id}")
async def update_document(document_id: str, payload: dict = Body(...), user: dict = Depends(deps.get_current_user)):
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


@router.delete("/library/bulk")
async def delete_library_bulk(payload: dict = Body(...), user: dict = Depends(deps.get_current_user)):
    ids = payload.get("ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(400, "Liste 'ids' requise et non vide")
    res = await deps.db.dossier_documents.delete_many({"id": {"$in": ids}})
    return {"deleted": res.deleted_count}


@router.delete("/library/{document_id}")
async def delete_library_doc(document_id: str, user: dict = Depends(deps.get_current_user)):
    doc = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable")
    await deps.db.dossier_documents.delete_one({"id": document_id})
    return {"deleted": 1}


@router.get("/library/{document_id}/download")
async def download_library_doc(document_id: str, user: dict = Depends(deps.get_current_user)):
    doc = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable")
    data, ctype = await _fetch_bytes(doc)
    filename = doc.get("original_filename", doc.get("filename", "document"))
    return Response(
        content=data,
        media_type=ctype,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(data)),
            "Cache-Control": "no-store",
        },
    )


@router.get("/library/{document_id}/preview")
async def preview_library_doc(document_id: str, user: dict = Depends(deps.get_current_user)):
    doc = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable")
    data, ctype = await _fetch_bytes(doc)
    filename = doc.get("original_filename", doc.get("filename", "document"))
    return Response(
        content=data,
        media_type=ctype,
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Content-Length": str(len(data)),
            "Cache-Control": "no-store",
        },
    )


@router.get("/library/{document_id}/preview-html")
async def preview_library_html(document_id: str, user: dict = Depends(deps.get_current_user)):
    """Aperçu HTML pour les Excel/CSV (rendu inline du contenu)."""
    import csv as _csv
    import io as _io
    from html import escape as _esc

    doc = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable")
    data, _ctype = await _fetch_bytes(doc)

    ext = (doc.get("original_filename") or doc.get("filename") or "").lower().split(".")[-1]
    sheets_html = []
    MAX_ROWS, MAX_COLS = 500, 40

    try:
        if ext in ("xlsx", "xlsm", "xls"):
            from openpyxl import load_workbook
            wb = load_workbook(filename=_io.BytesIO(data), data_only=True, read_only=True)
            for ws in wb.worksheets:
                rows_html = []
                first = True
                count = 0
                for row in ws.iter_rows(values_only=True):
                    if count >= MAX_ROWS:
                        rows_html.append(f'<tr><td colspan="{MAX_COLS}" class="trunc">… ({MAX_ROWS} lignes affichées sur plus)</td></tr>')
                        break
                    cells = list(row)[:MAX_COLS]
                    if first:
                        rows_html.append("<thead><tr>" + "".join(f"<th>{_esc(str(c) if c is not None else '')}</th>" for c in cells) + "</tr></thead><tbody>")
                        first = False
                    else:
                        rows_html.append("<tr>" + "".join(f"<td>{_esc(str(c) if c is not None else '')}</td>" for c in cells) + "</tr>")
                    count += 1
                if rows_html:
                    rows_html.append("</tbody>")
                else:
                    rows_html.append('<tbody><tr><td class="empty">Feuille vide</td></tr></tbody>')
                sheets_html.append({"name": ws.title, "html": '<table class="xls-table">' + "".join(rows_html) + "</table>"})
            wb.close()
        elif ext == "csv":
            try:
                text = data.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = data.decode("latin-1", errors="ignore")
            sample = text[:4096]
            delim = ";" if sample.count(";") > sample.count(",") else ","
            reader = _csv.reader(text.splitlines(), delimiter=delim)
            rows_html = []
            for i, row in enumerate(reader):
                if i >= MAX_ROWS:
                    rows_html.append(f'<tr><td colspan="{MAX_COLS}" class="trunc">… ({MAX_ROWS} lignes affichées sur plus)</td></tr>')
                    break
                cells = row[:MAX_COLS]
                if i == 0:
                    rows_html.append("<thead><tr>" + "".join(f"<th>{_esc(c)}</th>" for c in cells) + "</tr></thead><tbody>")
                else:
                    rows_html.append("<tr>" + "".join(f"<td>{_esc(c)}</td>" for c in cells) + "</tr>")
            rows_html.append("</tbody>")
            sheets_html.append({"name": "CSV", "html": '<table class="xls-table">' + "".join(rows_html) + "</table>"})
        else:
            raise HTTPException(400, f"Aperçu HTML non disponible pour ce format ({ext})")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Erreur de lecture du fichier : {exc}")

    return {"filename": doc.get("original_filename"), "sheets": sheets_html, "total_sheets": len(sheets_html)}
