import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { renderCustomerConfiguration } from "../scripts/render-template.mjs";

const validConfiguration = `
schemaVersion: "1.0"
name: fabrikam-help
assistant:
  displayName: Fabrikam Help
  instructions: Answer Fabrikam questions.
  model: gpt-4.1-mini
teams:
  enabled: true
  autoReply: true
  teamId: team-id
  channelIds:
    - channel-id
  developer:
    name: Fabrikam
    websiteUrl: https://www.fabrikam.com
    privacyUrl: https://www.fabrikam.com/privacy
    termsOfUseUrl: https://www.fabrikam.com/terms
deployment:
  environment: dev
  location: westus2
`;

async function setup(configuration = validConfiguration) {
  const directory = await mkdtemp(join(tmpdir(), "support-agent-render-"));
  const configPath = join(directory, "customer.yaml");
  const outputPath = join(directory, "output");
  await writeFile(configPath, configuration, "utf8");
  return { configPath, outputPath };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function getResource(requirements, id) {
  return requirements.resources.find((resource) => resource.id === id);
}

function assertAllBindingsHaveProducers(requirements) {
  const produced = new Set(
    requirements.resources.flatMap((resource) => resource.produces ?? []),
  );
  const content = JSON.stringify(requirements);
  for (const match of content.matchAll(/\$\{output\.([^}]+)\}/g)) {
    if (match[1] !== "<name>") {
      assert.ok(produced.has(match[1]), `No resource produces ${match[1]}`);
    }
  }
}

test("renders all enabled component settings from one customer file", async () => {
  const paths = await setup();
  await mkdir(paths.outputPath);
  await writeFile(
    join(paths.outputPath, "stale-configuration.json"),
    "{}",
    "utf8",
  );
  const result = await renderCustomerConfiguration(paths);

  assert.deepEqual(result.deploymentManifest.enabledComponents, [
    "backend",
    "agent",
    "frontend",
    "logic-app",
  ]);
  const requirements = await readJson(
    join(paths.outputPath, "resource-requirements.json"),
  );
  assert.deepEqual(await readdir(paths.outputPath), [
    "resource-requirements.json",
  ]);
  assert.equal(requirements.schemaVersion, "1.0");
  assert.equal(requirements.provisioningModel, "downstream");
  assert.deepEqual(requirements.solution.enabledComponents, [
    "backend",
    "agent",
    "frontend",
    "logic-app",
  ]);
  const appConfiguration = getResource(
    requirements,
    "runtimeConfiguration",
  ).configuration.values;
  assert.equal(appConfiguration.ASSISTANT_NAME, "Fabrikam Help");
  assert.equal(
    appConfiguration.AI_FOUNDRY_PROJECT_ENDPOINT,
    "${output.foundryProjectEndpoint}",
  );
  const logicApp = getResource(requirements, "autoReplyWorkflow").parameters;
  assert.deepEqual(logicApp.parameters.teamsChannelIds.value, ["channel-id"]);
  assert.equal(
    logicApp.parameters.backendBaseUrl.value,
    "${output.backendBaseUrl}",
  );
  assert.equal(
    appConfiguration.AGENT_INSTRUCTIONS,
    "Answer Fabrikam questions.",
  );
  assert.ok(
    requirements.resources.some((resource) => resource.id === "autoReplyWorkflow"),
  );
  assert.equal(
    getResource(requirements, "teamsApplication").configuration.manifestValues
      .TEAMS_BOT_SHORT_DISPLAY_NAME,
    "Fabrikam Help",
  );
  assertAllBindingsHaveProducers(requirements);
});

test("omits Teams artifacts when Teams is disabled", async () => {
  const paths = await setup(`
schemaVersion: "1.0"
name: fabrikam-help
assistant:
  displayName: Fabrikam Help
  instructions: Answer Fabrikam questions.
  model: gpt-4.1-mini
deployment:
  environment: dev
  location: westus2
`);
  const result = await renderCustomerConfiguration(paths);

  assert.deepEqual(result.deploymentManifest.enabledComponents, [
    "backend",
    "agent",
  ]);
  const requirements = await readJson(
    join(paths.outputPath, "resource-requirements.json"),
  );
  assert.deepEqual(await readdir(paths.outputPath), [
    "resource-requirements.json",
  ]);
  const agentRuntime = getResource(
    requirements,
    "agentCompute",
  ).configuration.runtimeSettings;
  assert.equal(agentRuntime.AZURE_CLIENT_ID, undefined);
  assert.equal(
    agentRuntime.AZURE_APPCONFIG_ENDPOINT,
    "${output.appConfigurationEndpoint}",
  );
  assert.ok(
    !requirements.resources.some((resource) => resource.id === "botIdentity"),
  );
  assert.ok(
    !requirements.resources.some((resource) =>
      resource.produces?.includes("agentIdentityClientId"),
    ),
  );
  const appConfiguration = getResource(
    requirements,
    "runtimeConfiguration",
  ).configuration.values;
  assert.equal(appConfiguration.TEAMS_BOT_ID, undefined);
  assert.equal(getResource(requirements, "frontendCompute"), undefined);
  assert.equal(getResource(requirements, "autoReplyWorkflow"), undefined);
  assertAllBindingsHaveProducers(requirements);
});

test("rejects auto-reply without Teams channel configuration", async () => {
  const paths = await setup(`
schemaVersion: "1.0"
name: fabrikam-help
assistant:
  displayName: Fabrikam Help
  instructions: Answer Fabrikam questions.
  model: gpt-4.1-mini
teams:
  enabled: true
  autoReply: true
  developer:
    name: Fabrikam
    websiteUrl: https://www.fabrikam.com
    privacyUrl: https://www.fabrikam.com/privacy
    termsOfUseUrl: https://www.fabrikam.com/terms
deployment:
  environment: dev
  location: westus2
`);

  await assert.rejects(
    renderCustomerConfiguration(paths),
    /Customer configuration is invalid/,
  );
});
