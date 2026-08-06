"""Chat request and response models."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

from models.conversation import ConversationType, Role


class AdditionalInfoType(str, Enum):
    Link = "link"
    Text = "text"


class Message(BaseModel):
    id: str | None = None
    role: Role
    content: str = Field(min_length=1)
    user_name: str | None = None
    user_id: str | None = None


class AdditionalInfo(BaseModel):
    type: AdditionalInfoType
    content: str
    link: str | None = None


class Reference(BaseModel):
    title: str
    link: str


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    conversation_type: ConversationType | None = None
    message: Message
    additional_infos: list[AdditionalInfo] = Field(default_factory=list)


class ChatResponse(BaseModel):
    id: str
    answer: str
    has_result: bool
    references: list[Reference] = Field(default_factory=list)
    agent_conversation_id: str | None = None
    trace_id: str | None = None
