"""Blade Academy CRM - Backend API.

Plateforme de gestion d'organisme de formation.
FastAPI + MongoDB monolithic server (MVP).
"""

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import io
import os
import re
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Dict, Any

import bcrypt
import jwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, File, UploadFile, Form
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from documents import build_pdf, DOC_BUILDERS
from storage import APP_PREFIX, put_object, get_object
from import_edof import TARGET_FIELDS, auto_map, parse_import_file, parse_date_fr, parse_amount, map_facture_columns

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("blade_academy")

app = FastAPI(title="Blade Academy API")
api = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}" if prefix else uuid.uuid4().hex


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": now_utc() + timedelta(hours=8),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": now_utc() + timedelta(days=7),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=8 * 3600, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=7 * 86400, path="/")


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")


def public_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "role": u.get("role", "admin"),
        "picture": u.get("picture"),
        "organisme": u.get("organisme", os.environ.get("ORG_NAME", "Blade Academy")),
        "auth_provider": u.get("auth_provider", "local"),
    }


async def get_current_user(request: Request) -> dict:
    # 1. JWT cookie/header
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if token:
        try:
            payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") == "access":
                u = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
                if u:
                    return u
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            pass

    # 2. Emergent session cookie
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if session_token:
        session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if session:
            expires_at = session["expires_at"]
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > now_utc():
                u = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
                if u:
                    return u

    raise HTTPException(status_code=401, detail="Non authentifié")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
RoleType = Literal["admin", "formateur", "apprenant", "entreprise"]
SessionStatus = Literal["brouillon", "planification", "planifiee", "terminee", "archivee"]
ActionType = Literal["formation", "bilan_competences", "vae", "apprentissage"]


class RegisterPayload(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: RoleType = "admin"


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class SessionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nom: str
    code_interne: Optional[str] = None
    type_session: Literal["formation_professionnelle", "conseil"] = "formation_professionnelle"
    type_action: ActionType = "formation"
    statut: SessionStatus = "brouillon"
    formation_interne: bool = False
    sous_traitance: bool = False
    retire_catalogue: bool = False
    fuseau_horaire: str = "Europe/Paris"
    date_debut: Optional[str] = None
    date_fin: Optional[str] = None
    lieu_id: Optional[str] = None
    lieu_temporaire: Optional[str] = None
    distanciel: bool = False
    administrateurs: List[str] = Field(default_factory=list)
    formateurs: List[str] = Field(default_factory=list)
    apprenants: List[str] = Field(default_factory=list)
    entreprise_id: Optional[str] = None
    financeur_id: Optional[str] = None
    programme: Optional[str] = None
    categorie: Optional[str] = None
    niveau: Optional[str] = None
    prix_ht: float = 0.0
    cout_ht: float = 0.0
    inclus_bpf: bool = True
    description: Optional[str] = None


class ApprenantPayload(BaseModel):
    nom: str
    prenom: str
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None
    entreprise_id: Optional[str] = None
    date_naissance: Optional[str] = None
    adresse: Optional[str] = None
    dossier_cpf: Optional[str] = None
    notes: Optional[str] = None


class FormateurPayload(BaseModel):
    nom: str
    prenom: str
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None
    interne: bool = True
    specialites: List[str] = Field(default_factory=list)
    tarif_journalier: float = 0.0
    notes: Optional[str] = None


class EntreprisePayload(BaseModel):
    raison_sociale: str
    siret: Optional[str] = None
    adresse: Optional[str] = None
    code_postal: Optional[str] = None
    ville: Optional[str] = None
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None
    contact_nom: Optional[str] = None
    notes: Optional[str] = None


class FinanceurPayload(BaseModel):
    nom: str
    type_financeur: Literal["opco", "pole_emploi", "cpf", "entreprise", "autre"] = "opco"
    code: Optional[str] = None
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    notes: Optional[str] = None


class LieuPayload(BaseModel):
    nom: str
    adresse: Optional[str] = None
    code_postal: Optional[str] = None
    ville: Optional[str] = None
    capacite: int = 0
    equipements: List[str] = Field(default_factory=list)
    distanciel: bool = False
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def register(payload: RegisterPayload, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    user_id = new_id("usr_")
    doc = {
        "user_id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "auth_provider": "local",
        "organisme": os.environ.get("ORG_NAME", "Blade Academy"),
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    access = create_access_token(user_id, email, payload.role)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return public_user(doc)


@api.post("/auth/login")
async def login(payload: LoginPayload, response: Response):
    email = payload.email.lower().strip()
    u = await db.users.find_one({"email": email})
    if not u or not u.get("password_hash") or not verify_password(payload.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    access = create_access_token(u["user_id"], email, u.get("role", "admin"))
    refresh = create_refresh_token(u["user_id"])
    set_auth_cookies(response, access, refresh)
    return public_user(u)


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@api.post("/auth/emergent/session")
async def emergent_session(request: Request, response: Response):
    """Exchange an Emergent session_id for a persistent session_token cookie."""
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id requis")

    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Session Google invalide")
    data = r.json()

    email = data["email"].lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing.get("name")), "picture": data.get("picture"), "auth_provider": "google"}},
        )
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        user_id = new_id("usr_")
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name", ""),
            "picture": data.get("picture"),
            "role": "admin",
            "auth_provider": "google",
            "organisme": os.environ.get("ORG_NAME", "Blade Academy"),
            "created_at": now_utc().isoformat(),
        }
        await db.users.insert_one(user_doc)

    session_token = data["session_token"]
    expires_at = now_utc() + timedelta(days=7)
    await db.user_sessions.insert_one(
        {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": now_utc().isoformat(),
        }
    )
    response.set_cookie("session_token", session_token, httponly=True, secure=True, samesite="none", max_age=7 * 86400, path="/")
    return public_user(user_doc)


