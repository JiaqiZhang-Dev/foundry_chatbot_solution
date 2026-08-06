"""Shared Azure AI Foundry clients."""

from __future__ import annotations

from azure.ai.projects.aio import AIProjectClient
from openai import AsyncOpenAI

from config.app_config import require
from utils.azure_credential import get_credential

_project_client: AIProjectClient | None = None
_openai_client: AsyncOpenAI | None = None
_completion_client: AsyncOpenAI | None = None
_stateless_session_id: str | None = None


def get_project_client() -> AIProjectClient:
    global _project_client
    if _project_client is None:
        _project_client = AIProjectClient(
            endpoint=require("AI_FOUNDRY_PROJECT_ENDPOINT"),
            credential=get_credential(),
            allow_preview=True,
        )
    return _project_client


def get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = get_project_client().get_openai_client(
            agent_name=require("AI_FOUNDRY_AGENT_NAME")
        )
    return _openai_client


def get_completion_client() -> AsyncOpenAI:
    """Return the project client used for model deployments, not hosted agents."""
    global _completion_client
    if _completion_client is None:
        _completion_client = get_project_client().get_openai_client()
    return _completion_client


def get_stateless_session_id() -> str | None:
    return _stateless_session_id


def set_stateless_session_id(session_id: str | None) -> None:
    global _stateless_session_id
    _stateless_session_id = session_id


async def close_clients() -> None:
    global _project_client, _openai_client, _completion_client
    if _completion_client is not None:
        await _completion_client.close()
        _completion_client = None
    if _openai_client is not None:
        await _openai_client.close()
        _openai_client = None
    if _project_client is not None:
        await _project_client.close()
        _project_client = None
