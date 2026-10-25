# PostgreSQL / MySQL flexible server (Burstable B1ms)

**Free amount, each month:** 750 hours of B1ms compute, 32 GB storage and 32 GB backup. That's enough for one server running all month.

**Who gets it:** only subscriptions with the free account's 12-month services. After 12 months, or on any other subscription, it bills about USD 15 or more a month, plus storage. Make sure the user agreed to this in the database skill's step 1 before you create anything.

**The PostgreSQL CLI defaults are paid:** General Purpose tier and 128 GB of storage. Always pass all of the flags below. The cost guard asks if any are missing.

**Leave out high-availability flags.** HA is off by default. The PostgreSQL flag name changed in CLI 2.87 (`--high-availability` → `--zonal-resiliency`), so naming either one can break on one CLI version or the other.

## 1. Names

- **Server:** `<project>-pg-<4 random>` or `<project>-mysql-<4 random>`. It must be globally unique and lowercase.
- **Admin user:** `<project>admin`.
- **Database:** `<project>db`.

## 2. Generate the admin password into `.env`

Use the same one-command recipe as [azure-sql.md](azure-sql.md) step 2. Its passwords are letters and digits plus `-Aa1`, which is safe to put in a URL.

## 3. Create the server

These commands print a connection string that includes the password, so `-o none` is required on the create command.

### PostgreSQL

bash:
```bash
PW="$(grep '^DB_ADMIN_PASSWORD=' .env | cut -d= -f2-)" && \
az postgres flexible-server create -g <rg> -n <server> -l <region> \
  --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 17 \
  --admin-user <admin> --admin-password "$PW" --public-access None --yes -o none && \
az postgres flexible-server db create -g <rg> -s <server> -d <db> -o none
```

PowerShell:
```powershell
$pw = (Select-String -Path .env -Pattern '^DB_ADMIN_PASSWORD=(.*)$').Matches[0].Groups[1].Value; az postgres flexible-server create -g <rg> -n <server> -l <region> --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 17 --admin-user <admin> --admin-password $pw --public-access None --yes -o none; az postgres flexible-server db create -g <rg> -s <server> -d <db> -o none
```

If version 17 isn't offered in the region, list the available versions with `az postgres flexible-server list-skus -l <region> -o table`, or simply drop `--version`.

### MySQL

Use the same pattern with:

```
az mysql flexible-server create -g <rg> -n <server> -l <region> \
  --tier Burstable --sku-name Standard_B1ms --storage-size 32 \
  --auto-scale-iops Disabled --storage-auto-grow Disabled \
  --admin-user <admin> --admin-password "$PW" --public-access None --yes -o none
az mysql flexible-server db create -g <rg> -s <server> -d <db> -o none
```

Creating a server takes 5 to 10 minutes. Run it with a long timeout, or in the background.

## 4. Firewall

Add the same two rules for either engine, using `postgres` or `mysql` in place of `<engine>`:

```
az <engine> flexible-server firewall-rule create -g <rg> -n <server> -r my-ip --start-ip-address <ip> --end-ip-address <ip> -o none
az <engine> flexible-server firewall-rule create -g <rg> -n <server> -r AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none
```

## 5. Connection strings for `.env`

Build these from the values already in `.env` inside a single command, so the password is never printed.

| Engine | `DATABASE_URL` |
|---|---|
| PostgreSQL | `postgresql://<admin>:<pw>@<server>.postgres.database.azure.com:5432/<db>?sslmode=require` |
| MySQL | `mysql://<admin>:<pw>@<server>.mysql.database.azure.com:3306/<db>?ssl-mode=REQUIRED` |

Both engines require TLS. Most drivers accept the flags shown above. For Node `mysql2`, pass `ssl: {}`.

## 6. Query it

Pass the password through the client's environment variable.

PostgreSQL:
```bash
PGPASSWORD="$(grep '^DB_ADMIN_PASSWORD=' .env | cut -d= -f2-)" psql "host=<server>.postgres.database.azure.com dbname=<db> user=<admin> sslmode=require"
```

MySQL:
```bash
MYSQL_PWD="$(grep '^DB_ADMIN_PASSWORD=' .env | cut -d= -f2-)" mysql -h <server>.mysql.database.azure.com -u <admin> --ssl-mode=REQUIRED <db>
```

## 7. Saving free hours and staying free

| Task | Command or check |
|---|---|
| Stop the server when nobody's using it | `az <engine> flexible-server stop -g <rg> -n <server>`. Azure starts it again automatically after 7 days (PostgreSQL) or 30 days (MySQL). |
| Start it again | `az <engine> flexible-server start -g <rg> -n <server>` |
| Check the server is still on the free settings | `az <engine> flexible-server show -g <rg> -n <server> --query "{state:state, tier:sku.tier, sku:sku.name, storageGB:storage.storageSizeGb}" -o table` |
| Check free hours used | Portal: Subscriptions → the subscription → "View all free services". The CLI can't show this. |

Put a reminder in `.azure-free.json` `notes`: "PostgreSQL free until ~<signup date + 12 months>; migrate to Azure SQL free or delete before then."
