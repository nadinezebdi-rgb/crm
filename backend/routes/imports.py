"""EDOF / CPF imports: Dossiers (apprenants + sessions) and Factures (encaissements)."""
import re
import uuid
from typing import Optional, Dict
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Query, Body

import deps
from models import EdofCommitPayload, SessionPayload, MOIS_FR
from import_edof import TARGET_FIELDS, auto_map, parse_import_file, parse_date_fr, parse_amount, map_facture_columns, detect_niveau_anglais
from routes.dossiers import sync_dossier_statuses_from_factures

router = APIRouter()


# ----- Import EDOF Dossiers (apprenants + sessions) -----
@router.post("/import/edof/preview")
async def edof_preview(file: UploadFile = File(...), user: dict = Depends(deps.get_current_user)):
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
async def edof_commit(payload: EdofCommitPayload, user: dict = Depends(deps.get_current_user)):
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
    import_note = f"Importé depuis EDOF (CPF) le {deps.now_utc().strftime('%d/%m/%Y')}"

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
        dossier = val(row, "dossier")
        formation = val(row, "formation")
        niveau = detect_niveau_anglais(formation)
        date_debut = parse_date_fr(val(row, "date_debut"))
        date_fin = parse_date_fr(val(row, "date_fin"))
        notes = import_note + (f" — Dossier CPF n° {dossier}" if dossier else "")

        if email:
            query = {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}
        else:
            query = {
                "nom": {"$regex": f"^{re.escape(nom)}$", "$options": "i"},
                "prenom": {"$regex": f"^{re.escape(prenom)}$", "$options": "i"},
            }
        existing = await deps.db.apprenants.find_one(query, {"_id": 0, "id": 1})
        champs = {
            "telephone": val(row, "telephone") or None,
            "dossier_cpf": dossier or None,
            "formation": formation or None,
            "niveau": niveau,
            "date_debut": date_debut,
            "date_fin": date_fin,
            "source": "edof",
            "updated_at": deps.now_utc().isoformat(),
        }
        if existing:
            await deps.db.apprenants.update_one({"id": existing["id"]}, {"$set": champs})
            stats["apprenants_existants"] += 1
        else:
            await deps.db.apprenants.insert_one({
                "id": deps.new_id(), "nom": nom, "prenom": prenom,
                "email": email or None,
                "entreprise_id": None, "date_naissance": None, "adresse": None,
                "notes": notes,
                "created_at": deps.now_utc().isoformat(),
                **champs,
            })
            stats["apprenants_crees"] += 1

    return stats

@router.delete("/import/edof/reset")
async def edof_reset(user: dict = Depends(deps.get_current_user)):
    """Supprime tous les apprenants et sessions importés depuis EDOF (source == 'edof')."""
    res_app = await deps.db.apprenants.delete_many({"source": "edof"})
    res_ses = await deps.db.sessions.delete_many({"source": "edof"})
    return {
        "apprenants_supprimes": res_app.deleted_count,
        "sessions_supprimees": res_ses.deleted_count,
    }


# ----- Factures CPF (encaissements) -----
@router.post("/factures-cpf/import")
async def factures_cpf_import(file: UploadFile = File(...), user: dict = Depends(deps.get_current_user)):
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
            "updated_at": deps.now_utc().isoformat(),
        }
        key = {"numero_facture": numero_facture} if numero_facture else {
            "numero_dossier": numero_dossier, "montant": doc["montant"], "date_emission": doc["date_emission"],
        }
        existing = await deps.db.factures_cpf.find_one(key, {"_id": 1})
        if existing:
            await deps.db.factures_cpf.update_one({"_id": existing["_id"]}, {"$set": doc})
            stats["mises_a_jour"] += 1
        else:
            await deps.db.factures_cpf.insert_one({"id": deps.new_id(), "created_at": deps.now_utc().isoformat(), **doc})
            stats["importees"] += 1
    # Synchro auto des statuts dossiers
    sync = await sync_dossier_statuses_from_factures()
    stats["dossiers_passes_facture"] = sync.get("promoted_to_facture", 0)
    stats["dossiers_passes_regle"] = sync.get("promoted_to_regle", 0)
    return stats


