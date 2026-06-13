"""CRM Formation - Backend API.

FastAPI + MongoDB. Gestion de stagiaires en formation:
- Formateurs (CRUD)
- Stagiaires (CRUD + workflow Kanban + archivage)
- Documents (upload/download/delete)
"""
from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import shutil
from pathlib import Path
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, EmailStr
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="CRM Formation API")
api_router = APIRouter(prefix="/api")

# ---------- Models ----------

StatusLiteral = Literal[
    "devis_attente",
    "devis_valide",
    "en_formation",
    "fin_formation",
    "facture",
    "regle",
]

FinanceurLiteral = Literal["OPCO", "CPF", "Privé"]
DocTypeLiteral = Literal["devis_signe", "attestation", "facture", "justificatif_paiement"]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Formateur(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    prenom: str
    email: Optional[str] = None
    telephone: Optional[str] = None
    specialite: Optional[str] = None
    created_at: str = Field(default_factory=utc_now_iso)


class FormateurCreate(BaseModel):
    nom: str
    prenom: str
    email: Optional[str] = None
    telephone: Optional[str] = None
    specialite: Optional[str] = None


class FormateurUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    specialite: Optional[str] = None


class Document(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    stagiaire_id: str
    type: DocTypeLiteral
    filename: str
    original_filename: str
    content_type: str
    size: int
    uploaded_at: str = Field(default_factory=utc_now_iso)


class Stagiaire(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    prenom: str
    date_naissance: Optional[str] = None
    adresse: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    formateur_id: Optional[str] = None
    formateur_nom: Optional[str] = None
    financeur: FinanceurLiteral
    financeur_detail: Optional[str] = None  # ex: nom de l'OPCO
    formation: Optional[str] = None
    status: StatusLiteral = "devis_attente"
    date_entree: str = Field(default_factory=utc_now_iso)
    date_debut_formation: Optional[str] = None
    date_fin_formation: Optional[str] = None
    date_cloture: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=utc_now_iso)


class StagiaireCreate(BaseModel):
    nom: str
    prenom: str
    date_naissance: Optional[str] = None
    adresse: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    formateur_id: Optional[str] = None
    financeur: FinanceurLiteral
    financeur_detail: Optional[str] = None
    formation: Optional[str] = None
    notes: Optional[str] = None


class StagiaireUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    date_naissance: Optional[str] = None
    adresse: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    formateur_id: Optional[str] = None
    financeur: Optional[FinanceurLiteral] = None
    financeur_detail: Optional[str] = None
    formation: Optional[str] = None
    date_debut_formation: Optional[str] = None
    date_fin_formation: Optional[str] = None
    notes: Optional[str] = None


class StatusUpdate(BaseModel):
    status: StatusLiteral


# ---------- Helpers ----------

def clean(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc.pop("_id")
    return doc


async def attach_formateur_name(stagiaire: dict) -> dict:
    fid = stagiaire.get("formateur_id")
    if fid:
        f = await db.formateurs.find_one({"id": fid}, {"_id": 0})
        if f:
            stagiaire["formateur_nom"] = f"{f.get('prenom', '')} {f.get('nom', '')}".strip()
    return stagiaire


# ---------- Routes : Health ----------

@api_router.get("/")
async def root():
    return {"service": "CRM Formation API", "status": "ok"}


# ---------- Routes : Formateurs ----------

@api_router.get("/formateurs", response_model=List[Formateur])
async def list_formateurs():
    items = await db.formateurs.find({}, {"_id": 0}).sort("nom", 1).to_list(1000)
    return items


@api_router.post("/formateurs", response_model=Formateur)
async def create_formateur(payload: FormateurCreate):
    f = Formateur(**payload.model_dump())
    await db.formateurs.insert_one(f.model_dump())
    return f


@api_router.get("/formateurs/{formateur_id}", response_model=Formateur)
async def get_formateur(formateur_id: str):
    f = await db.formateurs.find_one({"id": formateur_id}, {"_id": 0})
    if not f:
        raise HTTPException(404, "Formateur introuvable")
    return f


@api_router.put("/formateurs/{formateur_id}", response_model=Formateur)
async def update_formateur(formateur_id: str, payload: FormateurUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Aucune donnée à mettre à jour")
    result = await db.formateurs.update_one({"id": formateur_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(404, "Formateur introuvable")
    f = await db.formateurs.find_one({"id": formateur_id}, {"_id": 0})
    return f


@api_router.delete("/formateurs/{formateur_id}")
async def delete_formateur(formateur_id: str):
    # Détache d'éventuels stagiaires
    await db.stagiaires.update_many({"formateur_id": formateur_id}, {"$set": {"formateur_id": None}})
    result = await db.formateurs.delete_one({"id": formateur_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Formateur introuvable")
    return {"deleted": True}


# ---------- Routes : Stagiaires ----------

@api_router.get("/stagiaires", response_model=List[Stagiaire])
async def list_stagiaires(status: Optional[str] = None, closed: Optional[bool] = None):
    query: dict = {}
    if status:
        query["status"] = status
    if closed is True:
        query["status"] = "regle"
    elif closed is False:
        query["status"] = {"$ne": "regle"}
    items = await db.stagiaires.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    for s in items:
        await attach_formateur_name(s)
    return items


@api_router.get("/stagiaires/active", response_model=List[Stagiaire])
async def list_active_stagiaires():
    items = await db.stagiaires.find({"status": {"$ne": "regle"}}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    for s in items:
        await attach_formateur_name(s)
    return items


@api_router.get("/stagiaires/closed", response_model=List[Stagiaire])
async def list_closed_stagiaires(q: Optional[str] = None):
    query: dict = {"status": "regle"}
    if q:
        regex = {"$regex": q, "$options": "i"}
        # On filtrera côté Python sur formateur_nom (calculé) en sus
        query["$or"] = [
            {"nom": regex},
            {"prenom": regex},
            {"financeur_detail": regex},
            {"formation": regex},
        ]
    items = await db.stagiaires.find(query, {"_id": 0}).sort("date_cloture", -1).to_list(5000)
    for s in items:
        await attach_formateur_name(s)
    # Filtrage supplémentaire par formateur_nom si recherche
    if q:
        ql = q.lower()
        # Si une partie ne matche pas via $or, on inclut tous ceux dont le nom du formateur matche
        all_closed = await db.stagiaires.find({"status": "regle"}, {"_id": 0}).to_list(5000)
        extras = []
        existing_ids = {s["id"] for s in items}
        for s in all_closed:
            await attach_formateur_name(s)
            fn = (s.get("formateur_nom") or "").lower()
            if ql in fn and s["id"] not in existing_ids:
                extras.append(s)
        items.extend(extras)
    return items


@api_router.get("/stagiaires/{stagiaire_id}", response_model=Stagiaire)
async def get_stagiaire(stagiaire_id: str):
    s = await db.stagiaires.find_one({"id": stagiaire_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Stagiaire introuvable")
    await attach_formateur_name(s)
    return s


@api_router.post("/stagiaires", response_model=Stagiaire)
async def create_stagiaire(payload: StagiaireCreate):
    s = Stagiaire(**payload.model_dump())
    doc = s.model_dump()
    doc.pop("formateur_nom", None)  # toujours recalculé
    await db.stagiaires.insert_one(doc)
    saved = await db.stagiaires.find_one({"id": s.id}, {"_id": 0})
    await attach_formateur_name(saved)
    return saved


@api_router.put("/stagiaires/{stagiaire_id}", response_model=Stagiaire)
async def update_stagiaire(stagiaire_id: str, payload: StagiaireUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Aucune donnée à mettre à jour")
    result = await db.stagiaires.update_one({"id": stagiaire_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(404, "Stagiaire introuvable")
    s = await db.stagiaires.find_one({"id": stagiaire_id}, {"_id": 0})
    await attach_formateur_name(s)
    return s


@api_router.patch("/stagiaires/{stagiaire_id}/status", response_model=Stagiaire)
async def update_status(stagiaire_id: str, payload: StatusUpdate):
    s = await db.stagiaires.find_one({"id": stagiaire_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Stagiaire introuvable")
    updates = {"status": payload.status}
    # Si passage à 'regle' (Réglée) → archivage
    if payload.status == "regle" and s.get("status") != "regle":
        updates["date_cloture"] = utc_now_iso()
    # Si passage à 'en_formation' et pas de date début → set today
    if payload.status == "en_formation" and not s.get("date_debut_formation"):
        updates["date_debut_formation"] = utc_now_iso()
    # Si passage à 'fin_formation' et pas de date fin → set today
    if payload.status == "fin_formation" and not s.get("date_fin_formation"):
        updates["date_fin_formation"] = utc_now_iso()
    await db.stagiaires.update_one({"id": stagiaire_id}, {"$set": updates})
    s = await db.stagiaires.find_one({"id": stagiaire_id}, {"_id": 0})
    await attach_formateur_name(s)
    return s


@api_router.delete("/stagiaires/{stagiaire_id}")
async def delete_stagiaire(stagiaire_id: str):
    # Supprime aussi les documents associés sur disque
    docs = await db.documents.find({"stagiaire_id": stagiaire_id}, {"_id": 0}).to_list(1000)
    for d in docs:
        fpath = UPLOAD_DIR / d["filename"]
        if fpath.exists():
            fpath.unlink()
    await db.documents.delete_many({"stagiaire_id": stagiaire_id})
    result = await db.stagiaires.delete_one({"id": stagiaire_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Stagiaire introuvable")
    return {"deleted": True}


# ---------- Routes : Documents ----------

@api_router.get("/stagiaires/{stagiaire_id}/documents", response_model=List[Document])
async def list_documents(stagiaire_id: str):
    items = await db.documents.find({"stagiaire_id": stagiaire_id}, {"_id": 0}).sort("uploaded_at", -1).to_list(1000)
    return items


@api_router.post("/stagiaires/{stagiaire_id}/documents", response_model=Document)
async def upload_document(
    stagiaire_id: str,
    type: DocTypeLiteral = Form(...),
    file: UploadFile = File(...),
):
    s = await db.stagiaires.find_one({"id": stagiaire_id}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Stagiaire introuvable")
    doc_id = str(uuid.uuid4())
    ext = Path(file.filename or "").suffix
    stored_name = f"{doc_id}{ext}"
    file_path = UPLOAD_DIR / stored_name
    with file_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    size = file_path.stat().st_size
    document = Document(
        id=doc_id,
        stagiaire_id=stagiaire_id,
        type=type,
        filename=stored_name,
        original_filename=file.filename or stored_name,
        content_type=file.content_type or "application/octet-stream",
        size=size,
    )
    await db.documents.insert_one(document.model_dump())
    return document


@api_router.get("/documents/{document_id}/download")
async def download_document(document_id: str):
    d = await db.documents.find_one({"id": document_id}, {"_id": 0})
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


@api_router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    d = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Document introuvable")
    file_path = UPLOAD_DIR / d["filename"]
    if file_path.exists():
        file_path.unlink()
    await db.documents.delete_one({"id": document_id})
    return {"deleted": True}


# ---------- Stats utilitaires (Dashboard) ----------

@api_router.get("/stats")
async def stats():
    pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    cursor = db.stagiaires.aggregate(pipeline)
    by_status = {doc["_id"]: doc["count"] async for doc in cursor}
    total = await db.stagiaires.count_documents({})
    closed = await db.stagiaires.count_documents({"status": "regle"})
    return {
        "total": total,
        "actifs": total - closed,
        "clotures": closed,
        "by_status": by_status,
    }


# ---------- Wiring ----------

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("crm")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
