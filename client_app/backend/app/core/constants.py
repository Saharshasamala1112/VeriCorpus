UPLOAD_FOLDER = "uploads"
REPORT_FOLDER = "reports"
VECTOR_FOLDER = "vector_db"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
SIMILARITY_THRESHOLD = 0.75
MAX_CHUNK_SIZE = 500

GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_TEMPERATURE = 0.3

GROQ_TEMPERATURE = 0.3
GROQ_MAX_TOKENS = 4096
OLLAMA_TIMEOUT = 120

CORPUS_SEARCH_LIMIT = 20
CORPUS_RECORDS_LIMIT = 100

RISK_LEVELS = {
    "low": (0, 0.25),
    "medium": (0.25, 0.50),
    "high": (0.50, 0.75),
    "critical": (0.75, 1.0),
}

SCORE_WEIGHTS = {
    "all_signals": {"gemini_refs": 0.35, "ml": 0.25, "standalone": 0.25, "web": 0.15},
    "no_refs_with_web": {"gemini_refs": 0.0, "ml": 0.15, "standalone": 0.40, "web": 0.45},
    "no_refs_no_web": {"gemini_refs": 0.0, "ml": 0.25, "standalone": 0.75, "web": 0.0},
    "gemini_only": {"gemini_refs": 0.45, "ml": 0.0, "standalone": 0.35, "web": 0.20},
    "standalone_only": {"gemini_refs": 0.0, "ml": 0.0, "standalone": 1.0, "web": 0.0},
    "none": {"gemini_refs": 0.0, "ml": 0.0, "standalone": 0.0, "web": 0.0},
}

AI_DETECTION_RISK_LEVELS = {
    "low": (0.0, 0.3),
    "medium": (0.3, 0.5),
    "high": (0.5, 0.7),
    "critical": (0.7, 1.0),
}
