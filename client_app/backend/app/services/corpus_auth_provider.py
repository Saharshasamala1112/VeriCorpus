"""Corpus Authentication Provider.

This module implements the Corpus authentication provider that authenticates
users against the real Corpus API (Swecha) and maps them to VeriCorpus users.

Security notes:
- Corpus passwords are NEVER stored in VeriCorpus
- Corpus tokens are ephemeral and used only during authentication
- The corpus_user_id is the stable external identity mapping
- Email alone is never used to identify Corpus accounts
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings
from app.exceptions import CorpusAPIError
from app.services.corpus_service import normalize_phone

logger = logging.getLogger(__name__)


@dataclass
class CorpusIdentity:
    """Normalized identity returned by Corpus authentication."""

    provider_user_id: str  # Stable Corpus user ID
    email: str
    name: str
    phone: str
    verified: bool  # Whether the identity is verified by Corpus
    provider: str = "corpus"  # Always "corpus"
    raw_data: dict[str, Any] | None = None  # Raw response for debugging (not logged)


class CorpusAuthProvider:
    """Authentication provider for the Corpus API (Swecha).

    This provider authenticates users against the real Corpus API and returns
    a normalized CorpusIdentity. It does NOT create VeriCorpus users directly -
    that responsibility belongs to the auth service layer.

    The provider is configured via environment variables:
    - CORPUS_BASE_URL: The Corpus API base URL
    - CORPUS_PHONE: Default phone for service-level auth (optional)
    - CORPUS_PASSWORD: Default password for service-level auth (optional)
    """

    def __init__(self):
        self.base_url = settings.CORPUS_BASE_URL
        self.timeout = 30.0

    async def authenticate(self, phone: str, password: str) -> CorpusIdentity:
        """Authenticate a user against the Corpus API.

        Args:
            phone: The user's phone number (will be normalized)
            password: The user's Corpus password

        Returns:
            CorpusIdentity with the verified user information

        Raises:
            CorpusAuthenticationError: If authentication fails
            CorpusServiceUnavailableError: If the Corpus API is unavailable
            CorpusTimeoutError: If the Corpus API times out
        """
        normalized_phone = normalize_phone(phone)
        url = f"{self.base_url}/api/v1/auth/login"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    url,
                    json={"phone": normalized_phone, "password": password},
                    headers={"Content-Type": "application/json"},
                )
        except httpx.TimeoutException:
            logger.warning("Corpus API timeout during authentication")
            raise CorpusServiceUnavailableError("Corpus authentication service is temporarily unavailable")
        except httpx.RequestError as e:
            logger.error(f"Corpus API connection error: {type(e).__name__}")
            raise CorpusServiceUnavailableError("Corpus authentication service is temporarily unavailable")

        if response.status_code == 401:
            logger.warning(f"Corpus authentication failed: invalid credentials for phone {normalized_phone[:5]}***")
            raise CorpusAuthenticationError("Invalid Corpus credentials")

        if response.status_code == 403:
            logger.info("Corpus authentication failed: account inactive")
            raise CorpusAuthenticationError("Corpus account is inactive")

        if response.status_code >= 500:
            logger.error(f"Corpus API server error: {response.status_code}")
            raise CorpusServiceUnavailableError("Corpus authentication service is temporarily unavailable")

        if response.status_code != 200:
            logger.warning(f"Corpus API unexpected status: {response.status_code}")
            raise CorpusAuthenticationError("Corpus authentication failed")

        try:
            data = response.json()
        except ValueError:
            logger.error("Corpus API returned invalid JSON")
            raise CorpusServiceUnavailableError("Corpus authentication service returned an invalid response")

        # Extract user identity from Corpus login response
        # The Corpus API returns: {"access_token": "...", "user_id": "...", "username": "...", "phone": "...", "roles": [...]}
        corpus_access_token = data.get("access_token", "")
        if not corpus_access_token:
            logger.error("Corpus API response missing access_token")
            raise CorpusServiceUnavailableError("Corpus authentication service returned an invalid response")

        # user_id may be at top level or nested in a "user" object
        corpus_user = data.get("user", data)
        corpus_user_id = str(corpus_user.get("user_id", corpus_user.get("id", "")))
        if not corpus_user_id:
            corpus_user_id = normalized_phone
            logger.warning("Corpus API response missing user ID, using phone as identifier")

        return CorpusIdentity(
            provider_user_id=corpus_user_id,
            email=corpus_user.get("email", ""),
            name=corpus_user.get("username", corpus_user.get("name", corpus_user.get("full_name", ""))),
            phone=corpus_user.get("phone", normalized_phone),
            verified=True,
            raw_data=data,
        )

    async def get_user_info(self, access_token: str) -> CorpusIdentity:
        """Get user info from Corpus using an existing access token.

        This is used for linking an existing Corpus account to a VeriCorpus user.

        Args:
            access_token: The Corpus access token

        Returns:
            CorpusIdentity with the user information

        Raises:
            CorpusAuthenticationError: If the token is invalid
            CorpusServiceUnavailableError: If the Corpus API is unavailable
        """
        url = f"{self.base_url}/api/v1/auth/me"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    url,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
        except httpx.TimeoutException:
            raise CorpusServiceUnavailableError("Corpus service is temporarily unavailable")
        except httpx.RequestError:
            raise CorpusServiceUnavailableError("Corpus service is temporarily unavailable")

        if response.status_code == 401:
            raise CorpusAuthenticationError("Invalid or expired Corpus token")

        if response.status_code != 200:
            raise CorpusServiceUnavailableError("Corpus service returned an error")

        try:
            data = response.json()
        except ValueError:
            raise CorpusServiceUnavailableError("Corpus service returned an invalid response")

        corpus_user_id = str(data.get("id", ""))
        if not corpus_user_id:
            raise CorpusServiceUnavailableError("Corpus service returned an invalid response")

        return CorpusIdentity(
            provider_user_id=corpus_user_id,
            email=data.get("email", ""),
            name=data.get("name", data.get("full_name", "")),
            phone=data.get("phone", ""),
            verified=True,
            raw_data=data,
        )


class CorpusAuthenticationError(Exception):
    """Raised when Corpus authentication fails (invalid credentials, inactive account)."""

    def __init__(self, message: str = "Corpus authentication failed"):
        self.message = message
        super().__init__(self.message)


class CorpusServiceUnavailableError(Exception):
    """Raised when the Corpus service is unavailable (timeout, 5xx, connection error)."""

    def __init__(self, message: str = "Corpus service is temporarily unavailable"):
        self.message = message
        super().__init__(self.message)
