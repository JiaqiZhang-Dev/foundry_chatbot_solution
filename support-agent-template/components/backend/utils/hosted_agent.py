"""Bounded-retry invocation for Azure AI Foundry hosted agents."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    BadRequestError,
    NotFoundError,
)
from openai.types.responses import Response as OpenAIResponse
from openai.types.responses.response_input_item_param import ResponseInputItemParam

from utils.azure_foundry import set_stateless_session_id

logger = logging.getLogger(__name__)


class EmptyAgentResponseError(Exception):
    pass


class HostedAgentClient:
    def __init__(
        self,
        openai_client: AsyncOpenAI,
        *,
        max_retries: int = 3,
        retry_delay: float = 1.5,
        stream_timeout: float = 180.0,
    ) -> None:
        self._client = openai_client
        self._max_retries = max_retries
        self._retry_delay = retry_delay
        self._stream_timeout = stream_timeout

    async def invoke(
        self,
        conversation_items: list[ResponseInputItemParam],
        agent_ref: dict[str, str],
        agent_conversation_id: str | None = None,
        agent_session_id: str | None = None,
    ) -> tuple[str | None, OpenAIResponse]:
        last_error: Exception | None = None

        for attempt in range(1, self._max_retries + 1):
            extra_body: dict[str, Any] = {"agent_reference": agent_ref}
            kwargs: dict[str, Any] = {}
            if agent_conversation_id:
                kwargs["conversation"] = agent_conversation_id
            if agent_session_id:
                extra_body["agent_session_id"] = agent_session_id

            stream = None
            try:
                stream = await self._client.responses.create(
                    input=conversation_items,
                    store=True,
                    stream=True,
                    extra_body=extra_body,
                    **kwargs,
                )
                response = await asyncio.wait_for(
                    self._consume_stream(stream),
                    timeout=self._stream_timeout,
                )
                if response.status == "completed" and not response.output_text:
                    response = await self._poll_response(response)
                if not response.output_text:
                    raise EmptyAgentResponseError("Agent returned an empty response.")
                trace_id = self._extract_trace_id(stream)
                await self._close_stream(stream)
                return trace_id, response
            except (NotFoundError, BadRequestError) as error:
                last_error = error
                await self._close_stream(stream)
                if agent_session_id:
                    set_stateless_session_id(None)
                    agent_session_id = None
                    continue
            except (
                APIConnectionError,
                APITimeoutError,
                APIStatusError,
                asyncio.TimeoutError,
                EmptyAgentResponseError,
                RuntimeError,
            ) as error:
                last_error = error
                await self._close_stream(stream)

            logger.warning(
                "Hosted agent invocation failed on attempt %d/%d",
                attempt,
                self._max_retries,
                exc_info=last_error,
            )
            if attempt < self._max_retries:
                await asyncio.sleep(self._retry_delay * attempt)

        raise RuntimeError(
            f"Hosted agent invocation failed after {self._max_retries} attempts."
        ) from last_error

    async def _consume_stream(self, stream) -> OpenAIResponse:
        async for event in stream:
            if event.type == "response.completed":
                return event.response
            if event.type in ("response.failed", "response.incomplete"):
                raise RuntimeError(f"Agent stream ended with {event.type}.")
        raise RuntimeError("Agent stream ended without a completed response.")

    async def _poll_response(
        self,
        response: OpenAIResponse,
        *,
        max_retries: int = 5,
        retry_delay: float = 3.0,
    ) -> OpenAIResponse:
        for _ in range(max_retries):
            await asyncio.sleep(retry_delay)
            refreshed = await self._client.responses.retrieve(response.id)
            if refreshed.output_text:
                return refreshed
        return response

    async def _close_stream(self, stream) -> None:
        if stream is None:
            return
        close = getattr(stream, "close", None)
        if close is None:
            return
        try:
            result = close()
            if asyncio.iscoroutine(result):
                await result
        except Exception:
            logger.debug("Failed to close agent stream", exc_info=True)

    @staticmethod
    def _extract_trace_id(stream) -> str | None:
        response = getattr(stream, "response", None)
        if response is None:
            return None
        value = response.headers.get("x-request-id", "")
        return value.split(",")[0].strip() if value else None
