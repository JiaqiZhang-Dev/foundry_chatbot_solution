"""Feedback API models."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class Reaction(str, Enum):
    good = "good"
    bad = "bad"


class FeedbackRequest(BaseModel):
    reaction: Reaction
    comment: str | None = None
    reasons: list[str] = Field(default_factory=list)
    link: str | None = None
    channel_id: str | None = None
    user_name: str | None = None


class FeedbackResponse(BaseModel):
    id: str
    saved: bool
