# Azure SQL Database: free offer, passwordless

This is what gets built. No passwords exist anywhere, so there's nothing to leak.

```
your app (App Service F1 / Container Apps / Functions Flex)
  └─ system-assigned managed identity ──► free database
                                            user [<app>] FROM EXTERNAL PROVIDER
                                            member of role app_readwrite (read + write data)
you (az login) ──► Microsoft Entra admin of the server (local dev, migrations, setup)
```

## Defaults (apply them without asking)

| Setting | Default |
|---|---|
| Server sign-in | **Microsoft Entra only.** SQL logins and passwords are switched off. |
| Admin | The signed-in user, or a small Entra group containing them if they use a personal or guest account (step 2) |
| Server name | Generated automatically (step 1) |
| Firewall | The user's current public IP, kept up to date automatically, plus "Allow Azure services" so the hosted app can connect |
| App access | The app's system-assigned managed identity, in the `app_readwrite` role: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and no schema changes |

## Free offer facts (tell the user the ones that matter)

- **Free amount, every month:** 100,000 vCore-seconds of serverless compute, plus 32 GB of data and 32 GB of backup per database.
- **Limits:** up to 10 free databases per subscription. The allowance resets on the 1st of the month.
- **Always use `AutoPause`.** When the month's free compute runs out, the database pauses until the 1st and never bills. `BillOverUsage` can't be undone. The cost guard asks before either mistake.
- **Idle pausing.** The plugin sets the free database to **pause after 15 minutes idle**, the shortest delay allowed. The first connection after a pause takes up to a minute while the database wakes up. Apps should use a 60-second connect timeout and retry once.
- **Awake time is what uses the free amount.** While awake, the database uses compute every second, even when idle. That's roughly 40 hours awake per month on these settings. **Open connections keep it awake.** See "Keep the free amount lasting" in [azure-sql-growth.md](azure-sql-growth.md), and apply it to the app: pools that drop idle connections, and health checks that don't query the database.

## 1. Names (automatic)

- **Server:** `<project>-sql-<5 random lowercase letters or digits>`. Make `<project>` from the folder name: lowercase, with anything other than letters, digits or `-` replaced by `-`, cut to 20 characters. Generate the suffix with the shell:
  - bash: `openssl rand -hex 3 | cut -c1-5`
  - PowerShell: `-join ((48..57)+(97..122) | Get-Random -Count 5 | ForEach-Object {[char]$_})`
- **Database:** `<project>db`.
- **Name already taken:** if the create step fails with "already exists", generate a new suffix and retry once.
- Show the names on the creation card. Don't ask the user to choose them.

## 2. The admin (signed-in user or a group)

Run:

```
az ad signed-in-user show --query "{id:id, upn:userPrincipalName, name:displayName}" -o json
```

Then pick the admin:

- **The UPN contains `#EXT#`.** This is a personal Microsoft account (Gmail, Outlook, and so on) or a guest. Microsoft's docs disagree on whether these accounts can be the SQL admin directly, so use a group. Groups are free.
  ```
  az ad group create --display-name sqladmins-<server> --mail-nickname sqladmins-<server> --query id -o tsv
  az ad group member add --group sqladmins-<server> --member-id <user id>
  ```
  The admin is then: `--external-admin-principal-type Group --external-admin-name sqladmins-<server> --external-admin-sid <group id>`.
- **Otherwise, it's a regular member account.** Make the user the admin: `--external-admin-principal-type User --external-admin-name "<display name>" --external-admin-sid <user id>`.
- **If `signed-in-user show` fails,** for example because the CLI is signed in as a service principal or the directory blocks it, explain what happened. Ask the user to sign in as themselves with `az login`.

Don't write the UPN, the IDs or the group ID into `.azure-free.json`. Record only "admin: signed-in user" or "admin: group sqladmins-<server>".

## 3. Create the server and the free database

Show a creation card first. Then:

