import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { renderCustomerConfiguration } from "./render-template.mjs";

const execute = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const excludedSegments = new Set([
  ".pytest_cache",
  ".venv",
  "__pycache__",
  "appPackage/build",
  "coverage",
  "devTools",
  "env",
  "lib",
  "node_modules",
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shouldCopy(sourceRoot, sourcePath) {
  const path = relative(sourceRoot, sourcePath).split(sep).join("/");
  return ![...excludedSegments].some(
    (segment) => path === segment || path.startsWith(`${segment}/`),
  );
}

async function copyDirectory(source, destination) {
  await cp(source, destination, {
    recursive: true,
    filter: (path) => shouldCopy(source, path),
  });
}

function packageName(solutionName) {
  return `support-agent-${solutionName}`;
}

function createReadme(config, readiness) {
  const components = ["backend", "agent"];
  if (config.teams.enabled) {
    components.push("frontend");
  }
  if (config.teams.autoReply) {
    components.push("logic-app");
  }
  return `# ${config.assistant.displayName}

Generated from \`support-agent@${readiness.templateVersion}\`.

## Included components

${components.map((component) => `- \`components/${component}\``).join("\n")}

## Configuration

The complete generated deployment contract is
\`config/generated/resource-requirements.json\`. It contains the solution
metadata, logical resources, App Configuration values, component runtime
settings, optional Teams manifest values, and optional Logic App parameters.
Values in the form \`\${output.<infrastructure-output>}\` are resolved after
provisioning.

## Provisioning

This is a provisioner-neutral package. A downstream system reads
\`config/generated/resource-requirements.json\`, provisions matching resources,
resolves the declared \`\${output.*}\` bindings, and deploys the included source.
`;
}

async function createPackageArchive(packageDirectory, destinationDirectory) {
  const npmCli = process.env.npm_execpath;
  const packageRelativePath = relative(
    destinationDirectory,
    packageDirectory,
  );
  const packageArgument = packageRelativePath
    ? `.${sep}${packageRelativePath}`
    : ".";
  const args = [
    "pack",
    packageArgument,
    "--pack-destination",
    ".",
    "--json",
  ];
  let result;
  if (npmCli) {
    result = await execute(process.execPath, [npmCli, ...args], {
      cwd: destinationDirectory,
      maxBuffer: 10 * 1024 * 1024,
    });
  } else if (process.platform === "win32") {
    const command = `npm.cmd ${args.join(" ")}`;
    result = await execute(process.env.ComSpec ?? "cmd.exe", [
      "/d",
      "/s",
      "/c",
      command,
    ], {
      cwd: destinationDirectory,
      maxBuffer: 10 * 1024 * 1024,
    });
  } else {
    result = await execute("npm", args, {
      cwd: destinationDirectory,
      maxBuffer: 10 * 1024 * 1024,
    });
  }
  const packResult = JSON.parse(result.stdout);
  if (!Array.isArray(packResult) || !packResult[0]?.filename) {
    throw new Error("npm pack did not return an archive filename.");
  }
  return join(destinationDirectory, packResult[0].filename);
}

export async function buildCustomerPackage({
  configPath,
  outputPath,
  createArchive = true,
}) {
  const templatePackage = await readJson(join(packageRoot, "package.json"));
  const targetRoot = resolve(
    outputPath ??
      join(
        packageRoot,
        "artifacts",
        String(Date.now()),
      ),
  );
  const stagingDirectory = join(targetRoot, ".package-staging");
  const packageDirectory = join(targetRoot, "package");
  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });

  const rendered = await renderCustomerConfiguration({
    configPath,
    outputPath: join(stagingDirectory, "config", "generated"),
  });
  const config = rendered.config;
  if (!outputPath) {
    const namedTarget = join(packageRoot, "artifacts", config.name);
    await rm(namedTarget, { recursive: true, force: true });
    await rename(targetRoot, namedTarget);
    return buildCustomerPackage({
      configPath,
      outputPath: namedTarget,
      createArchive,
    });
  }

  const enabledComponents = rendered.solutionManifest.enabledComponents;
  for (const component of enabledComponents) {
    await copyDirectory(
      join(packageRoot, "components", component),
      join(stagingDirectory, "components", component),
    );
  }
  await cp(
    join(packageRoot, "components", "frontend", "appPackage", "color.png"),
    join(stagingDirectory, "components", "frontend", "appPackage", "color.png"),
    { force: true },
  ).catch(() => {});

  await writeFile(
    join(stagingDirectory, "components", "agent", "instruction.md"),
    `${config.assistant.instructions.trim()}\n`,
    "utf8",
  );

  const readiness = {
    templateVersion: templatePackage.version,
    readyForDownstreamProvisioning: true,
    provisioningModel: "downstream",
    resourceContract: "config/generated/resource-requirements.json",
  };
  const customerPackageJson = {
    name: packageName(config.name),
    version: templatePackage.version,
    private: true,
    description: `${config.assistant.displayName} generated support-agent solution`,
    supportAgentSolution: {
      name: config.name,
      components: enabledComponents,
      readiness: "ready-for-downstream-provisioning",
    },
  };
  await Promise.all([
    writeJson(join(stagingDirectory, "package.json"), customerPackageJson),
    writeJson(join(stagingDirectory, "solution.json"), {
      schemaVersion: "1.0",
      template: {
        id: "support-agent",
        version: templatePackage.version,
      },
      customer: {
        name: config.name,
        displayName: config.assistant.displayName,
      },
      components: enabledComponents,
      readiness,
    }),
    writeFile(
      join(stagingDirectory, "README.md"),
      createReadme(config, readiness),
      "utf8",
    ),
  ]);

  await copyDirectory(stagingDirectory, packageDirectory);
  await rm(stagingDirectory, { recursive: true, force: true });
  let archivePath;
  if (createArchive) {
    archivePath = await createPackageArchive(packageDirectory, targetRoot);
  }
  return {
    config,
    outputPath: targetRoot,
    packageDirectory,
    archivePath,
    readiness,
  };
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
    const result = await buildCustomerPackage({
      configPath: args.config,
      outputPath: args.output,
    });
    console.log(`Built customer package at ${result.packageDirectory}`);
    console.log(`Created archive ${result.archivePath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
