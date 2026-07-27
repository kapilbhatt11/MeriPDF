import logging
import smtplib
import ssl
from email.message import EmailMessage

from app import config

logger = logging.getLogger(__name__)


def send_verification_email(to_email: str, verify_url: str, display_name: str | None) -> bool:
    """
    Send plain-text verification email. Returns True if sent via SMTP, False if only logged (dev).
    """
    greeting = (display_name or "").strip() or "there"
    body = (
        f"Hi {greeting},\n\n"
        f"Please confirm your MeriPDF account by opening this link:\n\n"
        f"{verify_url}\n\n"
        f"If you did not sign up, you can ignore this email.\n"
    )

    if not config.SMTP_HOST:
        logger.warning(
            "[email] SMTP not configured (MERIPDF_SMTP_HOST empty). Verification link for %s:\n%s",
            to_email,
            verify_url,
        )
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = "Confirm your MeriPDF email"
        msg["From"] = config.SMTP_FROM
        msg["To"] = to_email
        msg.set_content(body)

        context = ssl.create_default_context()
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=30) as server:
            if config.SMTP_USE_TLS:
                server.starttls(context=context)
            if config.SMTP_USER:
                server.login(config.SMTP_USER, config.SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send verification email to %s", to_email)
        raise
