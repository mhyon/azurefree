---
name: status
description: Checks what an Azure free-tier project is running and whether anything costs money. Lists resources, flags anything outside free tiers, shows month-to-date cost, Azure SQL free compute left, Cosmos DB throughput against the free 1000 RU/s, budget alerts, and the subscription's offer and spending-limit state. Use when the user asks if they're being charged, how much free allowance is left, what they have running on Azure, why their app or database stopped or paused, or wants a periodic cost check.
allowed-tools: Bash(az account show*) Bash(az account list *) Bash(az group list *) Bash(az resource list *) Bash(az rest --method get *) Bash(az staticwebapp show *) Bash(az staticwebapp list *) Bash(az appservice plan show *) Bash(az appservice plan list *) Bash(az webapp show *) Bash(az webapp list *) Bash(az containerapp show *) Bash(az containerapp list *) Bash(az functionapp show *) Bash(az functionapp list *) Bash(az sql server list *) Bash(az sql db show *) Bash(az sql db list *) Bash(az cosmosdb show *) Bash(az cosmosdb list *) Bash(az cosmosdb sql database list *) Bash(az cosmosdb sql database throughput show *) Bash(az cosmosdb sql container list *) Bash(az cosmosdb sql container throughput show *) Bash(az postgres flexible-server show *) Bash(az postgres flexible-server list *) Bash(az mysql flexible-server show *) Bash(az mysql flexible-server list *) Bash(az monitor metrics list *) Bash(az sql server ad-only-auth get *) Bash(az sql server ad-admin list *) Bash(az sql server firewall-rule list *) Bash(az webapp identity show *) Bash(az containerapp identity show *) Bash(az functionapp identity show *) Read
---

# Free-tier health check

Everything in this check is read-only. Free limits are in [free-offers.md](${CLAUDE_PLUGIN_ROOT}/reference/free-offers.md).

## 1. Subscription

1. Read `.azure-free.json` if it exists.
2. Confirm the CLI is signed in to the subscription the file records: `az account show --query "{name:name, id:id}"`.
3. Check the subscription's offer and state:
   ```
   az rest --method get --url "https://management.azure.com/subscriptions/{subscriptionId}?api-version=2022-12-01" --query "{state:state, quotaId:subscriptionPolicies.quotaId, spendingLimit:subscriptionPolicies.spendingLimit}"
   ```
   - `state` other than `Enabled`: say so first. A disabled Free Trial means the 30 days or the credit ran out, and nothing runs until they upgrade.
   - `spendingLimit` is `Off`: the subscription can now bill the card. The budget alert matters more than ever.

## 2. Inventory

- **Project:** `az resource list -g <rg> --query "[].{name:name, type:type, sku:sku.name, tier:sku.tier, location:location}" -o table`.
- **Strays:** `az resource list --query "[].{name:name, type:type, rg:resourceGroup, sku:sku.name}" -o table` across the whole subscription.

Point out anything that usually costs money even in a hobby project:

| Resource type | Why it can cost |
|---|---|
| `Microsoft.ContainerRegistry/registries` | Bills daily |
| `Microsoft.Compute/virtualMachines`, `/disks` | Compute and storage |
| `Microsoft.Network/publicIPAddresses` | Bills hourly |
| `Microsoft.OperationalInsights/workspaces`, `Microsoft.Insights/components` | Ingestion past the free amount |
| `Microsoft.Cache/*` | No free tier |
| `Microsoft.Storage/storageAccounts` | Usually cents |

Resource groups Azure creates automatically, such as `DefaultResourceGroup-*`, `NetworkWatcherRG` and `ME_*`/`MC_*`, are expected and usually free. Still list what's in them.

## 3. Check each resource against its free tier

Check only what exists. Show ✅ when the resource is within its free tier, ⚠️ when it's free but near a limit, and ❌ when it's billing or misconfigured.

| Service | Command | Free when |
|---|---|---|
| Static Web Apps | `az staticwebapp show -n <n> -g <rg> --query "sku.name"` | `Free` |
| App Service | `az appservice plan show -n <plan> -g <rg> --query "sku.name"` and `az webapp show -n <app> -g <rg> --query "{state:state, usage:usageState}"` | `F1`. A `usageState` of `Exceeded` means today's 60 CPU minutes are used up. |
| Container Apps | `az containerapp show -n <n> -g <rg> --query "{min:properties.template.scale.minReplicas, max:properties.template.scale.maxReplicas, cpu:properties.template.containers[0].resources.cpu, mem:properties.template.containers[0].resources.memory}"` | min is `0` and max is `1`. Higher CPU or memory uses up the grant faster, and **usage past the grant is billed**. Check month-to-date cost in step 4. |
| Functions | `az functionapp show -n <n> -g <rg> --query serverFarmId -o tsv`, then `az appservice plan show --ids <that id> --query sku.name -o tsv` | `FC1` (Flex Consumption) or `Y1` (Consumption), with no always-ready instances |
| Azure SQL | `az sql db show -g <rg> -s <srv> -n <db> --query "{status:status, free:useFreeLimit, whenExhausted:freeLimitExhaustionBehavior}"` | `free` is true and `whenExhausted` is `AutoPause`. For compute left this month, see [azure-sql.md §7](${CLAUDE_PLUGIN_ROOT}/skills/database/references/azure-sql.md). |
| Cosmos DB | `az cosmosdb show -n <n> -g <rg> --query enableFreeTier`, plus the throughput sum from [cosmos-db.md §5](${CLAUDE_PLUGIN_ROOT}/skills/database/references/cosmos-db.md) | Free tier is true and total throughput ≤ 1000 RU/s |
| PostgreSQL / MySQL | `az <engine> flexible-server show -g <rg> -n <srv> --query "{state:state, tier:sku.tier, sku:sku.name, gb:storage.storageSizeGb}"` | Burstable, `Standard_B1ms`, ≤ 32 GB, **and** within the first 12 months of the free account |

