"""Blob Storage client for feedback records."""

from __future__ import annotations

from azure.storage.blob.aio import BlobServiceClient

from config.app_config import require
from utils.azure_credential import get_credential

_client: BlobServiceClient | None = None


def get_blob_service_client() -> BlobServiceClient:
    global _client
    if _client is None:
        _client = BlobServiceClient(
            account_url=require("STORAGE_BASE_URL"),
            credential=get_credential(),
        )
    return _client


async def upload_blob(container: str, blob_name: str, data: bytes) -> None:
    blob = get_blob_service_client().get_blob_client(container, blob_name)
    await blob.upload_blob(data, overwrite=False)


async def close_storage_client() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
