from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.authenticity_service import analyze_input
from app.services.corpus_service import FALLBACK_LANGUAGES, CorpusService
from app.services.forensic_adapter import forensic_adapter
from app.services.learning_service import learning_service

router = APIRouter(prefix="/authenticity", tags=["Authenticity"])
corpus_service = CorpusService()

# Allowed MIME types for upload
ALLOWED_MIME_TYPES = {
    "text/plain",
    "text/csv",
    "text/html",
    "text/markdown",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/flac",
    "video/mp4",
    "video/webm",
    "video/avi",
    "video/quicktime",
}

MAX_TEXT_LENGTH = 100_000  # 100K characters


@router.get("/languages")
async def authenticity_languages():
    try:
        languages = await corpus_service.get_public_languages()
        return {
            "languages": languages or FALLBACK_LANGUAGES,
            "source": "Corpus API" if languages else "fallback",
            "available": bool(languages),
        }
    except Exception:
        return {"languages": FALLBACK_LANGUAGES, "source": "fallback", "available": False}


@router.post("/analyze")
async def analyze_authenticity(
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    source_url: str | None = Form(default=None),
    language: str = Form(default="en"),
):
    if not file and not text and not source_url:
        raise HTTPException(status_code=400, detail="Provide a file, text, or source URL")

    # Validate language code
    if not language.strip() or len(language) > 16:
        raise HTTPException(status_code=400, detail="language must be a valid language code")

    # Validate text input length
    if text and len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text input too long. Maximum {MAX_TEXT_LENGTH} characters allowed.",
        )

    # Validate source URL format
    if source_url:
        if not source_url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="source_url must be a valid HTTP(S) URL")
        if len(source_url) > 2048:
            raise HTTPException(status_code=400, detail="source_url too long (max 2048 characters)")

    if file:
        # Validate file content type
        if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{file.content_type}' not supported. Allowed types: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
            )

        data = await file.read()

        # Validate file is not empty
        if not data:
            raise HTTPException(status_code=400, detail="The uploaded file is empty")

        # Validate file size (50MB max)
        if len(data) > 50 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large. Maximum size is 50MB.")

        return await analyze_input(
            data,
            file.filename or "uploaded-file",
            file.content_type,
            language,
            corpus_languages=await _languages(),
        )

    data = (text or source_url or "").encode("utf-8")
    return await analyze_input(
        data,
        "pasted-input.txt",
        "text/plain",
        language,
        source_url,
        corpus_languages=await _languages(),
    )


@router.post("/feedback")
async def authenticity_feedback(sample_id: str = Form(...), label: str = Form(...)):
    try:
        return learning_service.label_sample(sample_id, label)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/learning-status")
async def authenticity_learning_status():
    return learning_service.status()


@router.get("/model-status")
async def model_status():
    return {
        "forensic": forensic_adapter.status(),
        "learning": learning_service.status(),
    }


@router.post("/translate")
async def translate_explanation(explanation: str = Form(...), target_language: str = Form(...)):
    if not explanation.strip():
        raise HTTPException(status_code=400, detail="explanation is required")
    if not target_language.strip() or len(target_language) > 16:
        raise HTTPException(status_code=400, detail="valid target_language code is required")
    from app.services.gemini_service import gemini_service

    prompt = (
        f"Translate the following forensic analysis explanation into {target_language}. "
        f"Keep the technical meaning accurate. Only return the translated text.\n\n{explanation}"
    )
    try:
        translated = await gemini_service.generate(prompt)
    except Exception:
        translated = explanation
    return {"original": explanation, "translated": translated, "language": target_language}


async def _languages() -> list[dict] | None:
    try:
        return await corpus_service.get_public_languages() or FALLBACK_LANGUAGES
    except Exception:
        return FALLBACK_LANGUAGES
