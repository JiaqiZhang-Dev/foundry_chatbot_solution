import {
    CloudAdapter,
    ConfigurationBotFrameworkAuthentication,
} from "botbuilder";

import type { FrontendConfig } from "./config.js";

export function createAdapter(config: FrontendConfig): CloudAdapter {
    const authentication = new ConfigurationBotFrameworkAuthentication(
        config.isLocal && !config.botId
            ? {}
            : {
                  MicrosoftAppId: config.botId,
                  MicrosoftAppPassword: config.botPassword,
                  MicrosoftAppType: config.botType,
                  MicrosoftAppTenantId: config.botTenantId,
              },
    );
    const adapter = new CloudAdapter(authentication);
    adapter.onTurnError = async (context, error) => {
        console.error("Unhandled bot turn error", error);
        if (context.activity.type === "message") {
            await context.sendActivity(
                "The assistant encountered an error while processing this message.",
            );
        }
    };
    return adapter;
}
