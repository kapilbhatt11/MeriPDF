from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str | None = Field(None, max_length=255)
    mobile_number: str | None = Field(None, max_length=20)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterResponse(BaseModel):
    message: str
    email: str
    email_sent: bool


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ResendVerificationResponse(BaseModel):
    message: str


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=255)
    mobile_number: str | None = Field(None, max_length=20)
    date_of_birth: date | None = None
    gender: str | None = Field(None, max_length=32)


class SubscriptionOut(BaseModel):
    plan: str
    status: str
    label: str
    is_pro: bool
    current_period_end: str | None = None
    is_expired: bool = False


class UserPublic(BaseModel):
    id: int
    email: str
    full_name: str | None = None
    mobile_number: str | None = None
    is_admin: bool = False
    email_verified: bool = True
    avatar_url: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    subscription: SubscriptionOut
