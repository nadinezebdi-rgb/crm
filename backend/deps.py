"""Shared dependencies: MongoDB, JWT helpers, auth, common utilities."""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import bcrypt
import jwt
from fastapi import HTTPException, Request, Response
from motor.motor_asyncio import AsyncIOMotorClient

JWT_ALGORITHM = "HS256"

logger = logging.getLogger("blade_academy")

# Lazy-initialized Mongo client and database. Call `init_mongo()` at startup.
mongo_client: AsyncIOMotorClient | None = None
db = None
USE_MOCK_DB = False


class AsyncMongomockWrapper:
    """Wraps mongomock (sync) to provide an async-like interface for development."""
    
    def __init__(self, sync_db):
        self._db = sync_db
    
    def __getattr__(self, name: str):
        """Get a collection wrapper."""
        collection = getattr(self._db, name)
        return AsyncCollectionWrapper(collection)
    
    async def command(self, *args, **kwargs):
        """Mock command execution."""
        return {"ok": 1.0}


class AsyncCollectionWrapper:
    """Wraps a mongomock collection to provide async-like methods."""
    
    def __init__(self, collection):
        self._coll = collection
    
    async def create_index(self, field_or_list: str | list, **kwargs):
        """Create an index on the collection."""
        try:
            self._coll.create_index(field_or_list if isinstance(field_or_list, list) else [(field_or_list, 1)], **kwargs)
            return field_or_list
        except Exception:
            # mongomock may not support all index features; ignore errors
            return field_or_list
    
    async def insert_one(self, document: dict) -> Any:
        """Insert a single document."""
        result = self._coll.insert_one(document)
        return type('InsertResult', (), {'inserted_id': result.inserted_id})()
    
    async def find_one(self, filter: dict = None, projection: dict = None) -> dict | None:
        """Find one document."""
        return self._coll.find_one(filter, projection)
    
    def find(self, filter: dict = None, projection: dict = None):
        """Find multiple documents - returns an async-iterable cursor wrapper."""
        cursor = self._coll.find(filter, projection)
        return AsyncCursorWrapper(cursor)
    
    async def update_one(self, filter: dict, update: dict, **kwargs) -> Any:
        """Update one document."""
        result = self._coll.update_one(filter, update, **kwargs)
        return type('UpdateResult', (), {
            'matched_count': result.matched_count,
            'modified_count': result.modified_count
        })()
    
    async def delete_one(self, filter: dict) -> Any:
        """Delete one document."""
        result = self._coll.delete_one(filter)
        return type('DeleteResult', (), {'deleted_count': result.deleted_count})()
    
    async def delete_many(self, filter: dict) -> Any:
        """Delete many documents."""
        result = self._coll.delete_many(filter)
        return type('DeleteResult', (), {'deleted_count': result.deleted_count})()
    
    async def insert_many(self, documents: list) -> Any:
        """Insert many documents."""
        result = self._coll.insert_many(documents)
        return type('InsertManyResult', (), {'inserted_ids': result.inserted_ids})()
    
    async def update_many(self, filter: dict, update: dict, **kwargs) -> Any:
        """Update many documents."""
        result = self._coll.update_many(filter, update, **kwargs)
        return type('UpdateResult', (), {
            'matched_count': result.matched_count,
            'modified_count': result.modified_count
        })()
    
    async def count_documents(self, filter: dict) -> int:
        """Count documents matching a filter."""
        return self._coll.count_documents(filter)
    
    async def distinct(self, key: str, filter: dict = None) -> list:
        """Get distinct values."""
        return self._coll.distinct(key, filter)
    
    async def aggregate(self, pipeline: list) -> Any:
        """Run an aggregation pipeline."""
        return self._coll.aggregate(pipeline)


class AsyncCursorWrapper:
    """Wraps a mongomock cursor for async iteration."""
    
    def __init__(self, cursor):
        self._cursor = cursor
        self._list = None
    
    def __aiter__(self):
        """Support async for iteration."""
        self._iter = iter(list(self._cursor))
        return self
    
    async def __anext__(self):
        """Get next item in async iteration."""
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration
    
    async def to_list(self, length: int) -> list:
        """Convert cursor to list (up to `length` items)."""
        return list(self._cursor)[:length]


async def init_mongo() -> None:
    """Initialise la connexion MongoDB à partir des variables d'environnement.
    
    Falls back to in-memory mock MongoDB if real MongoDB is unavailable.
    This enables local development without external MongoDB installation.

    Raises a RuntimeError with a clear message if required env vars are missing.
    """
    global mongo_client, db, USE_MOCK_DB
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        raise RuntimeError("MONGO_URL and DB_NAME must be set in environment or .env")
    
    try:
        mongo_client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=2000)
        # Test connection with a simple command
        await mongo_client.admin.command("ping")
        db = mongo_client[db_name]
        logger.info(f"Connected to MongoDB at {mongo_url}")
    except Exception as e:
        logger.warning(f"Cannot connect to real MongoDB ({mongo_url}): {e}. Using in-memory mock database for development.")
        USE_MOCK_DB = True
        try:
            import mongomock
            # Create a mongomock client - wrap it for async compatibility
            _mock_client = mongomock.MongoClient()
            _mock_db = _mock_client[db_name]
            db = AsyncMongomockWrapper(_mock_db)
            logger.info("Using mongomock (in-memory) for development - data will NOT persist")
        except ImportError:
            logger.error("mongomock not installed. Install with: pip install mongomock")
            raise RuntimeError("MongoDB unavailable and mongomock not installed. Cannot proceed.")


def close_mongo() -> None:
    global mongo_client
    if mongo_client:
        mongo_client.close()


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
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET must be set in environment or .env")
    return secret


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "type": "access", "exp": now_utc() + timedelta(hours=8),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh", "exp": now_utc() + timedelta(days=7)}
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
