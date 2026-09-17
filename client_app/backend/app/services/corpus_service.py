import re

import httpx

from app.core.config import settings
from app.core.constants import CORPUS_RECORDS_LIMIT, CORPUS_SEARCH_LIMIT
from app.exceptions import CorpusAPIError
from app.logger import logger

FALLBACK_LANGUAGES = [
    {"id": "en", "name": "English"},
    {"id": "te", "name": "Telugu"},
    {"id": "hi", "name": "Hindi"},
    {"id": "ta", "name": "Tamil"},
    {"id": "kn", "name": "Kannada"},
    {"id": "ml", "name": "Malayalam"},
    {"id": "bn", "name": "Bengali"},
    {"id": "mr", "name": "Marathi"},
    {"id": "gu", "name": "Gujarati"},
    {"id": "pa", "name": "Punjabi"},
    {"id": "ur", "name": "Urdu"},
    {"id": "or", "name": "Odia"},
    {"id": "as", "name": "Assamese"},
    {"id": "ne", "name": "Nepali"},
]


def normalize_phone(phone: str) -> str:
    normalized = re.sub(r"[^\d+]", "", phone.strip())
    if normalized.startswith("00"):
        return f"+{normalized[2:]}"
    return normalized


class CorpusService:
    def __init__(self):
        self.base_url = settings.CORPUS_BASE_URL
        self.phone = settings.CORPUS_PHONE
        self.password = settings.CORPUS_PASSWORD
        self.token = None

    async def login(self):
        return await self.login_with_credentials(self.phone, self.password)

    async def get_public_languages(self) -> list[dict]:
        url = f"{self.base_url}/api/v1/languages"
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(url, headers={"Accept": "application/json"})
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, list) else payload.get("items", [])

    async def login_with_credentials(self, phone: str, password: str):
        url = f"{self.base_url}/api/v1/auth/login"
        payload = {"phone": normalize_phone(phone), "password": password}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json=payload)
        if response.status_code == 401:
            try:
                message = response.json().get("message", "Incorrect phone number or password")
            except ValueError:
                message = "Incorrect phone number or password"
            raise CorpusAPIError(message, status_code=401)
        response.raise_for_status()
        data = response.json()
        self.token = data["access_token"]
        logger.info("Corpus API login successful")
        return data

    async def send_login_otp(self, phone: str):
        url = f"{self.base_url}/api/v1/auth/login/send-otp"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json={"phone": phone})
        response.raise_for_status()
        data = response.json()
        logger.info(f"Login OTP sent to {phone}")
        return data

    async def verify_login_otp(self, phone: str, otp_code: str):
        url = f"{self.base_url}/api/v1/auth/login/verify-otp"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json={"phone": phone, "otp_code": otp_code})
        response.raise_for_status()
        data = response.json()
        self.token = data["access_token"]
        logger.info("OTP login successful")
        return data

    async def resend_login_otp(self, phone: str):
        url = f"{self.base_url}/api/v1/auth/login/resend-otp"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json={"phone": phone})
        response.raise_for_status()
        return response.json()

    async def send_signup_otp(self, phone: str):
        url = f"{self.base_url}/api/v1/auth/signup/send-otp"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json={"phone": phone})
        response.raise_for_status()
        data = response.json()
        logger.info(f"Signup OTP sent to {phone}")
        return data

    async def verify_signup_otp(self, phone: str, otp_code: str, name: str = "", email: str = ""):
        url = f"{self.base_url}/api/v1/auth/signup/verify-otp"
        payload = {"phone": phone, "otp_code": otp_code}
        if name:
            payload["name"] = name
        if email:
            payload["email"] = email
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        self.token = data.get("access_token")
        logger.info("OTP signup successful")
        return data

    async def resend_signup_otp(self, phone: str):
        url = f"{self.base_url}/api/v1/auth/signup/resend-otp"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json={"phone": phone})
        response.raise_for_status()
        return response.json()

    async def refresh_token(self):
        await self._ensure_auth()
        url = f"{self.base_url}/api/v1/auth/refresh"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=self.headers())
        response.raise_for_status()
        data = response.json()
        self.token = data.get("access_token", self.token)
        logger.info("Corpus API token refreshed")
        return data

    async def get_me(self):
        await self._ensure_auth()
        url = f"{self.base_url}/api/v1/auth/me"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=self.headers())
        response.raise_for_status()
        return response.json()

    def headers(self):
        if not self.token:
            raise CorpusAPIError("Corpus session expired. Login required.", 401)
        return {"Authorization": f"Bearer {self.token}"}

    async def _ensure_auth(self):
        if not self.token:
            await self.login()

    async def upload_document(self, file):
        await self._ensure_auth()
        url = f"{self.base_url}/api/v1/records/upload"
        files = {"file": (file.filename, await file.read(), file.content_type)}
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=self.headers(), files=files)
        response.raise_for_status()
        return response.json()

    async def get_documents(self, skip: int = 0, limit: int = CORPUS_RECORDS_LIMIT):
        await self._ensure_auth()
        url = f"{self.base_url}/api/v1/records/"
        params: dict[str, str | int] = {"skip": skip, "limit": limit, "media_type": "document"}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=self.headers(), params=params)
        response.raise_for_status()
        return response.json()

    async def search_records(self, query: str, limit: int = CORPUS_SEARCH_LIMIT):
        await self._ensure_auth()
        url = f"{self.base_url}/api/v1/records/search"
        params: dict[str, str | int] = {"query": query, "limit": limit}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=self.headers(), params=params)
        response.raise_for_status()
        return response.json()

    async def get_record(self, record_id: str):
        await self._ensure_auth()
        url = f"{self.base_url}/api/v1/records/{record_id}"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=self.headers())
        response.raise_for_status()
        return response.json()

    async def get_record_knowledge(self, record_id: str):
        await self._ensure_auth()
        url = f"{self.base_url}/api/v1/records/{record_id}/knowledge"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=self.headers())
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()

    async def get_retrievals(self, record_id: str, query: str):
        await self._ensure_auth()
        url = f"{self.base_url}/api/v1/records/{record_id}/retrievals"
        payload = {"query": query}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=self.headers(), json=payload)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()

    async def get_record_url(self, record_id: str, expires_minutes: int = 60):
        await self._ensure_auth()
        url = f"{self.base_url}/api/v1/records/{record_id}/record-url"
        params = {"expires_minutes": expires_minutes}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(url, headers=self.headers(), params=params)
        response.raise_for_status()
        return response.json()
