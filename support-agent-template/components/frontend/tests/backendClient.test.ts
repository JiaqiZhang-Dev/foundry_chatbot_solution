import { describe, expect, it } from "vitest";

import { normalizeScope } from "../src/backendClient.js";

describe("normalizeScope", () => {
    it("adds the default scope suffix", () => {
        expect(normalizeScope("api://backend")).toBe("api://backend/.default");
    });

    it("preserves an existing default scope", () => {
        expect(normalizeScope("api://backend/.default")).toBe(
            "api://backend/.default",
        );
    });
});
