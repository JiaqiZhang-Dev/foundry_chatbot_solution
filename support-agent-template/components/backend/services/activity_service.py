"""Convert Microsoft Graph Teams messages into Bot Framework activities."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from models.teams import TeamsChatMessage


class ActivityService:
    def __init__(
        self,
        *,
        bot_id: str,
        bot_name: str,
        service_url_base: str,
        default_locale: str,
        default_timezone: str,
    ) -> None:
        self._bot_id = bot_id if bot_id.startswith("28:") else f"28:{bot_id}"
        self._bot_name = bot_name
        self._service_url_base = service_url_base.rstrip("/")
        self._default_locale = default_locale
        self._default_timezone = default_timezone

    def convert(self, message: TeamsChatMessage) -> dict[str, object]:
        query = parse_qs(urlparse(message.webUrl).query)
        tenant_id = (query.get("tenantId") or [""])[0]
        if not tenant_id:
            raise ValueError("Teams message webUrl must contain tenantId.")

        sender = message.sender.user if message.sender and message.sender.user else None
        root_message_id = message.replyToId or message.id
        timestamp = message.createdDateTime.isoformat()
        locale = message.locale or self._default_locale

        mention_entities = []
        for mention in message.mentions:
            application = mention.mentioned.application if mention.mentioned else None
            if application is None:
                continue
            application_id = (
                application.id
                if application.id.startswith("28:")
                else f"28:{application.id}"
            )
            mention_entities.append(
                {
                    "mentioned": {
                        "id": application_id,
                        "name": application.displayName,
                    },
                    "text": f"<at>{mention.mentionText}</at>",
                    "type": "mention",
                }
            )

        attachments = []
        if message.body.contentType.lower() == "html":
            attachments.append(
                {
                    "contentType": "text/html",
                    "content": message.body.content,
                }
            )

        return {
            "type": "message",
            "id": message.id,
            "timestamp": timestamp,
            "localTimestamp": timestamp,
            "serviceUrl": f"{self._service_url_base}/{tenant_id}",
            "channelId": "msteams",
            "from": {
                "id": sender.id if sender else "",
                "name": sender.displayName if sender else "",
                "aadObjectId": sender.id if sender else "",
                "role": "user",
            },
            "conversation": {
                "name": message.subject or "",
                "isGroup": True,
                "conversationType": "channel",
                "tenantId": tenant_id,
                "id": f"{message.channelIdentity.channelId};messageid={root_message_id}",
            },
            "recipient": {
                "id": self._bot_id,
                "name": self._bot_name,
            },
            "text": message.body.content,
            "textFormat": "plain",
            "attachments": attachments,
            "entities": [
                *mention_entities,
                {
                    "locale": locale,
                    "timezone": self._default_timezone,
                    "type": "clientInfo",
                },
            ],
            "channelData": {
                "teamsChannelId": message.channelIdentity.channelId,
                "teamsTeamId": message.channelIdentity.teamId,
                "channel": {"id": message.channelIdentity.channelId},
                "tenant": {"id": tenant_id},
            },
            "locale": locale,
            "localTimezone": self._default_timezone,
            "callerId": "urn:botframework:azure",
        }
