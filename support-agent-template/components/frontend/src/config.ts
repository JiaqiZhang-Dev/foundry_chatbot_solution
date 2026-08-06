function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Required environment variable '${name}' is not configured.`);
    }
    return value;
}

export interface FrontendConfig {
    isLocal: boolean;
    botId: string;
    botTenantId: string;
    botType: string;
    botPassword?: string;
    botDisplayName: string;
    backendBaseUrl: string;
    backendScope?: string;
    userAssignedIdentityClientId: string;
    port: number;
}

export function loadConfig(): FrontendConfig {
    const isLocal = process.env.IS_LOCAL === "true";
    const botId = process.env.BOT_ID?.trim() || "";
    if (!isLocal && !botId) {
        required("BOT_ID");
    }
    const port = Number(process.env.PORT ?? "3978");
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error("PORT must be a valid TCP port.");
    }

    return {
        isLocal,
        botId,
        botTenantId: isLocal
            ? process.env.BOT_TENANT_ID?.trim() || ""
            : required("BOT_TENANT_ID"),
        botType: process.env.BOT_TYPE?.trim() || "UserAssignedMSI",
        botPassword: process.env.BOT_PASSWORD?.trim() || undefined,
        botDisplayName: process.env.BOT_DISPLAY_NAME?.trim() || "Support Agent",
        backendBaseUrl: required("BACKEND_BASE_URL").replace(/\/+$/, ""),
        backendScope: process.env.BACKEND_SCOPE?.trim() || undefined,
        userAssignedIdentityClientId:
            process.env.USER_ASSIGNED_IDENTITY_CLIENT_ID?.trim() || botId,
        port,
    };
}
