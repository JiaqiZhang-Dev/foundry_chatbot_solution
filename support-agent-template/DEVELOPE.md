# Support Agent Template Development

This document is for maintainers of `@azure-sdk/support-agent-template`.
Consumers should follow [README.md](./README.md).

## Design boundary

The template was extracted from the Azure SDK QA Bot and the infrastructure in
PR #16357. It retains the reusable chatbot flow while removing Azure
SDK-specific behavior.

Included:

- TypeScript Teams frontend.
- FastAPI backend and Teams activity conversion.
- Foundry hosted-agent source and instruction template.
- Optional Logic App channel auto-reply workflow.
- Public configuration contract and internal compiler schemas.
- Provisioner-neutral resource and output contract.
- Executable CLI and tests.

Excluded:

- Azure SDK-specific prompts, tools, tenants, cards, and branding.
- Knowledge synchronization and ADO pipelines.
- Standalone activity-conversion Function App.
- PaaS portal, catalog API, provisioning engine, MCP server, and IDE skill.

Public-web grounding uses Foundry Web Search. Resource provisioning remains a
downstream responsibility.

## Repository layout

| Path | Purpose |
| --- | --- |
| `components/agent` | Foundry hosted-agent source |
| `components/backend` | FastAPI chat and Teams conversion service |
| `components/frontend` | Bot Framework Teams service and app manifest |
| `components/logic-app` | Optional Teams channel auto-reply workflow |
| `config/public-parameters.json` | Customer-visible parameter contract |
| `config/customer-config.schema.json` | Internal normalized configuration schema |
| `config/resource-requirements.schema.json` | Downstream provisioning contract schema |
| `scripts/cli.mjs` | Published `support-agent-template` executable |
| `scripts/generate-customer-config.mjs` | Public values to internal YAML |
| `scripts/render-template.mjs` | Internal YAML to generated settings |
| `scripts/build-package.mjs` | Component selection and solution packaging |
| `tests` | Compiler, package, and CLI tests |
| `template.json` | Template metadata and compiler entrypoints |

Each component has its own README for component-specific runtime and local
development details.

## Compiler flow

```text
public parameter JSON
        |
        v
generateCustomerConfig
        |
        v
internal customer-config.yaml
        |
        v
renderCustomerConfiguration
        |
        v
generated settings + resource requirements
        |
        v
buildCustomerPackage
        |
        v
unpacked solution + versioned .tgz
```

`generate --parameters` performs the entire flow and removes its temporary
internal YAML. `configure`, `render`, and `generate --config` expose the stages
for platform integrations and debugging.

## Platform integration

The PaaS reads `config/public-parameters.json` to build its form or API. The
contract defines labels, types, defaults, choices, validation, conditional
visibility, and conditional requirements.

The normal integration invokes one command with the customer's flat values:

```powershell
support-agent-template generate `
  --parameters <customer-parameters.json> `
  --output <solution-output>
```

For separate lifecycle stages:

```powershell
support-agent-template configure `
  --parameters <customer-parameters.json> `
  --output <private-workspace>\customer-config.yaml

support-agent-template render `
  --config <private-workspace>\customer-config.yaml `
  --output <private-workspace>\rendered

support-agent-template generate `
  --config <private-workspace>\customer-config.yaml `
  --output <solution-output>
```

Keep `customer-config.yaml` private. It is an internal compiler contract, not a
customer interface.

## Downstream provisioning integration

The generated package is provisioner-neutral. A downstream system may use
Bicep, Terraform, `azd`, a portal service, or another deployment engine.

### Package inputs

| File | Purpose |
| --- | --- |
| `solution.json` | Template version, environment, enabled components, and readiness |
| `config/generated/resource-requirements.json` | Logical resources, capabilities, access, sources, and required outputs |
| `config/generated/deployment.parameters.json` | Region, environment, and enabled features |
| `config/generated/app-configuration.json` | Shared application configuration values |
| `config/generated/runtime-settings.json` | Per-component environment variables |

### Provisioning sequence

1. Verify that the generated contract's `schemaVersion` is supported.
2. Provision every `resources[]` entry using its required capabilities.
   `azureResourceTypes` are hints, not prescribed module implementations.
3. Build an output map from every `resources[].produces` value.
4. Apply each `resources[].access` entry after its resource and principal exist.
5. Complete resources marked `authorization: interactive`.
6. Resolve every `${output.<name>}` token in JSON values and property names.
7. Materialize `outputBindings.derivedOutputs`.
8. Seed App Configuration and inject runtime settings.
9. Build and deploy enabled component sources in dependency order.
10. Run readiness checks before enabling the Logic App or production traffic.

