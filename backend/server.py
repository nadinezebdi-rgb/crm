"""Blade Academy CRM - Backend API entry point.

Plateforme de gestion d'organisme de formation (Qualiopi / BPF / CPF).
FastAPI + MongoDB ; routes modulaires dans /app/backend/routes/.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

import deps
from deps import init_mongo, close_mongo
from seed import seed
from routes.auth import router as auth_router
from routes.crud import router as crud_router
from routes.sessions import router as sessions_router
from routes.dashboard import router as dashboard_router
from routes.parametres import router as parametres_router
from routes.imports import router as imports_router
from routes.documents import router as documents_router
from routes.dossiers import router as dossiers_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("blade_academy")

app = FastAPI(title="Blade Academy API")

api = APIRouter(prefix="/api")
api.include_router(auth_router)
api.include_router(crud_router)
api.include_router(sessions_router)
api.include_router(dashboard_router)
api.include_router(parametres_router)
api.include_router(imports_router)
api.include_router(documents_router)
api.include_router(dossiers_router)


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


@app.on_event("startup")
async def startup():
    # Initialize MongoDB connection and collections
    try:
        await init_mongo()
    except RuntimeError as e:
        logger.error(f"MongoDB initialization failed: {e}")
        raise
    except Exception as e:
        logger.error(f"Database connection error: {e}. Ensure MongoDB is running at {os.environ.get('MONGO_URL', 'mongodb://localhost:27017')}")
        raise
    
    try:
        await deps.db.users.create_index("email", unique=True)
        await deps.db.users.create_index("user_id", unique=True)
        await deps.db.sessions.create_index("id", unique=True)
        await deps.db.user_sessions.create_index("session_token")
        await seed()
        logger.info("Blade Academy API ready ✅")
    except Exception as e:
        logger.error(f"Startup initialization error: {e}")
        raise


@app.on_event("shutdown")
async def shutdown():
    close_mongo()
