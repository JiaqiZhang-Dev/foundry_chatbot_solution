"""Persist feedback as immutable JSON records in Blob Storage."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from uuid import uuid4

from config.app_config import get
from models.feedback import FeedbackRequest, FeedbackResponse
from utils.azure_storage import upload_blob


class FeedbackService:
    async def process(self, request: FeedbackRequest) -> FeedbackResponse:
        feedback_id = str(uuid4())
        now = datetime.now(timezone.utc)
        payload = {
            "id": feedback_id,
            "createdAt": now.isoformat(),
            **request.model_dump(mode="json"),
        }
        blob_name = f"{now:%Y/%m}/{feedback_id}.json"
        await upload_blob(
            get("STORAGE_FEEDBACK_CONTAINER", "feedback"),
            blob_name,
            json.dumps(payload, ensure_ascii=True).encode("utf-8"),
        )
        return FeedbackResponse(id=feedback_id, saved=True)
