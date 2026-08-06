"""Minimal prompt-driven Azure AI Foundry hosted agent."""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(override=False)

from agent_framework import Agent
from agent_framework.foundry import FoundryChatClient
from agent_framework_foundry_hosting import ResponsesHostServer

import config.app_config as app_config
from config.app_config import get, require
from utils.azure_credential import close_credential, get_credential

logger = logging.getLogger(__name__)
DEFAULT_INSTRUCTION_PATH = Path(__file__).with_name("instruction.md")
WEB_SEARCH_CONTEXT_SIZES = {"low", "medium", "high"}


def resolve_instructions(
    configured_instructions: str | None,
    instruction_path: Path = DEFAULT_INSTRUCTION_PATH,
) -> str:
    """Resolve a non-empty customer prompt from configuration or the file."""
    instructions = (configured_instructions or "").strip()
    if not instructions:
        if not instruction_path.exists():
            raise FileNotFoundError(
                f"Agent instruction file does not exist: {instruction_path}"
            )
        instructions = instruction_path.read_text(encoding="utf-8").strip()
    if not instructions:
        raise RuntimeError("Agent instructions cannot be empty.")
    return instructions


def create_agent() -> Agent:
    """Create a prompt-only agent from initialized configuration."""
    agent_name = get("AI_FOUNDRY_AGENT_NAME", "support-agent")
    app_version = os.environ.get("APP_VERSION")
    agent_id = f"{agent_name}:{app_version}" if app_version else agent_name
    instructions = resolve_instructions(get("AGENT_INSTRUCTIONS"))

    client = FoundryChatClient(
        project_endpoint=require("AI_FOUNDRY_PROJECT_ENDPOINT"),
        model=require("AI_FOUNDRY_AGENT_COMPLETION_MODEL"),
        credential=get_credential(),
    )

    tools = []
    web_search_enabled = get("ENABLE_WEB_SEARCH", "true").lower() == "true"
    if web_search_enabled:
        context_size = get("WEB_SEARCH_CONTEXT_SIZE", "medium").lower()
        if context_size not in WEB_SEARCH_CONTEXT_SIZES:
            raise RuntimeError(
                "WEB_SEARCH_CONTEXT_SIZE must be one of: low, medium, high."
            )
        tools.append(client.get_web_search_tool(search_context_size=context_size))

        source_hints = get("WEB_SEARCH_SOURCE_HINTS", "").strip()
        if source_hints:
            instructions += (
                "\n\nWhen using web search, prefer these customer-provided public "
                f"sources when they are relevant: {source_hints}"
            )
        instructions += (
            "\n\nUse web search when current or externally verifiable information "
            "is needed. Cite the source URLs used in the answer."
        )

    default_options = {}
    reasoning_effort = get("AI_FOUNDRY_AGENT_REASONING_EFFORT")
    if reasoning_effort:
        default_options["reasoning"] = {"effort": reasoning_effort}
    if web_search_enabled:
        default_options["include"] = ["web_search_call.action.sources"]

    return Agent(
        client,
        name=agent_name,
        id=agent_id,
        instructions=instructions,
        tools=tools,
        default_options=default_options,
    )


async def main() -> None:
    await app_config.init()
    server = ResponsesHostServer(create_agent())
    try:
        await server.run_async()
    finally:
        await close_credential()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )
    logging.getLogger("azure.core.pipeline.policies.http_logging_policy").setLevel(
        logging.WARNING
    )
    logger.info("Prompt agent container starting")
    asyncio.run(main())
