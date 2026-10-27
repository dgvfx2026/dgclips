"""Readiness checks shared by the Vercel API and background worker."""
import os


def missing_configuration() -> list[str]:
    required = ("BACKEND_DATABASE_URL", "REDIS_HOST", "REDIS_PASSWORD", "BACKEND_AUTH_SECRET", "APP_SETTINGS_ENCRYPTION_KEY", "MEDIA_S3_BUCKET")
    missing = [key for key in required if not os.getenv(key, "").strip()]
    if os.getenv("MEDIA_STORAGE", "").lower() != "s3":
        missing.append("MEDIA_STORAGE=s3")
    if os.getenv("DGCLIPS_DEMO", "true").lower() == "true":
        missing.append("DGCLIPS_DEMO=false")
    return missing