# ---------------------------------------------------------------------------
# Generic CRUD factory
# ---------------------------------------------------------------------------
def make_crud(name: str, collection: str, payload_model):
    """Generate list/create/get/update/delete endpoints for a collection."""

    @api.get(f"/{name}")
    async def list_items(q: Optional[str] = None, user: dict = Depends(get_current_user)):
        query = {}
        if q:
            query = {"$or": [
                {k: {"$regex": q, "$options": "i"}} for k in ("nom", "prenom", "email", "raison_sociale", "code_interne")
            ]}
        items = await db[collection].find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return items

    @api.post(f"/{name}")
    async def create_item(payload: payload_model, user: dict = Depends(get_current_user)):
        doc = payload.model_dump()
        doc["id"] = new_id()
        doc["created_at"] = now_utc().isoformat()
        doc["updated_at"] = doc["created_at"]
        await db[collection].insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.get(f"/{name}/{{item_id}}")
    async def get_item(item_id: str, user: dict = Depends(get_current_user)):
        doc = await db[collection].find_one({"id": item_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Introuvable")
        return doc

    @api.put(f"/{name}/{{item_id}}")
    async def update_item(item_id: str, payload: payload_model, user: dict = Depends(get_current_user)):
        doc = payload.model_dump()
        doc["updated_at"] = now_utc().isoformat()
        result = await db[collection].update_one({"id": item_id}, {"$set": doc})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Introuvable")
        updated = await db[collection].find_one({"id": item_id}, {"_id": 0})
        return updated

    @api.delete(f"/{name}/{{item_id}}")
    async def delete_item(item_id: str, user: dict = Depends(get_current_user)):
        result = await db[collection].delete_one({"id": item_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Introuvable")
        return {"ok": True}

    return list_items, create_item, get_item, update_item, delete_item


make_crud("apprenants", "apprenants", ApprenantPayload)
make_crud("formateurs", "formateurs", FormateurPayload)
make_crud("entreprises", "entreprises", EntreprisePayload)
make_crud("financeurs", "financeurs", FinanceurPayload)
make_crud("lieux", "lieux", LieuPayload)


# ---------------------------------------------------------------------------
# Sessions endpoints (custom because they have status transitions + progression)
# ---------------------------------------------------------------------------
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


@api.get("/sessions")
async def list_sessions(
    statut: Optional[str] = None,
    type_action: Optional[str] = None,
    administrateur: Optional[str] = None,
    formateur: Optional[str] = None,
    q: Optional[str] = None,
    user: dict = Depends(get_current_user),
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
    items = await db.sessions.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [with_progression(s) for s in items]


@api.post("/sessions")
async def create_session(payload: SessionPayload, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["code_interne"] = doc.get("code_interne") or f"SES-{now_utc().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
    doc["created_at"] = now_utc().isoformat()
    doc["updated_at"] = doc["created_at"]
    doc["convocations_envoyees"] = False
    doc["evaluations_envoyees"] = False
    doc["factures_emises"] = False
    doc["attestations_emises"] = False
    await db.sessions.insert_one(doc)
    doc.pop("_id", None)
    return with_progression(doc)


@api.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    doc = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return with_progression(doc)


@api.put("/sessions/{session_id}")
async def update_session(session_id: str, payload: SessionPayload, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["updated_at"] = now_utc().isoformat()
    result = await db.sessions.update_one({"id": session_id}, {"$set": doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session introuvable")
    updated = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    return with_progression(updated)


@api.patch("/sessions/{session_id}/statut")
async def update_session_status(session_id: str, body: dict, user: dict = Depends(get_current_user)):
    statut = body.get("statut")
    if statut not in ("brouillon", "planification", "planifiee", "terminee", "archivee"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    result = await db.sessions.update_one({"id": session_id}, {"$set": {"statut": statut, "updated_at": now_utc().isoformat()}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session introuvable")
    updated = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    return with_progression(updated)


@api.patch("/sessions/{session_id}/progression")
async def update_session_progression(session_id: str, body: dict, user: dict = Depends(get_current_user)):
    """Mark a progression flag (convocations_envoyees, evaluations_envoyees, factures_emises, attestations_emises)."""
    allowed = {"convocations_envoyees", "evaluations_envoyees", "factures_emises", "attestations_emises"}
    updates = {k: bool(v) for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="Aucun champ valide")
    updates["updated_at"] = now_utc().isoformat()
    await db.sessions.update_one({"id": session_id}, {"$set": updates})
    updated = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return with_progression(updated)


@api.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    result = await db.sessions.delete_one({"id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dashboard & calendar
# ---------------------------------------------------------------------------
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    total_sessions = await db.sessions.count_documents({})
    sessions_actives = await db.sessions.count_documents({"statut": {"$in": ["planification", "planifiee"]}})
    sessions_terminees = await db.sessions.count_documents({"statut": "terminee"})
    total_apprenants = await db.apprenants.count_documents({})
    total_formateurs = await db.formateurs.count_documents({})
    total_entreprises = await db.entreprises.count_documents({})

    # Compute CA : encaissements CPF réels (factures EDOF) + sessions hors CPF
    factures = await db.factures_cpf.find({}, {"_id": 0, "montant": 1, "statut_reglement": 1}).to_list(20000)
    ca_cpf = sum(f.get("montant", 0) for f in factures if str(f.get("statut_reglement", "")).lower().startswith("vers"))
    match = {"statut": {"$in": ["planifiee", "terminee"]}}
    if ca_cpf > 0:
        # Les sessions financées CPF sont déjà comptées via les factures (pas de double comptage)
        cpf_financeur = await db.financeurs.find_one({"type_financeur": "cpf"}, {"_id": 0, "id": 1})
        if cpf_financeur:
            match["financeur_id"] = {"$ne": cpf_financeur["id"]}
    pipeline = [
        {"$match": match},
        {"$group": {"_id": None, "ca": {"$sum": "$prix_ht"}, "cout": {"$sum": "$cout_ht"}}},
    ]
    agg = await db.sessions.aggregate(pipeline).to_list(1)
    ca_sessions = float(agg[0]["ca"]) if agg else 0.0
    cout = float(agg[0]["cout"]) if agg else 0.0
    ca = ca_sessions + ca_cpf

    # Sessions par statut (kanban counts)
    by_status = {}
    for s in ("brouillon", "planification", "planifiee", "terminee", "archivee"):
        by_status[s] = await db.sessions.count_documents({"statut": s})

    # Progression moyenne
    sessions = await db.sessions.find({"statut": {"$ne": "archivee"}}, {"_id": 0}).to_list(2000)
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


@api.get("/dashboard/calendar")
async def calendar(user: dict = Depends(get_current_user)):
    sessions = await db.sessions.find(
        {"statut": {"$in": ["planification", "planifiee", "terminee"]}, "date_debut": {"$ne": None}},
        {"_id": 0, "id": 1, "nom": 1, "code_interne": 1, "date_debut": 1, "date_fin": 1, "statut": 1, "distanciel": 1},
    ).to_list(500)
    return sessions


# ---------------------------------------------------------------------------
# Paramètres organisme (infos légales — utilisées sur les documents PDF)
# ---------------------------------------------------------------------------
DEFAULT_ORGANISME = {
    "nom": "Blade Academy",
    "forme_juridique": "SAS",
    "adresse": "26 Rue Jules Lefebvre",
    "code_postal": "02130",
    "ville": "Fère-en-Tardenois",
    "pays": "France",
    "siret": "984 617 654 00012",
    "rcs": "Soissons 984 617 654",
    "code_ape": "85.59A",
    "tva": "FR50984617654",
    "nda": "32020170602",
    "nda_region": "Hauts-de-France",
    "qualiopi_numero": "338511-1",
    "qualiopi_certificateur": "CERTIF OPAC",
    "email": "blade.academy@hotmail.com",
    "telephone": "+33 (0)6 51 21 84 87",
    "site_web": "https://blade-academy.fr",
}


class OrganismeSettings(BaseModel):
    nom: str = ""
    forme_juridique: str = ""
    adresse: str = ""
    code_postal: str = ""
    ville: str = ""
    pays: str = ""
    siret: str = ""
    rcs: str = ""
    code_ape: str = ""
    tva: str = ""
    nda: str = ""
    nda_region: str = ""
    qualiopi_numero: str = ""
    qualiopi_certificateur: str = ""
    email: str = ""
    telephone: str = ""
    site_web: str = ""


async def get_organisme() -> dict:
    doc = await db.organisme_settings.find_one({"key": "organisme"}, {"_id": 0, "key": 0})
    return doc or dict(DEFAULT_ORGANISME)


@api.get("/parametres/organisme")
async def read_organisme(user: dict = Depends(get_current_user)):
    return await get_organisme()


@api.put("/parametres/organisme")
async def update_organisme(payload: OrganismeSettings, user: dict = Depends(get_current_user)):
    await db.organisme_settings.update_one(
        {"key": "organisme"}, {"$set": payload.model_dump()}, upsert=True
    )


# ---------------------------------------------------------------------------
# Import EDOF / Mon Compte Formation (CPF)
# ---------------------------------------------------------------------------
class EdofCommitPayload(BaseModel):
    rows: List[Dict[str, Any]]
    mapping: Dict[str, Optional[str]]
    create_sessions: bool = True


@api.post("/import/edof/preview")
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


@api.post("/import/edof/commit")
async def edof_commit(payload: EdofCommitPayload, user: dict = Depends(get_current_user)):
    mapping = payload.mapping

    def val(row, field):
        col = mapping.get(field)
        return str(row.get(col) or "").strip() if col else ""

    if not mapping.get("nom") or not mapping.get("prenom"):
        raise HTTPException(status_code=400, detail="Les colonnes Nom et Prénom doivent être mappées")

    stats = {
        "apprenants_crees": 0,
        "apprenants_existants": 0,
        "sessions_creees": 0,
        "sessions_maj": 0,
        "lignes_ignorees": [],
    }
    today_iso = now_utc().date().isoformat()
    import_note = f"Importé depuis EDOF (CPF) le {now_utc().strftime('%d/%m/%Y')}"

    # Financeur CPF (find-or-create) pour rattacher les sessions créées
    financeur_cpf = None
    if payload.create_sessions:
        financeur_cpf = await db.financeurs.find_one({"type_financeur": "cpf"}, {"_id": 0})
        if not financeur_cpf:
            financeur_cpf = {
                "id": new_id(),
                "nom": "Caisse des Dépôts — Mon Compte Formation",
                "type_financeur": "cpf",
                "code": "CPF",
                "email": None, "telephone": None, "adresse": None,
                "notes": "Créé automatiquement lors de l'import EDOF.",
                "created_at": now_utc().isoformat(),
                "updated_at": now_utc().isoformat(),
            }
            await db.financeurs.insert_one(dict(financeur_cpf))
            financeur_cpf.pop("_id", None)

    session_groups: Dict[tuple, dict] = {}

    for i, row in enumerate(payload.rows):
        line_no = i + 2  # +1 en-tête, +1 indexation humaine
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
                "id": apprenant_id,
                "nom": nom,
                "prenom": prenom,
                "email": email or None,
                "telephone": val(row, "telephone") or None,
                "entreprise_id": None,
                "date_naissance": None,
                "adresse": None,
                "dossier_cpf": dossier or None,
                "notes": notes,
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
            key = (formation.lower(), d1 or "", d2 or "")
            group = session_groups.setdefault(key, {
                "nom": formation, "date_debut": d1, "date_fin": d2,
                "apprenants": [], "total": 0.0,
            })
            if apprenant_id not in group["apprenants"]:
                group["apprenants"].append(apprenant_id)
                group["total"] += parse_amount(val(row, "prix"))

    for group in session_groups.values():
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
                    nom=group["nom"],
                    statut=statut,
                    date_debut=group["date_debut"],
                    date_fin=group["date_fin"],
                    apprenants=group["apprenants"],
                    prix_ht=round(group["total"], 2),
                    financeur_id=financeur_cpf["id"] if financeur_cpf else None,
                    description=import_note + ".",
                ).model_dump(),
                "id": new_id(),
                "code_interne": f"SES-{now_utc().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}",
                "created_at": now_iso,
                "updated_at": now_iso,
                "convocations_envoyees": False,
                "evaluations_envoyees": False,
                "factures_emises": False,
                "attestations_emises": False,
            })
            stats["sessions_creees"] += 1

    return stats


# ---------------------------------------------------------------------------
# Facturation CPF (import de l'export "Factures" EDOF + suivi des encaissements)
# ---------------------------------------------------------------------------
@api.post("/factures-cpf/import")
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


@api.get("/factures-cpf")
async def list_factures_cpf(q: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    query = {}
    if q:
        query = {"$or": [
            {"numero_dossier": {"$regex": re.escape(q), "$options": "i"}},
            {"numero_facture": {"$regex": re.escape(q), "$options": "i"}},
        ]}
    factures = await db.factures_cpf.find(query, {"_id": 0}).sort("date_emission", -1).to_list(2000)
    # Lien factures ↔ stagiaires via le n° de dossier CPF
    apprenants_map = {}
    async for a in db.apprenants.find({"dossier_cpf": {"$nin": [None, ""]}}, {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "dossier_cpf": 1}):
        apprenants_map[a["dossier_cpf"]] = a
    for f in factures:
        linked = apprenants_map.get(f.get("numero_dossier"))
        f["apprenant"] = {"id": linked["id"], "nom": linked["nom"], "prenom": linked["prenom"]} if linked else None
    return factures


@api.get("/factures-cpf/stats")
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


# ---------------------------------------------------------------------------
# Documents des apprenants (stockage de fichiers persistant)
# ---------------------------------------------------------------------------
CATEGORIES_DOCUMENTS_APPRENANT = {
    "certificat", "convocation_certification", "facture", "attestation_assiduite",
    "releve_connexion", "contrat", "emargement", "dpc", "convention", "communications", "autre",
}


@api.get("/apprenants/{apprenant_id}/documents")
async def list_documents_apprenant(apprenant_id: str, user: dict = Depends(get_current_user)):
    return await db.apprenant_documents.find(
        {"apprenant_id": apprenant_id, "is_deleted": False}, {"_id": 0}
    ).sort("uploaded_at", -1).to_list(500)


@api.post("/apprenants/{apprenant_id}/documents")
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


@api.get("/documents-apprenants/{doc_id}/download")
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


@api.delete("/documents-apprenants/{doc_id}")
async def delete_document_apprenant(doc_id: str, user: dict = Depends(get_current_user)):
    result = await db.apprenant_documents.update_one({"id": doc_id}, {"$set": {"is_deleted": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document introuvable")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Fusion de fiches apprenants en double
# ---------------------------------------------------------------------------
class FusionPayload(BaseModel):
    apprenant_ids: List[str]


@api.post("/apprenants/fusionner")
async def fusionner_apprenants(payload: FusionPayload, user: dict = Depends(get_current_user)):
    if len(payload.apprenant_ids) < 2:
        raise HTTPException(status_code=400, detail="Au moins deux fiches sont nécessaires pour fusionner")
    fiches = await db.apprenants.find({"id": {"$in": payload.apprenant_ids}}, {"_id": 0}).to_list(100)
    if len(fiches) < 2:
        raise HTTPException(status_code=404, detail="Fiches introuvables")
    # La fiche conservée = la plus ancienne ; elle est enrichie avec les champs manquants
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

    # Réaffecter les sessions
    sessions_touchees = 0
    async for s in db.sessions.find({"apprenants": {"$in": doublon_ids}}, {"_id": 0, "id": 1, "apprenants": 1}):
        nouveaux = [a for a in s.get("apprenants", []) if a not in doublon_ids]
        if cible["id"] not in nouveaux:
            nouveaux.append(cible["id"])
        await db.sessions.update_one(
            {"id": s["id"]}, {"$set": {"apprenants": nouveaux, "updated_at": now_utc().isoformat()}}
        )
        sessions_touchees += 1

    # Réaffecter les documents puis supprimer les doublons
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


# ---------------------------------------------------------------------------
# Qualité des données — détection de doublons
# ---------------------------------------------------------------------------
@api.get("/qualite/doublons")
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
            # Déjà signalé par email identique → on ne le répète que si les emails diffèrent ou manquent
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


# ---------------------------------------------------------------------------
# Documents PDF réglementaires (voir documents.py)
# ---------------------------------------------------------------------------
DOC_TITLES = {
    "convention": "Convention de formation professionnelle",
    "contrat": "Contrat de formation",
    "convocation": "Convocation à la formation",
    "attestation": "Attestation de fin de formation",
    "facture": "Facture",
    "emargement": "Feuille d'émargement",
    "programme": "Programme de formation",
    "evaluation": "Évaluation de la formation",
}


@api.get("/documents/session/{session_id}/{doc_type}")
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


# Classement automatique des PDF générés dans les fiches des stagiaires
DOC_TYPE_TO_CATEGORIE = {
    "convention": "convention",
    "contrat": "contrat",
    "convocation": "convocation_certification",
    "attestation": "attestation_assiduite",
    "facture": "facture",
    "emargement": "emargement",
    "programme": "autre",
    "evaluation": "autre",
}


@api.post("/documents/session/{session_id}/{doc_type}/classer")
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


# ---------------------------------------------------------------------------
# Purge des données de démonstration (seed)
# ---------------------------------------------------------------------------
DEMO_SESSION_CODES = ["SES-2026-AGILE-01", "SES-2026-CYBER-02", "SES-2026-BILAN-03", "SES-2026-MGT-04"]
DEMO_APPRENANT_EMAILS = ["j.petit@acme.fr", "e.rousseau@acme.fr", "l.bertrand@solaris.fr", "m.faure@solaris.fr", "h.robin@nordique.fr"]
DEMO_FORMATEUR_EMAILS = ["c.lefebvre@blade-academy.fr", "a.moreau@externe.fr", "i.garcia@blade-academy.fr"]
DEMO_ENTREPRISE_SIRETS = ["12345678900012", "98765432100018", "45678912300026"]
DEMO_FINANCEUR_NOMS = ["OPCO Atlas", "OPCO EP"]  # le financeur CPF est conservé (utilisé par l'import EDOF)
DEMO_LIEU_NOMS = ["Centre Blade Academy Paris", "Espace Lyon Confluence", "Distanciel - Zoom"]


@api.post("/parametres/purge-demo")
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
    # Empêche le seed de réinsérer les données de démo au prochain démarrage
    await db.meta.update_one({"key": "demo_purged"}, {"$set": {"key": "demo_purged", "at": now_utc().isoformat()}}, upsert=True)
    return res


# ---------------------------------------------------------------------------
# Seed + startup
# ---------------------------------------------------------------------------
async def seed():
    # --- Migration idempotente de rebranding (FormaPro -> Blade Academy) ---
    # Nécessaire pour mettre à jour les bases existantes (dev ET production).
    old_admin = await db.users.find_one({"email": "admin@formapro.fr"})
    if old_admin and not await db.users.find_one({"email": "admin@blade-academy.fr"}):
        await db.users.update_one(
            {"email": "admin@formapro.fr"},
            {"$set": {"email": "admin@blade-academy.fr", "name": "Admin Blade Academy"}},
        )
    await db.users.update_many(
        {"organisme": {"$in": ["FormaPro", "FormaPro Académie"]}},
        {"$set": {"organisme": "Blade Academy"}},
    )
    await db.lieux.update_many({"nom": "Centre FormaPro Paris"}, {"$set": {"nom": "Centre Blade Academy Paris"}})
    async for f in db.formateurs.find({"email": {"$regex": "@formapro\\.fr$"}}):
        await db.formateurs.update_one(
            {"id": f["id"]},
            {"$set": {"email": f["email"].replace("@formapro.fr", "@blade-academy.fr")}},
        )

    # Infos légales de l'organisme (pré-remplies Blade Academy si absentes)
    if not await db.organisme_settings.find_one({"key": "organisme"}):
        await db.organisme_settings.insert_one({"key": "organisme", **DEFAULT_ORGANISME})

    # Admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@blade-academy.fr")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "user_id": new_id("usr_"),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": os.environ.get("ADMIN_NAME", "Admin"),
            "role": "admin",
            "auth_provider": "local",
            "organisme": os.environ.get("ORG_NAME", "Blade Academy"),
            "created_at": now_utc().isoformat(),
        })
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    # Demo entities (only if empty — et jamais si l'utilisateur a purgé la démo)
    if await db.meta.find_one({"key": "demo_purged"}):
        return
    if await db.entreprises.count_documents({}) == 0:
        entreprises = [
            {"id": new_id(), "raison_sociale": "Acme Industries", "siret": "12345678900012", "ville": "Paris", "email": "contact@acme.fr", "contact_nom": "Sophie Bernard", "created_at": now_utc().isoformat()},
            {"id": new_id(), "raison_sociale": "Solaris Tech", "siret": "98765432100018", "ville": "Lyon", "email": "rh@solaris.fr", "contact_nom": "Marc Dubois", "created_at": now_utc().isoformat()},
            {"id": new_id(), "raison_sociale": "Nordique Conseil", "siret": "45678912300026", "ville": "Lille", "email": "contact@nordique.fr", "contact_nom": "Léa Martin", "created_at": now_utc().isoformat()},
        ]
        await db.entreprises.insert_many(entreprises)

    if await db.formateurs.count_documents({}) == 0:
        formateurs = [
            {"id": new_id(), "nom": "Lefebvre", "prenom": "Camille", "email": "c.lefebvre@blade-academy.fr", "interne": True, "specialites": ["Gestion de projet", "Agile"], "tarif_journalier": 850, "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Moreau", "prenom": "Antoine", "email": "a.moreau@externe.fr", "interne": False, "specialites": ["Cybersécurité"], "tarif_journalier": 1200, "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Garcia", "prenom": "Inès", "email": "i.garcia@blade-academy.fr", "interne": True, "specialites": ["Communication", "Management"], "tarif_journalier": 950, "created_at": now_utc().isoformat()},
        ]
        await db.formateurs.insert_many(formateurs)

    if await db.apprenants.count_documents({}) == 0:
        apprenants = [
            {"id": new_id(), "nom": "Petit", "prenom": "Julien", "email": "j.petit@acme.fr", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Rousseau", "prenom": "Émilie", "email": "e.rousseau@acme.fr", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Bertrand", "prenom": "Lucas", "email": "l.bertrand@solaris.fr", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Faure", "prenom": "Manon", "email": "m.faure@solaris.fr", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Robin", "prenom": "Hugo", "email": "h.robin@nordique.fr", "created_at": now_utc().isoformat()},
        ]
        await db.apprenants.insert_many(apprenants)

    if await db.financeurs.count_documents({}) == 0:
        financeurs = [
            {"id": new_id(), "nom": "OPCO Atlas", "type_financeur": "opco", "code": "ATLAS", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "OPCO EP", "type_financeur": "opco", "code": "EP", "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "CPF Direct", "type_financeur": "cpf", "code": "CPF", "created_at": now_utc().isoformat()},
        ]
        await db.financeurs.insert_many(financeurs)

    if await db.lieux.count_documents({}) == 0:
        lieux = [
            {"id": new_id(), "nom": "Centre Blade Academy Paris", "adresse": "12 rue de la République", "code_postal": "75011", "ville": "Paris", "capacite": 20, "distanciel": False, "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Espace Lyon Confluence", "adresse": "5 cours Charlemagne", "code_postal": "69002", "ville": "Lyon", "capacite": 15, "distanciel": False, "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Distanciel - Zoom", "capacite": 100, "distanciel": True, "created_at": now_utc().isoformat()},
        ]
        await db.lieux.insert_many(lieux)

    if await db.sessions.count_documents({}) == 0:
        admin_user = await db.users.find_one({"email": admin_email}, {"_id": 0})
        admin_id = admin_user["user_id"] if admin_user else ""
        formateurs = await db.formateurs.find({}, {"_id": 0}).to_list(10)
        apprenants = await db.apprenants.find({}, {"_id": 0}).to_list(10)
        entreprises = await db.entreprises.find({}, {"_id": 0}).to_list(10)
        lieux = await db.lieux.find({}, {"_id": 0}).to_list(10)

        demo_sessions = [
            {
                "id": new_id(), "nom": "Initiation Scrum Master", "code_interne": "SES-2026-AGILE-01",
                "type_session": "formation_professionnelle", "type_action": "formation",
                "statut": "planifiee", "formation_interne": False, "sous_traitance": False, "retire_catalogue": False,
                "fuseau_horaire": "Europe/Paris", "date_debut": "2026-03-10", "date_fin": "2026-03-12",
                "lieu_id": lieux[0]["id"] if lieux else None, "distanciel": False,
                "administrateurs": [admin_id], "formateurs": [formateurs[0]["id"]] if formateurs else [],
                "apprenants": [a["id"] for a in apprenants[:3]],
                "entreprise_id": entreprises[0]["id"] if entreprises else None,
                "programme": "Scrum & Agile", "categorie": "Management", "niveau": "Débutant",
                "prix_ht": 4500.0, "cout_ht": 2400.0, "inclus_bpf": True,
                "description": "Formation Scrum Master sur 3 jours pour équipes produit.",
                "convocations_envoyees": True, "evaluations_envoyees": False,
                "factures_emises": True, "attestations_emises": False,
                "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
            },
            {
                "id": new_id(), "nom": "Cybersécurité — Fondamentaux", "code_interne": "SES-2026-CYBER-02",
                "type_session": "formation_professionnelle", "type_action": "formation",
                "statut": "planification", "formation_interne": False, "sous_traitance": False, "retire_catalogue": False,
                "fuseau_horaire": "Europe/Paris", "date_debut": "2026-04-05", "date_fin": "2026-04-07",
                "lieu_id": lieux[2]["id"] if len(lieux) > 2 else None, "distanciel": True,
                "administrateurs": [admin_id], "formateurs": [formateurs[1]["id"]] if len(formateurs) > 1 else [],
                "apprenants": [a["id"] for a in apprenants[2:5]],
                "entreprise_id": entreprises[1]["id"] if len(entreprises) > 1 else None,
                "programme": "Cyber 101", "categorie": "Sécurité", "niveau": "Intermédiaire",
                "prix_ht": 6800.0, "cout_ht": 4100.0, "inclus_bpf": True,
                "description": "Formation distancielle sur les fondamentaux de la cybersécurité.",
                "convocations_envoyees": False, "evaluations_envoyees": False,
                "factures_emises": False, "attestations_emises": False,
                "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
            },
            {
                "id": new_id(), "nom": "Bilan de Compétences", "code_interne": "SES-2026-BILAN-03",
                "type_session": "conseil", "type_action": "bilan_competences",
                "statut": "terminee", "formation_interne": False, "sous_traitance": False, "retire_catalogue": False,
                "fuseau_horaire": "Europe/Paris", "date_debut": "2026-01-15", "date_fin": "2026-02-28",
                "lieu_id": lieux[1]["id"] if len(lieux) > 1 else None, "distanciel": False,
                "administrateurs": [admin_id], "formateurs": [formateurs[2]["id"]] if len(formateurs) > 2 else [],
                "apprenants": [apprenants[4]["id"]] if len(apprenants) > 4 else [],
                "entreprise_id": entreprises[2]["id"] if len(entreprises) > 2 else None,
                "programme": "Bilan 24h", "categorie": "Conseil RH", "niveau": "Tous niveaux",
                "prix_ht": 2400.0, "cout_ht": 1200.0, "inclus_bpf": True,
                "description": "Accompagnement individuel sur 24h réparties sur 6 semaines.",
                "convocations_envoyees": True, "evaluations_envoyees": True,
                "factures_emises": True, "attestations_emises": True,
                "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
            },
            {
                "id": new_id(), "nom": "Brouillon — Management 360°", "code_interne": "SES-2026-MGT-04",
                "type_session": "formation_professionnelle", "type_action": "formation",
                "statut": "brouillon", "formation_interne": True, "sous_traitance": False, "retire_catalogue": True,
                "fuseau_horaire": "Europe/Paris", "date_debut": None, "date_fin": None,
                "lieu_id": None, "distanciel": False,
                "administrateurs": [admin_id], "formateurs": [], "apprenants": [],
                "entreprise_id": None, "programme": "Management avancé", "categorie": "Management", "niveau": "Avancé",
                "prix_ht": 0.0, "cout_ht": 0.0, "inclus_bpf": False,
                "description": "À planifier - parcours Management 360° pour cadres dirigeants.",
                "convocations_envoyees": False, "evaluations_envoyees": False,
                "factures_emises": False, "attestations_emises": False,
                "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat(),
            },
        ]
        await db.sessions.insert_many(demo_sessions)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.sessions.create_index("id", unique=True)
    await db.user_sessions.create_index("session_token")
    await seed()
    logger.info("Blade Academy API ready ✅")


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ---------------------------------------------------------------------------
# Root + mount
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"service": "Blade Academy API", "version": "1.0.0"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
