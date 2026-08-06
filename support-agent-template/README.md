# Support Agent Template

`support-agent-template@0.1.0` generates a support chatbot solution
from your configuration. Every solution includes a Foundry hosted agent and
backend. Microsoft Teams and channel auto-reply are optional.

## What this template includes

### Solution components

| Component | Included | Purpose |
| --- | --- | --- |
| Foundry hosted agent | Always | Runs the configured assistant instructions and model, with optional Web Search |
| FastAPI backend | Always | Provides chat, conversation, feedback, intention, Teams conversion, and health APIs |
| Teams frontend | Optional | Receives Bot Framework activities and connects Teams users to the backend |
| Teams app package | Optional | Provides the generated Teams manifest and app icons |
| Logic App | Optional | Monitors selected Teams channels and coordinates automatic replies |
| Generated configuration | Always | Supplies runtime settings, App Configuration values, component bindings, and provisioning requirements |

Enabling Teams includes the frontend and Teams app package. Enabling channel
auto-reply also includes the Logic App.

### Chatbot features

- Custom assistant name, instructions, business scope, and Foundry model.
- Public-web grounding through Foundry Web Search with source citations.
- Multi-turn conversation messages and state stored in Cosmos DB.
- User feedback collection in Blob Storage.
- Intention classification for deciding whether an automated reply is useful.
- Microsoft Teams direct conversations and mentions when Teams is enabled.
- Selected-channel auto-reply with human-expert reply suppression when
  auto-reply is enabled.
- Application telemetry and backend/frontend health endpoints.
- Provisioner-neutral source and resource requirements for downstream
  deployment.

## Requirements

- Node.js 22 or later.
- npm.
- GitHub CLI (`gh`) or `curl`.
- A PaaS or downstream provisioning service that supports the generated
  solution package.

You do not need an Azure sign-in to generate the solution.

## Quick start

The npm package is not published to a registry yet.

### 1. Download the template package

Prefer GitHub CLI:

```powershell
gh release download support-agent-template-v0.1.0 `
  --repo JiaqiZhang-Dev/foundry_chatbot_solution `
  --pattern support-agent-template-0.1.0.tgz
```

If GitHub CLI is unavailable, use:

```powershell
curl.exe -L -O `
  https://github.com/JiaqiZhang-Dev/foundry_chatbot_solution/releases/download/support-agent-template-v0.1.0/support-agent-template-0.1.0.tgz
```

Both commands save `support-agent-template-0.1.0.tgz` in the current
directory.

### 2. Discover the available settings

Resolve the downloaded archive to an absolute path first. This prevents npm
from resolving a relative filename against your user home or a parent npm
workspace:

```powershell
$templatePackage = (Resolve-Path .\support-agent-template-0.1.0.tgz).Path
npx --yes `
  --package $templatePackage `
  support-agent-template parameters
```

This command shows every setting's JSON name, type, requirement, default,
description, and allowed choices.

### 3. Create your configuration

Create `customer-parameters.json`. This full-featured example enables public web
grounding, Microsoft Teams, and selected-channel auto-reply:

```json
{
  "solutionName": "contoso-support",
  "assistantDisplayName": "Contoso Support",
  "agentInstructions": "Answer questions about Contoso products clearly and concisely. Prefer configured public documentation and cite useful sources.",
  "modelDeployment": "gpt-4.1-mini",
  "webSearchEnabled": true,
  "knowledgeSources": [
    "https://www.contoso.com/support"
  ],
  "teamsEnabled": true,
  "developerName": "Contoso",
  "developerWebsiteUrl": "https://www.contoso.com",
  "privacyUrl": "https://www.contoso.com/privacy",
  "termsOfUseUrl": "https://www.contoso.com/terms",
  "teamsAutoReply": true,
  "teamsTeamId": "<teams-group-id>",
  "teamsChannelIds": [
    "<support-channel-id>"
  ]
}
```

### 4. Generate your solution

```powershell
npx --yes `
  --package $templatePackage `
  support-agent-template generate `
  --parameters .\customer-parameters.json `
  --output .\contoso-support
