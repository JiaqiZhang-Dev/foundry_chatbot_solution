import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const originalEnvironment = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnvironment };
});

describe("loadConfig", () => {
    it("supports the Agents Playground profile without bot credentials", () => {
        process.env.IS_LOCAL = "true";
        process.env.BACKEND_BASE_URL = "http://localhost:8000/";
        delete process.env.BOT_ID;
        delete process.env.BOT_TENANT_ID;

        const config = loadConfig();

        expect(config.isLocal).toBe(true);
        expect(config.botId).toBe("");
        expect(config.botTenantId).toBe("");
        expect(config.backendBaseUrl).toBe("http://localhost:8000");
    });

    it("requires bot credentials outside the Playground profile", () => {
        delete process.env.IS_LOCAL;
        process.env.BACKEND_BASE_URL = "http://localhost:8000";
        delete process.env.BOT_ID;
        delete process.env.BOT_TENANT_ID;

        expect(() => loadConfig()).toThrow(
            "Required environment variable 'BOT_ID' is not configured.",
        );
    });
});
