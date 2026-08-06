"""Invoke the configured Foundry hosted agent."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import cast

from azure.ai.projects.aio import AIProjectClient
from azure.ai.projects.models import AgentVersionDetails
from openai import AsyncOpenAI, NotFoundError
from openai.types.responses import Response as OpenAIResponse
from openai.types.responses.response_input_item_param import ResponseInputItemParam

from config.app_config import get, require
from models.chat import AdditionalInfoType, ChatRequest, ChatResponse, Reference
from models.conversation import ConversationMessage, Role
from services.conversation_service import ConversationService
from utils.azure_foundry import (
    get_openai_client,
    get_project_client,
    get_stateless_session_id,
    set_stateless_session_id,
)
from utils.hosted_agent import HostedAgentClient
from utils.text import preprocess_message

_REFERENCE_SECTION_RE = re.compile(r"\n*\*\*References\*\*\s*\n", re.IGNORECASE)
_REFERENCE_LINK_RE = re.compile(r"-\s*\[([^\]]+)\]\(([^)]+)\)")
_MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")
_CITATION_TOKEN_RE = re.compile(r"[^\w\s]*cite[^\w\s]*turn\d+\S*")


class ChatService:
    def __init__(self) -> None:
        self._conversations = ConversationService()

    async def chat(self, request: ChatRequest) -> ChatResponse:
        project_client = get_project_client()
        openai_client = get_openai_client()
        agent = await self._get_agent(project_client)

        threaded = bool(request.conversation_id and request.conversation_type)
        if threaded:
            conversation_id, is_new = await self._resolve_conversation(
                openai_client,
                request,
            )
            session_id = None
        else:
            conversation_id, is_new = None, True
            session_id = get_stateless_session_id()

        items: list[ResponseInputItemParam] = [
            cast(
                ResponseInputItemParam,
                {
                    "type": "message",
                    "role": request.message.role.value,
                    "content": preprocess_message(request.message.content),
                },
            )
        ]
        for info in request.additional_infos:
            content = info.content
            if info.type == AdditionalInfoType.Link and info.link:
                content = f"{content}: {info.link}"
            items.append(
                cast(
                    ResponseInputItemParam,
                    {"type": "message", "role": "user", "content": content},
                )
            )

        agent_ref = {
            "name": agent.name,
            "version": agent.version,
            "type": "agent_reference",
        }
        trace_id, response = await HostedAgentClient(openai_client).invoke(
            conversation_items=items,
            agent_conversation_id=conversation_id,
            agent_session_id=session_id,
            agent_ref=agent_ref,
        )
        if not threaded and not get_stateless_session_id():
            extra = getattr(response, "model_extra", None) or {}
            set_stateless_session_id(extra.get("agent_session_id"))

        answer, references = self._parse_response(response.output_text or "")
        references = self._merge_references(
            references,
            self._extract_url_citations(response),
        )
        if threaded and answer:
            await self._save_answer(request, response.id, answer)

        return ChatResponse(
            id=response.id,
            answer=answer,
            has_result=bool(answer),
            references=references,
            agent_conversation_id=conversation_id,
            trace_id=trace_id,
        )

    async def _get_agent(
        self,
        project_client: AIProjectClient,
    ) -> AgentVersionDetails:
        name = require("AI_FOUNDRY_AGENT_NAME")
        version = get("AI_FOUNDRY_AGENT_VERSION")
        if version:
            return await project_client.agents.get_version(name, version)
        details = await project_client.agents.get(name)
        if details is None or details.versions.latest is None:
            raise RuntimeError(f"Foundry agent '{name}' has no deployed version.")
        return details.versions.latest

    async def _resolve_conversation(
        self,
        client: AsyncOpenAI,
        request: ChatRequest,
    ) -> tuple[str, bool]:
        assert request.conversation_id
        assert request.conversation_type
        stored = await self._conversations.get_agent_conversation_id(
            request.conversation_id,
            request.conversation_type,
        )
        if stored:
            try:
                await client.conversations.retrieve(stored)
                return stored, False
            except NotFoundError:
                pass

        conversation = await client.conversations.create()
        await self._conversations.save_agent_conversation_mapping(
            request.conversation_id,
            request.conversation_type,
            conversation.id,
        )
        return conversation.id, True

    async def _save_answer(
        self,
        request: ChatRequest,
        response_id: str,
        answer: str,
    ) -> None:
        assert request.conversation_id
        assert request.conversation_type
        await self._conversations.save_conversation(
            ConversationMessage(
                id=f"bot-{response_id}",
                sender_role=Role.Assistant,
                sender_id="support-agent",
                sender_name=get("ASSISTANT_NAME", "Support Agent"),
                content=answer,
                created_at=datetime.now(timezone.utc),
                conversation_id=request.conversation_id,
                conversation_type=request.conversation_type,
            )
        )

    @staticmethod
    def _parse_response(text: str) -> tuple[str, list[Reference]]:
        cleaned = _CITATION_TOKEN_RE.sub("", text).strip()
        inline_references = [
            Reference(title=title.strip(), link=link.strip())
            for title, link in _MARKDOWN_LINK_RE.findall(cleaned)
        ]
        match = _REFERENCE_SECTION_RE.search(cleaned)
        if not match:
            return cleaned, ChatService._merge_references(inline_references)
        section_references = [
            Reference(title=title.strip(), link=link.strip())
            for title, link in _REFERENCE_LINK_RE.findall(cleaned[match.end() :])
        ]
        return (
            cleaned[: match.start()].rstrip(),
            ChatService._merge_references(
                section_references,
                inline_references,
            ),
        )

    @staticmethod
    def _extract_url_citations(response: OpenAIResponse) -> list[Reference]:
        references: list[Reference] = []
        for item in response.output or []:
            for content in getattr(item, "content", None) or []:
                for annotation in getattr(content, "annotations", None) or []:
                    if getattr(annotation, "type", None) != "url_citation":
                        continue
                    url = getattr(annotation, "url", None)
                    if not url:
                        continue
                    references.append(
                        Reference(
                            title=getattr(annotation, "title", None) or url,
                            link=url,
                        )
                    )
        return references

    @staticmethod
    def _merge_references(
        *reference_groups: list[Reference],
    ) -> list[Reference]:
        merged: list[Reference] = []
        seen_links: set[str] = set()
        for references in reference_groups:
            for reference in references:
                if reference.link in seen_links:
                    continue
                seen_links.add(reference.link)
                merged.append(reference)
        return merged
