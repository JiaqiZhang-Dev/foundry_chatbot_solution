"""Logic App intention-classification models."""

from __future__ import annotations

from pydantic import BaseModel

from models.chat import Message
from models.conversation import ConversationType


class IntentionRequest(BaseModel):
    message: Message
    conversation_id: str | None = None
    conversation_type: ConversationType | None = None


class IntentionResponse(BaseModel):
    should_respond: bool
    reason: str
