"""Persist chatbot conversation state in Cosmos DB."""

from __future__ import annotations

from models.conversation import (
    ConversationDocumentType,
    ConversationMappingItem,
    ConversationMessage,
    ConversationMessageItem,
    ConversationType,
)
from utils.azure_cosmosdb import (
    get_conversation_mapping_container,
    get_conversation_message_container,
)


class ConversationService:
    @staticmethod
    def _partition(
        conversation_id: str,
        conversation_type: ConversationType,
    ) -> str:
        return f"{conversation_type.value}:{conversation_id}"

    async def get_agent_conversation_id(
        self,
        customer_conversation_id: str | None,
        conversation_type: ConversationType | None,
    ) -> str | None:
        if not customer_conversation_id or not conversation_type:
            return None
        key = self._partition(customer_conversation_id, conversation_type)
        container = await get_conversation_mapping_container()
        try:
            raw = await container.read_item(
                item=customer_conversation_id,
                partition_key=key,
            )
        except Exception as error:
            if getattr(error, "status_code", None) == 404:
                return None
            raise
        return ConversationMappingItem.model_validate(raw).agent_conversation_id

    async def save_agent_conversation_mapping(
        self,
        customer_conversation_id: str,
        conversation_type: ConversationType,
        agent_conversation_id: str,
    ) -> None:
        key = self._partition(customer_conversation_id, conversation_type)
        item = ConversationMappingItem(
            id=customer_conversation_id,
            customer_conversation_id=customer_conversation_id,
            conversation_type=conversation_type,
            mapping_key=key,
            agent_conversation_id=agent_conversation_id,
        )
        container = await get_conversation_mapping_container()
        await container.upsert_item(item.model_dump(mode="json"))

    async def save_conversation(self, message: ConversationMessage) -> None:
        item = ConversationMessageItem(
            **message.model_dump(),
            conversation_partition=self._partition(
                message.conversation_id,
                message.conversation_type,
            ),
        )
        container = await get_conversation_message_container()
        await container.upsert_item(item.model_dump(mode="json"))

    async def get_messages(
        self,
        conversation_id: str,
        conversation_type: ConversationType,
    ) -> list[ConversationMessageItem]:
        partition = self._partition(conversation_id, conversation_type)
        query = (
            "SELECT * FROM c WHERE c.conversation_partition = @partition "
            "AND c.document_type = @documentType ORDER BY c.created_at ASC"
        )
        parameters = [
            {"name": "@partition", "value": partition},
            {
                "name": "@documentType",
                "value": ConversationDocumentType.message.value,
            },
        ]
        container = await get_conversation_message_container()
        return [
            ConversationMessageItem.model_validate(item)
            async for item in container.query_items(
                query=query,
                parameters=parameters,
                partition_key=partition,
            )
        ]

    async def has_expert_reply(
        self,
        conversation_id: str,
        conversation_type: ConversationType,
        original_author_id: str,
    ) -> bool:
        messages = await self.get_messages(conversation_id, conversation_type)
        return any(
            message.sender_role.value == "user"
            and message.sender_id != original_author_id
            for message in messages
        )

    async def record_should_reply(
        self,
        message_id: str,
        conversation_id: str,
        conversation_type: ConversationType,
        should_reply: bool,
    ) -> None:
        partition = self._partition(conversation_id, conversation_type)
        container = await get_conversation_message_container()
        try:
            raw = await container.read_item(item=message_id, partition_key=partition)
        except Exception as error:
            if getattr(error, "status_code", None) == 404:
                return
            raise
        item = ConversationMessageItem.model_validate(raw)
        item.should_reply = should_reply
        await container.upsert_item(item.model_dump(mode="json"))
