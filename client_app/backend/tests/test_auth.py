import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, decode_token, hash_password, verify_password
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


def test_refresh_routes_are_registered() -> None:
    routes = set(app.openapi()["paths"])
    assert "/api/v1/auth/refresh" in routes
    assert "/api/v1/corpus/refresh" in routes


def test_openapi_exposes_auth_routes() -> None:
    client = TestClient(app)
    response = client.get("/openapi.json")
    assert response.status_code == 200
    body = response.json()
    paths = body["paths"]
    assert "/auth/login" in paths
    assert "/api/v1/auth/refresh" in paths
    assert "/api/v1/corpus/refresh" in paths
