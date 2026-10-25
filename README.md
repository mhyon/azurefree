# azure-free: a Claude Code plugin for Azure's free tier

A guided path for creators and builders to put a **website or app plus a database on Azure for free**, without having to learn Azure first and without surprise bills.

Claude walks you through each step:

1. Sign up for the right Azure account.
2. Install and sign in to the Azure CLI.
3. Deploy your project to free hosting.
4. Add a free database and connect it to your app.
5. Check costs and free usage.
6. Clean up when you're done.

Along the way, a cost guard watches every `az` command and pauses anything that would create a paid resource.

> Unofficial. A personal project by a Microsoft employee; not a Microsoft product and not endorsed by Microsoft. Free-tier terms change, so the plugin's reference notes record when each fact was last checked, and it can re-check them against Microsoft Learn. Read the [Disclaimers](#disclaimers) before you use it.

## What you get

| Command | What it does |
|---|---|
| `/azure-free:start` | **Start here.** Works out where you are (account, CLI, sign-in, existing resources), looks at your project, recommends free services, and walks you through the rest. |
| `/azure-free:signup` | Picks the right account (free account, Azure for Students, or an existing one), explains the 30-day/USD 200 deal in plain words, opens the sign-up page and coaches you through it. |
| `/azure-free:setup` | Installs the Azure CLI and signs you in. Detects your offer type and spending limit, picks a region, creates a resource group, and sets a **$1 budget email alert**. |
| `/azure-free:web` | Deploys to Static Web Apps Free, App Service F1, Container Apps (scale to zero) or Functions Flex. Also covers redeploys, settings, logs and custom domains. |
| `/azure-free:database` | Sets up the Azure SQL free offer, the default for any app that stores data, and names the other free options in one line. Apps on SQLite, in-memory or JSON-file storage are moved to Azure SQL automatically. For apps already on PostgreSQL, MySQL or MongoDB, it explains the cost trade-off and asks before switching. Cosmos DB free tier, DocumentDB (MongoDB) free tier and PostgreSQL/MySQL (12 months) are used if you ask, if you keep your existing engine, or if the app can't run on SQL Server without a rewrite. Azure SQL is fully passwordless: Entra-only sign-in, an auto-named server, your IP opened automatically, and your app's managed identity added as a database user in a read/write role. After setup, it explains the Azure SQL features that fit your app as it grows past a prototype (row-level security, data masking, Always Encrypted, ledger and temporal tables, JSON and vector search, and the in-place path from free to production) and can set up row-level security for you. The other engines get generated credentials in `.env`. It also covers migrations. |
| `/azure-free:status` | Shows what's running, whether each resource is still within its free tier, the month-to-date cost, free SQL compute left, and your budgets. |
| `/azure-free:cleanup` | Pauses servers to save free hours, deletes one resource, or tears down the whole project, with an export offer and confirmation first. |

You don't have to remember the commands. Saying something like *"put this site on Azure for free"* or *"am I being charged on Azure?"* loads the right skill.

### The cost guard

A `PreToolUse` hook reads every Bash or PowerShell command Claude is about to run. When it finds an `az` command that would create something paid, it pauses and tells you why. Examples:

- An App Service plan without `--sku F1` (the CLI default is a paid Basic plan)
- `az sql db create` without `--use-free-limit`, or with the one-way `BillOverUsage`
- `az cosmosdb create` without `--enable-free-tier true`, which can't be fixed after creation
- PostgreSQL without `--tier Burstable --sku-name Standard_B1ms --storage-size 32` (the CLI defaults to General Purpose and 128 GB)
- `az containerapp up --source`, which quietly creates a paid container registry
- Container Apps with `--min-replicas 1` or more, or without `--max-replicas 1`. The default is up to 10 replicas, and every busy replica past the free grant is billed.
- Always-paid services such as AKS, Redis, App Gateway and Bastion

Deleting a resource group or a database also pauses for confirmation.

You can change what the guard does with the plugin option `cost_guard`, set via `/config` or `claude plugin configure azure-free`:

| Mode | Behaviour |
|---|---|
| `ask` (default) | Pause and ask you, with the reason |
| `block` | Refuse paid creates and explain the free alternative. Deletes still ask. |
| `warn` | Let commands run, but tell Claude about the cost |
| `off` | Disable the guard |

