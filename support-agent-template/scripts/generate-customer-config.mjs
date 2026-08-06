import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { stringify as stringifyYaml } from "yaml";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function conditionMatches(condition, values) {
  return Object.entries(condition ?? {}).every(
    ([name, expected]) => values[name] === expected,
  );
}

function validateValue(parameter, value, errors) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (parameter.type === "boolean" && typeof value !== "boolean") {
    errors.push(`${parameter.name} must be a boolean`);
  }
  if (
    ["string", "multiline-string", "model-deployment", "azure-location", "url"].includes(
      parameter.type,
    ) &&
    typeof value !== "string"
  ) {
    errors.push(`${parameter.name} must be a string`);
    return;
  }
  if (
    ["string-list", "url-list"].includes(parameter.type) &&
    (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
  ) {
    errors.push(`${parameter.name} must be a string array`);
    return;
  }
  if (parameter.pattern && !new RegExp(parameter.pattern).test(value)) {
    errors.push(`${parameter.name} has an invalid format`);
  }
  if (parameter.maxLength && value.length > parameter.maxLength) {
    errors.push(`${parameter.name} exceeds ${parameter.maxLength} characters`);
  }
  if (parameter.minItems && value.length < parameter.minItems) {
    errors.push(`${parameter.name} requires at least ${parameter.minItems} items`);
  }
  if (parameter.choices && !parameter.choices.includes(value)) {
    errors.push(`${parameter.name} must be one of ${parameter.choices.join(", ")}`);
  }
  if (
    parameter.type === "url" &&
    !value.startsWith("https://")
  ) {
    errors.push(`${parameter.name} must use HTTPS`);
  }
  if (
    parameter.type === "url-list" &&
    value.some((url) => !url.startsWith("https://"))
  ) {
    errors.push(`${parameter.name} entries must use HTTPS`);
  }
}

function optional(target, key, value) {
  if (value !== undefined && value !== null && value !== "") {
    target[key] = value;
  }
}

export async function generateCustomerConfig({
  parameterValues,
  contractPath = join(packageRoot, "config", "public-parameters.json"),
}) {
  const contract = JSON.parse(await readFile(resolve(contractPath), "utf8"));
  if (contract.schemaVersion !== "1.0") {
    throw new Error(`Unsupported parameter contract ${contract.schemaVersion}.`);
  }

  const knownParameters = new Set(
    contract.parameters.map((parameter) => parameter.name),
  );
  const unknown = Object.keys(parameterValues).filter(
    (name) => !knownParameters.has(name),
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown customer parameters: ${unknown.join(", ")}`);
  }

  const values = { ...parameterValues };
  for (const parameter of contract.parameters) {
    if (values[parameter.name] === undefined && "default" in parameter) {
      values[parameter.name] = structuredClone(parameter.default);
    }
  }

  const errors = [];
  for (const parameter of contract.parameters) {
    const required =
      parameter.required === true ||
      (parameter.requiredWhen &&
        conditionMatches(parameter.requiredWhen, values));
    const value = values[parameter.name];
    if (
      required &&
      (value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0))
    ) {
      errors.push(`${parameter.name} is required`);
      continue;
    }
    validateValue(parameter, value, errors);
  }
  if (errors.length > 0) {
    throw new Error(`Customer parameters are invalid: ${errors.join("; ")}`);
  }

  const config = {
    schemaVersion: "1.0",
    name: values.solutionName,
    assistant: {
      displayName: values.assistantDisplayName,
      instructions: values.agentInstructions,
      model: values.modelDeployment,
      scope: values.assistantScope,
      webSearch: {
        enabled: values.webSearchEnabled,
        contextSize: values.webSearchContextSize,
        sourceHints: values.knowledgeSources,
      },
    },
    teams: {
      enabled: values.teamsEnabled,
      autoReply: values.teamsEnabled && values.teamsAutoReply,
      locale: values.locale,
      timezone: values.timezone,
    },
    deployment: {
      environment: "dev",
      location: "westus2",
    },
  };

  if (values.teamsEnabled) {
    optional(config.teams, "shortName", values.teamsShortName);
    optional(config.teams, "fullName", values.teamsFullName);
    optional(config.teams, "shortDescription", values.teamsShortDescription);
    optional(config.teams, "fullDescription", values.teamsFullDescription);
    config.teams.developer = {
      name: values.developerName,
      websiteUrl: values.developerWebsiteUrl,
      privacyUrl: values.privacyUrl,
      termsOfUseUrl: values.termsOfUseUrl,
    };
  }
  if (values.teamsEnabled && values.teamsAutoReply) {
    config.teams.teamId = values.teamsTeamId;
    config.teams.channelIds = values.teamsChannelIds;
  }
  return config;
}

function parseArguments(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--parameters", "--output", "--contract"].includes(argument)) {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${argument} requires a value.`);
      }
      result[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!result.parameters || !result.output) {
    throw new Error("--parameters and --output are required.");
  }
  return result;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (import.meta.url === invokedPath) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const parameterValues = JSON.parse(
      await readFile(resolve(args.parameters), "utf8"),
    );
    const config = await generateCustomerConfig({
      parameterValues,
      contractPath: args.contract,
    });
    await mkdir(dirname(resolve(args.output)), { recursive: true });
    await writeFile(resolve(args.output), stringifyYaml(config), "utf8");
    console.log(`Generated internal customer configuration at ${resolve(args.output)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
