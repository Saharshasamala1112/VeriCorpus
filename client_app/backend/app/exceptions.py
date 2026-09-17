from fastapi import Request
from fastapi.responses import JSONResponse


class PlagiarismError(Exception):
    def __init__(self, message: str, detail: str = ""):
        self.message = message
        self.detail = detail


class CorpusAPIError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code


class DocumentProcessingError(Exception):
    def __init__(self, message: str):
        self.message = message


class GeminiAPIError(Exception):
    def __init__(self, message: str):
        self.message = message


class KnowledgeError(Exception):
    def __init__(self, message: str):
        self.message = message


async def plagiarism_error_handler(request: Request, exc: PlagiarismError):
    return JSONResponse(status_code=422, content={"error": exc.message, "detail": exc.detail})


async def corpus_api_error_handler(request: Request, exc: CorpusAPIError):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.message})


async def document_processing_error_handler(request: Request, exc: DocumentProcessingError):
    return JSONResponse(status_code=400, content={"error": exc.message})


async def gemini_api_error_handler(request: Request, exc: GeminiAPIError):
    return JSONResponse(status_code=502, content={"error": f"Gemini API error: {exc.message}"})


async def knowledge_error_handler(request: Request, exc: KnowledgeError):
    return JSONResponse(status_code=400, content={"error": exc.message})


def register_exception_handlers(app):
    app.add_exception_handler(PlagiarismError, plagiarism_error_handler)
    app.add_exception_handler(CorpusAPIError, corpus_api_error_handler)
    app.add_exception_handler(DocumentProcessingError, document_processing_error_handler)
    app.add_exception_handler(GeminiAPIError, gemini_api_error_handler)
    app.add_exception_handler(KnowledgeError, knowledge_error_handler)
