"""Generic CRUD factory for entity collections."""
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends

from deps import db, now_utc, new_id, get_current_user
from models import ApprenantPayload, FormateurPayload, EntreprisePayload, FinanceurPayload, LieuPayload

router = APIRouter()


def make_crud(name: str, collection: str, payload_model):
    """Generate list/create/get/update/delete endpoints for a collection."""

    @router.get(f"/{name}")
    async def list_items(q: Optional[str] = None, user: dict = Depends(get_current_user)):
        query = {}
        if q:
            query = {"$or": [
                {k: {"$regex": q, "$options": "i"}} for k in ("nom", "prenom", "email", "raison_sociale", "code_interne")
            ]}
        items = await db[collection].find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return items

    @router.post(f"/{name}")
    async def create_item(payload: payload_model, user: dict = Depends(get_current_user)):
        doc = payload.model_dump()
        doc["id"] = new_id()
        doc["created_at"] = now_utc().isoformat()
        doc["updated_at"] = doc["created_at"]
        await db[collection].insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get(f"/{name}/{{item_id}}")
    async def get_item(item_id: str, user: dict = Depends(get_current_user)):
        doc = await db[collection].find_one({"id": item_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Introuvable")
        return doc

    @router.put(f"/{name}/{{item_id}}")
    async def update_item(item_id: str, payload: payload_model, user: dict = Depends(get_current_user)):
        doc = payload.model_dump()
        doc["updated_at"] = now_utc().isoformat()
        result = await db[collection].update_one({"id": item_id}, {"$set": doc})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Introuvable")
        return await db[collection].find_one({"id": item_id}, {"_id": 0})

    @router.delete(f"/{name}/{{item_id}}")
    async def delete_item(item_id: str, user: dict = Depends(get_current_user)):
        result = await db[collection].delete_one({"id": item_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Introuvable")
        return {"ok": True}


make_crud("apprenants", "apprenants", ApprenantPayload)
make_crud("formateurs", "formateurs", FormateurPayload)
make_crud("entreprises", "entreprises", EntreprisePayload)
make_crud("financeurs", "financeurs", FinanceurPayload)
make_crud("lieux", "lieux", LieuPayload)
