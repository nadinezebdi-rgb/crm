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
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Body
from fastapi.responses import Response
from pydantic import BaseModel, Field

import deps
from storage import APP_PREFIX, put_object, get_object
from import_edof import parse_import_file, auto_map, parse_date_fr

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


@router.get("/dossiers/{dossier_id}/factures-cpf")
async def get_linked_factures(dossier_id: str, user: dict = Depends(deps.get_current_user)):
    """Renvoie les factures CPF liées à ce dossier (matching financeur_nom = numero_dossier)."""
    d = await deps.db.dossiers.find_one({"id": dossier_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dossier introuvable")
    num = d.get("financeur_nom")
    if not num:
        return []
    factures = await deps.db.factures_cpf.find(
        {"numero_dossier": num}, {"_id": 0}
    ).sort("date_emission", -1).to_list(200)
    return factures


@router.get("/dossiers/{dossier_id}/documents")
async def list_documents(dossier_id: str, user: dict = Depends(deps.get_current_user)):
    """Renvoie tous les documents pertinents pour ce dossier :
      1) Documents uploadés directement (dossier_documents avec dossier_id == dossier_id)
      2) Documents de la bibliothèque centrale cross-linkés via :
         - dossier.financeur_nom == library.auto_attach_meta.numero_dossier
         - OU le n° de facture extrait du nom de fichier matche une facture CPF du dossier
    """
    from routes.library import _normalize_invoice_number  # import paresseux pour éviter cycle

    items = await deps.db.dossier_documents.find(
        {"dossier_id": dossier_id}, {"_id": 0}
    ).sort("uploaded_at", -1).to_list(500)
    seen_ids = {it["id"] for it in items}

    dossier = await deps.db.dossiers.find_one({"id": dossier_id}, {"_id": 0, "financeur_nom": 1})
    if dossier and dossier.get("financeur_nom"):
        numero = dossier["financeur_nom"]

        # (A) Cross-link par numero_dossier (déjà attaché par l'auto-rattachement)
        async for libdoc in deps.db.dossier_documents.find(
            {
                "auto_attach_meta.numero_dossier": numero,
                "dossier_id": {"$in": [None, dossier_id]},
            },
            {"_id": 0},
        ):
            if libdoc.get("id") not in seen_ids:
                libdoc["source"] = "library"
                items.append(libdoc)
                seen_ids.add(libdoc["id"])

        # (B) Cross-link par numero_facture : matche les library PDF dont le nom contient
        # un n° de facture présent dans factures_cpf du dossier
        factures = await deps.db.factures_cpf.find(
            {"numero_dossier": numero, "numero_facture": {"$nin": [None, ""]}},
            {"_id": 0, "numero_facture": 1},
        ).to_list(500)
        normalized_targets = {
            _normalize_invoice_number(f["numero_facture"]): f["numero_facture"]
            for f in factures if _normalize_invoice_number(f.get("numero_facture"))
        }
        if normalized_targets:
            async for libdoc in deps.db.dossier_documents.find(
                {"type": "facture", "is_edof_source": {"$ne": True}},
                {"_id": 0},
            ):
                if libdoc.get("id") in seen_ids:
                    continue
                normalized_doc = _normalize_invoice_number(libdoc.get("original_filename"))
                if normalized_doc and normalized_doc in normalized_targets:
                    libdoc["source"] = "library"
                    libdoc["matched_facture"] = normalized_targets[normalized_doc]
                    items.append(libdoc)
                    seen_ids.add(libdoc["id"])

    items.sort(key=lambda d: d.get("uploaded_at") or "", reverse=True)
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
    content = await file.read()
    if not content:
        raise HTTPException(400, "Fichier vide")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 25 Mo)")
    doc_id = deps.new_id()
    ext = Path(file.filename or "").suffix.lstrip(".") or "bin"
    path = f"{APP_PREFIX}/library/{doc_id}.{ext}"
    try:
        result = await put_object(path, content, file.content_type or "application/octet-stream")
    except Exception:
        raise HTTPException(502, "Stockage indisponible, réessayez")
    document = {
        "id": doc_id,
        "dossier_id": dossier_id,
        "type": type,
        "filename": path.split("/")[-1],
        "original_filename": file.filename or path.split("/")[-1],
        "content_type": file.content_type or "application/octet-stream",
        "size": result.get("size", len(content)),
        "storage_path": result.get("path", path),
        "uploaded_at": deps.now_utc().isoformat(),
    }
    await deps.db.dossier_documents.insert_one(dict(document))
    document.pop("_id", None)
    return document


@router.get("/dossier-documents/{document_id}/download")
async def download_document(document_id: str, user: dict = Depends(deps.get_current_user)):
    d = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Document introuvable")
    path = d.get("storage_path")
    if not path:
        raise HTTPException(404, "Fichier introuvable (document antérieur à la migration vers stockage objet)")
    try:
        data, ctype = await get_object(path)
    except Exception:
        raise HTTPException(502, "Stockage indisponible")
    filename = d.get("original_filename", d.get("filename", "document"))
    return Response(
        content=data,
        media_type=ctype or d.get("content_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(data)),
            "Cache-Control": "no-store",
        },
    )


@router.delete("/dossier-documents/{document_id}")
async def delete_document(document_id: str, user: dict = Depends(deps.get_current_user)):
    d = await deps.db.dossier_documents.find_one({"id": document_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Document introuvable")
    await deps.db.dossier_documents.delete_one({"id": document_id})
    return {"ok": True}


@router.get("/dossiers-stats")
async def dossiers_stats(user: dict = Depends(deps.get_current_user)):
    by_status = {}
    for s in STATUS_ORDER:
        by_status[s] = await deps.db.dossiers.count_documents({"status": s})
    total = await deps.db.dossiers.count_documents({})
    return {"total": total, "actifs": total - by_status.get("regle", 0), "by_status": by_status}


# ============================================================================
# Auto-statut depuis les factures CPF importées (EDOF)
# ============================================================================

def _is_facture_payee(statut: Optional[str]) -> bool:
    """Renvoie True si le statut EDOF indique une facture réglée/versée."""
    if not statut:
        return False
    s = statut.strip().lower()
    # Accepte les variantes : "Réglée", "Réglé", "Versée", "Versé", "Payée", "Encaissée"
    return s.startswith(("régl", "regl", "vers", "pay", "encaiss"))


async def _dossier_doc_types_count(dossier: dict) -> int:
    """Compte le nombre de TYPES de documents distincts présents pour un dossier (max 4).

    Types reconnus : devis_signe, attestation, facture, justificatif_paiement.
    Une facture CPF importée (factures_cpf liée via financeur_nom) compte comme "facture",
    de la même manière que dans le DossierDrawer.
    """
    types_present = set()
    async for d in deps.db.dossier_documents.find(
        {"dossier_id": dossier["id"], "type": {"$in": ["devis_signe", "attestation", "facture", "justificatif_paiement"]}},
        {"_id": 0, "type": 1},
    ):
        types_present.add(d["type"])
    # Si une facture CPF est rattachée → le slot "facture" est validé
    if dossier.get("financeur_nom") and "facture" not in types_present:
        if await deps.db.factures_cpf.find_one({"numero_dossier": dossier["financeur_nom"]}, {"_id": 1}):
            types_present.add("facture")
    return len(types_present)


async def sync_dossier_statuses_from_factures() -> dict:
    """Met à jour le statut des dossiers en fonction des factures CPF importées.

    Règles (UNIQUEMENT en upgrade, jamais de downgrade) :
      • Si ≥1 facture liée a un statut "Réglée"/"Versée" ET le dossier a ≥4 types de
        documents complets → status = `regle` (+ date_cloture)
      • Sinon, si ≥1 facture existe → status ≥ `facture`
      • Si <4 documents, on ne dépasse JAMAIS `facture` (l'utilisateur doit compléter
        les pièces avant l'archivage).
    Le matching dossier ↔ facture est fait via dossier.financeur_nom == facture.numero_dossier
    """
    promoted_facture = 0
    promoted_regle = 0
    untouched = 0
    blocked_missing_docs = 0
    details: List[dict] = []

    # 1) Indexe les factures par numero_dossier
    by_dossier: dict = {}
    async for f in deps.db.factures_cpf.find(
        {"numero_dossier": {"$nin": [None, ""]}},
        {"_id": 0, "numero_dossier": 1, "statut_reglement": 1, "numero_facture": 1},
    ):
        by_dossier.setdefault(f["numero_dossier"], []).append(f)

    # 2) Parcourt tous les dossiers avec un n° CPF
    async for d in deps.db.dossiers.find(
        {"financeur_nom": {"$nin": [None, ""]}},
        {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "status": 1, "financeur_nom": 1, "date_cloture": 1},
    ):
        factures = by_dossier.get(d["financeur_nom"], [])
        if not factures:
            untouched += 1
            continue

        current_idx = STATUS_ORDER.index(d["status"]) if d.get("status") in STATUS_ORDER else 0
        has_paid = any(_is_facture_payee(f.get("statut_reglement")) for f in factures)

        target_idx = current_idx
        target_status = d.get("status")
        # Une facture payée => on tente regle, mais SEULEMENT si 4 types de docs présents
        if has_paid:
            doc_types_count = await _dossier_doc_types_count(d)
            if doc_types_count >= 4:
                target_idx = STATUS_ORDER.index("regle")
                target_status = "regle"
            else:
                # Bloqué par les docs manquants : on monte au moins à "facture"
                facture_idx = STATUS_ORDER.index("facture")
                if current_idx < facture_idx:
                    target_idx = facture_idx
                    target_status = "facture"
                blocked_missing_docs += 1
        else:
            facture_idx = STATUS_ORDER.index("facture")
            if current_idx < facture_idx:
                target_idx = facture_idx
                target_status = "facture"

        # On NE downgrade JAMAIS — uniquement promotion
        if target_idx <= current_idx:
            untouched += 1
            continue

        updates = {"status": target_status, "updated_at": deps.now_utc().isoformat()}
        if target_status == "regle" and not d.get("date_cloture"):
            updates["date_cloture"] = deps.now_utc().isoformat()
        await deps.db.dossiers.update_one({"id": d["id"]}, {"$set": updates})

        if target_status == "regle":
            promoted_regle += 1
        else:
            promoted_facture += 1
        details.append({
            "dossier_id": d["id"],
            "stagiaire": f"{d.get('prenom', '')} {d.get('nom', '')}".strip(),
            "financeur_nom": d["financeur_nom"],
            "from": d.get("status"),
            "to": target_status,
            "factures_count": len(factures),
        })

    return {
        "promoted_to_regle": promoted_regle,
        "promoted_to_facture": promoted_facture,
        "untouched": untouched,
        "blocked_missing_docs": blocked_missing_docs,
        "details": details,
    }


@router.post("/dossiers-admin/sync-status-factures")
async def sync_status_from_factures_endpoint(user: dict = Depends(deps.get_current_user)):
    """Endpoint manuel : re-synchronise tous les statuts depuis les factures CPF.

    Utile après un import EDOF correctif ou si on veut forcer la re-évaluation.
    """
    return await sync_dossier_statuses_from_factures()


# ============================================================================
# ADMIN — Vider tous les dossiers + Importer depuis EDOF/CSV/XLSX
# ============================================================================

@router.delete("/dossiers-admin/clear")
async def clear_all_dossiers(
    scope: Optional[str] = "all",  # "all" | "active" | "closed"
    user: dict = Depends(deps.get_current_user),
):
    """Supprime TOUS les dossiers + leurs documents (action irréversible)."""
    query: dict = {}
    if scope == "active":
        query = {"status": {"$ne": "regle"}}
    elif scope == "closed":
        query = {"status": "regle"}

    # Identifie d'abord les dossiers concernés
    dossiers = await deps.db.dossiers.find(query, {"_id": 0, "id": 1}).to_list(100000)
    dossier_ids = [d["id"] for d in dossiers]

    # Supprime les documents (DB + fichiers disque)
    docs = await deps.db.dossier_documents.find(
        {"dossier_id": {"$in": dossier_ids}}, {"_id": 0}
    ).to_list(100000) if dossier_ids else []
    for doc in docs:
        fpath = UPLOAD_DIR / doc.get("filename", "")
        if fpath.exists():
            try:
                fpath.unlink()
            except Exception:
                pass
    if dossier_ids:
        await deps.db.dossier_documents.delete_many({"dossier_id": {"$in": dossier_ids}})

    # Supprime les dossiers
    result = await deps.db.dossiers.delete_many(query)
    return {"deleted": result.deleted_count, "documents_deleted": len(docs)}


def _detect_financeur_type(value: str) -> str:
    """Devine le type de financeur depuis une chaîne libre."""
    v = (value or "").lower()
    if any(k in v for k in ["cpf", "compte personnel", "mon compte", "edof"]):
        return "CPF"
    if any(k in v for k in ["opco", "atlas", "akto", "afdas", "constructys", "ocapiat", "uniformation", "ep "]):
        return "OPCO"
    if any(k in v for k in ["prive", "privé", "client", "auto"]):
        return "Privé"
    return "CPF"  # défaut : fichier EDOF → CPF


@router.post("/dossiers-admin/import-edof")
async def import_edof_dossiers(
    file: UploadFile = File(...),
    default_financeur: str = Form("CPF"),
    default_formation: str = Form("ANGLAIS"),
    default_formateur_id: Optional[str] = Form(None),
    user: dict = Depends(deps.get_current_user),
):
    """Importe un export EDOF/CSV/Excel et crée un dossier par ligne.

    Détecte automatiquement les colonnes : nom, prénom, date de naissance,
    adresse, email, téléphone, date début, date fin, formation.
    """
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 15 Mo)")
    try:
        columns, rows = parse_import_file(file.filename or "", content)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if not rows:
        raise HTTPException(400, "Aucune ligne de données détectée")

    mapping = auto_map(columns)
    if not mapping.get("nom") or not mapping.get("prenom"):
        raise HTTPException(400, "Colonnes Nom et Prénom introuvables dans le fichier")

    def cell(row: dict, field: str) -> str:
        col = mapping.get(field)
        return str(row.get(col) or "").strip() if col else ""

    # Valide le formateur par défaut s'il est fourni
    formateur_doc = None
    if default_formateur_id:
        formateur_doc = await deps.db.formateurs.find_one({"id": default_formateur_id})
        if not formateur_doc:
            raise HTTPException(400, "Formateur par défaut introuvable")

    created = 0
    skipped = []
    now_iso = deps.now_utc().isoformat()

    for idx, row in enumerate(rows, start=1):
        nom = cell(row, "nom")
        prenom = cell(row, "prenom")
        if not nom or not prenom:
            skipped.append({"ligne": idx, "raison": "nom/prénom manquant"})
            continue

        formation_libre = cell(row, "formation") or default_formation
        financeur_type = default_financeur if default_financeur in ("OPCO", "CPF", "Privé") else "CPF"
        financeur_nom = cell(row, "dossier") or None  # n° de dossier CPF si présent

        dossier = {
            "id": deps.new_id(),
            "nom": nom,
            "prenom": prenom,
            "date_naissance": parse_date_fr(cell(row, "date_naissance")) or None,
            "adresse": cell(row, "adresse") or None,
            "email": cell(row, "email") or None,
            "telephone": cell(row, "telephone") or None,
            "formateur_id": default_formateur_id,
            "financeur_type": financeur_type,
            "financeur_nom": financeur_nom,
            "formation": formation_libre,
            "notes": f"Importé depuis EDOF · {file.filename}",
            "status": "devis_attente",
            "date_entree": now_iso,
            "date_cloture": None,
            "date_debut_formation": parse_date_fr(cell(row, "date_debut")),
            "date_fin_formation": parse_date_fr(cell(row, "date_fin")),
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await deps.db.dossiers.insert_one(dossier)
        created += 1

    return {
        "created": created,
        "total_rows": len(rows),
        "skipped": skipped,
        "mapping_detected": mapping,
        "columns": columns,
    }