The schema remains in the published template package at
`config/resource-requirements.schema.json`; it is not copied into each
generated customer solution. Schema validation is an optional defensive
integration check for the provisioner. It is not a customer responsibility.
Fail deployment when an output is missing or an unresolved token remains.

Do not commit resolved files containing credentials or connection strings.
Keep them in the deployment workspace or secret store.

### Component configuration

- **App Configuration:** Resolve `app-configuration.json`; give both agent and
  backend `AZURE_APPCONFIG_ENDPOINT`. Set backend `AZURE_CLIENT_ID` to its
  user-assigned identity client ID. Do not set it for the hosted agent, which
  authenticates with its own runtime identity.
- **Runtime settings:** Apply each top-level object in `runtime-settings.json`
  to the corresponding component host.
- **Agent instructions:** The generated instruction is copied to
  `components/agent/instruction.md`; `AGENT_INSTRUCTIONS` may override it.
- **Teams:** Resolve `teams-manifest.json`, replace matching manifest
  placeholders, include both icons, validate the app package, and register it.
- **Logic App:** Authorize the Teams connection, resolve
  `logic-app.parameters.json`, deploy the workflow disabled, then enable it
  after dependency checks pass.

### Deployment order and readiness

1. Shared resources and managed identities.
2. RBAC assignments and App Configuration values.
3. Foundry hosted agent.
4. Backend.
5. Frontend and Teams application when enabled.
6. Teams API connection and Logic App when auto-reply is enabled.

| Component | Readiness check |
| --- | --- |
| Backend | `GET /ping` returns HTTP 200 |
| Frontend | `GET /health` returns HTTP 200 |
| Agent | One prompt succeeds through the hosted-agent endpoint |
| Logic App | A test channel message produces a successful run |

## Local setup

Requirements:

- Node.js 22 or later.
- npm.
- Python and frontend dependencies only when working on those components.

From this directory:

```powershell
npm ci
npm test
```

`npm test` validates the package structure and runs all Node.js compiler and CLI
tests.

## Run the CLI from source

Display help:

```powershell
npm run cli -- --help
```

Compile the checked-in public example:

```powershell
npm run cli -- generate `
  --parameters config\public-parameter-values.example.json `
  --output artifacts\contoso-support
```

Use `--no-archive` for faster local iteration when only the unpacked package is
needed.

## Change the public configuration

When adding or changing a customer-visible parameter:

1. Update `config/public-parameters.json`.
2. Update `generateCustomerConfig` in
   `scripts/generate-customer-config.mjs`.
3. Update `config/customer-config.schema.json` if the normalized shape changes.
4. Update `config/public-parameter-values.example.json`.
5. Add default, conditional, invalid-input, and end-to-end test coverage.
6. Update the consumer parameter groups in `README.md`.

Do not expose provisioned URLs, resource IDs, identities, credentials, scopes,
or connection strings as customer inputs. Those values belong in the
downstream output contract.

## Change generated resources or settings

Update `scripts/render-template.mjs` and the relevant schema when changing:

- Enabled-component rules.
- Runtime environment variables.
- App Configuration values.
- Teams manifest values.
- Logic App parameters.
- Resource capabilities, outputs, access, or RBAC intent.

Keep `${output.<name>}` references consistent with
`resource-requirements.json`. Add tests for both enabled and disabled feature
paths.

## Change component source

Keep the components generic and independently buildable. Follow each
component's README and existing language conventions.

The package builder excludes local dependencies, virtual environments, caches,
compiled output, coverage, and Playground logs. Add new local-only directories
to both `.npmignore` and the package builder exclusion list.

## Inspect the publish artifact

Create and inspect the npm archive without publishing:

```powershell
npm pack --dry-run --json
npm pack
```

Confirm that the archive includes the CLI, source components, configuration
contracts, consumer README, and this developer guide. It must not include
`node_modules`, virtual environments, build output, Playground logs, tests, or
generated customer artifacts.

## Publish

Before publishing:

1. Update the version in `package.json` and regenerate `package-lock.json`.
2. Run `npm ci`, `npm test`, and `npm audit`.
3. Inspect `npm pack --dry-run --json`.
4. Install the packed archive in a temporary consumer project.
5. Run the installed CLI with the example public parameters and confirm it
   creates both `package/` and the solution `.tgz`.
6. Publish through the approved package-registry release process.

Do not publish generated customer solutions or resolved infrastructure values
with the template package.
