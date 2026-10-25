---
name: setup
description: Gets a computer and an Azure subscription ready for free-tier work. Installs or updates the Azure CLI, signs in, picks the subscription, checks the offer type and spending limit, chooses a region, registers resource providers, creates the project's resource group, sets up a budget email alert and writes .azure-free.json. Use when the Azure CLI is missing or signed out, when switching subscriptions, before creating a project's first Azure resource, or when the user asks for cost alerts.
allowed-tools: Bash(az version*) Bash(az account show*) Bash(az account list *) Bash(az account list-locations *) Bash(az group list *) Bash(az group show *) Bash(az provider show *) Bash(az rest --method get *) Read Glob
---

# Set up the Azure CLI, subscription and cost alert

Follow the guiding rules in the `azure-free:start` skill: plain language, one step at a time, a creation card before anything is created, and no secrets in chat. Facts and limits are in [free-offers.md](${CLAUDE_PLUGIN_ROOT}/reference/free-offers.md).

Skip any step that's already done. Check first, then act.

## 1. Azure CLI installed and current

Run `az version -o json`.

**If the CLI is missing,** install it for their OS:

| OS | Command | Notes |
|---|---|---|
| Windows | `winget install --exact --id Microsoft.AzureCLI` | A UAC prompt may appear for the user. The current shell won't see `az` until Claude Code restarts. Until then, call it by its full path: `"C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"`. |
| macOS | `brew update && brew install azure-cli` | No Homebrew? Send them to https://learn.microsoft.com/cli/azure/install-azure-cli-macos |
| Debian/Ubuntu | `curl -sL https://aka.ms/InstallAzureCLIDeb \| sudo bash` | Needs their sudo password, so ask them to run it in their own terminal (in the Claude Code CLI they can type `! <command>`). |
| Anything else | https://learn.microsoft.com/cli/azure/install-azure-cli | |

**If the version is older than 2.60,** suggest `az upgrade`.

Know the flag differences between versions:
- `az webapp up` is deprecated in newer releases. The skills don't use it.
- PostgreSQL's `--high-availability` became `--zonal-resiliency` in 2.87. The skills leave both out, because high availability is off by default.

## 2. Signed in

Run `az account show -o json`.

**If they're not signed in:**
1. Explain that a browser window, or on Windows an account picker, will open, and that they sign in there.
2. Run `az login` with a 5-minute timeout.
3. If there's no browser (SSH, container, remote session), run `az login --use-device-code` in the background. Read its output and show them the URL and code. Wait until they say they're done, then check `az account show`.

Never ask for their password.

**If they have several subscriptions:**
1. List them: `az account list --query "[].{name:name, id:id, state:state, default:isDefault}" -o table`.
2. Ask which one this project should use. Recommend a personal Free Trial or pay-as-you-go subscription over a work one.
3. Switch: `az account set --subscription <id>`.

## 3. Offer type and health

Check the offer and status:

```
az rest --method get --url "https://management.azure.com/subscriptions/{subscriptionId}?api-version=2022-12-01" --query "{name:displayName, state:state, quotaId:subscriptionPolicies.quotaId, spendingLimit:subscriptionPolicies.spendingLimit}"
```

Translate the result into plain words using free-offers.md §2. For example: "This is a Free Trial. You have USD 200 of credit and the spending limit is on, so nothing can charge your card until you choose to upgrade."

Flag these:

| What you see | What to tell them |
|---|---|
| `state` is `Disabled` or `Warned` | The trial has probably ended. They need to upgrade in the portal (Subscriptions → their subscription → Upgrade) before anything can be created. |
| quotaId is `EnterpriseAgreement_*` or `CSP_*` | This is probably an employer's or reseller's subscription. Check they're allowed to use it, or switch. |
| `DreamSpark_*` | Students Starter. Only App Service and Functions are available, with no free database. |
| `AzureForStudents_*` or `Sponsored_*` | Budgets won't work here. Step 7 changes accordingly. |

## 4. Region

Ask where most of their visitors are, then suggest one region for everything:

| Visitors | Region | Fallbacks |
|---|---|---|
| North America | `eastus2` | `centralus`, `westus2` |
| Europe | `westeurope` | `northeurope` |
| Asia | `eastasia` | `southeastasia` |
| Australia | `australiaeast` | n/a |

