import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestRootEndpoints:
    @pytest.mark.anyio
    async def test_root(self, client):
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["project"] == "VeriCorpus AI"
        assert "version" in data

    @pytest.mark.anyio
    async def test_health(self, client):
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


class TestAuthEndpoints:
    @pytest.mark.anyio
    async def test_register_missing_fields(self, client):
        response = await client.post("/api/v1/auth/register", json={})
        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_login_missing_fields(self, client):
        response = await client.post("/api/v1/auth/login", json={})
        assert response.status_code == 422

    @pytest.mark.anyio
    async def test_protected_route_no_token(self, client):
        response = await client.get("/api/v1/auth/me")
        assert response.status_code in (401, 403)

    @pytest.mark.anyio
    async def test_media_upload_no_auth(self, client):
        response = await client.post("/api/v1/media/upload", params={"media_type": "text"})
        assert response.status_code in (401, 403, 422)

    @pytest.mark.anyio
    async def test_list_media_no_auth(self, client):
        response = await client.get("/api/v1/media/")
        assert response.status_code in (401, 403)


class TestAnalysisEndpoints:
    @pytest.mark.anyio
    async def test_create_analysis_no_auth(self, client):
        response = await client.post("/api/v1/analysis/", json={"text": "hello"})
        assert response.status_code in (401, 403)

    @pytest.mark.anyio
    async def test_list_analyses_no_auth(self, client):
        response = await client.get("/api/v1/analysis/")
        assert response.status_code in (401, 403)


class TestDatasetEndpoints:
    @pytest.mark.anyio
    async def test_list_datasets_no_auth(self, client):
        response = await client.get("/api/v1/datasets/")
        assert response.status_code in (401, 403)


class TestModelEndpoints:
    @pytest.mark.anyio
    async def test_list_models_no_auth(self, client):
        response = await client.get("/api/v1/models/")
        assert response.status_code in (401, 403)
