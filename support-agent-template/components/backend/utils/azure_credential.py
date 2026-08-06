"""Shared asynchronous Azure credential."""

from __future__ import annotations

import os

from azure.core.credentials_async import AsyncTokenCredential
from azure.identity.aio import DefaultAzureCredential

_credential: AsyncTokenCredential | None = None


def get_credential() -> AsyncTokenCredential:
    global _credential
    if _credential is None:
        _credential = DefaultAzureCredential(
            managed_identity_client_id=os.environ.get("AZURE_CLIENT_ID")
        )
    return _credential


async def close_credential() -> None:
    global _credential
    if _credential is not None:
        await _credential.close()
        _credential = None
