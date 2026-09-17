import pytest
from pydantic import ValidationError

from app.schemas.analysis import AnalysisRequest
from app.schemas.auth import LoginRequest, RegisterRequest
from app.schemas.common import PaginationParams
from app.schemas.dataset import DatasetCreate
from app.schemas.model import ModelCreate


class TestAuthSchemas:
    def test_register_valid(self):
        r = RegisterRequest(phone="1234567890", username="test", password="password123")
        assert r.phone == "1234567890"

    def test_register_short_phone(self):
        with pytest.raises(ValidationError):
            RegisterRequest(phone="123", username="test", password="password123")

    def test_register_short_password(self):
        with pytest.raises(ValidationError):
            RegisterRequest(phone="1234567890", username="test", password="123")

    def test_register_short_username(self):
        with pytest.raises(ValidationError):
            RegisterRequest(phone="1234567890", username="a", password="password123")

    def test_login_valid(self):
        r = LoginRequest(phone="1234567890", password="pass")
        assert r.phone == "1234567890"


class TestAnalysisSchemas:
    def test_analysis_empty_request(self):
        r = AnalysisRequest()
        assert r.text is None
        assert r.media_asset_id is None
        assert r.input_type == "text"

    def test_analysis_with_text(self):
        r = AnalysisRequest(text="hello world")
        assert r.text == "hello world"
        assert r.input_type == "text"


class TestDatasetSchemas:
    def test_dataset_create_valid(self):
        d = DatasetCreate(name="test-ds", media_type="text")
        assert d.name == "test-ds"

    def test_dataset_missing_media_type(self):
        with pytest.raises(ValidationError):
            DatasetCreate(name="test-ds")  # type: ignore[call-arg]


class TestModelSchemas:
    def test_model_create_valid(self):
        m = ModelCreate(name="test-model", media_type="text")
        assert m.name == "test-model"


class TestPaginationParams:
    def test_default_pagination(self):
        p = PaginationParams(page=1, page_size=20)
        assert p.page == 1
        assert p.page_size == 20
        assert p.offset == 0

    def test_custom_pagination(self):
        p = PaginationParams(page=3, page_size=10)
        assert p.offset == 20

    def test_invalid_page(self):
        with pytest.raises(ValidationError):
            PaginationParams(page=0, page_size=20)

    def test_invalid_page_size(self):
        with pytest.raises(ValidationError):
            PaginationParams(page=1, page_size=200)
