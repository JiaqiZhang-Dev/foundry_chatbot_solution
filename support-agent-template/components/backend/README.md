# Support agent backend

This FastAPI service is the generic runtime boundary between the chatbot
clients and an Azure AI Foundry hosted agent.

## Included API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/ping` | Deployment and App Service health check |
| `POST` | `/agent/chat` | Invoke the configured hosted agent |
| `POST` | `/agent/feedback` | Store customer feedback in Blob Storage |
| `POST` | `/conversation/save` | Persist a Teams conversation message |
| `POST` | `/message/intention` | Decide whether the Logic App should auto-reply |
| `POST` | `/teams/activity/convert` | Convert a Graph Teams message into a Bot Framework activity |

The backend retains conversation state, citation parsing, monitoring, and the
Logic App expert-reply guard. Knowledge retrieval is owned by the hosted agent
and its configured knowledge binding.

## Removed from the source chatbot

- Azure SDK and TypeSpec tenants, prompts, skills, and routing.
- GitHub, Azure DevOps, pipeline, and Azure SDK MCP tools.
- Direct `/knowledge/retrieve` and legacy endpoint aliases.
- Offline evaluation, episode extraction, and user-memory workflows.
- Teams image ingestion.
- Knowledge synchronization.

## Configuration

Settings are loaded from the process environment. When
`AZURE_APPCONFIG_ENDPOINT` is set, Azure App Configuration values override
matching environment values.

Required runtime settings:

| Setting | Purpose |
| --- | --- |
| `AI_FOUNDRY_PROJECT_ENDPOINT` | Foundry project endpoint |
| `AI_FOUNDRY_AGENT_NAME` | Hosted agent name |
| `AZURE_COSMOSDB_ENDPOINT` | Conversation store endpoint |
| `STORAGE_BASE_URL` | Feedback storage account Blob endpoint |
| `TEAMS_BOT_ID` | Bot application ID used as the activity recipient |

Optional settings:

| Setting | Default |
| --- | --- |
| `AI_FOUNDRY_AGENT_VERSION` | Latest deployed version |
| `AI_FOUNDRY_INTENTION_MODEL` | `AI_FOUNDRY_AGENT_COMPLETION_MODEL`, then `gpt-4o-mini` |
| `ASSISTANT_SCOPE` | `the configured business support domain` |
| `ASSISTANT_NAME` | `Support Agent` |
| `AZURE_COSMOSDB_DATABASE` | `support-agent` |
| `AZURE_COSMOSDB_MAPPING_CONTAINER` | `conversation-mappings` |
| `AZURE_COSMOSDB_MESSAGE_CONTAINER` | `conversation-messages` |
| `STORAGE_FEEDBACK_CONTAINER` | `feedback` |
| `TEAMS_SERVICE_URL_BASE` | `https://smba.trafficmanager.net/amer` |
| `DEFAULT_LOCALE` | `en-US` |
| `DEFAULT_TIMEZONE` | `UTC` |

## Container

Build the backend from this component directory:

```powershell
docker build -t support-agent-backend .
```

The container runs Uvicorn on port `8089`.

## Local validation

Create the virtual environment and install both runtime and test dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m compileall .
.\.venv\Scripts\python.exe -m pytest
```

Start the backend:

```powershell
.\.venv\Scripts\python.exe server.py
```

On Windows, use `python` after activating the venv or invoke
`.\.venv\Scripts\python.exe` explicitly. Do not use `python3`: the Windows app
alias may bypass the active venv and use a global interpreter without the
installed dependencies.
