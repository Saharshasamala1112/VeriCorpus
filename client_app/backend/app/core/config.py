import secrets

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "VeriCorpus AI"
    APP_VERSION: str = "4.0.0"
    DEBUG: bool = True

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vericorpus"
    CORPUS_DB_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/indic_corpus"

    JWT_SECRET: str = Field(default_factory=lambda: secrets.token_urlsafe(64))
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    BCRYPT_ROUNDS: int = 12

    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_MIME_TYPES: str = ""
    ALLOWED_PROVIDER_HOSTS: str = "api.corpus.swecha.org,api.openai.com,api.gemini.google.com,api.groq.com"

    CORS_ORIGINS: str = "http://localhost:5173,https://localhost:5173,https://veri-corpus-12cj08ydc-saharshasamala1112s-projects.vercel.app"
    RATE_LIMIT_PER_MINUTE: int = 60

    CORPUS_BASE_URL: str = "https://api.corpus.swecha.org"
    CORPUS_PHONE: str = ""
    CORPUS_PASSWORD: str = ""

    # Email Service
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = "noreply@vericorpus.ai"
    FROM_NAME: str = "VeriCorpus AI"
    FRONTEND_URL: str = "http://localhost:5173"

    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"

    LEARNING_DB_PATH: str = "data/corpusguard_learning.sqlite3"
    VECTOR_STORE_PATH: str = "data/vericorpus_vectors.sqlite3"
    FORENSIC_MODEL_ROOT: str = ""
    FORENSIC_MODEL_PATH: str = ""
    FORENSIC_OUTPUT_DIR: str = "outputs/forensic"
    FORENSIC_ENABLED: bool = True

    # MLflow Configuration
    MLFLOW_TRACKING_URI: str = "file:./mlruns"
    MLFLOW_REGISTRY_URI: str = ""
    MLFLOW_EXPERIMENT_NAME: str = "vericorpus"
    MLFLOW_ARTIFACT_ROOT: str = "mlartifacts"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    @field_validator("DATABASE_URL", "CORPUS_DB_URL", mode="before")
    @classmethod
    def normalize_async_database_url(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        if value.startswith("postgres://"):
            return "postgresql+asyncpg://" + value.removeprefix("postgres://")
        if value.startswith("postgresql://"):
            return "postgresql+asyncpg://" + value.removeprefix("postgresql://")
        return value

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.DEBUG:
            return self

        if self.JWT_SECRET in {"", "dev-only-jwt-secret-change-me", "CHANGE-ME-IN-PRODUCTION"}:
            raise ValueError("JWT_SECRET must be set via environment variable when DEBUG is disabled")

        for name, value in (
            ("DATABASE_URL", self.DATABASE_URL),
            ("CORPUS_DB_URL", self.CORPUS_DB_URL),
        ):
            if not value or any(placeholder in value for placeholder in (":postgres@", ":change-me@")):
                raise ValueError(f"{name} must be configured with non-default credentials")

        return self

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        if not origins:
            return ["http://localhost:5173"]
        return origins

    @property
    def allowed_provider_hosts(self) -> list[str]:
        hosts = [host.strip().lower() for host in self.ALLOWED_PROVIDER_HOSTS.split(",") if host.strip()]
        return hosts or ["api.corpus.swecha.org"]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


settings = Settings()