```

The command validates your settings and creates:

- `contoso-support\package\`: the unpacked solution.
- `contoso-support\support-agent-contoso-support-0.1.0.tgz`: the distributable
  solution archive.

Inside the package, `solution.json` summarizes the enabled chatbot abilities,
included components, planned service endpoints, and required resource types.
`config/generated/resource-requirements.json` provides the detailed handoff for
the downstream provisioner.

### 5. Send the solution for provisioning

Give the generated `.tgz` to your PaaS or downstream provisioning service. If
you generated the solution inside a PaaS portal, this handoff may happen
automatically.

The generated archive is not a standalone installer. You do not need to open,
edit, or validate its internal files.

## Settings

### Solution

| JSON name | Required | Default or constraint | Purpose |
| --- | --- | --- | --- |
| `solutionName` | Yes | Lowercase, 3-31 characters | Generated solution identifier |

### Foundry hosted agent

| JSON name | Required | Default or constraint | Purpose |
| --- | --- | --- | --- |
| `assistantDisplayName` | Yes | Maximum 100 characters | User-visible assistant name |
| `agentInstructions` | Yes | Maximum 9,000 characters | Behavior, boundaries, and response style |
| `modelDeployment` | Yes | Existing model deployment name | Model used by the hosted agent |
| `assistantScope` | No | `the configured business support domain` | Business domain the assistant supports |
| `webSearchEnabled` | No | `true` | Enable Foundry Web Search |
| `webSearchContextSize` | No | `medium`; `low`, `medium`, or `high` | Search context size |
| `knowledgeSources` | No | `[]` | Preferred public HTTPS source URLs |

`knowledgeSources` guides the assistant toward preferred public sources. It
does not create a private knowledge index or prevent Web Search from using
other public pages.

### Microsoft Teams

| JSON name | Required | Default or condition | Purpose |
| --- | --- | --- | --- |
| `teamsEnabled` | No | `false` | Include the Teams chatbot |
| `teamsShortName` | No | Maximum 30 characters | Short Teams app name |
| `teamsFullName` | No | Maximum 100 characters | Full Teams app name |
| `teamsShortDescription` | No | Maximum 80 characters | Short Teams app description |
| `teamsFullDescription` | No | Maximum 4,000 characters | Full Teams app description |
| `developerName` | With Teams | No default | Teams app publisher name |
| `developerWebsiteUrl` | With Teams | HTTPS URL | Publisher website |
| `privacyUrl` | With Teams | HTTPS URL | Privacy statement |
| `termsOfUseUrl` | With Teams | HTTPS URL | Terms of use |
| `locale` | No | `en-US` | Default Teams locale |

### Channel auto-reply (Logic App)

| JSON name | Required | Default or condition | Purpose |
| --- | --- | --- | --- |
| `teamsAutoReply` | No | `false`; requires Teams | Reply automatically in selected channels |
| `teamsTeamId` | With auto-reply | Team ID | Team monitored for messages |
| `teamsChannelIds` | With auto-reply | At least one channel ID | Channels monitored for messages |
| `timezone` | No | `UTC` | Default operational timezone |

Example Teams settings:

```json
{
  "teamsEnabled": true,
  "teamsShortName": "Contoso Support",
  "developerName": "Contoso",
  "developerWebsiteUrl": "https://www.contoso.com",
  "privacyUrl": "https://www.contoso.com/privacy",
  "termsOfUseUrl": "https://www.contoso.com/terms"
}
```

To enable channel auto-reply, also set:

```json
{
  "teamsAutoReply": true,
  "teamsTeamId": "<team-id>",
  "teamsChannelIds": [
    "<channel-id>"
  ]
}
```

## Save the settings contract

To save the complete machine-readable setting definition:

```powershell
npx --yes `
  --package $templatePackage `
  support-agent-template parameters `
  --output .\support-agent-parameters.json
```

Infrastructure endpoints, resource IDs, identities, credentials, scopes,
connection strings, and role assignments are not customer settings. The
provisioning service creates and supplies them.

## After the package is published

Once the package is available from an npm registry, cloning and `npm pack` are
no longer required. Run it directly:

```powershell
npx support-agent-template@0.1.0 generate `
  --parameters .\customer-parameters.json `
  --output .\contoso-support
```
