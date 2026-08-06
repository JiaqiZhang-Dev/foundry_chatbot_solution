# Teams auto-reply Logic App

This component monitors configured Microsoft Teams channels and sends eligible
questions through the support agent without requiring users to mention the bot.

## Workflow

1. Receive a new-channel-message notification from the Teams connector.
2. Load full message details and ignore announcements, meetings, application
   messages, and messages that already mention a bot.
3. Persist the message through backend `/conversation/save`.
4. Ask backend `/message/intention` whether the assistant should reply. The
   backend also suppresses replies when a human participant has already helped.
5. Convert the Graph message through backend `/teams/activity/convert`.
6. Submit the resulting Bot Framework activity to frontend `/api/messages`.

The workflow has no Blob channel configuration, integration account, inline
JavaScript, Azure SDK filtering, or Function App dependency.

## Authentication

The Teams trigger uses an existing authorized Teams API connection. The
workflow's system-assigned identity authenticates HTTP calls to the backend and
Bot Framework endpoint using their configured audiences.

## Deploy

Copy `parameters.example.json`, replace every placeholder, and deploy
`template.json` as a resource-group deployment. Generated customer packages
embed the same values under the `autoReplyWorkflow` resource's `parameters`
property in `config/resource-requirements.json`; the downstream
provisioner resolves its `${output.*}` bindings.

The workflow is deployed disabled by default. Enable it only after backend and
frontend health checks pass and the Teams API connection is authorized.
