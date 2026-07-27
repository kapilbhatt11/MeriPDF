# backend/app/services/db_ops.py
from app.db import database
from app.models import documents, extracted_texts


async def save_new_document(original_filename, stored_filename, filepath, lang, user_id: int):
    """Insert new document with empty OCR text."""
    row = await database.fetch_one(
        documents.insert()
        .values(
            original_filename=original_filename,
            stored_filename=stored_filename,
            filepath=filepath,
            language=lang,
            user_id=user_id,
        )
        .returning(documents.c.id)
    )
    doc_id = row["id"]

    query_text = extracted_texts.insert().values(document_id=doc_id, content="")
    await database.execute(query_text)

    return doc_id


async def update_extracted_text(stored_filename, content: str):
    """Update OCR text after processing."""
    query = documents.select().where(documents.c.stored_filename == stored_filename)
    doc = await database.fetch_one(query)
    if not doc:
        return None

    doc_id = doc["id"]

    query_update = extracted_texts.update().where(
        extracted_texts.c.document_id == doc_id
    ).values(content=content)

    await database.execute(query_update)
    return doc_id


async def fetch_document_with_text(doc_id: int, user_id: int):
    """Return document + OCR text if owned by user."""
    query = documents.select().where(
        documents.c.id == doc_id,
        documents.c.user_id == user_id,
    )
    doc = await database.fetch_one(query)
    if not doc:
        return None

    query_text = extracted_texts.select().where(extracted_texts.c.document_id == doc_id)
    text_row = await database.fetch_one(query_text)
    content = text_row["content"] if text_row else ""

    d = dict(doc)
    return {
        "document": d,
        "text": content or "",
    }
