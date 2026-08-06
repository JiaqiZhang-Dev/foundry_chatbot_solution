"""Classify whether the Logic App should auto-reply."""

from __future__ import annotations

from pathlib import Path

from openai.types.chat import ChatCompletionMessageParam

from config.app_config import get
from models.conversation import Role
from models.intention import IntentionRequest, IntentionResponse
from services.conversation_service import ConversationService
from utils.azure_foundry import get_completion_client

_PROMPT = (Path(__file__).parent.parent / "prompts" / "intention.md").read_text(
    encoding="utf-8"
)


class IntentionService:
    def __init__(self) -> None:
        self._conversations = ConversationService()

    async def classify(self, request: IntentionRequest) -> IntentionResponse:
        history = []
        if request.conversation_id and request.conversation_type:
            if request.message.user_id and await self._conversations.has_expert_reply(
                request.conversation_id,
                request.conversation_type,
                request.message.user_id,
            ):
                return IntentionResponse(
                    should_respond=False,
                    reason="A human participant has already replied.",
                )
            history = await self._conversations.get_messages(
                request.conversation_id,
                request.conversation_type,
            )

        messages: list[ChatCompletionMessageParam] = [
            {
                "role": "system",
                "content": _PROMPT.format(
                    assistant_scope=get(
                        "ASSISTANT_SCOPE",
                        "the configured business support domain",
                    )
                ),
            }
        ]
        for item in history:
            role = (
                "assistant"
                if item.sender_role in (Role.Assistant, Role.System)
                else "user"
            )
            messages.append({"role": role, "content": item.content})
        messages.append({"role": "user", "content": request.message.content})

        intention_model = get("AI_FOUNDRY_INTENTION_MODEL") or get(
            "AI_FOUNDRY_AGENT_COMPLETION_MODEL",
            "gpt-4o-mini",
        )
        response = await get_completion_client().chat.completions.create(
            model=intention_model,
            messages=messages,
            response_format={"type": "json_object"},
        )
        result = IntentionResponse.model_validate_json(
            response.choices[0].message.content or ""
        )

        if (
            request.message.id
            and request.conversation_id
            and request.conversation_type
        ):
            await self._conversations.record_should_reply(
                request.message.id,
                request.conversation_id,
                request.conversation_type,
                result.should_respond,
            )
        return result
