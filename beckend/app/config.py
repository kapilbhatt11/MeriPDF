import os

SECRET_KEY = os.getenv("DOCINTEL_SECRET_KEY", "change-me-in-production-use-openssl-rand-hex-32")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("DOCINTEL_TOKEN_MINUTES", "10080"))  # 7 days

# Public URL of this API (used inside verification links in emails)
API_PUBLIC_URL = os.getenv("DOCINTEL_API_PUBLIC_URL", "http://127.0.0.1:8000").rstrip("/")
# Where users land after clicking verify (Next.js)
FRONTEND_URL = os.getenv("DOCINTEL_FRONTEND_URL", "http://localhost:3000").rstrip("/")

# SMTP — leave host empty to only log the link in the server console (dev)
SMTP_HOST = os.getenv("DOCINTEL_SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("DOCINTEL_SMTP_PORT", "587"))
SMTP_USER = os.getenv("DOCINTEL_SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("DOCINTEL_SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("DOCINTEL_SMTP_FROM", "").strip() or SMTP_USER
SMTP_USE_TLS = os.getenv("DOCINTEL_SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")

# Anonymous users: merge + split + compress combined per calendar day per IP
FREE_ANONYMOUS_PDF_OPS_PER_DAY = int(os.getenv("DOCINTEL_FREE_PDF_OPS_PER_DAY", "5"))

# Razorpay Keys (Leave empty for Mock Mode during development)
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
