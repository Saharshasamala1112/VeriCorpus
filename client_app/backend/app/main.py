from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.analysis import router as analysis_router
from app.api.analysis_v2 import router as analysis_v2_router
from app.api.assistant import router as assistant_router
from app.api.auth import router as auth_router
from app.api.auth_v2 import router as auth_v2_router
from app.api.authenticity import router as authenticity_router
from app.api.corpus import router as corpus_router
from app.api.corpus_intel import router as corpus_intel_router
from app.api.corpus_v2 import router as corpus_v2_router
from app.api.datasets import router as datasets_router
from app.api.ingestion import router as ingestion_router
from app.api.media import router as media_router
from app.api.mlops import router as mlops_router
from app.api.models_v2 import router as models_v2_router
from app.api.training import router as training_router
from app.api.training_v2 import router as training_v2_router
from app.core.config import settings
from app.core.database import init_db
from app.exceptions import register_exception_handlers
from app.middleware import (
    RateLimitMiddleware,
    RequestIDMiddleware,
    RequestSizeLimitMiddleware,
    SecurityAuditMiddleware,
    SecurityHeadersMiddleware,
)
from app.services.media_processors import (
    audio_processor,  # noqa: F401
    document_processor,  # noqa: F401
    image_processor,  # noqa: F401
    text_processor,  # noqa: F401
    video_processor,  # noqa: F401
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    register_exception_handlers(app)
    await init_db()
    yield


app = FastAPI(
    title="VeriCorpus AI",
    description="Evidence-led media authenticity analysis with Corpus language context.",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware, max_size_mb=settings.MAX_UPLOAD_SIZE_MB)
app.add_middleware(SecurityAuditMiddleware)
app.add_middleware(RateLimitMiddleware, max_requests=settings.RATE_LIMIT_PER_MINUTE)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With", "X-Request-ID"],
)

# v2 API routes
app.include_router(auth_v2_router, prefix="/api/v1")
app.include_router(media_router, prefix="/api/v1")
app.include_router(ingestion_router, prefix="/api/v1")
app.include_router(corpus_v2_router, prefix="/api/v1")
app.include_router(corpus_intel_router, prefix="/api/v1")
app.include_router(datasets_router, prefix="/api/v1")
app.include_router(analysis_router, prefix="/api/v1")
app.include_router(analysis_v2_router, prefix="/api/v1")
app.include_router(models_v2_router, prefix="/api/v1")
app.include_router(training_v2_router, prefix="/api/v1")
app.include_router(mlops_router, prefix="/api/v1")

# Legacy routes (preserved for backward compatibility)
app.include_router(auth_router)
app.include_router(authenticity_router)
app.include_router(assistant_router)
app.include_router(corpus_router)
app.include_router(training_router)


@app.get("/")
async def root():
    return {"project": "VeriCorpus AI", "version": settings.APP_VERSION, "status": "Running"}


@app.get("/health")
async def health():
    return {"status": "healthy", "version": settings.APP_VERSION}