Static Web Apps content is served globally. Its region only matters for its managed API (centralus, eastus2, westus2, westeurope, eastasia), so put a Static Web App in the nearest of those, even if the rest of the project is elsewhere.

If a later create fails with a capacity or "not available in this region" error, retry in the nearest fallback.

## 5. Resource providers

New subscriptions often need providers registered. Register only the ones this project's choices need:

| Service | Providers |
|---|---|
| Static Web Apps, App Service, Functions | `Microsoft.Web` |
| Container Apps | `Microsoft.App`, `Microsoft.OperationalInsights` |
| Azure SQL | `Microsoft.Sql` |
| Cosmos DB, DocumentDB | `Microsoft.DocumentDB` |
| PostgreSQL | `Microsoft.DBforPostgreSQL` |
| MySQL | `Microsoft.DBforMySQL` |
| Functions storage | `Microsoft.Storage` |
| Budgets and cost queries | `Microsoft.Consumption`, `Microsoft.CostManagement` |

1. Check each: `az provider show -n <ns> --query registrationState -o tsv`.
2. Register the ones that aren't `Registered`: `az provider register -n <ns> --wait`. Registration is free and takes a minute or two.

## 6. Resource group

1. Name it `rg-<project>-free`. Use the folder name, lowercased, with hyphens.
2. Show a creation card. Resource groups are free.
3. Create it:
   ```
   az group create -n <rg> -l <region> --tags project=<project> managed-by=azure-free -o table
   ```

## 7. Budget email alert

**Skip this step for Students and Sponsorship offers.** Tell the user why, and record it in `notes` in `.azure-free.json`.

For everyone else, this step is mandatory. A $1 monthly budget emails them as soon as anything starts to cost money.

1. **Explain it.**
   - Budgets only send alerts; they never stop anything.
   - Alerts can arrive up to a day late.
   - On a Free Trial the spending limit already protects them. The budget is their safety net after they upgrade.
2. **Get the email address.** Ask where alerts should go. Offer the signed-in account (from `az account show --query user.name -o tsv`) if it's an email address. Don't save the address anywhere except the budget itself.
3. **Write the budget file.** Put `budget.json` in the OS temp folder or your scratchpad, not in the project.
   - Set `startDate` to the first day of the current month in UTC.
   - Set `endDate` to three years later.
   - Fill in `contactEmails` with the address from step 2.

   ```json
   {
     "properties": {
       "category": "Cost",
       "amount": 1,
       "timeGrain": "Monthly",
       "timePeriod": { "startDate": "2026-10-01T00:00:00Z", "endDate": "2029-10-01T00:00:00Z" },
       "notifications": {
         "AnySpend":     { "enabled": true, "operator": "GreaterThan",          "threshold": 1,   "thresholdType": "Actual",     "contactEmails": ["<email>"] },
         "OverBudget":   { "enabled": true, "operator": "GreaterThanOrEqualTo", "threshold": 100, "thresholdType": "Actual",     "contactEmails": ["<email>"] },
         "ForecastOver": { "enabled": true, "operator": "GreaterThan",          "threshold": 100, "thresholdType": "Forecasted", "contactEmails": ["<email>"] }
       }
     }
   }
   ```

   Thresholds are percentages of the $1 amount, so `AnySpend` fires at the first cent.
4. **Create the budget:**
   ```
   az rest --method put --url "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.Consumption/budgets/azure-free-monthly?api-version=2023-11-01" --body @<path-to>/budget.json -o none
   ```
5. **Delete the temp file.**
6. **If it fails,** check why:
   - The subscription is brand new: Cost Management can take up to 48 hours to switch on. Record the budget as pending in `notes`, and have `azure-free:status` retry later.
   - The offer isn't supported: treat it like the Students case above.

## 8. Write `.azure-free.json` and protect secrets

1. Create `.azure-free.json` in the project root. Include the subscription details, region, resource group and budget (name, amount, scope). Follow the schema in [state-file.md](${CLAUDE_PLUGIN_ROOT}/reference/state-file.md).
2. Make sure `.gitignore` exists and contains `.env` and `.env.*`, so secrets created later stay out of git.

## 9. Recap and next step

Recap in three lines or fewer: the CLI is ready, which subscription and offer they're on, the region, the resource group, and the alert email. Then continue with `azure-free:web`, or with whatever step the user came here for.
