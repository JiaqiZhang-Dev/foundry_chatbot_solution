"""Microsoft Graph Teams message models used by the Logic App."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TeamsMessageBody(BaseModel):
    content: str = ""
    contentType: str = "text"


class TeamsUser(BaseModel):
    id: str
    displayName: str = ""


class TeamsApplication(BaseModel):
    id: str
    displayName: str = ""


class TeamsMessageSender(BaseModel):
    user: TeamsUser | None = None
    application: TeamsApplication | None = None


class TeamsChannelIdentity(BaseModel):
    channelId: str
    teamId: str


class TeamsMentionedIdentity(BaseModel):
    application: TeamsApplication | None = None


class TeamsMention(BaseModel):
    mentionText: str = ""
    mentioned: TeamsMentionedIdentity | None = None


class TeamsChatMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str
    createdDateTime: datetime
    webUrl: str
    body: TeamsMessageBody
    channelIdentity: TeamsChannelIdentity
    sender: TeamsMessageSender | None = Field(default=None, alias="from")
    replyToId: str | None = None
    subject: str | None = None
    locale: str | None = None
    mentions: list[TeamsMention] = Field(default_factory=list)
