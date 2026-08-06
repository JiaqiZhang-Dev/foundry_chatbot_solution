import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const execute = promisify(execFile);
const cliPath = fileURLToPath(new URL("../scripts/cli.mjs", import.meta.url));
const parametersPath = fileURLToPath(
  new URL("../config/public-parameter-values.example.json", import.meta.url),
);

test("CLI configures and generates a solution from public parameters", async () => {
  const root = await mkdtemp(join(tmpdir(), "support-agent-cli-"));
  const configPath = join(root, "private", "customer-config.yaml");
  const outputPath = join(root, "solution");

  const parameterHelp = await execute(process.execPath, [cliPath, "parameters"]);
  assert.match(parameterHelp.stdout, /solutionName \(string; required\)/);
  assert.match(
    parameterHelp.stdout,
    /teamsTeamId \(string; required when teamsAutoReply=true\)/,
  );

  await execute(process.execPath, [
    cliPath,
    "configure",
    "--parameters",
    parametersPath,
    "--output",
    configPath,
  ]);
  const config = parseYaml(await readFile(configPath, "utf8"));
  assert.equal(config.name, "contoso-support");

  await execute(process.execPath, [
    cliPath,
    "generate",
    "--parameters",
    parametersPath,
    "--output",
    outputPath,
    "--no-archive",
  ]);
  await access(join(outputPath, "package", "solution.json"));
  await access(join(outputPath, "package", "components", "logic-app"));
});
