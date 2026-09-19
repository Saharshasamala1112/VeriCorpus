import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.core.security import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.main import app


class TestPasswordHashing:
    def test_hash_password_returns_string(self):
        hashed = hash_password("testpassword")
        assert isinstance(hashed, str)
        assert len(hashed) > 0

    def test_verify_correct_password(self):
        password = "mypassword123"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("correctpassword")
        assert verify_password("wrongpassword", hashed) is False

    def test_different_hashes_for_same_password(self):
        hashed1 = hash_password("samepassword")
        hashed2 = hash_password("samepassword")
        assert hashed1 != hashed2

    def test_empty_password(self):
        hashed = hash_password("")
        assert verify_password("", hashed) is True


class TestJWT:
    def test_create_and_decode_token(self):
        token = create_access_token("user-123")
        payload = decode_token(token)
        assert payload["sub"] == "user-123"
        assert "exp" in payload
        assert "iat" in payload

    def test_decode_invalid_token(self):
        with pytest.raises(Exception):
            decode_token("invalid.token.here")

    def test_token_expiry(self):
        from datetime import timedelta

        token = create_access_token("user-123", expires_delta=timedelta(seconds=-1))
        with pytest.raises(Exception):
            decode_token(token)

    def test_token_with_custom_expiry(self):
        from datetime import timedelta
        token = create_access_token("user-123", expires_delta=timedelta(hours=2))
        payload = decode_token(token)
        assert payload["sub"] == "user-123"


# ──────────────────────────────────────────────────────────────────────────────
# Auth Provider Enum Tests
# ──────────────────────────────────────────────────────────────────────────────


class TestAuthProviderEnum:
    def test_user_model_provider_field(self):
        from app.models.user import AuthProvider
        assert AuthProvider.LOCAL.value == "local"
        assert AuthProvider.CORPUS.value == "corpus"

    def test_token_response_has_auth_provider(self):
        from app.schemas.auth import TokenResponse
        assert "auth_provider" in TokenResponse.model_fields

    def test_user_response_has_auth_provider(self):
        from app.schemas.auth import UserResponse
        assert "auth_provider" in UserResponse.model_fields

    def test_corpus_standalone_login_request_schema(self):
        from app.schemas.auth import CorpusStandaloneLoginRequest
        req = CorpusStandaloneLoginRequest(phone="+919876543210", password="Test123!")
        assert req.phone == "+919876543210"
        assert req.password == "Test123!"


# ──────────────────────────────────────────────────────────────────────────────
# API Route Registration Tests
# ──────────────────────────────────────────────────────────────────────────────


class TestAuthRoutesRegistered:
    def test_corpus_standalone_login_route_exists(self):
        routes = set(app.openapi()["paths"])
        assert "/api/v1/auth/corpus/standalone-login" in routes

    def test_native_login_route_exists(self):
        routes = set(app.openapi()["paths"])
        assert "/api/v1/auth/login" in routes

    def test_register_route_exists(self):
        routes = set(app.openapi()["paths"])
        assert "/api/v1/auth/register" in routes

    def test_me_route_exists(self):
        routes = set(app.openapi()["paths"])
        assert "/api/v1/auth/me" in routes

    def test_forgot_password_route_exists(self):
        routes = set(app.openapi()["paths"])
        assert "/api/v1/auth/forgot-password" in routes

    def test_reset_password_route_exists(self):
        routes = set(app.openapi()["paths"])
        assert "/api/v1/auth/reset-password" in routes

    def test_corpus_lifecycle_routes_exist(self):
        routes = set(app.openapi()["paths"])
        assert "/api/v1/auth/corpus/login" in routes
        assert "/api/v1/auth/corpus/send-login-otp" in routes
        assert "/api/v1/auth/corpus/verify-login-otp" in routes
        assert "/api/v1/auth/corpus/send-signup-otp" in routes
        assert "/api/v1/auth/corpus/verify-signup-otp" in routes
        assert "/api/v1/auth/corpus/status" in routes
        assert "/api/v1/auth/corpus/disconnect" in routes


