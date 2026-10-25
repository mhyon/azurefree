---
name: web
description: Deploys a website, web app or API to free Azure hosting and keeps it updated. Covers Static Web Apps Free for static sites and SPAs, App Service F1 or Container Apps (scale to zero) for server apps, and Functions Flex Consumption for APIs. Use when the user wants to deploy, publish, host or redeploy a site or app on Azure for free, asks which free Azure hosting fits their project, needs logs, settings or a custom domain for an Azure-hosted app, or hits a quota error on the App Service free plan.
argument-hint: "[static | app-service | container-apps | functions]"
---

# Put the app on free Azure hosting

Follow the guiding rules in the `azure-free:start` skill: plain language, one step at a time, a creation card before every create, and secrets kept out of chat. Limits are in [free-offers.md](${CLAUDE_PLUGIN_ROOT}/reference/free-offers.md) §3.

## 0. Prerequisites

Read `.azure-free.json`. You need a signed-in CLI, a resource group and a region. If any of these is missing, run `azure-free:setup` first. If the file already lists a web resource, this is a **redeploy**: skip to step 4 and use the `deploy` command recorded there.

## 1. Choose the host

If the user passed an argument (`static`, `app-service`, `container-apps`, `functions`), use it. Otherwise, inspect the project and recommend:

| Project | Host | At the free limit | Reference |
|---|---|---|---|
| Static site or SPA (plain HTML, Vite, React, Vue, Svelte, Angular, Astro static, Hugo, Jekyll, Next.js `output: 'export'`) | Static Web Apps Free | Stops serving. **Never bills.** | [static-web-apps.md](references/static-web-apps.md) |
| Server app (Express, Flask, FastAPI, Django, ASP.NET Core, Spring, Go, Rails) | App Service F1. If the F1 quota is zero, use Container Apps instead. | Stops until the next day. **Never bills.** | [app-service.md](references/app-service.md) |
| Server-side-rendering frameworks, or anything with a Dockerfile | Container Apps | **Keeps running and bills the overage** | [container-apps.md](references/container-apps.md) |
| Serverless functions only | Functions Flex Consumption | **Keeps running and bills the overage** | [functions.md](references/functions.md) |

**Capped options first.** Static Web Apps and App Service F1 stop at their limit, while Container Apps and Functions bill past their free grant with no cap. When a capped option fits the app, recommend it. Whenever you recommend Container Apps or Functions, say plainly that usage past the free grant is billed, and give the rough cost: about $0.027 per active hour for Container Apps, and $0.047 per busy instance-hour for Functions.

On a **Free Trial** (quotaId `FreeTrial_*`), say that the App Service free plan sometimes has zero quota on new trials. Recommend Container Apps for server apps unless the user prefers to try F1 first. The trial's spending limit protects them for now; mention that this changes when they upgrade.

**Using Azure SQL?** If the project uses Azure SQL, or `.azure-free.json` already lists one, the code that talks to the database must run where managed identity is available: App Service, Container Apps or Functions. Static Web Apps Free-plan managed functions (`api/`) can't use managed identity, and linking your own API needs the paid Standard plan. A static front end can stay on Static Web Apps and call an API hosted on one of the other three.

Ask the user to confirm the host with one AskUserQuestion. Give the free limit that matters most for each option, for example "sleeps after 20 minutes idle" or "100 GB bandwidth a month".

## 2. Build and run locally first

1. Find the build command and output folder:
   - `package.json` scripts: `build` usually outputs to `dist/`, `build/` or `out/`.
   - Python: `requirements.txt` or `pyproject.toml`.
   - .NET: `dotnet publish`.
2. Run the build and fix any errors before deploying anything. A broken build deployed to Azure is much harder to debug.
3. **Server apps:** check that the app listens on the port Azure provides (`process.env.PORT`, `os.environ["PORT"]`, or `ASPNETCORE_URLS`), not a hard-coded one.

## 3. Create the hosting resource and deploy

Open the reference file for the chosen host and follow it. Each reference covers naming, creation, the first deploy, redeploys, settings, logs and custom domains.

- **Budget gate for Container Apps and Functions.** Before creating either one, check the subscription's `spendingLimit`. If it's `Off` or `CurrentPeriodOff`, a budget alert must exist first, because these hosts bill past their free grant. The reference's "Before you create anything" step has the commands. If there's no budget, create one (setup skill step 7) before deploying.
- Show a creation card before every create command. Its "If over" line must be honest for that service. "Never bills" is only true for Static Web Apps Free, App Service F1 and Azure SQL with AutoPause. For Container Apps and Functions, give the overage price.
- The cost guard checks every `az` command you run.
- If the guard pauses a command, don't argue past it. Fix the command so it uses the free option, or explain the cost and let the user decide.

## 4. Verify it's live

1. Fetch the URL and check for HTTP 200: `curl -sS -o /dev/null -w "%{http_code}" <url>` in bash, or `(Invoke-WebRequest <url> -UseBasicParsing).StatusCode` in PowerShell.
2. A first request after deploying or after a period of idling can take 10 to 60 seconds. Retry once before you start debugging.
3. Give the user the URL and suggest they open it.

If something's wrong, check the logs using the steps in the reference before changing anything.

## 5. Record it

Add or update the web entry in `.azure-free.json`. See [state-file.md](${CLAUDE_PLUGIN_ROOT}/reference/state-file.md). Fill in:
- `service`, `name`, `tier` and `url`
- `deploy`: the exact redeploy command, with any secret replaced by a description of where to get it

Also record supporting resources (plan, environment, storage account) as separate entries. Set `updated` to today's date.

## 5b. Connect to an existing Azure SQL database

If `.azure-free.json` lists an Azure SQL database and this app should use it, finish the passwordless connection now. Follow [azure-sql.md](${CLAUDE_PLUGIN_ROOT}/skills/database/references/azure-sql.md) steps 6–8:
1. Assign the app's managed identity.
2. Create its database user in `app_readwrite`.
3. Set the connection settings.
4. Restart the app.

Then check that an endpoint that reads from the database works.

## 6. Hand back

Wrap up in three lines or fewer:
1. The live URL.
2. The free limit to watch.
3. How to redeploy. They can also say "redeploy my app" any time.

If they need a database, continue with `azure-free:database`.

## Going public

When the user adds a custom domain, or says they're launching, sharing the app widely or starting to charge, offer the launch check from [goals-to-features.md](${CLAUDE_PLUGIN_ROOT}/skills/database/references/goals-to-features.md).
- Include only the items that fit their `goals`: backups and restore, auditing, Microsoft Defender for SQL, the growth path.
- Use the same five-beat shape, with prices for anything that costs.
- Skip it if `launch-check` is in `declined`.
- Record a new goal such as `public` or `business` in `goals`.
