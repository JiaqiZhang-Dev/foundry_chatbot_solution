import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildCustomerPackage } from "../scripts/build-package.mjs";

test("builds a self-contained package with selected components", async () => {
  const directory = await mkdtemp(join(tmpdir(), "support-agent-package-"));
  const configPath = join(directory, "customer.yaml");
  const outputPath = join(directory, "output");
  await writeFile(
    configPath,
    `
schemaVersion: "1.0"
name: northwind-help
assistant:
  displayName: Northwind Help
  instructions: Answer Northwind questions.
  model: gpt-4.1-mini
teams:
  enabled: true
  autoReply: false
  developer:
    name: Northwind
    websiteUrl: https://www.northwind.example
    privacyUrl: https://www.northwind.example/privacy
    termsOfUseUrl: https://www.northwind.example/terms
deployment:
  environment: dev
  location: westus2
`,
    "utf8",
  );

  const result = await buildCustomerPackage({
    configPath,
    outputPath,
    createArchive: false,
  });

  await access(join(result.packageDirectory, "components", "backend", "server.py"));
  await access(join(result.packageDirectory, "components", "agent", "init.py"));
  await access(join(result.packageDirectory, "components", "frontend", "src", "index.ts"));
  await assert.rejects(
    access(join(result.packageDirectory, "components", "logic-app")),
  );
  await assert.rejects(
    access(join(result.packageDirectory, "components", "frontend", "node_modules")),
  );
  await assert.rejects(
    access(join(result.packageDirectory, "components", "frontend", "devTools")),
  );
  await access(
    join(
      result.packageDirectory,
      "config",
      "generated",
      "resource-requirements.json",
    ),
  );
  assert.deepEqual(
    await readdir(join(result.packageDirectory, "config", "generated")),
    ["resource-requirements.json"],
  );
  await assert.rejects(access(join(result.packageDirectory, "infra")));
  await assert.rejects(access(join(result.packageDirectory, "deployment")));
  await assert.rejects(
    access(
      join(result.packageDirectory, "config", "resource-requirements.schema.json"),
    ),
  );
  assert.equal(
    await readFile(
      join(result.packageDirectory, "components", "agent", "instruction.md"),
      "utf8",
    ),
    "Answer Northwind questions.\n",
  );
  assert.equal(result.readiness.readyForDownstreamProvisioning, true);
});
