import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse as parseYaml } from "yaml";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptRoot, "..");
const outputBinding = (name) => `\${output.${name}}`;

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function formatValidationErrors(errors) {
  return errors
    .map((error) => `${error.path} ${error.message}`)
    .join("; ");
}

function matchesType(value, type) {
  if (type === "array") {
    return Array.isArray(value);
  }
  if (type === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  return typeof value === type;
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function applySchema(schema, input, path, errors) {
  let value = input;
  if (value === undefined && Object.hasOwn(schema, "default")) {
    value = structuredClone(schema.default);
  }
  if (value === undefined) {
    return value;
  }

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push({ path, message: `must be ${schema.type}` });
    return value;
  }
  if (Object.hasOwn(schema, "const") && !valuesEqual(value, schema.const)) {
    errors.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum && !schema.enum.some((item) => valuesEqual(value, item))) {
    errors.push({ path, message: `must be one of ${schema.enum.join(", ")}` });
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path, message: `must have at least ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path, message: `must have at most ${schema.maxLength} characters` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path, message: `must match ${schema.pattern}` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `must contain at least ${schema.minItems} items` });
    }
    if (schema.uniqueItems) {
      const unique = new Set(value.map((item) => JSON.stringify(item)));
      if (unique.size !== value.length) {
        errors.push({ path, message: "must contain unique items" });
      }
    }
    if (schema.items) {
      value.forEach((item, index) => {
        value[index] = applySchema(schema.items, item, `${path}/${index}`, errors);
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        errors.push({ path: `${path}/${required}`, message: "is required" });
      }
    }
    if (schema.additionalProperties === false) {
      for (const property of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties ?? {}, property)) {
          errors.push({ path: `${path}/${property}`, message: "is not allowed" });
        }
      }
    }
    for (const [property, propertySchema] of Object.entries(
      schema.properties ?? {},
    )) {
      const child = applySchema(
        propertySchema,
        value[property],
        `${path}/${property}`,
        errors,
      );
      if (child !== undefined) {
        value[property] = child;
      }
    }
  }

  for (const nestedSchema of schema.allOf ?? []) {
    value = applySchema(nestedSchema, value, path, errors);
  }
  if (schema.if) {
    const conditionErrors = [];
    applySchema(schema.if, structuredClone(value), path, conditionErrors);
    if (conditionErrors.length === 0 && schema.then) {
      value = applySchema(schema.then, value, path, errors);
    }
  }
  return value;
}

function validateCustomerConfiguration(schema, input) {
  const errors = [];
  const config = applySchema(schema, input, "", errors);
  return { config, errors };
}

function getOutputPath(config, requestedOutput) {
  return resolve(
    requestedOutput ?? join(packageRoot, "artifacts", config.name),
  );
}

function getDefaultResourcePrefix(config) {
  return `${config.name}-${config.deployment.environment}`
    .slice(0, 41)
    .replace(/-+$/, "");
}

function buildAppConfiguration(config) {
  const webSearch = config.assistant.webSearch;
  const settings = {
    AI_FOUNDRY_PROJECT_ENDPOINT: outputBinding("foundryProjectEndpoint"),
    AI_FOUNDRY_AGENT_NAME: outputBinding("agentName"),
    AI_FOUNDRY_AGENT_VERSION: outputBinding("agentVersion"),
    AI_FOUNDRY_AGENT_COMPLETION_MODEL: config.assistant.model,
    AGENT_INSTRUCTIONS: config.assistant.instructions,
    ASSISTANT_NAME: config.assistant.displayName,
    ASSISTANT_SCOPE: config.assistant.scope,
    ENABLE_WEB_SEARCH: String(webSearch.enabled),
    WEB_SEARCH_CONTEXT_SIZE: webSearch.contextSize,
    WEB_SEARCH_SOURCE_HINTS: webSearch.sourceHints.join(","),
    AZURE_COSMOSDB_ENDPOINT: outputBinding("cosmosEndpoint"),
    AZURE_COSMOSDB_DATABASE: outputBinding("cosmosDatabase"),
    AZURE_COSMOSDB_MAPPING_CONTAINER: "conversation-mappings",
    AZURE_COSMOSDB_MESSAGE_CONTAINER: "conversation-messages",
    STORAGE_BASE_URL: outputBinding("storageBlobEndpoint"),
    STORAGE_FEEDBACK_CONTAINER: "feedback",
  };
  if (config.teams.enabled) {
    settings.TEAMS_BOT_ID = outputBinding("botClientId");
    settings.DEFAULT_LOCALE = config.teams.locale;
    settings.DEFAULT_TIMEZONE = config.teams.timezone;
  }
  return settings;
}

function buildRuntimeSettings(config) {
  const appConfigurationEndpoint = outputBinding("appConfigurationEndpoint");
  const settings = {
    agent: {
      AZURE_APPCONFIG_ENDPOINT: appConfigurationEndpoint,
    },
    backend: {
      AZURE_APPCONFIG_ENDPOINT: appConfigurationEndpoint,
      AZURE_CLIENT_ID: outputBinding("backendIdentityClientId"),
      APPLICATIONINSIGHTS_CONNECTION_STRING: outputBinding(
        "applicationInsightsConnectionString",
      ),
    },
  };
  if (config.teams.enabled) {
    settings.frontend = {
      BOT_ID: outputBinding("botClientId"),
      BOT_TENANT_ID: outputBinding("tenantId"),
      BOT_TYPE: "UserAssignedMSI",
      BOT_DISPLAY_NAME: config.assistant.displayName,
      BACKEND_BASE_URL: outputBinding("backendBaseUrl"),
      BACKEND_SCOPE: outputBinding("backendAudience"),
      USER_ASSIGNED_IDENTITY_CLIENT_ID: outputBinding("botClientId"),
      APPLICATIONINSIGHTS_CONNECTION_STRING: outputBinding(
        "applicationInsightsConnectionString",
      ),
    };
  }
  return settings;
}

function buildTeamsManifest(config) {
  const teams = config.teams;
  const shortName =
    teams.shortName ?? config.assistant.displayName.slice(0, 30);
  return {
    TEAMS_APP_ID: outputBinding("teamsAppId"),
    BOT_ID: outputBinding("botClientId"),
    DEVELOPER_NAME: teams.developer.name,
    DEVELOPER_WEBSITE_URL: teams.developer.websiteUrl,
    PRIVACY_URL: teams.developer.privacyUrl,
    TERMS_OF_USE_URL: teams.developer.termsOfUseUrl,
    TEAMS_BOT_SHORT_DISPLAY_NAME: shortName,
    TEAMS_BOT_FULL_DISPLAY_NAME:
      teams.fullName ?? config.assistant.displayName,
    TEAMS_APP_SHORT_DESCRIPTION:
      teams.shortDescription ?? `Ask ${shortName} for help.`.slice(0, 80),
    TEAMS_APP_FULL_DESCRIPTION:
      teams.fullDescription ??
      `Get support answers from ${config.assistant.displayName}.`,
  };
}

function buildLogicAppParameters(config) {
  return {
    $schema:
      "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: {
      logicAppName: {
        value: `${config.deployment.resourcePrefix}-logicapp`,
      },
      logicAppState: {
        value: "Disabled",
      },
      teamsGroupId: { value: config.teams.teamId },
      teamsChannelIds: { value: config.teams.channelIds },
      backendBaseUrl: { value: outputBinding("backendBaseUrl") },
      backendAudience: { value: outputBinding("backendAudience") },
      backendIdentityResourceId: {
        value: outputBinding("backendIdentityResourceId"),
      },
      frontendBaseUrl: { value: outputBinding("frontendBaseUrl") },
      frontendAudience: { value: outputBinding("botClientId") },
      frontendIdentityResourceId: {
        value: outputBinding("botIdentityResourceId"),
      },
      teamsConnectionResourceId: {
        value: outputBinding("teamsConnectionResourceId"),
      },
      userAssignedIdentities: {
        value: {
          [outputBinding("backendIdentityResourceId")]: {},
          [outputBinding("botIdentityResourceId")]: {},
        },
      },
    },
  };
}

function buildResourceRequirements(config, enabledComponents) {
  const runtimeSettings = buildRuntimeSettings(config);
  const resources = [
    {
      id: "foundryProject",
      kind: "ai-project",
      requiredBy: ["agent", "backend"],
      capabilities: ["hosted-agent", "model-deployment"],
      configuration: {
        model: config.assistant.model,
        webSearch: config.assistant.webSearch.enabled,
      },
      produces: [
        "foundryProjectEndpoint",
        "agentName",
        "agentVersion",
      ],
      azureResourceTypes: [
        "Microsoft.CognitiveServices/accounts",
        "Microsoft.CognitiveServices/accounts/projects",
      ],
      access: [
        {
          principalOutput: "agentIdentityPrincipalId",
          role: "Azure AI User",
        },
        {
          principalOutput: "backendIdentityPrincipalId",
          role: "Azure AI User",
        },
      ],
    },
    {
      id: "stateStore",
      kind: "document-database",
      requiredBy: ["backend"],
      capabilities: ["partitioned-documents"],
      configuration: {
        database: "support-agent",
        containers: [
          {
            name: "conversation-mappings",
            partitionKey: "/mapping_key",
          },
          {
            name: "conversation-messages",
            partitionKey: "/conversation_partition",
          },
        ],
      },
      produces: ["cosmosEndpoint", "cosmosDatabase"],
      azureResourceTypes: ["Microsoft.DocumentDB/databaseAccounts"],
      access: [
        {
          principalOutput: "backendIdentityPrincipalId",
          role: "Cosmos DB Built-in Data Contributor",
        },
      ],
    },
    {
      id: "feedbackStorage",
      kind: "object-storage",
      requiredBy: ["backend"],
      configuration: {
        containers: ["feedback"],
      },
      produces: ["storageBlobEndpoint"],
      azureResourceTypes: ["Microsoft.Storage/storageAccounts"],
      access: [
        {
          principalOutput: "backendIdentityPrincipalId",
          role: "Storage Blob Data Contributor",
        },
      ],
    },
    {
      id: "runtimeConfiguration",
      kind: "configuration-store",
      requiredBy: ["agent", "backend"],
      configuration: {
        values: buildAppConfiguration(config),
      },
      produces: ["appConfigurationEndpoint"],
      azureResourceTypes: ["Microsoft.AppConfiguration/configurationStores"],
      access: [
        {
          principalOutput: "agentIdentityPrincipalId",
          role: "App Configuration Data Reader",
        },
        {
          principalOutput: "backendIdentityPrincipalId",
          role: "App Configuration Data Reader",
        },
      ],
    },
    {
      id: "monitoring",
      kind: "application-monitoring",
      requiredBy: config.teams.enabled
        ? ["backend", "frontend"]
        : ["backend"],
      produces: ["applicationInsightsConnectionString"],
      azureResourceTypes: ["Microsoft.Insights/components"],
    },
    {
      id: "agentCompute",
      kind: "container-host",
      requiredBy: ["agent"],
      source: "components/agent",
      containerPort: 8088,
      healthPath: "/",
      configuration: {
        runtimeSettings: runtimeSettings.agent,
      },
      produces: ["agentIdentityPrincipalId"],
    },
    {
      id: "backendCompute",
      kind: "container-host",
      requiredBy: ["backend"],
      source: "components/backend",
      containerPort: 8089,
      healthPath: "/ping",
      authentication: "managed-identity",
      configuration: {
        runtimeSettings: runtimeSettings.backend,
      },
      produces: [
        "backendBaseUrl",
        "backendAudience",
        "backendIdentityClientId",
        "backendIdentityPrincipalId",
        "backendIdentityResourceId",
      ],
    },
  ];

  if (config.teams.enabled) {
    resources.push(
      {
        id: "frontendCompute",
        kind: "container-host",
        requiredBy: ["frontend"],
        source: "components/frontend",
        containerPort: 3978,
        healthPath: "/health",
        authentication: "bot-framework",
        configuration: {
          runtimeSettings: runtimeSettings.frontend,
        },
        produces: ["frontendBaseUrl"],
      },
      {
        id: "botIdentity",
        kind: "bot-identity",
        requiredBy: ["frontend"],
        produces: [
          "botClientId",
          "botIdentityResourceId",
          "tenantId",
        ],
        azureResourceTypes: [
          "Microsoft.ManagedIdentity/userAssignedIdentities",
          "Microsoft.BotService/botServices",
        ],
      },
      {
        id: "teamsApplication",
        kind: "teams-application",
        requiredBy: ["frontend"],
        configuration: {
          manifestValues: buildTeamsManifest(config),
        },
        produces: ["teamsAppId"],
      },
    );
  }
  if (config.teams.autoReply) {
    resources.push(
      {
        id: "teamsConnection",
        kind: "authorized-api-connection",
        requiredBy: ["logic-app"],
        authorization: "interactive",
        produces: ["teamsConnectionResourceId"],
        azureResourceTypes: ["Microsoft.Web/connections"],
      },
      {
        id: "autoReplyWorkflow",
        kind: "workflow-host",
        requiredBy: ["logic-app"],
        source: "components/logic-app/template.json",
        parameters: buildLogicAppParameters(config),
        azureResourceTypes: ["Microsoft.Logic/workflows"],
      },
    );
  }

  return {
    schemaVersion: "1.0",
    provisioningModel: "downstream",
    solution: {
      name: config.name,
      environment: config.deployment.environment,
      location: config.deployment.location,
      resourcePrefix: config.deployment.resourcePrefix,
      enabledComponents,
    },
    resources,
    outputBindings: {
      syntax: "${output.<name>}",
    },
  };
}

export async function renderCustomerConfiguration({
  configPath,
  outputPath,
}) {
  const schema = await readJson(
    join(packageRoot, "config", "customer-config.schema.json"),
  );
  const rawConfig = parseYaml(await readFile(resolve(configPath), "utf8"));
  const validation = validateCustomerConfiguration(schema, rawConfig);
  if (validation.errors.length > 0) {
    throw new Error(
      `Customer configuration is invalid: ${formatValidationErrors(validation.errors)}`,
    );
  }
  const normalizedConfig = validation.config;

  normalizedConfig.deployment.resourcePrefix ??=
    getDefaultResourcePrefix(normalizedConfig);
  const target = getOutputPath(normalizedConfig, outputPath);
  await mkdir(target, { recursive: true });

  const enabledComponents = ["backend", "agent"];
  if (normalizedConfig.teams.enabled) {
    enabledComponents.push("frontend");
  }
  if (normalizedConfig.teams.autoReply) {
    enabledComponents.push("logic-app");
  }

  const deploymentManifest = {
    schemaVersion: "1.0",
    template: "support-agent",
    solutionName: normalizedConfig.name,
    environment: normalizedConfig.deployment.environment,
    location: normalizedConfig.deployment.location,
    enabledComponents,
    bindingSyntax: "${output.<infrastructure-output>}",
  };

  const generatedFileNames = [
    "customer-config.json",
    "deployment-manifest.json",
    "deployment.parameters.json",
    "app-configuration.json",
    "runtime-settings.json",
    "agent-instructions.md",
    "teams-manifest.json",
    "logic-app.parameters.json",
    "resource-requirements.json",
  ];
  await Promise.all(
    generatedFileNames.map((name) => rm(join(target, name), { force: true })),
  );
  await writeJson(
    join(target, "resource-requirements.json"),
    buildResourceRequirements(normalizedConfig, enabledComponents),
  );

  return { config: normalizedConfig, outputPath: target, deploymentManifest };
}

function parseArguments(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--config" || argument === "--output") {
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
  if (!result.config) {
    throw new Error("--config is required.");
  }
  return result;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (import.meta.url === invokedPath) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const result = await renderCustomerConfiguration({
      configPath: args.config,
      outputPath: args.output,
    });
    console.log(
      `Rendered ${result.config.name} configuration to ${result.outputPath}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