### Azure SQL access (passwordless setup)

For each Azure SQL server in the project, check the following. These are the access checks; see the table above for the free-offer checks.

| Check | Command | Expected |
|---|---|---|
| Entra-only sign-in | `az sql server ad-only-auth get -g <rg> -n <server> --query azureAdOnlyAuthentication` | `true` |
| Admin | `az sql server ad-admin list -g <rg> -s <server> --query "[].login" -o tsv` | The user, or `sqladmins-<server>` |
| Firewall | `az sql server firewall-rule list -g <rg> -s <server> --query "[].{name:name, start:startIpAddress}" -o table` | `azure-free-client` matches the user's current IP, and `AllowAllWindowsAzureIps` exists |
| App identity | `az webapp identity show` / `az containerapp identity show` / `az functionapp identity show -g <rg> -n <app> --query principalId -o tsv` | A principal ID |
| Database users | `sqlcmd -S tcp:<server>.database.windows.net,1433 -d <db> --authentication-method ActiveDirectoryAzCli -l 60 -Q "SELECT m.name FROM sys.database_role_members rm JOIN sys.database_principals r ON r.principal_id = rm.role_principal_id JOIN sys.database_principals m ON m.principal_id = rm.member_principal_id WHERE r.name = N'app_readwrite'"` | Each app is listed |

- **The firewall IP is stale:** update it straight away. This is automatic by design, so use the command from [azure-sql.md step 4](${CLAUDE_PLUGIN_ROOT}/skills/database/references/azure-sql.md).
- **The free amount is running low early in the month, or the database paused before month end:**
  1. First look for what keeps it awake: open connections, pool minimums, health checks, query tools left open.
  2. Check `--auto-pause-delay` is 15. View it with `az sql db show ... --query autoPauseDelay`.
  3. If the app really needs more, explain the growth path.
  Both are covered in [azure-sql-growth.md](${CLAUDE_PLUGIN_ROOT}/skills/database/references/azure-sql-growth.md).
- **Anything else is wrong:** offer to fix it.

## 4. Money

### Month-to-date cost

1. Write `cost-query.json` to the OS temp folder or your scratchpad:
   ```json
   {"type":"ActualCost","timeframe":"MonthToDate","dataset":{"granularity":"None","aggregation":{"totalCost":{"name":"Cost","function":"Sum"}},"grouping":[{"type":"Dimension","name":"ServiceName"}]}}
   ```
2. Run the query:
   ```
   az rest --method post --url "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-11-01" --body @<path-to>/cost-query.json
   ```
3. Delete the temp file.

How to explain the result:
- Free-tier usage shows as $0.
- Credits aren't subtracted, so on a Free Trial any non-zero line is being paid from the USD 200.
- The data can be up to a day behind.
- If the offer isn't supported (Students or Sponsorship), say so. Point them to https://www.microsoftazuresponsorships.com to see their remaining credit.

### Budgets

```
az rest --method get --url "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.Consumption/budgets?api-version=2023-11-01" --query "value[].{name:name, amount:properties.amount, spent:properties.currentSpend.amount}"
```

- **No budget, and the offer supports budgets:** offer to create one ([setup skill step 7](${CLAUDE_PLUGIN_ROOT}/skills/setup/SKILL.md)).
- **`notes` in `.azure-free.json` say the budget is pending:** retry creating it now.

### Credit left on a Free Trial

There's no CLI command for this. Point the user to the portal: Cost Management + Billing → Credits.

## 5. Report

Lead with a one-line verdict, for example "Everything is on free tiers. $0.00 billed this month." Then show:

1. **Resources:** a table with each resource, its tier, and its ✅/⚠️/❌ status.
2. **Month-to-date cost,** split by service if anything isn't zero.
3. **What to do,** in priority order. Examples:
   - "Set `--min-replicas 0` on api to stop idle billing."
   - "SQL has 18% of its free compute left. It will pause until Nov 1."
   - "This Free Trial must be upgraded within 30 days of sign-up to keep these free services."

Offer to fix each ❌ item, with a creation card or confirmation for every change. Update `.azure-free.json` if the inventory didn't match it.

**When the app is growing,** offer at most one insight from [goals-to-features.md](${CLAUDE_PLUGIN_ROOT}/skills/database/references/goals-to-features.md) that fits the change and isn't in `declined`. Signs of growth include:
- the free amount running low early in the month
- data growing
- the user mentioning more users or new plans

Put it after the report, in the five-beat shape, and update `goals` if their plans changed. If nothing has changed, don't add one.
