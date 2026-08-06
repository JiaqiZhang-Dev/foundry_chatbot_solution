# Teams frontend

This component hosts the Microsoft Teams bot endpoint and forwards user
messages to the support-agent backend.

## Included behavior

- Bot Framework authentication and `/api/messages` activity processing.
- Support for direct Teams `@mention` activities and activities forwarded by
  the Logic App.
- Managed-identity authentication to the backend.
- Backend `/agent/chat` invocation.
- Answer and source-link rendering.
- Health endpoint and deployment container.
- Parameterized Teams app manifest.

The frontend has no AI planner, prompts, tenant routing, channel catalog,
storage access, GitHub integration, adaptive feedback cards, or Azure
SDK-specific behavior.

## Configuration

| Setting | Required | Purpose |
| --- | --- | --- |
| `IS_LOCAL` | No | Set by the Teams Toolkit test-tool profile to use the local simulator |
| `BOT_ID` | Yes | Teams bot application/client ID |
| `BOT_TENANT_ID` | Yes for single-tenant/MSI | Bot tenant ID |
| `BOT_TYPE` | No | Bot Framework app type; defaults to `UserAssignedMSI` |
| `BOT_PASSWORD` | No | Secret for local/service-principal deployments |
| `BACKEND_BASE_URL` | Yes | Base URL of the FastAPI backend |
| `BACKEND_SCOPE` | No | Entra scope for backend authentication; omit for unauthenticated local development |
| `USER_ASSIGNED_IDENTITY_CLIENT_ID` | No | Managed identity used for backend calls; defaults to `BOT_ID` |
| `BOT_DISPLAY_NAME` | No | Display name used in logs; defaults to `Support Agent` |
| `PORT` | No | HTTP port; defaults to `3978` |

Calls from the frontend to the backend use the Bot Framework user-assigned
managed identity.

## Local development

To chat in the browser with the same workflow as the original chatbot:

1. Open this `components/frontend` folder in VS Code.
2. Install the **Microsoft 365 Agents Toolkit** extension.
3. Start the backend at `http://localhost:8000`.
4. Select the `testtool` environment and choose **Debug in Microsoft 365
   Agents Playground**.
5. Select `Node.js` and the `dev:teamsfx:testtool` script. Launch the Playground
   with `dev:teamsfx:launch-teams-testtool` if the extension does not open it
   automatically.

The test-tool npm script sets `IS_LOCAL=true` and
`BACKEND_BASE_URL=http://localhost:8000`. In this mode, the local simulator does
not require a deployed bot identity. This behavior is limited to the Playground
script; normal startup still requires `BOT_ID` and `BOT_TENANT_ID`.

For command-line development with a configured bot identity:

```powershell
npm ci
npm run build
npm test
npm start
```

The service exposes `GET /health` and `POST /api/messages`.
