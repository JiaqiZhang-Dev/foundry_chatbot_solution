import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const template = JSON.parse(await readFile(join(packageRoot, "template.json"), "utf8"));

if (packageJson.chatbotTemplate?.id !== template.id) {
  throw new Error("package.json chatbotTemplate.id must match template.json id.");
}

await access(join(packageRoot, template.parameterContract));

if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
  throw new Error("package.json version must use semantic versioning.");
}

const requiredPaths = [
  ".npmignore",
  "DEVELOPE.md",
  packageJson.chatbotTemplate.manifest,
  "config/customer-config.schema.json",
  "config/customer-config.example.yaml",
  "config/public-parameter-values.example.json",
  "config/public-parameters.json",
  "config/resource-requirements.schema.json",
  "scripts/build-package.mjs",
  "scripts/cli.mjs",
  "scripts/generate-customer-config.mjs",
  "scripts/render-template.mjs",
  "components/frontend",
  "components/frontend/package.json",
  "components/frontend/Dockerfile",
  "components/frontend/appPackage/manifest.json",
  "components/frontend/appPackage/manifest.testtool.json",
  "components/frontend/teamsapp.testtool.yml",
  "components/logic-app",
  "components/logic-app/template.json",
  "components/logic-app/parameters.example.json",
  "components/backend",
  "components/backend/server.py",
  "components/backend/Dockerfile",
  "components/backend/requirements.txt",
  "components/agent",
  "components/agent/init.py",
  "components/agent/Dockerfile",
  "components/agent/instruction.md",
  "config",
  "tests",
];

for (const relativePath of requiredPaths) {
  await access(join(packageRoot, relativePath));
}

const expectedComponents = new Set(["frontend", "backend", "agent", "logic-app"]);
for (const component of template.sourceComponents) {
  expectedComponents.delete(component.id);
  await access(join(packageRoot, component.path));
}

if (expectedComponents.size > 0) {
  throw new Error(`Missing source components: ${[...expectedComponents].join(", ")}`);
}

const logicAppTemplate = JSON.parse(
  await readFile(join(packageRoot, "components/logic-app/template.json"), "utf8"),
);
const serializedWorkflow = JSON.stringify(logicAppTemplate);
for (const removedDependency of [
  "functionAppResourceId",
  "blobStorageAccountName",
  "integrationAccountResourceId",
  "convertActivity')]",
]) {
  if (serializedWorkflow.includes(removedDependency)) {
    throw new Error(`Logic App still references removed dependency: ${removedDependency}`);
  }
}
for (const requiredPath of [
  "/conversation/save",
  "/message/intention",
  "/teams/activity/convert",
  "/api/messages",
]) {
  if (!serializedWorkflow.includes(requiredPath)) {
    throw new Error(`Logic App is missing required integration: ${requiredPath}`);
  }
}

console.log(
  `Validated ${template.id}@${packageJson.version}: ${template.sourceComponents.length} source components.`,
);
