# backend/app/routes/documents.py
from fastapi import APIRouter, Depends, HTTPException

from app.models import documents
from app.db import database
from app.services import db_ops
from app.deps import get_current_verified_user

router = APIRouter()


@router.get("/documents")
async def list_documents(current_user: dict = Depends(get_current_verified_user)):
    query = (
        documents.select()
        .where(documents.c.user_id == current_user["id"])
        .order_by(documents.c.created_at.desc())
    )
    rows = await database.fetch_all(query)
    return [
        {
            "id": r["id"],
            "original_filename": r["original_filename"],
            "stored_filename": r["stored_filename"],
            "filepath": r["filepath"],
            "language": r["language"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else "",
        }
        for r in rows
    ]


@router.get("/documents/{doc_id}")
async def get_document(doc_id: int, current_user: dict = Depends(get_current_verified_user)):
    doc = await db_ops.fetch_document_with_text(doc_id, current_user["id"])
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc
