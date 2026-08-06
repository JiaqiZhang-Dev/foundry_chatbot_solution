import { describe, expect, it } from "vitest";
import type { Activity } from "botbuilder";

import {
    buildChatRequest,
    formatChatResponse,
    getConversationType,
} from "../src/messageHandler.js";

const baseActivity = {
    type: "message",
    id: "message-1",
    channelId: "msteams",
    serviceUrl: "https://example.test",
    conversation: {
        id: "channel-1;messageid=root-1",
        conversationType: "channel",
    },
    from: {
        id: "teams-user",
        aadObjectId: "entra-user",
        name: "User One",
    },
    recipient: { id: "bot-id", name: "Support Agent" },
    text: "How do I reset my password?",
} as Activity;

describe("message handling", () => {
    it("maps Teams channel context to the backend contract", () => {
        expect(buildChatRequest(baseActivity, baseActivity.text!)).toEqual({
            conversation_id: "channel-1;messageid=root-1",
            conversation_type: "teams_channel",
            message: {
                id: "message-1",
                role: "user",
                content: "How do I reset my password?",
                user_name: "User One",
                user_id: "entra-user",
            },
        });
    });

    it("detects chat conversations", () => {
        const activity = {
            ...baseActivity,
            conversation: { id: "chat-1", conversationType: "personal" },
            channelData: {},
        } as Activity;

        expect(getConversationType(activity)).toBe("teams_chat");
    });

    it("appends backend references missing from the answer", () => {
        expect(
            formatChatResponse({
                id: "response-1",
                answer: "Follow the documented reset procedure.",
                has_result: true,
                references: [
                    {
                        title: "Reset guide",
                        link: "https://example.test/reset",
                    },
                ],
            }),
        ).toContain(
            "**Sources**\n- [Reset guide](https://example.test/reset)",
        );
    });
});
