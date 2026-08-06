"""Support agent backend server."""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from contextvars import ContextVar
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv(override=False)

from fastapi import FastAPI, HTTPException, Request

from _version import VERSION
import config.app_config as app_config
from models.chat import ChatRequest, ChatResponse
from models.conversation import ConversationMessage, SaveConversationMessageResponse
from models.feedback import FeedbackRequest, FeedbackResponse
from models.intention import IntentionRequest, IntentionResponse
from models.teams import TeamsChatMessage
from services.activity_service import ActivityService
from services.chat_service import ChatService
from services.conversation_service import ConversationService
from services.feedback_service import FeedbackService
from services.intention_service import IntentionService
from utils.azure_cosmosdb import close_cosmos_client
from utils.azure_credential import close_credential
from utils.azure_foundry import close_clients
from utils.azure_storage import close_storage_client

_request_id: ContextVar[str] = ContextVar("request_id", default="system")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id.get()
        return True


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s [RequestID: %(request_id)s] "
            "%(name)s: %(message)s"
        )
    )
    handler.addFilter(RequestIdFilter())
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)


configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await app_config.init()
    yield
    await close_clients()
    await close_cosmos_client()
    await close_storage_client()
    await close_credential()


app = FastAPI(title="Support Agent Backend", version=VERSION, lifespan=lifespan)
chat_service = ChatService()
conversation_service = ConversationService()
feedback_service = FeedbackService()
intention_service = IntentionService()


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = str(uuid4())
    token = _request_id.set(request_id)
    try:
        response = await call_next(request)
    finally:
        _request_id.reset(token)
    response.headers["x-request-id"] = request_id
    return response


@app.get("/ping")
async def ping():
    return {"status": "ok", "version": VERSION}


@app.post("/agent/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        return await chat_service.chat(request)
    except Exception:
        logger.exception("Chat request failed")
        raise


@app.post("/agent/feedback", response_model=FeedbackResponse)
async def feedback(request: FeedbackRequest):
    return await feedback_service.process(request)


@app.post(
    "/conversation/save",
    response_model=SaveConversationMessageResponse,
)
async def save_conversation(request: ConversationMessage):
    await conversation_service.save_conversation(request)
    return SaveConversationMessageResponse()


@app.post("/message/intention", response_model=IntentionResponse)
async def intention(request: IntentionRequest):
    return await intention_service.classify(request)


@app.post("/teams/activity/convert")
async def convert_teams_activity(request: TeamsChatMessage):
    service = ActivityService(
        bot_id=app_config.require("TEAMS_BOT_ID"),
        bot_name=app_config.get("ASSISTANT_NAME", "Support Agent"),
        service_url_base=app_config.get(
            "TEAMS_SERVICE_URL_BASE",
            "https://smba.trafficmanager.net/amer",
        ),
        default_locale=app_config.get("DEFAULT_LOCALE", "en-US"),
        default_timezone=app_config.get("DEFAULT_TIMEZONE", "UTC"),
    )
    try:
        return service.convert(request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8089)
