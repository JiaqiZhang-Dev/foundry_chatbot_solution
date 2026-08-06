export type ConversationType = "teams_channel" | "teams_chat";

export interface ChatRequest {
    conversation_id?: string;
    conversation_type?: ConversationType;
    message: {
        id?: string;
        role: "user";
        content: string;
        user_name?: string;
        user_id?: string;
    };
}

export interface Reference {
    title: string;
    link: string;
}

export interface ChatResponse {
    id: string;
    answer: string;
    has_result: boolean;
    references: Reference[];
    trace_id?: string;
}
