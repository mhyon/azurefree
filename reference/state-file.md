# `.azure-free.json` — the project's Azure state

The skills keep one small JSON file at the project root. It lets a new session pick up where the last one stopped: the plugin's SessionStart hook summarizes it into context automatically.

Rules:
- **No secrets, ever.** No passwords, keys, connection strings, deployment tokens or email addresses. Secrets go in `.env` (git-ignored) and in the app's own settings on Azure. The file is safe to commit.
- Create it when the setup skill first picks a resource group; update it after every create, delete or redeploy-command change. Set `updated` to today's date (YYYY-MM-DD).
- Read it before acting; trust Azure over the file if they disagree (resources can be changed in the portal), then fix the file.

Shape:

```json
{
  "$comment": "Written by the azure-free Claude Code plugin. No secrets: safe to commit.",
  "version": 1,
  "subscription": {
    "id": "00000000-0000-0000-0000-000000000000",
    "name": "Azure subscription 1",
    "offer": "Free Trial",
    "quotaId": "FreeTrial_2014-09-01",
    "spendingLimit": "On"
  },
  "region": "eastus2",
  "resourceGroup": "rg-myapp-free",
  "budget": { "name": "azure-free-monthly", "amount": 1, "scope": "subscription" },
  "resources": [
    {
      "role": "web",
      "service": "static-web-app",
      "name": "myapp-web",
      "tier": "Free",
      "url": "https://<random>.azurestaticapps.net",
      "deploy": "npx @azure/static-web-apps-cli deploy ./dist --env production --deployment-token <from: az staticwebapp secrets list>"
    },
    {
      "role": "database",
      "service": "azure-sql-free",
      "name": "myappdb",
      "server": "myapp-sql-k3x9a",
      "tier": "Free offer, AutoPause",
      "auth": "Entra only; admin: signed-in user",
      "appAccess": ["myapp-api (system-assigned identity) in app_readwrite"],
      "firewall": "your IP (rule azure-free-client, auto-updated) + Azure services",
      "secrets": "none (passwordless)"
    }
  ],
  "goals": {
    "purpose": "small-group",
    "privateData": "per-person",
    "sensitive": ["contact"],
    "needs": ["search", "history"]
  },
  "declined": [{ "feature": "temporal", "on": "2026-10-29" }],
  "updated": "2026-10-29"
}
```

For Azure SQL, never record IP addresses, user principal names, or object/group IDs. Record rule names and "signed-in user" / "group sqladmins-<server>" instead.

`goals` and `declined` record what the user wants the app to become, and which database suggestions they've turned down. The skills use them to keep suggestions relevant and to avoid repeating one the user already declined. Use only the short labels listed in [goals-to-features.md](${CLAUDE_PLUGIN_ROOT}/skills/database/references/goals-to-features.md), never free text about the user or their customers.

`service` values used by the skills: `static-web-app`, `app-service-f1`, `container-app`, `function-app-flex`, `azure-sql-free`, `cosmos-free`, `documentdb-free`, `postgres-flex-b1ms`, `mysql-flex-b1ms`, plus supporting pieces such as `app-service-plan`, `sql-server`, `container-apps-env`, `storage-account`.

`budget.scope` is `subscription` or `resource-group`. Leave `budget` out entirely when the offer doesn't support budgets (Azure for Students), and add a `"notes"` array entry saying so.
