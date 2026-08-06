# Support Agent Template

`@azure-sdk/support-agent-template@0.1.0` generates a support chatbot solution
from your configuration. Every solution includes a Foundry hosted agent and
backend. Microsoft Teams and channel auto-reply are optional.

## Requirements

- Node.js 22 or later.
- Git.
- npm.
- A PaaS or downstream provisioning service that supports the generated
  solution package.

You do not need an Azure sign-in to generate the solution.

## Quick start

The npm package is not published yet. Build it locally from this repository.

### 1. Build the template package

```powershell
git clone https://github.com/JiaqiZhang-Dev/foundry_chatbot_solution.git
Set-Location foundry_chatbot_solution\support-agent-template
npm ci
$templatePackage = npm pack --silent | Select-Object -Last 1
```

This creates `azure-sdk-support-agent-template-0.1.0.tgz` in the current
directory. You do not need to modify or build the component source projects.

### 2. Discover the available settings

```powershell
npx --yes --package ".\$templatePackage" support-agent-template parameters
```

This command shows every setting's JSON name, type, requirement, default,
description, and allowed choices.

### 3. Create your configuration

Create `customer-parameters.json`. This is the smallest useful configuration:

```json
{
  "solutionName": "contoso-support",
  "assistantDisplayName": "Contoso Support",
  "agentInstructions": "Answer Contoso product questions clearly and cite useful public sources.",
  "modelDeployment": "gpt-4.1-mini",
  "environment": "dev",
  "location": "westus2"
}
```

### 4. Generate your solution

```powershell
npx --yes --package ".\$templatePackage" support-agent-template generate `
  --parameters .\customer-parameters.json `
  --output .\contoso-support
```

The command validates your settings and creates:

- `contoso-support\package\`: the unpacked solution.
- `contoso-support\support-agent-contoso-support-0.1.0.tgz`: the distributable
  solution archive.

### 5. Send the solution for provisioning

Give the generated `.tgz` to your PaaS or downstream provisioning service. If
you generated the solution inside a PaaS portal, this handoff may happen
automatically.

The generated archive is not a standalone installer. You do not need to open,
edit, or validate its internal files.

## Settings

### Solution and assistant

| JSON name | Required | Default or constraint | Purpose |
| --- | --- | --- | --- |
| `solutionName` | Yes | Lowercase, 3-31 characters | Generated solution identifier |
| `assistantDisplayName` | Yes | Maximum 100 characters | User-visible assistant name |
| `agentInstructions` | Yes | Maximum 9,000 characters | Behavior, boundaries, and response style |
| `modelDeployment` | Yes | Existing model deployment name | Model used by the hosted agent |
| `assistantScope` | No | `the configured business support domain` | Business domain the assistant supports |
| `environment` | Yes | `dev` | Deployment environment name |
| `location` | Yes | Azure region name | Deployment region |
| `resourcePrefix` | No | Lowercase, 3-41 characters | Optional Azure resource-name prefix |

### Public web grounding

| JSON name | Required | Default or choices | Purpose |
| --- | --- | --- | --- |
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
| `teamsAutoReply` | No | `false`; requires Teams | Reply automatically in selected channels |
| `teamsTeamId` | With auto-reply | Team ID | Team monitored for messages |
| `teamsChannelIds` | With auto-reply | At least one channel ID | Channels monitored for messages |
| `teamsShortName` | No | Maximum 30 characters | Short Teams app name |
| `teamsFullName` | No | Maximum 100 characters | Full Teams app name |
| `teamsShortDescription` | No | Maximum 80 characters | Short Teams app description |
| `teamsFullDescription` | No | Maximum 4,000 characters | Full Teams app description |
| `developerName` | With Teams | No default | Teams app publisher name |
| `developerWebsiteUrl` | With Teams | HTTPS URL | Publisher website |
| `privacyUrl` | With Teams | HTTPS URL | Privacy statement |
| `termsOfUseUrl` | With Teams | HTTPS URL | Terms of use |
| `locale` | No | `en-US` | Default Teams locale |
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
npx --yes --package ".\$templatePackage" support-agent-template parameters `
  --output .\support-agent-parameters.json
```

Infrastructure endpoints, resource IDs, identities, credentials, scopes,
connection strings, and role assignments are not customer settings. The
provisioning service creates and supplies them.

## After the package is published

Once the package is available from an npm registry, cloning and `npm pack` are
no longer required. Run it directly:

```powershell
npx @azure-sdk/support-agent-template@0.1.0 generate `
  --parameters .\customer-parameters.json `
  --output .\contoso-support
```
