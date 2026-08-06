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
});
