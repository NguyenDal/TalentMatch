"""Small-instance web runtime: bounded uploads and same-origin React hosting."""

import os
import re
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.gzip import GZipMiddleware

MAX_UPLOAD_BODY = 6 * 1024 * 1024
PUBLIC_ROUTES = {"", "login", "signup", "contact", "request-password-reset", "reset-password", "dashboard"}


class UploadBodyLimitMiddleware:
    """Bound the multipart body before FastAPI spools/parses uploaded files."""

    def __init__(self, app, max_bytes=MAX_UPLOAD_BODY):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path", "").rstrip("/") != "/upload-resume":
            await self.app(scope, receive, send)
            return
        if scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = self.max_bytes + 1
        if declared > self.max_bytes:
            await self.reject(scope, receive, send)
            return
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body = message.get("body", b"")
            size += len(body)
            if size > self.max_bytes:
                await self.reject(scope, receive, send)
                return
            chunks.append(body)
            if not message.get("more_body", False):
                break
        sent = False

        async def bounded_receive():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, send)

    async def reject(self, scope, receive, send):
        response = JSONResponse({"detail": "This upload is too large. Choose a resume under 5 MB and a shorter job description."}, status_code=413)
        await response(scope, receive, send)


def configure_web_runtime(app, frontend_dir=None):
    """Call after API registration so frontend routing cannot hide API errors."""
    app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=5)
    app.add_middleware(UploadBodyLimitMiddleware)

    @app.get("/healthz", include_in_schema=False)
    def health():
        # Does not wake Neon or spend AI credits just to keep the instance healthy.
        return JSONResponse({"status": "ok"}, headers={"Cache-Control": "no-store"})

    configured = frontend_dir if frontend_dir is not None else os.getenv("FRONTEND_DIST_DIR")
    if not configured:
        return
    root = Path(configured).resolve()
    if not (root / "index.html").is_file():
        raise RuntimeError("FRONTEND_DIST_DIR must contain the built React index.html.")

    @app.api_route("/{page_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def frontend(page_path: str):
        requested = Path(page_path)
        if any(part.startswith(".") for part in requested.parts):
            raise HTTPException(404, "Not found")
        candidate = (root / requested).resolve()
        if not candidate.is_relative_to(root):
            raise HTTPException(404, "Not found")
        if candidate.is_file():
            immutable = page_path.startswith("static/") and re.search(r"[.-][a-f0-9]{8,}[.-]", candidate.name)
            cache = "public, max-age=31536000, immutable" if immutable else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache, "X-Content-Type-Options": "nosniff"})
        route = page_path.rstrip("/")
        if route in PUBLIC_ROUTES or route == "dashboard/settings" or route.startswith("dashboard/settings/"):
            return FileResponse(root / "index.html", headers={"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"})
        raise HTTPException(404, "Not found")