`ask` prompts still appear in auto mode. In non-interactive `claude -p` runs, nobody can answer the prompt, so paused commands are refused. Claude Code's docs don't say for certain whether a hook's `ask` still prompts when permissions are bypassed (`--dangerously-skip-permissions`). If you work that way, set the guard to `block`.

### Suggestions that fit your goals

The plugin asks a few questions about what you want your app to become, such as who will use it and what kind of data it holds. It uses your answers to suggest database features that fit, one at a time, each with what it costs. Say "not needed" and it won't bring that one up again. Your answers are kept as short labels in `.azure-free.json`.

### Picks up where you left off

The skills record what they create in `.azure-free.json` at your project root: subscription, region, resource group, each resource, and its redeploy command. **The file never holds secrets.** A `SessionStart` hook summarizes it into Claude's context, so next week "redeploy my app" just works. Projects without the file pay no token cost.

### Up-to-date docs

The plugin connects the Microsoft Learn MCP server (`https://learn.microsoft.com/api/mcp`, no sign-in needed). Claude uses it to check any free-tier limit marked *unverified* before relying on it.

## What's free (checked 2026-10-19; overage prices checked 2026-10-25)

| | Option | Free for | Main limit | At the limit |
|---|---|---|---|---|
| Web | Static Web Apps Free | Always | 100 GB bandwidth/month per subscription | Site unavailable until next month. **Never bills.** |
| Web | App Service F1 | Always | 60 CPU min/day; no custom domain. New Free Trials may have **zero quota** | App stops until the next day. **Never bills.** |
| Web | Container Apps | Always (monthly grant) | ~200 active hours at 0.25 vCPU; scale to zero | **Keeps running and bills the overage**: about $0.027 per active hour per replica, or about $14/month for one replica busy all month |
| Web | Functions Flex Consumption | Always (monthly grant) | 250k executions + 100k GB-s | **Keeps running and bills the overage**: about $0.047 per busy instance-hour at 512 MB, plus $0.40 per million executions |
| DB | Azure SQL Database free offer | Always | 100k vCore-seconds + 32 GB per database per month, up to 10 databases | With AutoPause (the plugin's setting), pauses until the 1st. **Never bills.** |
| DB | Cosmos DB free tier | Always | 1000 RU/s + 25 GB, one account per subscription | **Bills** throughput above 1000 RU/s and storage above 25 GB |
| DB | Azure DocumentDB free tier | Always | 32 GB, one cluster per subscription | Fixed free cluster; moving to a paid tier is a manual upgrade |
| DB | PostgreSQL / MySQL B1ms | **12 months**, free account only | 750 h + 32 GB per month | **Bills** usage above the allowance, and everything after 12 months |

Prices are East US list prices. During a Free Trial, the spending limit stops any of these from charging your card. After you upgrade, the rows marked **bills** can cost money, which is why the plugin requires a budget alert before deploying Container Apps or Functions on a subscription without a spending limit.

The full notes, sources and known conflicts are in [reference/free-offers.md](reference/free-offers.md).

**The thing most people miss:** a Free Trial is disabled after 30 days unless you upgrade to pay-as-you-go. Upgrading keeps all the free services, but it removes the spending limit for good. That's why setup always creates a budget alert, except on Azure for Students, where Microsoft doesn't support budgets and the credit cap is the safety net.

## Disclaimers

**Unofficial, personal project.** azure-free is built by a Microsoft employee in a personal capacity. It isn't a Microsoft product, and it isn't sponsored or endorsed by Microsoft or Anthropic. Its choices, including defaulting to Azure SQL, are the author's own. Microsoft, Azure, Azure SQL, Microsoft Entra and related names are trademarks of Microsoft Corporation. Claude and Claude Code are trademarks of Anthropic.

**You're responsible for your Azure bill.** The plugin tries to keep you on free tiers, but it can't guarantee you'll pay nothing. Microsoft sets the free offers' limits, eligibility rules and end dates, and can change them at any time. Any charges on your subscription are between you and Microsoft. Before relying on anything being free, check [Azure pricing](https://azure.microsoft.com/pricing) and your subscription's Cost Management.

**The cost guard is a safety net, not a guarantee.** It only checks `az` commands that Claude runs, matches them against a known list of paid patterns, and lets a command through if the guard itself errors. It doesn't see Bicep or ARM templates, `azd`, the Azure portal, or commands you run yourself. It needs Node.js. It can't ask you in non-interactive runs, and it may not ask when permissions are bypassed. Budget alerts are emails that can arrive a day late, and they don't stop spending.

**Free-tier facts may be out of date.** The limits and prices in this repo were last checked on 2026-10-19. They're summaries, not Microsoft's terms. Microsoft's official documentation and offer terms always take precedence.

**Claude acts on your real Azure account.** The skills run real Azure CLI commands with your signed-in credentials, including commands that create and delete resources. AI can make mistakes. Read permission prompts before approving them, keep backups of data you care about, and don't run with permissions bypassed.

**Not production-ready as-is.** Free tiers have no SLA and limited backups (a 7-day restore window on the free Azure SQL offer), and apps sleep and databases pause when idle. The default database firewall lets any Azure-hosted service attempt a connection; only identities you've granted can actually get in. Review your security, compliance and data-protection needs before storing real customer data.

**Third-party services.** To open the database firewall, setup looks up your public IP using `api.ipify.org`. The bundled Microsoft Learn MCP server sends documentation searches to Microsoft. Tools the skills may install (Azure CLI, go-sqlcmd, the Static Web Apps CLI, Azure Functions Core Tools) come from Microsoft and have their own licenses and telemetry. The plugin itself collects no data.

**No warranty.** This plugin is provided "as is" under the MIT License. See [LICENSE](LICENSE).

## Requirements

- Claude Code
- **Node.js 18+**, used by the two hooks. Without Node, the skills still work, but the cost guard and session context don't run.
- The Azure CLI. `/azure-free:setup` installs it for you if it's missing.
- An Azure account. `/azure-free:signup` helps you get one.

## Install

**From GitHub.** Inside Claude Code:

```
/plugin marketplace add mhyon/azurefree
/plugin install azure-free@azurefree
```

**Try a local clone without installing:**

```bash
claude --plugin-dir /path/to/azurefree
```

A local clone is also a one-plugin marketplace, so `/plugin marketplace add /path/to/azurefree` works too.

## Safety

- Claude never enters passwords, card numbers or phone codes for you. It opens the page and coaches you while you type.
- Nothing is created without a "creation card" showing the name, region, cost and how to undo it, followed by your yes.
- Azure SQL has no passwords at all. You sign in with your Microsoft Entra account, and the app signs in with its managed identity, which can read and write data but can't change the schema.
- For other engines, passwords are generated straight into `.env` and are never shown in chat. Commands that would echo secrets run with `-o none`. The skills make sure `.gitignore` covers `.env`.
- The guard fails open. If it ever errors, your command goes through Claude Code's normal permission prompts.

## Development

```
.claude-plugin/plugin.json        manifest (+ cost_guard option)
.claude-plugin/marketplace.json   single-plugin marketplace
.mcp.json                         Microsoft Learn MCP server
hooks/hooks.json                  PreToolUse guard + SessionStart context
hooks/free-tier-guard.mjs         the cost guard (pure Node, no dependencies)
hooks/session-context.mjs         .azure-free.json → session context
reference/                        free-offer facts, state-file schema
skills/<name>/SKILL.md            the seven guided skills (+ references/)
tests/                            node:test unit tests for both hooks
```

Run the tests and validate:

```bash
node --test "tests/*.test.mjs"
```

```bash
claude plugin validate .claude-plugin/plugin.json --strict
```

```bash
claude plugin validate . --strict
```

```bash
claude --plugin-dir . plugin details azure-free
```

**Check the guard by hand** in a session started with `--plugin-dir .`. Ask Claude to run `echo ok || az appservice plan create -g x -n y --sku B1`. You should get a permission prompt that says the B1 plan is billed. Because of the `||`, the `az` part never runs even if you approve it.

**When free-tier terms change,** update `reference/free-offers.md` (and its "Last verified" date) first, then the matching skill reference and guard rule.

## License

MIT. See [LICENSE](LICENSE).
