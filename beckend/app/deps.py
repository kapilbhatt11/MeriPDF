from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth_security import decode_token
from app.db import database
from app.models import users

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    from app.auth_security import decode_token_payload
    payload = decode_token_payload(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    sub = payload.get("sub")
    if sub is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = int(sub)
    row = await database.fetch_one(users.select().where(users.c.id == user_id))
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    
    # Session concurrency check
    sid_in_token = payload.get("sid")
    db_sid = row["current_session_id"]
    if db_sid and sid_in_token != db_sid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="You have logged in from another device. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    return dict(row)


async def get_current_verified_user(current: dict = Depends(get_current_user)):
    """Use for uploads and documents — blocks accounts that have not confirmed email."""
    if not current.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email to use this feature.",
        )
    return current
