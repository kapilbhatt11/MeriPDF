from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
import fitz  # PyMuPDF
import io

router = APIRouter(prefix="/protect", tags=["PDF Security"])

@router.post("/lock")
async def lock_pdf(file: UploadFile = File(...), password: str = Form(...)):
    """Encrypts a PDF with the given password"""
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")
        
    try:
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        output_buffer = io.BytesIO()
        # Save with AES-256 encryption
        doc.save(
            output_buffer, 
            encryption=fitz.PDF_ENCRYPT_AES_256, 
            user_pw=password, 
            owner_pw=password
        )
        output_buffer.seek(0)
        
        return StreamingResponse(
            output_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="Locked_{file.filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to lock PDF: {str(e)}")


@router.post("/unlock")
async def unlock_pdf(file: UploadFile = File(...), password: str = Form(...)):
    """Decrypts a PDF using the given password"""
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")
        
    try:
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        if not doc.needs_pass:
            raise HTTPException(status_code=400, detail="This PDF is not password protected.")
            
        # Try to authenticate
        auth_success = doc.authenticate(password)
        if not auth_success:
            raise HTTPException(status_code=401, detail="Incorrect password. Cannot unlock.")
            
        output_buffer = io.BytesIO()
        # Save without encryption
        doc.save(output_buffer)
        output_buffer.seek(0)
        
        return StreamingResponse(
            output_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="Unlocked_{file.filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to unlock PDF: {str(e)}")
