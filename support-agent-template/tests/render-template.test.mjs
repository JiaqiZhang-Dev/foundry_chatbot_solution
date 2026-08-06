import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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

function assertAllBindingsHaveProducers(outputPath, requirements) {
  const produced = new Set(
    requirements.resources.flatMap((resource) => resource.produces ?? []),
  );
  for (const name of Object.keys(
    requirements.outputBindings.derivedOutputs ?? {},
  )) {
    produced.add(name);
  }
  return Promise.all(
    Object.values(requirements.outputBindings.consumers)
      .filter(Boolean)
      .map(async (consumer) => {
        const content = await readFile(join(outputPath, consumer.split("/").at(-1)), "utf8");
        for (const match of content.matchAll(/\$\{output\.([^}]+)\}/g)) {
          assert.ok(produced.has(match[1]), `No resource produces ${match[1]}`);
        }
      }),
  );
}

test("renders all enabled component settings from one customer file", async () => {
  const paths = await setup();
  const result = await renderCustomerConfiguration(paths);

  assert.deepEqual(result.deploymentManifest.enabledComponents, [
    "backend",
    "agent",
    "frontend",
    "logic-app",
  ]);
  const appConfiguration = await readJson(
    join(paths.outputPath, "app-configuration.json"),
  );
  assert.equal(appConfiguration.ASSISTANT_NAME, "Fabrikam Help");
  assert.equal(
    appConfiguration.AI_FOUNDRY_PROJECT_ENDPOINT,
    "${output.foundryProjectEndpoint}",
  );
  const logicApp = await readJson(
    join(paths.outputPath, "logic-app.parameters.json"),
  );
  assert.deepEqual(logicApp.parameters.teamsChannelIds.value, ["channel-id"]);
  assert.equal(
    logicApp.parameters.backendBaseUrl.value,
    "${output.backendBaseUrl}",
  );
  assert.equal(
    await readFile(join(paths.outputPath, "agent-instructions.md"), "utf8"),
    "Answer Fabrikam questions.\n",
  );
  const requirements = await readJson(
    join(paths.outputPath, "resource-requirements.json"),
  );
  assert.equal(requirements.provisioningModel, "downstream");
  assert.ok(
    requirements.resources.some((resource) => resource.id === "autoReplyWorkflow"),
  );
  assert.deepEqual(
    requirements.outputBindings.derivedOutputs.logicAppUserAssignedIdentities,
    {
      "${output.backendIdentityResourceId}": {},
      "${output.botIdentityResourceId}": {},
    },
  );
  await assertAllBindingsHaveProducers(paths.outputPath, requirements);
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
  const runtime = await readJson(join(paths.outputPath, "runtime-settings.json"));
  assert.equal(runtime.frontend, undefined);
  assert.equal(runtime.agent.AZURE_CLIENT_ID, undefined);
  assert.equal(
    runtime.agent.AZURE_APPCONFIG_ENDPOINT,
    "${output.appConfigurationEndpoint}",
  );
  const requirements = await readJson(
    join(paths.outputPath, "resource-requirements.json"),
  );
  assert.ok(
    !requirements.resources.some((resource) => resource.id === "botIdentity"),
  );
  assert.ok(
    !requirements.resources.some((resource) =>
      resource.produces?.includes("agentIdentityClientId"),
    ),
  );
  const appConfiguration = await readJson(
    join(paths.outputPath, "app-configuration.json"),
  );
  assert.equal(appConfiguration.TEAMS_BOT_ID, undefined);
  await assertAllBindingsHaveProducers(paths.outputPath, requirements);
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
