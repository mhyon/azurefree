# Azure SQL beyond the prototype

**Checked 2026-10-19 against Microsoft Learn.** Feature status changes; re-check anything here before quoting it as current. Use the Microsoft Learn MCP tools if they're available.

## How to use this file

This is the fact sheet: what each feature does, whether it works on the free database, what it costs, and how to set it up.

**Never read the user the whole thing.** Choose what to bring up, and when, using [goals-to-features.md](goals-to-features.md). It ties every suggestion to the user's own goals, and it skips anything they've declined.

**Anything with an extra cost** gets a creation card and an explicit yes, as always. The cost guard pauses paid scale-ups.

## The big idea

- **It's the SQL Server engine.** Azure SQL Database runs the same engine as SQL Server, so SQL Server drivers, tools, ORMs and know-how carry over. Microsoft handles patching, backups and high availability.
- **The free database is the one you grow.** It can move from free, to paying only for usage past the free amount, to bigger serverless sizes, to provisioned compute, to Hyperscale (up to 128 TB).
  - Every move happens **in place and online**, with a brief reconnect (usually under 30 seconds) and **no data migration**.
  - Leaving the free offer is one-way.
- **Engine features cost nothing extra.** Almost everything below works on the free database today. Costs come only from add-on services around a feature: log storage, Microsoft Defender, private networking and extra replicas.

## Protect data

| Feature | What it does for you later | On the free database | Extra cost |
|---|---|---|---|
| **Row-level security** | The database itself makes sure each user or customer only sees and changes their own rows, even if app code has a bug. See the recipe below. | ✅ | None |
| **Dynamic data masking** | Shows `j***@contoso.com` instead of the real value to support staff and reporting users. Regex-based masks are in preview. | ✅ Viewing or changing mask rules wakes a paused database. | None |
| **Always Encrypted** | Sensitive columns stay encrypted even from database admins. Only the app holding the key sees plaintext. | ✅ VBS secure enclaves aren't confirmed on the free offer specifically. | Key Vault, if keys are stored there |
| **Transparent data encryption** | Data, logs and backups are encrypted at rest. | ✅ **On by default**, with a service-managed key | None. Customer-managed keys need a paid Key Vault. |
| **Ledger tables** | Tamper-evident history: you can prove rows weren't changed behind your back. | ✅ A whole *ledger database* can only be chosen at creation. Ledger *tables* can be added any time. | Automatic digest storage (immutable Blob storage or Azure Confidential Ledger) is billed. |
| **Auditing** | A record of who did what, and when. Needed for many compliance rules. | ✅ Viewing audit records wakes a paused database. | Logs go to Storage, Log Analytics (first 5 GB a month free, then about USD 2.30/GB) or Event Hubs, each billed. |
| **Microsoft Defender for SQL** | Alerts on SQL injection and suspicious access, plus vulnerability assessment. | ✅ Its scans wake a paused database. | About **USD 15 per server per month**, after a 30-day trial |
| **Microsoft Entra sign-in and managed identity** | No passwords to leak or rotate. | ✅ **Already set up by this plugin** | None |
| **Private endpoint** | Takes the database off the public internet. | Not confirmed for the free offer | About USD 7.30 a month plus data processed |

## Richer data

| Feature | What it does for you later | On the free database | Status |
|---|---|---|---|
| **Native `json` type** and JSON functions | Store and query flexible documents next to relational data, with no second database. | ✅ | GA (May 2025) |
| **`VECTOR` type, `VECTOR_DISTANCE`, DiskANN vector index, `VECTOR_SEARCH`** | Semantic search and retrieval-augmented generation (RAG) right beside your data. Embeddings come from a model service, which is billed separately. | ✅ An index needs at least 100 vectors. The smallest free sizes may be tight on memory for big indexes. | Type GA June 2025; index and `VECTOR_SEARCH` GA September 2026 |
| **Regular expressions** (`REGEXP_LIKE` and others) | Validation and pattern search in SQL. | ✅ | GA (November 2025) |
| **Full-text search** | Word and phrase search without a separate search service. | ✅ | GA |
| **Temporal tables** | Automatic row history: "show me this order as it was on Monday", undo bad writes, audit trail. | ✅ History rows count toward the 32 GB limit, so set `HISTORY_RETENTION_PERIOD`. | GA |
| **Graph tables** | Friends-of-friends and other relationship queries with `MATCH`. | ✅ | GA |
| **Columnstore indexes** | Fast totals and analytics over large tables. | ✅ Very small sizes may be short on memory. | GA |

