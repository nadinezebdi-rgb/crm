"""Documents : génération PDF, classement dans les fiches, documents apprenants, fusion, qualité."""
import io
import uuid
import logging
from typing import Dict
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response
from fastapi.responses import StreamingResponse

from deps import db, now_utc, new_id, get_current_user
from models import (
    FusionPayload,
    CATEGORIES_DOCUMENTS_APPRENANT,
    DOC_TYPE_TO_CATEGORIE,
)
from documents import build_pdf, DOC_BUILDERS
from storage import APP_PREFIX, put_object, get_object
from routes.parametres import get_organisme

logger = logging.getLogger("blade_academy")
router = APIRouter()


# ---------------- Documents apprenants ----------------
@router.get("/apprenants/{apprenant_id}/documents")
async def list_documents_apprenant(apprenant_id: str, user: dict = Depends(get_current_user)):
    return await db.apprenant_documents.find(
        {"apprenant_id": apprenant_id, "is_deleted": False}, {"_id": 0}
    ).sort("uploaded_at", -1).to_list(500)


@router.post("/apprenants/{apprenant_id}/documents")
async def upload_document_apprenant(
    apprenant_id: str,
    categorie: str = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if categorie not in CATEGORIES_DOCUMENTS_APPRENANT:
        raise HTTPException(status_code=400, detail="Catégorie de document invalide")
    if not await db.apprenants.find_one({"id": apprenant_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Apprenant introuvable")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 10 Mo)")
    if not data:
        raise HTTPException(status_code=400, detail="Fichier vide")
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    path = f"{APP_PREFIX}/apprenants/{apprenant_id}/{uuid.uuid4().hex}.{ext}"
    try:
        result = await put_object(path, data, file.content_type or "application/octet-stream")
    except Exception:
        logger.exception("Échec de l'envoi vers le stockage d'objets")
        raise HTTPException(status_code=502, detail="Stockage indisponible, réessayez dans un instant")
    doc = {
        "id": new_id(),
        "apprenant_id": apprenant_id,
        "categorie": categorie,
        "nom_fichier": file.filename or "document",
        "content_type": file.content_type or "application/octet-stream",
        "taille": result.get("size", len(data)),
        "storage_path": result["path"],
        "is_deleted": False,
        "uploaded_at": now_utc().isoformat(),
    }
    await db.apprenant_documents.insert_one(dict(doc))
    return doc


@router.get("/documents-apprenants/{doc_id}/download")
async def download_document_apprenant(doc_id: str, user: dict = Depends(get_current_user)):
    doc = await db.apprenant_documents.find_one({"id": doc_id, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    try:
        data, content_type = await get_object(doc["storage_path"])
    except Exception:
        logger.exception("Échec de la lecture du stockage d'objets")
        raise HTTPException(status_code=502, detail="Stockage indisponible, réessayez dans un instant")
    return Response(
        content=data,
        media_type=doc.get("content_type") or content_type,
        headers={"Content-Disposition": f'inline; filename="{doc["nom_fichier"]}"'},
    )


@router.delete("/documents-apprenants/{doc_id}")
async def delete_document_apprenant(doc_id: str, user: dict = Depends(get_current_user)):
    result = await db.apprenant_documents.update_one({"id": doc_id}, {"$set": {"is_deleted": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document introuvable")
    return {"ok": True}


# ---------------- Fusion de fiches apprenants ----------------
@router.post("/apprenants/fusionner")
async def fusionner_apprenants(payload: FusionPayload, user: dict = Depends(get_current_user)):
    if len(payload.apprenant_ids) < 2:
        raise HTTPException(status_code=400, detail="Au moins deux fiches sont nécessaires pour fusionner")
    fiches = await db.apprenants.find({"id": {"$in": payload.apprenant_ids}}, {"_id": 0}).to_list(100)
    if len(fiches) < 2:
        raise HTTPException(status_code=404, detail="Fiches introuvables")
    fiches.sort(key=lambda f: f.get("created_at") or "")
    cible, doublons = fiches[0], fiches[1:]
    doublon_ids = [d["id"] for d in doublons]

    updates = {"updated_at": now_utc().isoformat()}
    for field in ["email", "telephone", "dossier_cpf", "adresse", "date_naissance", "entreprise_id"]:
        if not cible.get(field):
            for d in doublons:
                if d.get(field):
                    updates[field] = d[field]
                    break
    notes_sup = [d["notes"] for d in doublons if d.get("notes") and d["notes"] != cible.get("notes")]
    if notes_sup:
        updates["notes"] = "\n".join([n for n in [cible.get("notes")] + notes_sup if n])
    await db.apprenants.update_one({"id": cible["id"]}, {"$set": updates})

    sessions_touchees = 0
    async for s in db.sessions.find({"apprenants": {"$in": doublon_ids}}, {"_id": 0, "id": 1, "apprenants": 1}):
        nouveaux = [a for a in s.get("apprenants", []) if a not in doublon_ids]
        if cible["id"] not in nouveaux:
            nouveaux.append(cible["id"])
        await db.sessions.update_one(
            {"id": s["id"]}, {"$set": {"apprenants": nouveaux, "updated_at": now_utc().isoformat()}}
        )
        sessions_touchees += 1

    docs_result = await db.apprenant_documents.update_many(
        {"apprenant_id": {"$in": doublon_ids}}, {"$set": {"apprenant_id": cible["id"]}}
    )
    await db.apprenants.delete_many({"id": {"$in": doublon_ids}})

    return {
        "cible_id": cible["id"],
        "fiches_fusionnees": len(doublon_ids),
        "sessions_reaffectees": sessions_touchees,
        "documents_reaffectes": docs_result.modified_count,
    }


# ---------------- Qualité des données : doublons ----------------
@router.get("/qualite/doublons")
async def detect_doublons(user: dict = Depends(get_current_user)):
    apprenants = await db.apprenants.find(
        {}, {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "email": 1, "dossier_cpf": 1}
    ).to_list(20000)

    by_email: Dict[str, list] = {}
    by_name: Dict[tuple, list] = {}
    for a in apprenants:
        if a.get("email"):
            by_email.setdefault(a["email"].lower().strip(), []).append(a)
        key = ((a.get("nom") or "").lower().strip(), (a.get("prenom") or "").lower().strip())
        by_name.setdefault(key, []).append(a)

    doublons_email = [{"cle": k, "apprenants": v} for k, v in by_email.items() if len(v) > 1]
    doublons_nom = []
    for (n, p), v in by_name.items():
        if len(v) > 1:
            emails = {(x.get("email") or "").lower().strip() for x in v}
            if len(emails) > 1 or "" in emails:
                doublons_nom.append({"cle": f"{p.title()} {n.upper()}".strip(), "apprenants": v})

    factures = await db.factures_cpf.find(
        {}, {"_id": 0, "id": 1, "numero_facture": 1, "numero_dossier": 1, "montant": 1, "date_emission": 1}
    ).to_list(20000)
    by_facture: Dict[str, list] = {}
    by_dossier: Dict[str, list] = {}
    for f in factures:
        if f.get("numero_facture"):
            by_facture.setdefault(f["numero_facture"], []).append(f)
        if f.get("numero_dossier"):
            by_dossier.setdefault(f["numero_dossier"], []).append(f)

    return {
        "total_apprenants": len(apprenants),
        "total_factures": len(factures),
        "apprenants_par_email": doublons_email,
        "apprenants_par_nom": doublons_nom,
        "factures_par_numero": [{"cle": k, "factures": v} for k, v in by_facture.items() if len(v) > 1],
        "dossiers_multi_factures": [{"cle": k, "factures": v} for k, v in by_dossier.items() if len(v) > 1],
    }


# ---------------- Génération PDF & classement ----------------
async def _generer_pdf_session(session: dict, doc_type: str) -> bytes:
    ctx = {
        "session": session,
        "org": await get_organisme(),
        "lieu": await db.lieux.find_one({"id": session["lieu_id"]}, {"_id": 0}) if session.get("lieu_id") else None,
        "formateurs": await db.formateurs.find({"id": {"$in": session.get("formateurs", [])}}, {"_id": 0}).to_list(50),
        "apprenants": await db.apprenants.find({"id": {"$in": session.get("apprenants", [])}}, {"_id": 0}).to_list(300),
        "entreprise": await db.entreprises.find_one({"id": session["entreprise_id"]}, {"_id": 0}) if session.get("entreprise_id") else None,
        "financeur": await db.financeurs.find_one({"id": session["financeur_id"]}, {"_id": 0}) if session.get("financeur_id") else None,
    }
    title, blocks = DOC_BUILDERS[doc_type](ctx)
    return build_pdf(title, blocks, ctx["org"])


@router.get("/documents/session/{session_id}/{doc_type}")
async def generate_document(session_id: str, doc_type: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")
    if doc_type not in DOC_BUILDERS:
        raise HTTPException(status_code=400, detail="Type de document invalide")
    pdf = await _generer_pdf_session(session, doc_type)
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc_type}_{session.get("code_interne", session_id)}.pdf"'},
    )


@router.post("/documents/session/{session_id}/{doc_type}/classer")
async def classer_document_session(session_id: str, doc_type: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")
    if doc_type not in DOC_BUILDERS:
        raise HTTPException(status_code=400, detail="Type de document invalide")
    apprenant_ids = session.get("apprenants", [])
    if not apprenant_ids:
        raise HTTPException(status_code=400, detail="Aucun stagiaire inscrit à cette session")

    pdf = await _generer_pdf_session(session, doc_type)
    nom_fichier = f"{doc_type}_{session.get('code_interne', session_id)}.pdf"
    path = f"{APP_PREFIX}/sessions/{session_id}/{doc_type}-{uuid.uuid4().hex}.pdf"
    try:
        result = await put_object(path, pdf, "application/pdf")
    except Exception:
        logger.exception("Échec de l'envoi vers le stockage d'objets")
        raise HTTPException(status_code=502, detail="Stockage indisponible, réessayez dans un instant")

    categorie = DOC_TYPE_TO_CATEGORIE[doc_type]
    now_iso = now_utc().isoformat()
    for aid in apprenant_ids:
        await db.apprenant_documents.insert_one({
            "id": new_id(),
            "apprenant_id": aid,
            "categorie": categorie,
            "nom_fichier": nom_fichier,
            "content_type": "application/pdf",
            "taille": len(pdf),
            "storage_path": result["path"],
            "is_deleted": False,
            "uploaded_at": now_iso,
        })
    return {"classes": len(apprenant_ids), "categorie": categorie, "nom_fichier": nom_fichier}
