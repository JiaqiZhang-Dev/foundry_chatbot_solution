import {
    ActivityTypes,
    TurnContext,
    type Activity,
} from "botbuilder";

import type { BackendClient } from "./backendClient.js";
import type { ChatRequest, ChatResponse, ConversationType } from "./models.js";

export async function handleTurn(
    context: TurnContext,
    backendClient: BackendClient,
): Promise<void> {
    if (context.activity.type !== ActivityTypes.Message) {
        return;
    }

    const content = extractMessageText(context.activity);
    if (!content) {
        await context.sendActivity("Please send a question.");
        return;
    }

    await context.sendActivity({ type: ActivityTypes.Typing });
    const response = await backendClient.chat(
        buildChatRequest(context.activity, content),
    );
    await context.sendActivity(formatChatResponse(response));
}

export function extractMessageText(activity: Activity): string {
    const withoutMention = TurnContext.removeRecipientMention(activity);
    return (withoutMention || activity.text || "").trim();
}

export function buildChatRequest(
    activity: Activity,
    content: string,
): ChatRequest {
    return {
        conversation_id: activity.conversation?.id,
        conversation_type: getConversationType(activity),
        message: {
            id: activity.id,
            role: "user",
            content,
            user_name: activity.from?.name,
            user_id: activity.from?.aadObjectId || activity.from?.id,
        },
    };
}

export function getConversationType(activity: Activity): ConversationType {
    const channelData = activity.channelData as
        | { teamsChannelId?: string; channel?: { id?: string } }
        | undefined;
    return activity.conversation?.conversationType === "channel" ||
        Boolean(channelData?.teamsChannelId || channelData?.channel?.id)
        ? "teams_channel"
        : "teams_chat";
}

export function formatChatResponse(response: ChatResponse): string {
    const answer = response.answer.trim();
    const missingReferences = (response.references ?? []).filter(
        (reference) => reference.link && !answer.includes(reference.link),
    );
    if (missingReferences.length === 0) {
        return answer || "I could not find an answer.";
    }

    const sources = missingReferences
        .map((reference) => `- [${reference.title || reference.link}](${reference.link})`)
        .join("\n");
    return `${answer}\n\n**Sources**\n${sources}`;
}