## Keep it running

| Feature | What it does for you later | On the free database |
|---|---|---|
| **Query Store and automatic tuning** | Records query performance, and automatically reverts to a previous plan if a new one gets slower (`FORCE_LAST_GOOD_PLAN` is on by default). Index tuning can be turned on. | ✅ Always on |
| **Automatic backups and point-in-time restore** | Restore to any moment, for example to undo a bad deploy. | ✅ 7 days with AutoPause, on locally redundant storage. After upgrading, up to 35 days, plus long-term retention for up to 10 years. |
| **Built-in high availability** | Three copies of your data; node failures are handled for you. | ✅ But the free offer has **no SLA** |
| **Zone redundancy** | Survives a whole datacenter (zone) outage. | After upgrading. Costs extra. |
| **Geo-replication and failover groups** | A copy in another region for disaster recovery. | Failover groups: ❌ on free. The secondary database is billed, and these features stop auto-pause. |

## Connect it to more

| Feature | What it does for you later | Notes |
|---|---|---|
| **Data API builder** | Instant REST, GraphQL or MCP API over your tables, with no API code to write. | Free and open source; you host it on App Service or Container Apps. It can pass signed-in users' claims into `SESSION_CONTEXT`, so row-level security just works. (Static Web Apps "database connections" were retired on November 30, 2025, and Data API builder replaces them.) |
| **Change tracking** | "What changed since X?" Useful for syncing mobile or offline clients. | ✅ No cost |
| **Change data capture** | Feeds row changes into ETL and analytics pipelines. | ✅ Can't be combined with Fabric mirroring or change event streaming. |
| **Change event streaming** | Pushes row changes to Event Hubs or Fabric as events. | **Preview.** Event Hubs is billed. Doesn't apply row-level security or masking. |
| **Microsoft Fabric mirroring** | Near-real-time copy into Fabric for Power BI and analytics, with no ETL. | Needs a Fabric capacity (paid, or a trial). Free-offer support isn't confirmed. Row-level security and masking aren't carried over. |

## Keep the free amount lasting

**How the free amount gets used:**
- While the database is **online** it uses at least its minimum compute every second, even when idle: 0.5 vCore, or more because of the memory floor.
- While it's **paused**, it costs nothing.
- For the smallest settings, the free 100,000 vCore-seconds come to **roughly 40 hours awake per month**. That's an estimate from Microsoft's billing formula; the **"Free amount remaining"** metric is the real number.

**Auto-pause only happens** when there are zero sessions and zero CPU for the whole delay.
- Open connections keep the database awake. App connection pools, SSMS or VS Code query tabs, and health checks that query the database all count.
- Some portal views wake a paused database too: audit records, masking rules, TDE status, Query Store settings. So do Defender scans.

**What the plugin does:**
- **Creates the database with `--min-capacity 0.5 --auto-pause-delay 15`.** 15 minutes is the shortest delay allowed. For an existing database: `az sql db update -g <rg> -s <server> -n <db> --auto-pause-delay 15 --min-capacity 0.5`.
- **Lets the app's pool drop idle connections:**
  - Node `mssql`: `pool: { min: 0, idleTimeoutMillis: 30000 }`. These are the defaults; don't raise `min`.
  - .NET SqlClient: closes idle pooled connections after a few minutes on its own.
- **Keeps health checks such as `/healthz` from touching the database.**
- **Tells the user to close query tools** when they're done.

## Growth path (when the free amount isn't enough)

**Signs it's time:**
- The database pauses before the end of the month.
- `free_amount_remaining` reaches 0.
- The app needs more than 32 GB.
- The user needs an SLA or longer backups.

