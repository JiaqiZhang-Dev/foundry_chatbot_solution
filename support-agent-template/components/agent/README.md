# Prompt agent

This component is a lightweight Azure AI Foundry hosted agent that answers from
a customer-provided instruction prompt and model deployment. Foundry Web Search
provides optional grounding and URL citations without a separate search
resource or project connection.

It intentionally has no custom tools, skills, tenant routing, memory provider,
knowledge index, or product-specific behavior.

## Configuration

Settings are loaded from the process environment. When
`AZURE_APPCONFIG_ENDPOINT` is set, values from Azure App Configuration override
matching environment values.

| Setting | Required | Purpose |
| --- | --- | --- |
| `AI_FOUNDRY_PROJECT_ENDPOINT` | Yes | Foundry project endpoint |
| `AI_FOUNDRY_AGENT_COMPLETION_MODEL` | Yes | Model deployment used by the agent |
| `AGENT_INSTRUCTIONS` | No | Customer instruction prompt; overrides `instruction.md` |
| `AI_FOUNDRY_AGENT_NAME` | No | Agent identity; defaults to `support-agent` |
| `AI_FOUNDRY_AGENT_REASONING_EFFORT` | No | Optional model reasoning effort |
| `ENABLE_WEB_SEARCH` | No | Enables Foundry Web Search; defaults to `true` |
| `WEB_SEARCH_CONTEXT_SIZE` | No | Search context size: `low`, `medium`, or `high` |
| `WEB_SEARCH_SOURCE_HINTS` | No | Comma-separated public URLs/domains the prompt should prefer |
| `AZURE_APPCONFIG_ENDPOINT` | No | Optional App Configuration endpoint |
| `APP_VERSION` | No | Version added to the telemetry agent ID |

The template renderer can either write the customized prompt to
`instruction.md` or supply it through `AGENT_INSTRUCTIONS`.

## Container

The container exposes the Foundry Responses protocol on port `8088`.

```powershell
docker build -t support-agent .
docker run --rm -p 8088:8088 `
  -e AI_FOUNDRY_PROJECT_ENDPOINT="<project-endpoint>" `
  -e AI_FOUNDRY_AGENT_COMPLETION_MODEL="<model-deployment>" `
  -e AGENT_INSTRUCTIONS="<customized prompt>" `
  support-agent
```

Azure credentials must be available through managed identity or the local
Azure CLI context. In Foundry, the hosted agent uses its own runtime identity.

## Web Search boundary

General Web Search requires no Bing resource, Storage account, Search service,
index, or ingestion workflow. Source hints influence the agent prompt but do
not enforce a domain allowlist. Hard domain restriction requires a separately
configured Bing Custom Search connection.

Web Search sends query data to Grounding with Bing services, can transfer data
outside compliance and geographic boundaries, and incurs separate usage costs.
Do not include secrets or sensitive data in search queries.
