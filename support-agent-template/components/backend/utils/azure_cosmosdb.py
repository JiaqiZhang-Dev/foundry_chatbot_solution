"""Cosmos DB clients for conversation state."""

from __future__ import annotations

import asyncio

from azure.cosmos.aio import ContainerProxy, CosmosClient

from config.app_config import get, require
from utils.azure_credential import get_credential

_client: CosmosClient | None = None
_mapping_container: ContainerProxy | None = None
_message_container: ContainerProxy | None = None
_lock = asyncio.Lock()


async def _get_client() -> CosmosClient:
    global _client
    if _client is None:
        async with _lock:
            if _client is None:
                _client = CosmosClient(
                    url=require("AZURE_COSMOSDB_ENDPOINT"),
                    credential=get_credential(),
                )
                await _client.__aenter__()
    return _client


async def _get_container(name: str) -> ContainerProxy:
    client = await _get_client()
    database = client.get_database_client(get("AZURE_COSMOSDB_DATABASE", "support-agent"))
    container = database.get_container_client(name)
    await container.read()
    return container


async def get_conversation_mapping_container() -> ContainerProxy:
    global _mapping_container
    if _mapping_container is None:
        _mapping_container = await _get_container(
            get("AZURE_COSMOSDB_MAPPING_CONTAINER", "conversation-mappings")
        )
    return _mapping_container


async def get_conversation_message_container() -> ContainerProxy:
    global _message_container
    if _message_container is None:
        _message_container = await _get_container(
            get("AZURE_COSMOSDB_MESSAGE_CONTAINER", "conversation-messages")
        )
    return _message_container


async def close_cosmos_client() -> None:
    global _client, _mapping_container, _message_container
    _mapping_container = None
    _message_container = None
    if _client is not None:
        await _client.__aexit__(None, None, None)
        _client = None