# ──────────────────────────────────────────────────────────────────────────────
# Schema Validation Tests (No DB Required)
# ──────────────────────────────────────────────────────────────────────────────


class TestSchemaValidation:
    def test_login_request_valid(self):
        from app.schemas.auth import LoginRequest
        req = LoginRequest(identifier="test@example.com", password="pass123")
        assert req.identifier == "test@example.com"

    def test_register_request_valid(self):
        from app.schemas.auth import RegisterRequest
        req = RegisterRequest(
            full_name="Test User",
            email="test@example.com",
            phone="+919876543210",
            password="TestPass123!",
            confirm_password="TestPass123!",
            country_code="IN",
        )
        assert req.full_name == "Test User"
        assert req.country_code == "IN"

    def test_corpus_login_request_valid(self):
        from app.schemas.auth import CorpusStandaloneLoginRequest
        req = CorpusStandaloneLoginRequest(
            phone="+919876543210",
            password="CorpusPass123!",
        )
        assert req.phone == "+919876543210"

    def test_token_response_has_required_fields(self):
        from app.schemas.auth import TokenResponse
        fields = set(TokenResponse.model_fields.keys())
        assert "access_token" in fields
        assert "token_type" in fields
        assert "user_id" in fields
        assert "username" in fields
        assert "email" in fields
        assert "phone" in fields
        assert "roles" in fields
        assert "auth_provider" in fields

    def test_user_response_has_required_fields(self):
        from app.schemas.auth import UserResponse
        fields = set(UserResponse.model_fields.keys())
        assert "id" in fields
        assert "full_name" in fields
        assert "email" in fields
        assert "phone" in fields
        assert "auth_provider" in fields
        assert "corpus_connected" in fields


# ──────────────────────────────────────────────────────────────────────────────
# OpenAPI Schema Validation for Dual Auth
# ──────────────────────────────────────────────────────────────────────────────


class TestOpenAPISchema:
    def test_openapi_includes_auth_provider_in_token_response(self):
        client = TestClient(app)
        response = client.get("/openapi.json")
        assert response.status_code == 200
        body = response.json()
        components = body.get("components", {}).get("schemas", {})
        token_schema = components.get("TokenResponse", {})
        properties = token_schema.get("properties", {})
        assert "auth_provider" in properties

    def test_openapi_includes_corpus_standalone_login_request(self):
        client = TestClient(app)
        response = client.get("/openapi.json")
        assert response.status_code == 200
        body = response.json()
        components = body.get("components", {}).get("schemas", {})
        assert "CorpusStandaloneLoginRequest" in components

    def test_openapi_corpus_standalone_login_has_post_method(self):
        client = TestClient(app)
        response = client.get("/openapi.json")
        assert response.status_code == 200
        body = response.json()
        path = body["paths"].get("/api/v1/auth/corpus/standalone-login", {})
        assert "post" in path


# ──────────────────────────────────────────────────────────────────────────────
# CorpusAuthProvider Unit Tests (No API / No DB)
# ──────────────────────────────────────────────────────────────────────────────


class TestCorpusAuthProviderUnit:
    def test_import_provider(self):
        from app.services.corpus_auth_provider import CorpusAuthProvider
        assert callable(CorpusAuthProvider.authenticate)

    def test_import_custom_exceptions(self):
        from app.services.corpus_auth_provider import (
            CorpusAuthenticationError,
            CorpusServiceUnavailableError,
        )
        assert issubclass(CorpusAuthenticationError, Exception)
        assert issubclass(CorpusServiceUnavailableError, Exception)

    @patch("app.services.corpus_auth_provider.httpx.AsyncClient")
    def test_authenticate_method_exists(self, mock_client_cls):
        from app.services.corpus_auth_provider import CorpusAuthProvider
        assert hasattr(CorpusAuthProvider, "authenticate")
        assert hasattr(CorpusAuthProvider, "get_user_info")
