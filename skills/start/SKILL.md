---
name: start
description: Guided start for putting a website, web app or API, plus a database, on Azure for free. Use when someone wants to host or deploy a project on Azure at no cost, asks how to get started with Azure's free tier, asks which Azure services are free, or isn't sure what to do next with an Azure free-tier project. Checks where they are (account, CLI, sign-in, existing resources), recommends free services that fit their project, then walks them through each step.
argument-hint: "[what you want to build or host]"
allowed-tools: Bash(az version*) Bash(az account show*) Bash(az account list *) Bash(az group list *) Bash(az resource list *) Bash(az rest --method get *) Read Glob Grep
---

# Azure free tier: start here

Your job is to take the user from wherever they are now to a live web app and database running on Azure free tiers. Go one clear step at a time, and make sure nothing surprises them with a bill.

## How to guide (applies to every azure-free skill)

- **Speak to a creator, not a cloud engineer.** The first time a term comes up, define it in a short clause:
  - *subscription*: the billing container for everything you create
  - *resource group*: a folder for one project's resources
  - *region*: the datacenter location
  - *tier/SKU*: the size and price level
- **One step at a time.** Before each step, say what it does and why in a sentence. After it, confirm it worked and name the next step.
- **Make choices easy.** Use AskUserQuestion with your recommendation as the first option. Fall back to a plain question if that tool isn't available. Don't ask what you can find out yourself.
- **Show a creation card before creating anything,** then get a clear yes:
  ```
  About to create
    What:     Azure SQL Database (free offer)
    Name:     blogdb on server blog-sql-k3x9
    Where:    East US 2 · resource group rg-blog-free
    Cost:     $0. 100,000 vCore-seconds and 32 GB every month
    If over:  pauses until the 1st; never bills
    Undo:     /azure-free:cleanup
  ```
  Make the "If over" line honest for each service. Only Static Web Apps Free, App Service F1 and Azure SQL with AutoPause truly never bill. Container Apps, Functions and Cosmos DB above its free tier keep running and bill the overage, so give the price. The "At the limit" tables in [free-offers.md](${CLAUDE_PLUGIN_ROOT}/reference/free-offers.md) have the details.
- **Never create anything paid** unless the user has agreed to the actual price. The plugin's cost guard pauses `az` commands that would cost money. If it fires, explain the cost and offer the free alternative.
- **Never do the user's identity steps for them.** Don't enter passwords, card numbers, phone codes or CAPTCHAs. Open the page and coach them while they do it.
- **Keep secrets out of sight.** Secrets go in `.env` (git-ignored) and in the app's settings on Azure. Never put them in chat, in `.azure-free.json`, in commit messages or in command output. Use `-o none` on commands that would echo them.
- **Write commands that work in any shell.** They must run in bash and PowerShell:
  - Pass JSON as a file (`--body @file.json`).
  - Use the `{subscriptionId}` placeholder in `az rest` URLs.
  - Put each multi-step secret flow in a single command, because shell variables don't carry over between commands.
  - In PowerShell, `az` runs through a `.cmd` file. A `--query` (or other argument) that contains `(`, `)`, `|`, `&`, `<` or `>` but no spaces gets mangled by cmd.exe. Add a space inside it, for example `"length( @ )"`, or avoid those characters.
  - Put T-SQL in a `.sql` file and run it with `sqlcmd -i`, rather than quoting it inline.
- **Record progress in `.azure-free.json`.** See [state-file.md](${CLAUDE_PLUGIN_ROOT}/reference/state-file.md).
- **Check facts before relying on them.** Free-tier limits, eligibility and gotchas are in [free-offers.md](${CLAUDE_PLUGIN_ROOT}/reference/free-offers.md). Before relying on anything marked *unverified*, check it with the Microsoft Learn MCP tools (`microsoft_docs_search`, `microsoft_docs_fetch`).

## 1. Find out where the user is

Run these checks together. All of them are read-only.

