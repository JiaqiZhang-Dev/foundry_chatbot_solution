#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { stringify as stringifyYaml } from "yaml";

import { buildCustomerPackage } from "./build-package.mjs";
import { generateCustomerConfig } from "./generate-customer-config.mjs";
import { renderCustomerConfiguration } from "./render-template.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const help = `support-agent-template <command> [options]

Commands:
  parameters Configure customer-visible values supported by this template.
  configure  Validate public parameter values and write internal configuration.
  render     Render deployable settings from internal configuration.
  generate   Generate a complete customer solution package.

parameters options:
  --output <file>      Write the machine-readable parameter contract to a file.
  --contract <file>    Optional public parameter contract override.

configure options:
  --parameters <file>  Public parameter values JSON.
  --output <file>      Internal customer configuration YAML.
  --contract <file>    Optional public parameter contract override.

render options:
  --config <file>      Internal customer configuration YAML.
  --output <folder>    Rendered settings output folder.

generate options:
  --config <file>      Internal customer configuration YAML.
  --parameters <file>  Public values JSON; an alternative to --config.
  --contract <file>    Optional public parameter contract override.
  --output <folder>    Generated solution output folder.
  --no-archive         Generate the unpacked solution without a .tgz archive.
`;

function parseOptions(args, allowed) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--") || !allowed.has(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const name = argument.slice(2);
    if (name === "no-archive") {
      options.noArchive = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    options[name] = value;
    index += 1;
  }
  return options;
}

function requireOption(options, name, command) {
  if (!options[name]) {
    throw new Error(`${command} requires --${name}.`);
  }
}

function parameterRequirement(parameter) {
  if (parameter.required === true) {
    return "required";
  }
  if (parameter.requiredWhen) {
    const conditions = Object.entries(parameter.requiredWhen)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join(", ");
    return `required when ${conditions}`;
  }
  if ("default" in parameter) {
    return `default: ${JSON.stringify(parameter.default)}`;
  }
  return "optional";
}

async function parameters(args) {
  const options = parseOptions(args, new Set(["--output", "--contract"]));
  const contractPath = resolve(
    options.contract ??
      join(packageRoot, "config", "public-parameters.json"),
  );
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  if (options.output) {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(contract, null, 2)}\n`,
      "utf8",
    );
    console.log(`Wrote public parameter contract to ${outputPath}`);
    return;
  }
  console.log(`Customer parameters for ${contract.template}:\n`);
  for (const parameter of contract.parameters) {
    console.log(
      `${parameter.name} (${parameter.type}; ${parameterRequirement(parameter)})`,
    );
    console.log(`  ${parameter.label}${parameter.description ? `: ${parameter.description}` : ""}`);
    if (parameter.choices) {
      console.log(`  choices: ${parameter.choices.join(", ")}`);
    }
  }
}

async function configure(args) {
  const options = parseOptions(
    args,
    new Set(["--parameters", "--output", "--contract"]),
  );
  requireOption(options, "parameters", "configure");
  requireOption(options, "output", "configure");
  const parameterValues = JSON.parse(
    await readFile(resolve(options.parameters), "utf8"),
  );
  const config = await generateCustomerConfig({
    parameterValues,
    contractPath: options.contract,
  });
  const outputPath = resolve(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stringifyYaml(config), "utf8");
  console.log(`Wrote validated customer configuration to ${outputPath}`);
}

async function render(args) {
  const options = parseOptions(args, new Set(["--config", "--output"]));
  requireOption(options, "config", "render");
  const result = await renderCustomerConfiguration({
    configPath: options.config,
    outputPath: options.output,
  });
  console.log(`Rendered ${result.config.name} configuration to ${result.outputPath}`);
}

async function generate(args) {
  const options = parseOptions(
    args,
    new Set([
      "--config",
      "--parameters",
      "--contract",
      "--output",
      "--no-archive",
    ]),
  );
  if (Boolean(options.config) === Boolean(options.parameters)) {
    throw new Error("generate requires exactly one of --config or --parameters.");
  }
  const outputPath = resolve(
    options.output ?? join(process.cwd(), "support-agent-output"),
  );
  let temporaryDirectory;
  let configPath = options.config;
  try {
    if (options.parameters) {
      const parameterValues = JSON.parse(
        await readFile(resolve(options.parameters), "utf8"),
      );
      const config = await generateCustomerConfig({
        parameterValues,
        contractPath: options.contract,
      });
      temporaryDirectory = await mkdtemp(
        join(tmpdir(), "support-agent-template-"),
      );
      configPath = join(temporaryDirectory, "customer-config.yaml");
      await writeFile(configPath, stringifyYaml(config), "utf8");
    }
    const result = await buildCustomerPackage({
      configPath,
      outputPath,
      createArchive: !options.noArchive,
    });
    console.log(`Generated customer solution at ${result.packageDirectory}`);
    if (result.archivePath) {
      console.log(`Created archive ${result.archivePath}`);
    }
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

export async function runCli(args) {
  const [command, ...commandArgs] = args;
  if (!command || command === "--help" || command === "-h") {
    console.log(help);
    return;
  }
  if (command === "parameters") {
    await parameters(commandArgs);
  } else if (command === "configure") {
    await configure(commandArgs);
  } else if (command === "render") {
    await render(commandArgs);
  } else if (command === "generate") {
    await generate(commandArgs);
  } else {
    throw new Error(`Unknown command: ${command}\n\n${help}`);
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (import.meta.url === invokedPath) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
