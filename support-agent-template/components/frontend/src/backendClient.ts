import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";

import type { ChatRequest, ChatResponse } from "./models.js";

export interface BackendClientOptions {
    baseUrl: string;
    scope?: string;
    managedIdentityClientId: string;
    timeoutMs?: number;
    credential?: TokenCredential;
}

export class BackendClient {
    private readonly baseUrl: string;
    private readonly scope?: string;
    private readonly timeoutMs: number;
    private readonly credential: TokenCredential;

    public constructor(options: BackendClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, "");
        this.scope = options.scope;
        this.timeoutMs = options.timeoutMs ?? 180_000;
        this.credential =
            options.credential ??
            new DefaultAzureCredential({
                managedIdentityClientId: options.managedIdentityClientId,
            });
    }

    public async chat(request: ChatRequest): Promise<ChatResponse> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.scope) {
            const token = await this.credential.getToken(normalizeScope(this.scope));
            if (!token?.token) {
                throw new Error("Backend access token acquisition returned no token.");
            }
            headers.Authorization = `Bearer ${token.token}`;
        }

        const response = await fetch(`${this.baseUrl}/agent/chat`, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) {
            const details = await response.text();
            throw new Error(
                `Backend chat request failed with ${response.status}: ${details.slice(0, 1000)}`,
            );
        }

        const payload = (await response.json()) as ChatResponse;
        if (!payload.id || typeof payload.answer !== "string") {
            throw new Error("Backend returned an invalid chat response.");
        }
        return payload;
    }
}

export function normalizeScope(value: string): string {
    const scope = value.trim().replace(/\/+$/, "");
    return scope.endsWith("/.default") ? scope : `${scope}/.default`;
}
