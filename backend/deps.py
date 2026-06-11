"""Shared dependencies: MongoDB, JWT helpers, auth, common utilities."""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from fastapi import HTTPException, Request, Response
from motor.motor_asyncio import AsyncIOMotorClient

JWT_ALGORITHM = "HS256"

logger = logging.getLogger("blade_academy")

mongo_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = mongo_client[os.environ["DB_NAME"]]


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