@router.get("/factures-cpf")
async def list_factures_cpf(q: Optional[str] = Query(None), user: dict = Depends(deps.get_current_user)):
    query = {}
    if q:
        query = {"$or": [
            {"numero_dossier": {"$regex": re.escape(q), "$options": "i"}},
            {"numero_facture": {"$regex": re.escape(q), "$options": "i"}},
        ]}
    factures = await deps.db.factures_cpf.find(query, {"_id": 0}).sort("date_emission", -1).to_list(2000)

    # Liaison 1 : apprenants (ancien schéma — via apprenants.dossier_cpf)
    apprenants_map = {}
    async for a in deps.db.apprenants.find({"dossier_cpf": {"$nin": [None, ""]}}, {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "dossier_cpf": 1}):
        apprenants_map[a["dossier_cpf"]] = a

    # Liaison 2 : dossiers stagiaires (nouveau schéma — via dossiers.financeur_nom)
    dossiers_map = {}
    async for d in deps.db.dossiers.find(
        {"financeur_nom": {"$nin": [None, ""]}},
        {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "financeur_nom": 1, "status": 1},
    ):
        dossiers_map[d["financeur_nom"]] = d

    for f in factures:
        num = f.get("numero_dossier")
        apprenant = apprenants_map.get(num)
        dossier = dossiers_map.get(num)
        if dossier:
            f["stagiaire"] = {
                "id": dossier["id"],
                "nom": dossier["nom"],
                "prenom": dossier["prenom"],
                "status": dossier.get("status"),
                "kind": "dossier",
            }
        elif apprenant:
            f["stagiaire"] = {
                "id": apprenant["id"],
                "nom": apprenant["nom"],
                "prenom": apprenant["prenom"],
                "kind": "apprenant",
            }
        else:
            f["stagiaire"] = None
        # Back-compat champ existant côté frontend
        f["apprenant"] = {"id": apprenant["id"], "nom": apprenant["nom"], "prenom": apprenant["prenom"]} if apprenant else None
    return factures


