import express from "express";

import { createAdapter } from "./adapter.js";
import { BackendClient } from "./backendClient.js";
import { loadConfig } from "./config.js";
import { handleTurn } from "./messageHandler.js";

const config = loadConfig();
const adapter = createAdapter(config);
const backendClient = new BackendClient({
    baseUrl: config.backendBaseUrl,
    scope: config.backendScope,
    managedIdentityClientId: config.userAssignedIdentityClientId,
});

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_request, response) => {
    response.status(200).json({
        status: "healthy",
        version: "0.1.0",
        uptime: process.uptime(),
    });
});

app.post("/api/messages", async (request, response) => {
    await adapter.process(request, response, async (context) => {
        await handleTurn(context, backendClient);
    });
});

app.listen(config.port, () => {
    console.info(`${config.botDisplayName} listening on port ${config.port}`);
});
