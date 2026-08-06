import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { stringify as stringifyYaml } from "yaml";

import { buildCustomerPackage } from "../scripts/build-package.mjs";
import { generateCustomerConfig } from "../scripts/generate-customer-config.mjs";

test("compiles public parameter values into a complete customer package", async () => {
  const root = await mkdtemp(join(tmpdir(), "support-agent-public-"));
  const parameterValues = JSON.parse(
    await readFile(
      new URL("../config/public-parameter-values.example.json", import.meta.url),
      "utf8",
    ),
  );
  const config = await generateCustomerConfig({ parameterValues });
  const configPath = join(root, "private", "customer-config.yaml");
  await mkdir(join(root, "private"));
  await writeFile(configPath, stringifyYaml(config), "utf8");

  const result = await buildCustomerPackage({
    configPath,
    outputPath: join(root, "compiled"),
    createArchive: false,
  });

  assert.deepEqual(result.config.teams.channelIds, ["<teams-channel-id>"]);
  for (const component of ["agent", "backend", "frontend", "logic-app"]) {
    await access(join(result.packageDirectory, "components", component));
  }
  const resourceRequirements = JSON.parse(
    await readFile(
      join(
        result.packageDirectory,
        "config",
        "generated",
        "resource-requirements.json",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(resourceRequirements.solution.enabledComponents, [
    "backend",
    "agent",
    "frontend",
    "logic-app",
  ]);
  const solution = JSON.parse(
    await readFile(join(result.packageDirectory, "solution.json"), "utf8"),
  );
  assert.ok(
    solution.capabilities.some(
      (capability) => capability.id === "publicWebGrounding",
    ),
  );
  assert.ok(
    solution.capabilities.some(
      (capability) => capability.id === "channelAutoReply",
    ),
  );
  assert.deepEqual(
    solution.components.map((component) => component.id),
    ["backend", "agent", "frontend", "logic-app"],
  );
  assert.ok(
    solution.endpoints.some(
      (endpoint) => endpoint.urlTemplate === "${output.backendBaseUrl}/agent/chat",
    ),
  );
  assert.ok(
    solution.endpoints.some(
      (endpoint) =>
        endpoint.id === "hostedAgent" &&
        endpoint.urlTemplate === "${output.agentEndpoint}",
    ),
  );
  assert.ok(
    resourceRequirements.resources
      .find((resource) => resource.id === "agentCompute")
      .produces.includes("agentEndpoint"),
  );
  assert.equal(
    solution.resources.contract,
    "config/generated/resource-requirements.json",
  );
});
