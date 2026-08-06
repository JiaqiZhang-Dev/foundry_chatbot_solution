from datetime import datetime, timezone

import pytest

from models.teams import TeamsChatMessage
from services.activity_service import ActivityService


def _service() -> ActivityService:
    return ActivityService(
        bot_id="bot-application-id",
        bot_name="Contoso Support",
        service_url_base="https://smba.trafficmanager.net/apac/",
        default_locale="en-US",
        default_timezone="UTC",
    )


def _message(**overrides) -> TeamsChatMessage:
    payload = {
        "id": "message-1",
        "createdDateTime": datetime(2026, 8, 5, tzinfo=timezone.utc),
        "webUrl": "https://teams.microsoft.com/l/message?tenantId=tenant-1",
        "body": {
            "content": "<p>How can I reset my password?</p>",
            "contentType": "html",
        },
        "channelIdentity": {"channelId": "channel-1", "teamId": "team-1"},
        "from": {"user": {"id": "user-1", "displayName": "User One"}},
        "mentions": [
            {
                "mentionText": "Contoso Support",
                "mentioned": {
                    "application": {
                        "id": "bot-application-id",
                        "displayName": "Contoso Support",
                    }
                },
            }
        ],
    }
    payload.update(overrides)
    return TeamsChatMessage.model_validate(payload)


def test_convert_activity_uses_configured_bot_identity() -> None:
    activity = _service().convert(_message())

    assert activity["recipient"] == {
        "id": "28:bot-application-id",
        "name": "Contoso Support",
    }
    assert activity["serviceUrl"] == (
        "https://smba.trafficmanager.net/apac/tenant-1"
    )
    assert activity["conversation"]["id"] == "channel-1;messageid=message-1"
    assert activity["attachments"] == [
        {
            "contentType": "text/html",
            "content": "<p>How can I reset my password?</p>",
        }
    ]


def test_convert_activity_uses_reply_root_for_thread() -> None:
    activity = _service().convert(_message(replyToId="root-message"))

    assert activity["conversation"]["id"] == "channel-1;messageid=root-message"


def test_convert_activity_requires_tenant_id() -> None:
    with pytest.raises(ValueError, match="tenantId"):
        _service().convert(
            _message(webUrl="https://teams.microsoft.com/l/message")
        )
