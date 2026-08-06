# Configuration

This directory contains the customer and generated configuration contracts.
Customer settings are grouped by the component they configure:

- **Foundry hosted agent**: model, instructions, scope, and Web Search.
- **Microsoft Teams**: bot and app-package settings.
- **Channel auto-reply (Logic App)**: monitored team, channels, and timezone.

The public parameter names remain flat so a PaaS can render them directly as
form fields. The parameter catalog's `groups` and each parameter's `group`
organize those fields without changing the customer values JSON shape.
Deployment placement and final resource naming are downstream provisioner
concerns and are not customer-facing chatbot capabilities.

Render an example:

```powershell
npm run render -- --config config/customer-config.example.yaml
```

The command recreates `artifacts/<name>/` with one generated file:
`resource-requirements.json`. It contains all provisioning and component
configuration. Values written as `${output.<name>}` are supplied by the
downstream provisioner after provisioning.