| Step | Command | What changes |
|---|---|---|
| 1. Tune first (still free) | See "Keep the free amount lasting" | Often enough on its own |
| 2. Pay only for the extra | `az sql db update -g <rg> -s <server> -n <db> --free-limit-exhaustion-behavior BillOverUsage` | **One-way.** The free amount still applies every month; usage past it is billed at General Purpose serverless rates (about USD 0.52 per vCore-hour, East US list price, October 2026). Allows bigger sizes and geo-redundant backups. Make sure the budget alert exists. |
| 3. More power | `az sql db update -g <rg> -s <server> -n <db> --capacity 8 --min-capacity 1` (after step 2) | More vCores and memory. Serverless goes up to 40 or 80 vCores, depending on region. |
| 4. Busy around the clock | Provisioned compute is often cheaper than serverless for always-on load. Leave the free offer first: turn off the portal's "Free database offer" toggle, or run `az sql db update ... --use-free-limit false`. The exact result of the CLI route isn't documented, so check the database in the portal afterwards. | A normal billed database |
| 5. Very large data or high scale | Leave the free offer, then run `az sql db update -g <rg> -s <server> -n <db> --edition Hyperscale --service-objective HS_Gen5_2` | Up to 128 TB. You can move back to General Purpose only within 45 days. |

- Every step happens online, with a brief reconnect and no data migration.
- The cost guard asks before steps 2–5, because each one costs money.
- Price everything with the user using https://azure.microsoft.com/pricing/calculator/ before they commit.

## Row-level security recipe (one app identity, many users)

**The pattern:**
1. The app signs users in.
2. The app connects as its single managed identity.
3. For every request, the app tells the database which user it's acting for through `SESSION_CONTEXT`.
4. The database filters the rows.

**What a forgotten step does:** if the app doesn't set the value, the predicate sees NULL and nothing is visible or writable. That's the safe default.

### 1. The policy

Put the T-SQL in a `.sql` file and run it with `sqlcmd -i`. `GO` separators work there. Use your table and owner column, for example `user_id nvarchar(128)`.

```sql
CREATE SCHEMA rls;
GO
CREATE FUNCTION rls.fn_owner(@user_id nvarchar(128))
RETURNS TABLE WITH SCHEMABINDING AS
RETURN SELECT 1 AS ok
 WHERE (DATABASE_PRINCIPAL_ID() = DATABASE_PRINCIPAL_ID(N'<app>')
        AND @user_id = CAST(SESSION_CONTEXT(N'user_id') AS nvarchar(128)))
    OR IS_MEMBER(N'db_owner') = 1;          -- you, the admin, still see everything
GO
CREATE SECURITY POLICY rls.owner_policy
  ADD FILTER PREDICATE rls.fn_owner(user_id) ON dbo.<table>,
  ADD BLOCK  PREDICATE rls.fn_owner(user_id) ON dbo.<table>
WITH (STATE = ON);
GO
-- New rows get the current user automatically:
ALTER TABLE dbo.<table> ADD CONSTRAINT df_<table>_user_id
  DEFAULT CAST(SESSION_CONTEXT(N'user_id') AS nvarchar(128)) FOR user_id;
```

How this policy behaves:
- **One BLOCK predicate covers every write.** An unqualified `BLOCK` predicate covers inserts, updates and deletes.
- **The app can't switch it off.** Its `app_readwrite` role can't alter the policy or the `rls` schema.
- **Index the owner column** (`user_id`).
- **Temporal history tables** need their own predicate.

### 2. In the app: set the user on every request

**Node (`mssql`).** Set the value in the *same batch* as the query, because pooled connections are shared between requests:

```js
await pool.request()
  .input("uid", sql.NVarChar(128), currentUser.id)
  .query(`EXEC sys.sp_set_session_context @key = N'user_id', @value = @uid;
          SELECT id, title FROM dbo.notes ORDER BY id DESC;`);
```

**.NET (EF Core):**
1. Set it in a `DbConnectionInterceptor.ConnectionOpened` override: `EXEC sys.sp_set_session_context @key = N'user_id', @value = @uid, @read_only = 1;`.
2. If `user_id` relies on the default constraint, leave it out of the EF model. Otherwise EF sends its own value.

**Data API builder:** turn on `set-session-context`, and the signed-in user's claims arrive in `SESSION_CONTEXT` automatically.

### 3. Prove it

1. Sign in as two different users.
2. Each should see only their own rows.
3. You, as the admin running `sqlcmd`, see all rows.
