import pytest
from pydantic import ValidationError

from models.chat import ChatRequest


def test_chat_request_requires_non_empty_message() -> None:
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(
            {
                "message": {
                    "role": "user",
                    "content": "",
                }
            }
        )
