"""Auth endpoints: register, login, logout, me, Emergent Google OAuth."""
import os
from datetime import timedelta

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, Depends

import deps
from models import RegisterPayload, LoginPayload

router = APIRouter()


@router.post("/auth/register")
async def register(payload: RegisterPayload, response: Response):
    email = payload.email.lower().strip()
    if await deps.db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    user_id = deps.new_id("usr_")
    doc = {
        "user_id": user_id,
        "email": email,
        "password_hash": deps.hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "auth_provider": "local",
        "organisme": os.environ.get("ORG_NAME", "Blade Academy"),
        "created_at": deps.now_utc().isoformat(),
    }
    await deps.db.users.insert_one(doc)
    access = deps.create_access_token(user_id, email, payload.role)
    refresh = deps.create_refresh_token(user_id)
    deps.set_auth_cookies(response, access, refresh)
    return deps.public_user(doc)


@router.post("/auth/login")
async def login(payload: LoginPayload, response: Response):
    email = payload.email.lower().strip()
    u = await deps.db.users.find_one({"email": email})
    if not u or not u.get("password_hash") or not deps.verify_password(payload.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    access = deps.create_access_token(u["user_id"], email, u.get("role", "admin"))
    refresh = deps.create_refresh_token(u["user_id"])
    deps.set_auth_cookies(response, access, refresh)
    return deps.public_user(u)


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await deps.db.user_sessions.delete_one({"session_token": session_token})
    deps.clear_auth_cookies(response)
    return {"ok": True}


@router.post("/auth/change-password")
async def change_password(request: Request, user: dict = Depends(deps.get_current_user)):
    """Changer son mot de passe.
    - Si l'utilisateur a déjà un mot de passe (auth_provider local), `current_password` est requis.
    - Si l'utilisateur s'est connecté via Google sans mot de passe, il peut en définir un sans `current_password`.
    """
    body = await request.json()
    new_password = (body.get("new_password") or "").strip()
    current_password = body.get("current_password") or ""

    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit faire au moins 8 caractères")

    fresh = await deps.db.users.find_one({"user_id": user["user_id"]})
    if fresh and fresh.get("password_hash"):
        if not current_password or not deps.verify_password(current_password, fresh["password_hash"]):
            raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    await deps.db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": deps.hash_password(new_password), "auth_provider": "local"}},
    )
    return {"ok": True}


@router.get("/auth/me")
async def me(user: dict = Depends(deps.get_current_user)):
    return deps.public_user(user)


@router.post("/auth/emergent/session")
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
    existing = await deps.db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await deps.db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing.get("name")), "picture": data.get("picture"), "auth_provider": "google"}},
        )
        user_doc = await deps.db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        user_id = deps.new_id("usr_")
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name", ""),
            "picture": data.get("picture"),
            "role": "admin",
            "auth_provider": "google",
            "organisme": os.environ.get("ORG_NAME", "Blade Academy"),
            "created_at": deps.now_utc().isoformat(),
        }
        await deps.db.users.insert_one(user_doc)

    session_token = data["session_token"]
    expires_at = deps.now_utc() + timedelta(days=7)
    await deps.db.user_sessions.insert_one(
        {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": deps.now_utc().isoformat(),
        }
    )
    response.set_cookie("session_token", session_token, httponly=True, secure=True, samesite="none", max_age=7 * 86400, path="/")
    return deps.public_user(user_doc)
