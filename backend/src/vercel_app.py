"""Vercel entrypoint: a usable demo deployment before external services exist."""
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from .vercel_runtime import missing_configuration

missing = missing_configuration()
if not missing:
    from .main import app
else:
    app = FastAPI(title="DGCLIPS · configuração pendente")

    @app.get("/health")
    async def health():
        return {"status": "demo", "processing_ready": False, "missing": missing}

    @app.api_route("/{path:path}", methods=["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD"])
    async def awaiting_configuration(path: str):
        return JSONResponse({"error": "Configure os serviços externos e desative DGCLIPS_DEMO para processar vídeos.", "code": "DGCLIPS_SETUP_REQUIRED"}, status_code=503)
