import assert from "node:assert/strict";
import test from "node:test";

import { generateCustomerConfig } from "../scripts/generate-customer-config.mjs";

const requiredValues = {
  solutionName: "contoso-support",
  assistantDisplayName: "Contoso Support",
  agentInstructions: "Answer Contoso questions.",
  modelDeployment: "gpt-4.1-mini",
};

test("generates internal configuration from public parameter values", async () => {
  const config = await generateCustomerConfig({
    parameterValues: {
      ...requiredValues,
      teamsEnabled: true,
      teamsAutoReply: true,
      teamsTeamId: "team-id",
      teamsChannelIds: ["channel-id"],
      developerName: "Contoso",
      developerWebsiteUrl: "https://contoso.example",
      privacyUrl: "https://contoso.example/privacy",
      termsOfUseUrl: "https://contoso.example/terms",
    },
  });

  assert.equal(config.assistant.webSearch.enabled, true);
  assert.equal(config.assistant.webSearch.contextSize, "medium");
  assert.equal(config.teams.autoReply, true);
  assert.deepEqual(config.teams.channelIds, ["channel-id"]);
  assert.equal(config.deployment, undefined);
});

test("does not require Teams parameters when Teams is disabled", async () => {
  const config = await generateCustomerConfig({
    parameterValues: requiredValues,
  });

  assert.equal(config.teams.enabled, false);
  assert.equal(config.teams.developer, undefined);
});

test("rejects missing conditional Teams parameters", async () => {
  await assert.rejects(
    generateCustomerConfig({
      parameterValues: {
        ...requiredValues,
        teamsEnabled: true,
      },
    }),
    /developerName is required/,
  );
});