1. Read `.azure-free.json` in the project root, if it exists. If it does, go to **Resuming** below.
2. `az version -o json` tells you whether the CLI is installed and which version.
3. `az account show -o json` tells you whether they're signed in, and to which subscription. An error that mentions `az login` means they aren't signed in.
4. If they're signed in, check the offer type:
   `az rest --method get --url "https://management.azure.com/subscriptions/{subscriptionId}?api-version=2022-12-01" --query "{state:state, quotaId:subscriptionPolicies.quotaId, spendingLimit:subscriptionPolicies.spendingLimit}"`
   Map the result with the table in free-offers.md §2.
5. Look at the project files to work out what it is (see step 4).

If the user doesn't know whether they have an Azure account, and the CLI isn't signed in, treat them as having no account. The signup skill handles "maybe".

## 2. Ask what the app is for

If the app stores data, or might, ask the round 1 questions from [goals-to-features.md](${CLAUDE_PLUGIN_ROOT}/skills/database/references/goals-to-features.md): what it should become, whether people will have their own private data, and whether it holds anything sensitive.
- Use one AskUserQuestion, and skip any question the code already answers.
- Record the answers as `goals` labels in `.azure-free.json` once the file exists. Until then, keep them in mind.

Skip this step if the user has asked to just get it running, or if `goals` is already recorded and nothing suggests it has changed.

## 3. Show the roadmap

Show this every time you start or resume, with what's done ticked off:

```
Your path to a free Azure app
  [x] 1. Azure account     Free Trial, spending limit on
  [x] 2. Tools ready       Azure CLI 2.77, signed in as sam@example.com
  [ ] 3. Website / app     → Static Web Apps (Free plan)
  [ ] 4. Database          → Azure SQL Database (free offer)
  [ ] 5. Connect them      app settings + .env
  [ ] 6. Cost alert        $1 budget → email
```

Leave out the database rows if they don't need a database.

## 4. Recommend free services for this project

**Hosting.** Pick based on what's in the project:

| What you find | Kind of project | Recommend |
|---|---|---|
| Only `index.html`/CSS/JS. Or Vite, CRA, Vue, Svelte, Angular, Astro (static), Hugo, Jekyll, Gatsby, or Next.js with `output: 'export'` | Static site or single-page app | **Static Web Apps Free.** A small API with no database (or with Cosmos DB) can go in `api/` as managed Functions. An API that uses Azure SQL goes on App Service F1 or Container Apps. |
| Express, Fastify, Nest, Flask, FastAPI, Django, ASP.NET Core, Spring Boot, Go, Rails | Server app | **App Service F1** (no Docker, zip deploy). On a Free Trial, warn that F1 quota may be zero and offer **Container Apps** as the fallback. |
| Next.js/Nuxt/SvelteKit/Remix with server-side rendering | Node server app | **Container Apps** (scales to zero, custom domains), or App Service F1 |
| A `Dockerfile` | Container | **Container Apps** |
| `host.json`, function handlers only | Serverless API | **Functions Flex Consumption** |
| No code yet | n/a | Ask what they want to make. A static site on Static Web Apps is the easiest first win. |

**Database. If the app stores data at all, recommend Azure SQL.**

**Azure SQL Database free offer:**
- Always free, with up to 10 databases.
- Passwordless: the app signs in with its managed identity.
- The code that talks to the database must run on App Service, Container Apps or Functions, not in a Static Web Apps `api/` folder.

How much to change depends on what the app uses today:
- **SQLite, an in-memory store, or JSON files:** moving the app to Azure SQL is part of the job. Do it without a separate question.
- **A real database engine already (PostgreSQL, MySQL or MongoDB, directly or through an ORM):** still recommend Azure SQL, but **ask before switching**. Say in plain words what would change in their code, and give the cost trade-off: Azure SQL is always free, while PostgreSQL/MySQL are free for 12 months on new free accounts only and then about USD 15 or more a month. If they'd rather keep their engine, use it.

ORM settings for switching to SQL Server:

