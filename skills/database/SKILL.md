---
name: database
description: Creates a free Azure database and connects an app to it. Azure SQL Database free offer is the default for every app that stores data, and it's fully passwordless. Cosmos DB free tier, Azure DocumentDB (MongoDB) free tier, and PostgreSQL/MySQL flexible server (free for 12 months on new free accounts) are used when the user asks for them, chooses to keep the engine their app already uses (the skill asks before switching an existing PostgreSQL, MySQL or MongoDB app), or the app can't run on SQL Server without a rewrite. For Azure SQL it uses Entra-only sign-in, the app's managed identity as a database user in a read/write role, an auto-named server, and an automatic firewall rule for the user's IP. Use when the user needs a database for their Azure app, asks which free Azure database to use, wants to connect to, query or migrate their Azure database, or asks why it paused, is slow to wake, or refuses their connection.
argument-hint: "[sql | cosmos | mongodb | postgres | mysql]"
---

# Add a free database and connect the app

Follow the guiding rules in the `azure-free:start` skill: plain language, one step at a time, a creation card before every create, and no secrets in chat. Limits are in [free-offers.md](${CLAUDE_PLUGIN_ROOT}/reference/free-offers.md) §4.

## 0. Prerequisites

Read `.azure-free.json`. You need a signed-in CLI, a resource group and a region. If any of these is missing, run `azure-free:setup` first.

Also note whether the web app exists yet. With Azure SQL, the app's managed identity is what gets database access, so that step waits until the app is deployed. Order:
- **If the app already exists,** do everything in one pass.
- **If not,** create and test the database now, then finish the "connect the app" steps right after `azure-free:web` deploys the app.

## 1. Choose the database

**Default: Azure SQL Database free offer.** When you recommend it, give the reason in one line, using specific claims: it's always free and passwordless, has row-level security, encryption, JSON and vector search built in, and the same database scales up in place when the app outgrows the free tier, with no data migration.

Then name the alternatives in one line, for example: "Other free options: Cosmos DB (always free, one per subscription) or PostgreSQL/MySQL (free for 12 months on new free accounts). Say if you'd prefer one."

Use Azure SQL for every app that stores data unless one of these applies:
- The user named another engine, either in the skill argument or in their request.
- The user chose to keep the engine their app already uses (see below).
- The app is tied to another engine and adapting it would mean a rewrite. Examples: WordPress, Mongo-native code, or Postgres-only features. See the database section of the [start skill](${CLAUDE_PLUGIN_ROOT}/skills/start/SKILL.md) for how to handle that case.

How much to change depends on what the code uses today:
- **SQLite, an in-memory store, or JSON files:** switch it to SQL Server as part of this step.
- **PostgreSQL, MySQL or MongoDB, directly or through an ORM:** **ask before switching.** Explain what would change in the code and the cost trade-off (Azure SQL is always free; PostgreSQL/MySQL are free for 12 months on new free accounts only, then about USD 15 or more a month). If the user wants to keep their engine, use it.

The start skill lists the ORM changes. After any switch, run the app locally against the new database before deploying.

