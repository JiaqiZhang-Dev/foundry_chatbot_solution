# Configuration

This directory contains the contracts that separate:

- Customer customization, such as assistant name and instructions.
- Platform deployment context, such as subscription, region, and environment.
- External bindings, such as public knowledge-source hints.
- Generated resource outputs, endpoints, identities, and connection names.
- Seed data for App Configuration, Storage, and other runtime services.

Customers edit one file matching `customer-config.schema.json`; they do not
edit component environment variables or Logic App ARM parameters.

Render an example:

```powershell
npm run render -- --config config/customer-config.example.yaml
```

The command writes a deterministic configuration bundle under
`artifacts/<name>/`. Values written as `${output.<name>}` are supplied by Bicep
and deployment hooks after provisioning.
