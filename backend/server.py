"""FormaPro - Backend API.

Plateforme de gestion d'organisme de formation.
FastAPI + MongoDB monolithic server (MVP).
"""

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import io
import os
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from reportlab.lib import colors

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("formapro")

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

    # Compute CA from active+terminated sessions
    pipeline = [
        {"$match": {"statut": {"$in": ["planifiee", "terminee"]}}},
        {"$group": {"_id": None, "ca": {"$sum": "$prix_ht"}, "cout": {"$sum": "$cout_ht"}}},
    ]
    agg = await db.sessions.aggregate(pipeline).to_list(1)
    ca = float(agg[0]["ca"]) if agg else 0.0
    cout = float(agg[0]["cout"]) if agg else 0.0

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
        "marge": ca - cout,
        "taux_marge": round((ca - cout) / ca * 100, 1) if ca > 0 else 0.0,
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
# Document generation (PDF) — basic ReportLab
# ---------------------------------------------------------------------------
def build_pdf(title: str, lines: List[str]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    # Header band
    c.setFillColor(colors.HexColor("#2563EB"))
    c.rect(0, height - 3 * cm, width, 3 * cm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(2 * cm, height - 2 * cm, os.environ.get("ORG_NAME", "Blade Academy"))
    c.setFont("Helvetica", 10)
    c.drawString(2 * cm, height - 2.6 * cm, "Organisme de formation certifié Qualiopi")

    # Title
    c.setFillColor(colors.HexColor("#0F172A"))
    c.setFont("Helvetica-Bold", 16)
    c.drawString(2 * cm, height - 4.5 * cm, title)

    # Body
    c.setFont("Helvetica", 11)
    y = height - 5.8 * cm
    for line in lines:
        if y < 3 * cm:
            c.showPage()
            y = height - 2 * cm
        c.setFillColor(colors.HexColor("#0F172A"))
        c.drawString(2 * cm, y, line[:110])
        y -= 0.7 * cm

    # Footer
    c.setFillColor(colors.HexColor("#64748B"))
    c.setFont("Helvetica", 8)
    c.drawString(2 * cm, 1.5 * cm, f"Document généré le {now_utc().strftime('%d/%m/%Y à %H:%M UTC')}")
    c.drawRightString(width - 2 * cm, 1.5 * cm, "Conforme Qualiopi - Blade Academy")

    c.save()
    buf.seek(0)
    return buf.read()


@api.get("/documents/session/{session_id}/{doc_type}")
async def generate_document(session_id: str, doc_type: str, user: dict = Depends(get_current_user)):
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")

    valid = {
        "convention": "Convention de formation professionnelle",
        "contrat": "Contrat de formation",
        "convocation": "Convocation à la formation",
        "attestation": "Attestation de fin de formation",
        "facture": "Facture",
        "emargement": "Feuille d'émargement",
        "programme": "Programme de formation",
        "evaluation": "Évaluation de la formation",
    }
    if doc_type not in valid:
        raise HTTPException(status_code=400, detail="Type de document invalide")

    lines = [
        f"Session : {session['nom']}",
        f"Code interne : {session.get('code_interne', '-')}",
        f"Type d'action : {session.get('type_action', '-')}",
        f"Date de début : {session.get('date_debut') or 'À définir'}",
        f"Date de fin : {session.get('date_fin') or 'À définir'}",
        f"Modalité : {'Distanciel' if session.get('distanciel') else 'Présentiel'}",
        f"Prix HT : {session.get('prix_ht', 0):.2f} EUR",
        "",
        "Nombre de formateurs : %d" % len(session.get("formateurs", [])),
        "Nombre d'apprenants : %d" % len(session.get("apprenants", [])),
        "",
        "Article 1 - Objet",
        "Le présent document a valeur conformément à la réglementation Qualiopi.",
        "Article 2 - Modalités",
        "Le présent document est généré automatiquement par la plateforme Blade Academy.",
    ]
    pdf = build_pdf(valid[doc_type], lines)
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc_type}_{session.get("code_interne", session_id)}.pdf"'},
    )


# ---------------------------------------------------------------------------
# Seed + startup
# ---------------------------------------------------------------------------
async def seed():
    # Admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@formapro.fr")
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

    # Demo entities (only if empty)
    if await db.entreprises.count_documents({}) == 0:
        entreprises = [
            {"id": new_id(), "raison_sociale": "Acme Industries", "siret": "12345678900012", "ville": "Paris", "email": "contact@acme.fr", "contact_nom": "Sophie Bernard", "created_at": now_utc().isoformat()},
            {"id": new_id(), "raison_sociale": "Solaris Tech", "siret": "98765432100018", "ville": "Lyon", "email": "rh@solaris.fr", "contact_nom": "Marc Dubois", "created_at": now_utc().isoformat()},
            {"id": new_id(), "raison_sociale": "Nordique Conseil", "siret": "45678912300026", "ville": "Lille", "email": "contact@nordique.fr", "contact_nom": "Léa Martin", "created_at": now_utc().isoformat()},
        ]
        await db.entreprises.insert_many(entreprises)

    if await db.formateurs.count_documents({}) == 0:
        formateurs = [
            {"id": new_id(), "nom": "Lefebvre", "prenom": "Camille", "email": "c.lefebvre@formapro.fr", "interne": True, "specialites": ["Gestion de projet", "Agile"], "tarif_journalier": 850, "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Moreau", "prenom": "Antoine", "email": "a.moreau@externe.fr", "interne": False, "specialites": ["Cybersécurité"], "tarif_journalier": 1200, "created_at": now_utc().isoformat()},
            {"id": new_id(), "nom": "Garcia", "prenom": "Inès", "email": "i.garcia@formapro.fr", "interne": True, "specialites": ["Communication", "Management"], "tarif_journalier": 950, "created_at": now_utc().isoformat()},
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
            {"id": new_id(), "nom": "Centre FormaPro Paris", "adresse": "12 rue de la République", "code_postal": "75011", "ville": "Paris", "capacite": 20, "distanciel": False, "created_at": now_utc().isoformat()},
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
    logger.info("FormaPro API ready ✅")


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
