"""Runtime settings loaded from environment and Azure App Configuration."""

from __future__ import annotations

import os
from typing import overload

from azure.appconfiguration.aio import AzureAppConfigurationClient

from utils.azure_credential import get_credential

_settings: dict[str, str] | None = None


async def init() -> None:
    global _settings
    if _settings is not None:
        return

    settings = dict(os.environ)
    endpoint = os.environ.get("AZURE_APPCONFIG_ENDPOINT")
    if endpoint:
        async with AzureAppConfigurationClient(
            base_url=endpoint,
            credential=get_credential(),
        ) as client:
            async for item in client.list_configuration_settings():
                if item.value is not None:
                    settings[item.key] = item.value
    _settings = settings


@overload
def get(key: str, default: str) -> str: ...


@overload
def get(key: str, default: None = None) -> str | None: ...


def get(key: str, default: str | None = None) -> str | None:
    if _settings is None:
        raise RuntimeError("Configuration is not initialized.")
    return _settings.get(key, default)


def require(key: str) -> str:
    value = get(key)
    if not value:
        raise RuntimeError(f"Required setting '{key}' is not configured.")
    return value
