"""Conversation API and Cosmos DB models."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class Role(str, Enum):
    User = "user"
    Assistant = "assistant"
    System = "system"
    Developer = "developer"


class ConversationType(str, Enum):
    teams_channel = "teams_channel"
    teams_chat = "teams_chat"
    web = "web"


class ConversationDocumentType(str, Enum):
    mapping = "conversation_mapping"
    message = "conversation_message"


class ConversationMessageExtraInfo(BaseModel):
    channel_id: str | None = None
    message_link: str | None = None


class ConversationMessage(BaseModel):
    id: str
    sender_role: Role
    sender_id: str
    sender_name: str
    content: str
    created_at: datetime
    conversation_id: str
    conversation_type: ConversationType
    should_reply: bool | None = None
    extra_info: ConversationMessageExtraInfo | None = None


class ConversationMappingItem(BaseModel):
    id: str
    customer_conversation_id: str
    mapping_key: str
    agent_conversation_id: str
    conversation_type: ConversationType | None = None
    document_type: ConversationDocumentType = Field(
        default=ConversationDocumentType.mapping
    )


class ConversationMessageItem(ConversationMessage):
    conversation_partition: str
    document_type: ConversationDocumentType = Field(
        default=ConversationDocumentType.message
    )


class SaveConversationMessageResponse(BaseModel):
    saved: bool = True
