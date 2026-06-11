"""EDOF / CPF imports: Dossiers (apprenants + sessions) and Factures (encaissements)."""
import re
import uuid
from typing import Optional, Dict
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Query

from deps import db, now_utc, new_id, get_current_user
from models import EdofCommitPayload, SessionPayload, MOIS_FR
from import_edof import TARGET_FIELDS, auto_map, parse_import_file, parse_date_fr, parse_amount, map_facture_columns

router = APIRouter()


# ----- Import EDOF Dossiers (apprenants + sessions) -----
@router.post("/import/edof/preview")
async def edof_preview(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 10 Mo)")
    try:
        columns, rows = parse_import_file(file.filename or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not rows:
        raise HTTPException(status_code=400, detail="Aucune ligne de données détectée dans le fichier")
    return {
        "columns": columns,
        "mapping": auto_map(columns),
        "fields": TARGET_FIELDS,
        "rows": rows,
        "total": len(rows),
    }


@router.post("/import/edof/commit")
async def edof_commit(payload: EdofCommitPayload, user: dict = Depends(get_current_user)):
    mapping = payload.mapping

    def val(row, field):
        col = mapping.get(field)
        return str(row.get(col) or "").strip() if col else ""

    if not mapping.get("nom") or not mapping.get("prenom"):
        raise HTTPException(status_code=400, detail="Les colonnes Nom et Prénom doivent être mappées")

    stats = {
        "apprenants_crees": 0, "apprenants_existants": 0,
        "sessions_creees": 0, "sessions_maj": 0, "lignes_ignorees": [],
    }
    today_iso = now_utc().date().isoformat()
    import_note = f"Importé depuis EDOF (CPF) le {now_utc().strftime('%d/%m/%Y')}"

    financeur_cpf = None
    if payload.create_sessions:
        financeur_cpf = await db.financeurs.find_one({"type_financeur": "cpf"}, {"_id": 0})
        if not financeur_cpf:
            financeur_cpf = {
                "id": new_id(),
                "nom": "Caisse des Dépôts — Mon Compte Formation",
                "type_financeur": "cpf", "code": "CPF",
                "email": None, "telephone": None, "adresse": None,
                "notes": "Créé automatiquement lors de l'import EDOF.",
                "created_at": now_utc().isoformat(),
                "updated_at": now_utc().isoformat(),
            }
            await db.financeurs.insert_one(dict(financeur_cpf))
            financeur_cpf.pop("_id", None)

    session_groups: Dict[tuple, dict] = {}

    for i, row in enumerate(payload.rows):
        line_no = i + 2
        nom, prenom = val(row, "nom"), val(row, "prenom")
        if not nom or not prenom:
            stats["lignes_ignorees"].append(f"Ligne {line_no} : nom ou prénom manquant")
            continue
        statut_dossier = val(row, "statut").lower()
        if "annul" in statut_dossier or "refus" in statut_dossier:
            stats["lignes_ignorees"].append(f"Ligne {line_no} : dossier « {val(row, 'statut')} »")
            continue

        email = val(row, "email").lower()
        if email:
            query = {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}
        else:
            query = {
                "nom": {"$regex": f"^{re.escape(nom)}$", "$options": "i"},
                "prenom": {"$regex": f"^{re.escape(prenom)}$", "$options": "i"},
            }
        existing = await db.apprenants.find_one(query, {"_id": 0, "id": 1})
        if existing:
            apprenant_id = existing["id"]
            stats["apprenants_existants"] += 1
        else:
            apprenant_id = new_id()
            dossier = val(row, "dossier")
            notes = import_note + (f" — Dossier CPF n° {dossier}" if dossier else "")
            await db.apprenants.insert_one({
                "id": apprenant_id, "nom": nom, "prenom": prenom,
                "email": email or None,
                "telephone": val(row, "telephone") or None,
                "entreprise_id": None, "date_naissance": None, "adresse": None,
                "dossier_cpf": dossier or None, "notes": notes,
                "created_at": now_utc().isoformat(),
                "updated_at": now_utc().isoformat(),
            })
            stats["apprenants_crees"] += 1

        if payload.create_sessions:
            formation = val(row, "formation")
            if not formation:
                continue
            d1 = parse_date_fr(val(row, "date_debut"))
            d2 = parse_date_fr(val(row, "date_fin"))
            if payload.groupement == "mois" and d1:
                mois = d1[:7]
                annee, num_mois = mois.split("-")
                nom_session = f"{formation} — {MOIS_FR[int(num_mois) - 1]} {annee}"
                key = (formation.lower(), mois)
            else:
                nom_session = formation
                key = (formation.lower(), d1 or "", d2 or "")
            group = session_groups.setdefault(key, {
                "nom": nom_session, "date_debut": d1, "date_fin": d2,
                "apprenants": [], "total": 0.0,
            })
            if d1 and (not group["date_debut"] or d1 < group["date_debut"]):
                group["date_debut"] = d1
            if d2 and (not group["date_fin"] or d2 > group["date_fin"]):
                group["date_fin"] = d2
            if apprenant_id not in group["apprenants"]:
                group["apprenants"].append(apprenant_id)
                group["total"] += parse_amount(val(row, "prix"))

    for group in session_groups.values():
        if payload.groupement == "mois":
            query = {"nom": {"$regex": f"^{re.escape(group['nom'])}$", "$options": "i"}}
        else:
            query = {"nom": {"$regex": f"^{re.escape(group['nom'])}$", "$options": "i"}, "date_debut": group["date_debut"]}
        existing = await db.sessions.find_one(query, {"_id": 0, "id": 1, "apprenants": 1})
        if existing:
            new_ids = [a for a in group["apprenants"] if a not in existing.get("apprenants", [])]
            if new_ids:
                await db.sessions.update_one(
                    {"id": existing["id"]},
                    {"$push": {"apprenants": {"$each": new_ids}}, "$set": {"updated_at": now_utc().isoformat()}},
                )
            stats["sessions_maj"] += 1
        else:
            if group["date_fin"] and group["date_fin"] < today_iso:
                statut = "terminee"
            elif group["date_debut"]:
                statut = "planifiee"
            else:
                statut = "brouillon"
            now_iso = now_utc().isoformat()
            await db.sessions.insert_one({
                **SessionPayload(
                    nom=group["nom"], statut=statut,
                    date_debut=group["date_debut"], date_fin=group["date_fin"],
                    apprenants=group["apprenants"],
                    prix_ht=round(group["total"], 2),
                    financeur_id=financeur_cpf["id"] if financeur_cpf else None,
                    description=import_note + ".",
                ).model_dump(),
                "id": new_id(),
                "code_interne": f"SES-{now_utc().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}",
                "created_at": now_iso, "updated_at": now_iso,
                "convocations_envoyees": False, "evaluations_envoyees": False,
                "factures_emises": False, "attestations_emises": False,
            })
            stats["sessions_creees"] += 1

    return stats


# ----- Factures CPF (encaissements) -----
@router.post("/factures-cpf/import")
async def factures_cpf_import(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 10 Mo)")
    try:
        columns, rows = parse_import_file(file.filename or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    mapping = map_facture_columns(columns)
    if not mapping.get("numero_dossier") or not mapping.get("montant"):
        raise HTTPException(
            status_code=400,
            detail="Ce fichier ne ressemble pas à un export Factures EDOF (colonnes n° de dossier / montant introuvables)",
        )

    def val(row, field):
        col = mapping.get(field)
        return str(row.get(col) or "").strip() if col else ""

    stats = {"importees": 0, "mises_a_jour": 0, "ignorees": 0}
    for row in rows:
        numero_dossier = val(row, "numero_dossier")
        numero_facture = val(row, "numero_facture")
        if not numero_dossier and not numero_facture:
            stats["ignorees"] += 1
            continue
        doc = {
            "numero_dossier": numero_dossier or None,
            "numero_facture": numero_facture or None,
            "type_facture": val(row, "type_facture") or "FACTURE",
            "date_emission": parse_date_fr(val(row, "date_emission")),
            "montant": parse_amount(val(row, "montant")),
            "statut_reglement": val(row, "statut_reglement") or "Inconnu",
            "date_reglement": parse_date_fr(val(row, "date_reglement")),
            "en_controle": val(row, "en_controle").upper().startswith("O"),
            "updated_at": now_utc().isoformat(),
        }
        key = {"numero_facture": numero_facture} if numero_facture else {
            "numero_dossier": numero_dossier, "montant": doc["montant"], "date_emission": doc["date_emission"],
        }
        existing = await db.factures_cpf.find_one(key, {"_id": 1})
        if existing:
            await db.factures_cpf.update_one({"_id": existing["_id"]}, {"$set": doc})
            stats["mises_a_jour"] += 1
        else:
            await db.factures_cpf.insert_one({"id": new_id(), "created_at": now_utc().isoformat(), **doc})
            stats["importees"] += 1
    return stats


@router.get("/factures-cpf")
async def list_factures_cpf(q: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    query = {}
    if q:
        query = {"$or": [
            {"numero_dossier": {"$regex": re.escape(q), "$options": "i"}},
            {"numero_facture": {"$regex": re.escape(q), "$options": "i"}},
        ]}
    factures = await db.factures_cpf.find(query, {"_id": 0}).sort("date_emission", -1).to_list(2000)
    apprenants_map = {}
    async for a in db.apprenants.find({"dossier_cpf": {"$nin": [None, ""]}}, {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "dossier_cpf": 1}):
        apprenants_map[a["dossier_cpf"]] = a
    for f in factures:
        linked = apprenants_map.get(f.get("numero_dossier"))
        f["apprenant"] = {"id": linked["id"], "nom": linked["nom"], "prenom": linked["prenom"]} if linked else None
    return factures


@router.get("/factures-cpf/stats")
async def factures_cpf_stats(user: dict = Depends(get_current_user)):
    factures = await db.factures_cpf.find({}, {"_id": 0, "montant": 1, "statut_reglement": 1, "date_emission": 1}).to_list(10000)
    total = sum(f.get("montant", 0) for f in factures)
    verse = sum(f.get("montant", 0) for f in factures if str(f.get("statut_reglement", "")).lower().startswith("vers"))
    par_mois: Dict[str, Dict[str, float]] = {}
    for f in factures:
        mois = (f.get("date_emission") or "")[:7]
        if not mois:
            continue
        entry = par_mois.setdefault(mois, {"total": 0.0, "verse": 0.0})
        entry["total"] += f.get("montant", 0)
        if str(f.get("statut_reglement", "")).lower().startswith("vers"):
            entry["verse"] += f.get("montant", 0)
    return {
        "nb_factures": len(factures),
        "total": round(total, 2),
        "total_verse": round(verse, 2),
        "total_attente": round(total - verse, 2),
        "par_mois": [{"mois": m, **{k: round(v, 2) for k, v in d.items()}} for m, d in sorted(par_mois.items())],
    }
