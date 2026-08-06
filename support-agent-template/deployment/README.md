# Deployment

This directory will contain:

- `azure.yaml`.
- Deployment hooks.
- Environment contracts.
- Application build and deployment order.
- Health gates.
- Configuration and seed-data setup.

The deployment flow will provision the complete Bicep graph and then deploy backend, Foundry agent, and frontend source projects.