```
az sql server create -n <server> -g <rg> -l <region> --enable-ad-only-auth --external-admin-principal-type <User|Group> --external-admin-name "<name>" --external-admin-sid <id> -o table
az sql db create -g <rg> -s <server> -n <db> -e GeneralPurpose -f Gen5 -c 2 --compute-model Serverless --min-capacity 0.5 --auto-pause-delay 15 --use-free-limit --free-limit-exhaustion-behavior AutoPause -o table
```

- `--min-capacity 0.5 --auto-pause-delay 15` keep the database's awake time, and so its use of the free amount, as low as possible.
- No `--admin-user` or `--admin-password` is needed. With Entra-only auth, Azure creates an unused SQL admin with a random password.
- If the database create fails with a free-limit message, all 10 free databases are in use. If it fails over the region, retry in the region where the subscription's first free database lives.

## 4. Firewall (automatic)

Open the user's current IP. Rerunning the same command with the same rule name updates the rule in place.

bash:
```bash
IP="$(curl -s https://api.ipify.org)" && az sql server firewall-rule create -g <rg> -s <server> -n azure-free-client --start-ip-address "$IP" --end-ip-address "$IP" -o none && echo "allowed $IP"
```

PowerShell:
```powershell
$ip = Invoke-RestMethod https://api.ipify.org; az sql server firewall-rule create -g <rg> -s <server> -n azure-free-client --start-ip-address $ip --end-ip-address $ip -o none; "allowed $ip"
```

Then let Azure-hosted apps in:

```
az sql server firewall-rule create -g <rg> -s <server> -n AllowAllWindowsAzureIps --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none
```

Explain in one line: this lets any Azure-hosted service *try* to connect, but the server accepts only the Entra identities you've granted. Private networking would be tighter, but it isn't free, and App Service F1 can't use it.

**The user's IP will change** (a new network, a router restart). When a local connection fails with *"Client with IP address 'x.x.x.x' is not allowed to access the server"*, rerun the first command without asking, then retry the connection. Firewall changes can take up to 5 minutes to apply.

## 5. Smoke test from this machine

You need go-sqlcmd. Check with `sqlcmd --version`. If it's missing, install it:

| OS | Command |
|---|---|
| Windows | `winget install --id Microsoft.Sqlcmd -e` |
| macOS | `brew install sqlcmd` |
| Linux | follow https://learn.microsoft.com/sql/tools/sqlcmd/sqlcmd-download-install, or `brew install sqlcmd` |

On Windows, an old ODBC-based `sqlcmd` may be first on the PATH. Check `sqlcmd --version`: go-sqlcmd prints `v1.x`.

Run the test:

```
sqlcmd -S tcp:<server>.database.windows.net,1433 -d <db> --authentication-method ActiveDirectoryAzCli -l 60 -b -Q "SELECT SUSER_SNAME() AS signed_in_as"
```

- Use `--authentication-method ActiveDirectoryAzCli`. **Don't add `-G`**: go-sqlcmd rejects the two together.
- If it fails, look at the error:

| Error | Fix |
|---|---|
| "not allowed to access the server" | Rerun step 4. |
| Login failed for a token-identified principal, with the user as admin | Switch to the group admin: create the group as in step 2, then run `az sql server ad-admin create -g <rg> -s <server> --display-name sqladmins-<server> --object-id <group id>`, and retry. |
| Login failed, other cases | `az account show` must be in the same tenant as the server. |
| 40613, "database not currently available" | It's waking up. Wait 30 seconds and retry, up to 3 times. |

## 6. Give the app its identity

The app has to exist first. If it doesn't yet, record the database and come back to this step after `azure-free:web` has deployed it.