| ORM or framework | Change it to SQL Server |
|---|---|
| Prisma | `provider = "sqlserver"` |
| Sequelize | `dialect: 'mssql'` |
| TypeORM | `type: 'mssql'` |
| Knex | `client: 'mssql'` |
| EF Core | `UseSqlServer` |
| Django | `mssql-django` |
| SQLAlchemy | `mssql+` URL |
| Rails | `activerecord-sqlserver-adapter` |
| Laravel | `sqlsrv` |

Recommend a different engine only in these cases:

| Situation | What to do |
|---|---|
| The user asks for a specific engine by name | Use it, and state its free terms plainly: PostgreSQL/MySQL B1ms is **free for 12 months only, on free accounts only**; Cosmos DB and DocumentDB free tiers are always free, one per subscription. |
| The user chooses to keep the engine their app already uses | Use it, with the same plain statement of its free terms. |
| The app is tied to an engine Azure SQL can't stand in for without a rewrite. For example: WordPress (MySQL only), Mongo-native code (`mongoose`/`mongodb`), or Postgres-only features (extensions like PostGIS, arrays, `jsonb` operators, `RETURNING`-heavy raw SQL) | Explain in two sentences what would have to change for Azure SQL. If the change is small, recommend Azure SQL and ask before switching. Otherwise offer the matching engine (MySQL flexible server, DocumentDB, PostgreSQL flexible server) with its free terms, and let the user choose. |
| No data storage at all | No database. Skip steps 4–5. |

Explain the recommendation in two or three plain sentences. Cover what it costs ($0 within limits), the one limit most likely to matter to them, and what happens if they go over. If the recommendation means changing the database the app uses today, say so plainly, so "Go with this" is an informed choice.

For Azure SQL, add one sentence on why it's a good long-term home, using specific claims. If their step 2 answers point to a goal Azure SQL helps with, make the sentence about that goal. For example: "Since friends will have their own notes, Azure SQL can keep each person's data separate in the database itself, and it's always free and passwordless." Otherwise use the general version: "It's always free and passwordless, has row-level security, encryption, and JSON and vector search built in, and it scales up in place when you outgrow the free tier." The database skill gives the fuller, app-specific version after setup.

Then name the alternatives in one line, for example: "Other free options: Cosmos DB (always free, one per subscription) or PostgreSQL/MySQL (free for 12 months on new free accounts). Say if you'd prefer one."

Then ask:

- **Go with this (recommended)**
- **Pick different services**
- **Web only for now**
- **Database only**

## 5. Walk the path

Load the matching skill for each remaining step, in this order. Skip steps that are already done.

1. **No usable Azure account.** Load `azure-free:signup`.
2. **CLI missing, not signed in, or no resource group or cost alert yet.** Load `azure-free:setup`.
3. **Website or app.** Load `azure-free:web`.
4. **Database, and connecting it to the app.** Load `azure-free:database`.
5. **Final check.** Load `azure-free:status`.

Between steps, give a one-line recap and name the next step. If the user wants to stop partway, update `.azure-free.json` so the next session can pick up where they left off.

## Resuming

If `.azure-free.json` exists:
1. Summarize what's deployed.
2. Confirm it still exists with `az resource list -g <resourceGroup> --query "[].{name:name, type:type}" -o table`.
3. Show the roadmap.
4. Ask what they'd like to do: **Redeploy my app**, **Add a database**, **Check costs and free usage**, **Change or remove something**.

If the user mentions new plans for the app, such as more users, charging for it, or AI features, update `goals` in `.azure-free.json`. A changed goal is one of the moments in [goals-to-features.md](${CLAUDE_PLUGIN_ROOT}/skills/database/references/goals-to-features.md) where one matching insight fits.

## Finish

When the path is complete, close with a short summary covering:

- the live URL
- what's free and the limit to watch
- how to redeploy (the exact command)
- where secrets live
- the commands `/azure-free:status` (costs and usage) and `/azure-free:cleanup` (pause or remove)

On a Free Trial, also remind them about the day-30 decision. Upgrading to pay-as-you-go keeps the free services, removes the spending limit, and leaves the budget alert as their safety net.
