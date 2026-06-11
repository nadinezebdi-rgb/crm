"""Blade Academy CRM — Stockage d'objets Emergent (documents des apprenants)."""

import os

import httpx

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_PREFIX = "blade-academy-crm"

_storage_key = None


async def _init_storage(force: bool = False) -> str:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]})
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
    return _storage_key


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = await _init_storage()
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            content=data,
        )
        if resp.status_code == 403:
            key = await _init_storage(force=True)
            resp = await client.put(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key, "Content-Type": content_type},
                content=data,
            )
        resp.raise_for_status()
        return resp.json()


async def get_object(path: str) -> tuple:
    key = await _init_storage()
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
        if resp.status_code == 403:
            key = await _init_storage(force=True)
            resp = await client.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
        resp.raise_for_status()
        return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