| Choice | Free for | App signs in with | Reference |
|---|---|---|---|
| **Azure SQL Database free offer (default)** | Always (10 databases per subscription) | **Managed identity, so no passwords** | [azure-sql.md](references/azure-sql.md) |
| Cosmos DB free tier (only if asked) | Always (one account per subscription) | Account key in `.env` | [cosmos-db.md](references/cosmos-db.md) |
| Azure DocumentDB free tier (only if asked, or for Mongo-native code) | Always (one cluster per subscription) | Password in `.env` | [cosmos-db.md](references/cosmos-db.md#azure-documentdb-mongodb-free-tier) |
| PostgreSQL flexible server B1ms | **12 months**, new free accounts only | Password in `.env` | [postgres-mysql.md](references/postgres-mysql.md) |
| MySQL flexible server B1ms | **12 months**, new free accounts only | Password in `.env` | [postgres-mysql.md](references/postgres-mysql.md) |

Azure SQL needs a host that supports managed identity: App Service, Container Apps or Functions. If the API lives in a Static Web Apps `api/` folder, explain that Free-plan managed functions can't use managed identity. Offer to move the API to App Service F1 or Container Apps, and keep the static front end on Static Web Apps.

For PostgreSQL or MySQL, check the offer type before you continue:
- **`FreeTrial_*`, or an upgraded free account in its first year:** say plainly that it starts billing about USD 15 or more a month after the 12 months. Suggest Azure SQL if their code isn't tied to Postgres or MySQL.
- **Any other offer:** assume it's paid from day one. The user can confirm by checking the portal: Subscriptions → their subscription → "View all free services". Don't create it until they've agreed to the price.

## 2. Check free slots are available

The single free slot for Cosmos DB or DocumentDB, and the 10 SQL slots, may already be in use.

- **Cosmos DB:** `az cosmosdb list --query "[?enableFreeTier].{name:name, rg:resourceGroup}" -o table`. If an account is listed, the free tier is taken. Offer to add a database to that account instead.
- **SQL:** run `az sql server list --query "[].{name:name, rg:resourceGroup}" -o table`. For each server, run `az sql db list -s <server> -g <rg> --query "[?useFreeLimit].name" -o tsv` and count the results. Ten or more means no free slots are left.

## 3. Create it

Follow the reference for the chosen engine.

**Azure SQL (passwordless).** Apply the defaults in azure-sql.md without asking the user to choose them:
- The server name is generated.
- The admin is the signed-in user, or an Entra group for personal or guest accounts.
- Sign-in is Entra-only.
- The firewall allows the user's current IP and Azure services.

Show one creation card that covers all of it. Then create, open the firewall, and run the smoke test (azure-sql.md steps 1–5).

**Every other engine uses a password or key.** For those:
- **Generate it** straight into `.env`. Never ask the user for one, and never show it.
- **Check `.gitignore` lists `.env`** before writing any secret.
- **Add `-o none`** to any create or settings command that would print a password, key or connection string. Use a `show` command afterwards for the non-secret details.
- **Open the firewall** for the user's IP and for Azure services, as each reference shows.

## 4. Connect the hosted app

**Azure SQL:** follow azure-sql.md steps 6–8:
1. Give the app a system-assigned identity.
2. Create its database user `FROM EXTERNAL PROVIDER` in the `app_readwrite` role.
3. Set the non-secret connection settings.
4. Restart the app.

If the app's stack has a known gotcha in the connection table, such as Node `mssql` ignoring the connection-string option or SqlClient 7 needing the extensions package, fix the app's code or packages too.

Also check the code for things that would keep the database awake and use up the free amount:
- a connection pool with a non-zero minimum
- a long idle timeout
- a health check that queries the database
- a background timer that polls it

Fix them, following "Keep the free amount lasting" in [azure-sql-growth.md](references/azure-sql-growth.md).

**Other engines:** put the connection string into the web host's settings, reading it from `.env` inside the command. Use the "Settings" section of the matching web reference:

| Host | Reference |
|---|---|
| App Service | [app-service.md](../web/references/app-service.md) |
| Container Apps | [container-apps.md](../web/references/container-apps.md) |
| Functions | [functions.md](../web/references/functions.md) |
| Static Web Apps API | [static-web-apps.md](../web/references/static-web-apps.md) |

Then check that a page or endpoint that uses the database works.

## 5. Schema and data

**Before writing or changing the schema (Azure SQL),** check what the data needs to do:
1. Read `goals` from `.azure-free.json`. If round 1 was never asked, ask it now.
2. Ask up to three round 2 questions from [goals-to-features.md](references/goals-to-features.md), choosing the ones their goals make relevant.
3. Record the answers.
4. For each goal, offer the "smallest step now" from that file's table, such as an owner column, a `tenant_id`, money tables created as ledger tables, or system versioning on key tables. These are cheapest before real data arrives. Apply each only with the user's OK, and skip any feature listed in `declined`.

Skip this check if the user has asked to just get it running.

Run the project's own migrations from this machine. As the Azure SQL admin, the user can change the schema; the app's identity deliberately can't. For other engines, load the variables from `.env` inside the same command.

| Framework | Command |
|---|---|
| Prisma | `npx prisma migrate deploy` |
| Django | `python manage.py migrate` |
| EF Core | `dotnet ef database update` |
| Rails | `bin/rails db:migrate` |
| Laravel | `php artisan migrate` |

With no ORM, write a small `.sql` schema file and run it with the engine's CLI (`sqlcmd -i` for Azure SQL).

If a local connection is refused because of the client IP, update the firewall rule automatically (azure-sql.md step 4) and retry.

## 6. Record it

Add the database entry, and the server entry if there is one, to `.azure-free.json`. See [state-file.md](${CLAUDE_PLUGIN_ROOT}/reference/state-file.md).

- **For Azure SQL, record:** the auth mode, which apps have access and in which role, and the firewall rule names. Not IP addresses, user names or object IDs.
- **For every engine:** never record passwords, keys or connection strings.

## 7. Hand back

Tell the user, in three lines or fewer:
1. What they have, for example: "Free Azure SQL database `blogdb`; your app signs in with its own identity, no passwords anywhere."
2. The free limit to watch.
3. The one behavior that will surprise them, such as the database pausing when idle or PostgreSQL's 12-month clock.

### For Azure SQL: connect their goals to what the database can do

Follow [goals-to-features.md](references/goals-to-features.md):
1. Pick **at most two** insights that trace back to the user's `goals` and are not in `declined`.
2. Share each in the five-beat shape: their goal, the insight, one consequence, the principle, then the Azure SQL feature and the smallest step now.
3. After each one, ask **Do it now · Later · Not needed**.
4. Record "Later" and "Not needed" in `declined`.
5. For "Do it now", use the recipe or facts in [azure-sql-growth.md](references/azure-sql-growth.md). Anything with a cost gets a creation card.

If their goals point to nothing (for example, a personal tool), skip this. One line is enough: the same database can scale up in place, with no migration, if they ever need more.

Suggest `azure-free:status` for a final check.