| Host | Command (prints the identity's principal ID) |
|---|---|
| App Service | `az webapp identity assign -g <rg> -n <app> --query principalId -o tsv` |
| Container Apps | `az containerapp identity assign -g <rg> -n <app> --system-assigned --query principalId -o tsv` |
| Functions (Flex) | `az functionapp identity assign -g <rg> -n <app> --query principalId -o tsv` |
| Static Web Apps `api/` | **Not possible.** Managed Functions on Static Web Apps can't use managed identity, and linking your own API needs the paid Standard plan. Host the API on App Service, Container Apps or Functions Flex, and call it from the static site. |

Don't pass `--role` or `--scope`; those create Azure role assignments the database doesn't need. The principal ID isn't secret.

## 7. Create the database user and role (as you, the admin)

1. Write `grant-<app>.sql` to the OS temp folder or your scratchpad, filling in `<app>` (the app's resource name) and `<principal id>`:

   ```sql
   IF DATABASE_PRINCIPAL_ID(N'app_readwrite') IS NULL
       CREATE ROLE app_readwrite;
   GRANT SELECT, INSERT, UPDATE, DELETE TO app_readwrite;

   IF DATABASE_PRINCIPAL_ID(N'<app>') IS NULL
       CREATE USER [<app>] FROM EXTERNAL PROVIDER WITH OBJECT_ID = '<principal id>';
   ALTER ROLE app_readwrite ADD MEMBER [<app>];

   SELECT m.name AS member_name, r.name AS role_name
   FROM sys.database_role_members rm
   JOIN sys.database_principals r ON r.principal_id = rm.role_principal_id
   JOIN sys.database_principals m ON m.principal_id = rm.member_principal_id
   WHERE r.name = N'app_readwrite';
   ```

2. Run it:
   ```
   sqlcmd -S tcp:<server>.database.windows.net,1433 -d <db> --authentication-method ActiveDirectoryAzCli -l 60 -b -i <path-to>/grant-<app>.sql
   ```
3. The script is safe to rerun, for example after adding a second app. Delete the file afterwards.

**Why this role:** `app_readwrite` holds database-wide read and write on data only. Microsoft advises against nesting custom roles inside `db_datareader`/`db_datawriter`, so the role is granted directly instead. If the app also calls stored procedures, add `GRANT EXECUTE TO app_readwrite;`.

**If the app runs migrations itself on startup** (EF `Migrate()`, `prisma migrate deploy` in the start script), it also needs DDL rights. Prefer running migrations from this machine. If the user wants the app to do it, ask, then run `ALTER ROLE db_ddladmin ADD MEMBER [<app>];`.

**If `CREATE USER` fails:**

| Error | Fix |
|---|---|
| Msg 37545, or "principal could not be found" | The identity is brand new. Wait a minute and rerun. |
| Msg 33130 or 33134 | Fall back to a SID-based user. It's built from the identity's *client* ID, from `az ad sp show --id <principal id> --query appId -o tsv`. Replace the `CREATE USER` line with:<br>`DECLARE @sql nvarchar(400) = N'CREATE USER [<app>] WITH SID = ' + CONVERT(nvarchar(100), CAST(CAST('<client id>' AS uniqueidentifier) AS varbinary(16)), 1) + N', TYPE = E';`<br>`EXEC (@sql);` |
| A guest account can't look up the identity | The user needs directory read access, or should use the group admin from step 2 with a member account. |

## 8. Connection settings (nothing secret)

The same values work locally and in Azure. In Azure, `DefaultAzureCredential` picks up the app's managed identity. On this machine, it picks up the user's `az login`, and the user is the admin.

| Stack | Setting | Notes |
|---|---|---|
| .NET (Microsoft.Data.SqlClient) | `ConnectionStrings__Default=Server=tcp:<server>.database.windows.net,1433;Database=<db>;Authentication=Active Directory Default;Encrypt=True;Connection Timeout=60;` | Needs SqlClient 3+. **SqlClient 7.x also needs the `Microsoft.Data.SqlClient.Extensions.Azure` package** at a matching version. |
| Node (`mssql` / `tedious`) | `AZURE_SQL_SERVER=<server>.database.windows.net` and `AZURE_SQL_DATABASE=<db>`, then in code: `{ server: process.env.AZURE_SQL_SERVER, database: process.env.AZURE_SQL_DATABASE, authentication: { type: 'azure-active-directory-default' }, options: { encrypt: true, connectTimeout: 60000 } }` | Use the config object. `mssql` **ignores** `Authentication=Active Directory Default` in a connection string and silently tries SQL auth. Use mssql 9+. |
| Prisma 7 (`@prisma/adapter-mssql`) | `DATABASE_URL=sqlserver://<server>.database.windows.net:1433;database=<db>;encrypt=true;authentication=DefaultAzureCredential` | Not `ActiveDirectoryMSI`, which needs legacy settings. |
| Python, `mssql-python` | `Server=tcp:<server>.database.windows.net,1433;Database=<db>;Authentication=ActiveDirectoryDefault;Encrypt=yes;` | Plus `pip install azure-identity` |
| Python, `pyodbc` | No connection-string option works in both places. Use `azure-identity`'s `DefaultAzureCredential().get_token("https://database.windows.net/.default")` and pass the token with `attrs_before={1256: ...}`. | Leave out UID, PWD and Authentication from the connection string. |
| Django (`mssql-django` 2+) | `OPTIONS={"python_driver": "mssql_python", "extra_params": "Authentication=ActiveDirectoryDefault"}` | |
| Java (JDBC 12.2+) | `jdbc:sqlserver://<server>.database.windows.net:1433;database=<db>;encrypt=true;authentication=ActiveDirectoryDefault;loginTimeout=60` | Plus the `azure-identity` dependency |
| Go | `azuread.DriverName` with `sqlserver://<server>.database.windows.net?database=<db>&fedauth=ActiveDirectoryDefault` | |

Put the settings in the local `.env` and in the host's settings:

| Host | Command |
|---|---|
| App Service | `az webapp config appsettings set -g <rg> -n <app> --settings AZURE_SQL_SERVER=<server>.database.windows.net AZURE_SQL_DATABASE=<db> -o none` |
| Container Apps | `az containerapp update -g <rg> -n <app> --set-env-vars AZURE_SQL_SERVER=<server>.database.windows.net AZURE_SQL_DATABASE=<db> -o none` |
| Functions | `az functionapp config appsettings set -g <rg> -n <app> --settings AZURE_SQL_SERVER=... AZURE_SQL_DATABASE=... -o none` |

For a full connection string such as the .NET one, quote the whole `KEY=value` pair, because it contains `;` and spaces.

After creating the database user, **restart the app** so it opens fresh connections:
- App Service: `az webapp restart -g <rg> -n <app>`
- Container Apps: find the active revision with `az containerapp revision list -g <rg> -n <app> --query "[?properties.active].name" -o tsv`, then `az containerapp revision restart -g <rg> -n <app> --revision <name>`. Or simply redeploy.

## 9. Use it from this machine

| Task | How |
|---|---|
| Query | `sqlcmd -S tcp:<server>.database.windows.net,1433 -d <db> --authentication-method ActiveDirectoryAzCli -l 60 -Q "SELECT TOP 5 name FROM sys.tables"` |
| Run a script | Use `-i file.sql` instead of `-Q`. |
| Migrations | Run them here, with the same `.env` settings. As admin, the user can change the schema; the app can't. |
| Portal | The **Query editor** (database → Query editor) also signs in with Entra. |

## 10. Free usage left this month

Check the database's free-offer status:

```
az sql db show -g <rg> -s <server> -n <db> --query "{status:status, freeLimit:useFreeLimit, whenExhausted:freeLimitExhaustionBehavior}" -o table
```

Check how much free compute is left:

```
az monitor metrics list --resource "$(az sql db show -g <rg> -s <server> -n <db> --query id -o tsv)" --metric free_amount_remaining free_amount_consumed --interval PT1H --aggregation Minimum -o table
```

In PowerShell, get the ID first and then pass it in: `$id = az sql db show ... --query id -o tsv; az monitor metrics list --resource $id ...`.

`free_amount_remaining` is in vCore-seconds, out of 100,000. A `status` of `Paused` near the end of the month means the free compute ran out. The database comes back on the 1st.

## What to record in `.azure-free.json`

```json
{ "role": "database", "service": "azure-sql-free", "name": "<db>", "server": "<server>",
  "tier": "Free offer, AutoPause", "auth": "Entra only; admin: signed-in user",
  "appAccess": ["<app> (system-assigned identity) in app_readwrite"],
  "firewall": "your IP (rule azure-free-client, auto-updated) + Azure services",
  "secrets": "none (passwordless)" }
```