@router.delete("/factures-cpf/bulk")
async def delete_factures_cpf_bulk(payload: dict = Body(...), user: dict = Depends(deps.get_current_user)):
    """Suppression en masse par liste d'IDs."""
    ids = payload.get("ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(400, "Liste 'ids' requise et non vide")
    res = await deps.db.factures_cpf.delete_many({"id": {"$in": ids}})
    return {"deleted": res.deleted_count}


@router.delete("/factures-cpf/all")
async def delete_all_factures_cpf(user: dict = Depends(deps.get_current_user)):
    """Supprime TOUTES les factures CPF (reset complet)."""
    res = await deps.db.factures_cpf.delete_many({})
    return {"deleted": res.deleted_count}


@router.delete("/factures-cpf/{facture_id}")
async def delete_facture_cpf(facture_id: str, user: dict = Depends(deps.get_current_user)):
    res = await deps.db.factures_cpf.delete_one({"id": facture_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Facture introuvable")
    return {"deleted": 1}


@router.get("/factures-cpf/stats")
async def factures_cpf_stats(user: dict = Depends(deps.get_current_user)):
    factures = await deps.db.factures_cpf.find({}, {"_id": 0, "montant": 1, "statut_reglement": 1, "date_emission": 1}).to_list(10000)
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


# ----- Génération de sessions par mois depuis les factures CPF -----
import calendar


@router.post("/sessions/generer-depuis-factures-cpf")
async def generer_sessions_depuis_factures_cpf(user: dict = Depends(deps.get_current_user)):
    """Regroupe les factures CPF par mois (date_emission) et crée une session synthétique par mois.

    - Une session "CPF — juillet 2025" par mois avec apprenants liés via dossier_cpf, montant total versé,
      financeur CPF (find-or-create). Idempotent : ré-exécution = sessions_maj sans doublon.
    """
    factures = await deps.db.factures_cpf.find(
        {"date_emission": {"$ne": None}},
        {"_id": 0, "numero_dossier": 1, "numero_facture": 1, "montant": 1, "date_emission": 1, "statut_reglement": 1},
    ).to_list(20000)
    if not factures:
        raise HTTPException(status_code=400, detail="Aucune facture CPF avec date d'émission disponible")

    # Mapping dossier_cpf → apprenant_id pour relier les apprenants existants
    dossier_to_apprenant: Dict[str, str] = {}
    async for a in deps.db.apprenants.find({"dossier_cpf": {"$nin": [None, ""]}}, {"_id": 0, "id": 1, "dossier_cpf": 1}):
        dossier_to_apprenant[a["dossier_cpf"]] = a["id"]

    # Financeur CPF find-or-create
    financeur_cpf = await deps.db.financeurs.find_one({"type_financeur": "cpf"}, {"_id": 0})
    if not financeur_cpf:
        financeur_cpf = {
            "id": deps.new_id(),
            "nom": "Caisse des Dépôts — Mon Compte Formation",
            "type_financeur": "cpf", "code": "CPF",
            "email": None, "telephone": None, "adresse": None,
            "notes": "Créé automatiquement lors de la génération de sessions CPF.",
            "created_at": deps.now_utc().isoformat(), "updated_at": deps.now_utc().isoformat(),
        }
        await deps.db.financeurs.insert_one(dict(financeur_cpf))
        financeur_cpf.pop("_id", None)

    # Regroupement par mois (YYYY-MM)
    groupes: Dict[str, dict] = {}
    for f in factures:
        mois = (f.get("date_emission") or "")[:7]
        if not mois or len(mois) != 7:
            continue
        g = groupes.setdefault(mois, {"montant_total": 0.0, "montant_verse": 0.0, "nb_factures": 0, "apprenant_ids": set(), "factures_numeros": []})
        g["montant_total"] += float(f.get("montant") or 0)
        if str(f.get("statut_reglement", "")).lower().startswith("vers"):
            g["montant_verse"] += float(f.get("montant") or 0)
        g["nb_factures"] += 1
        if f.get("numero_facture"):
            g["factures_numeros"].append(f["numero_facture"])
        dossier = f.get("numero_dossier")
        if dossier and dossier in dossier_to_apprenant:
            g["apprenant_ids"].add(dossier_to_apprenant[dossier])

    today_iso = deps.now_utc().date().isoformat()
    stats = {"sessions_creees": 0, "sessions_maj": 0, "details": []}

    for mois, g in sorted(groupes.items()):
        annee, num_mois = mois.split("-")
        num_mois_int = int(num_mois)
        nom_session = f"CPF — {MOIS_FR[num_mois_int - 1]} {annee}"
        last_day = calendar.monthrange(int(annee), num_mois_int)[1]
        date_debut = f"{annee}-{num_mois}-01"
        date_fin = f"{annee}-{num_mois}-{last_day:02d}"
        apprenants_list = sorted(g["apprenant_ids"])
        montant = round(g["montant_total"], 2)
        description = (
            f"Session générée automatiquement depuis les factures CPF du mois "
            f"({g['nb_factures']} facture(s), {round(g['montant_verse'], 2)} € versé / {montant} € émis)."
        )

        existing = await deps.db.sessions.find_one({"nom": nom_session}, {"_id": 0, "id": 1})
        if existing:
            await deps.db.sessions.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "apprenants": apprenants_list,
                    "prix_ht": montant,
                    "date_debut": date_debut, "date_fin": date_fin,
                    "description": description,
                    "financeur_id": financeur_cpf["id"],
                    "updated_at": deps.now_utc().isoformat(),
                }},
            )
            stats["sessions_maj"] += 1
        else:
            statut = "terminee" if date_fin < today_iso else ("planifiee" if date_debut <= today_iso else "planifiee")
            now_iso = deps.now_utc().isoformat()
            await deps.db.sessions.insert_one({
                **SessionPayload(
                    nom=nom_session, statut=statut,
                    date_debut=date_debut, date_fin=date_fin,
                    apprenants=apprenants_list,
                    prix_ht=montant,
                    financeur_id=financeur_cpf["id"],
                    description=description,
                    categorie="CPF",
                ).model_dump(),
                "id": deps.new_id(),
                "code_interne": f"CPF-{annee}-{num_mois}",
                "created_at": now_iso, "updated_at": now_iso,
                "convocations_envoyees": False, "evaluations_envoyees": False,
                "factures_emises": True, "attestations_emises": False,
            })
            stats["sessions_creees"] += 1
        stats["details"].append({
            "mois": mois, "nom": nom_session, "montant": montant,
            "montant_verse": round(g["montant_verse"], 2),
            "nb_factures": g["nb_factures"], "nb_apprenants": len(apprenants_list),
        })

    return stats
