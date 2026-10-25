# Cosmos DB free tier (NoSQL API)

**Free amount:** 1000 RU/s and 25 GB per account, for the account's whole life.

**Limits:**
- Only **one free-tier account per subscription.**
- Free tier can **only be chosen when the account is created.**
- Serverless accounts can't use free tier.

**Throughput is shared.** The 1000 RU/s covers the whole account. The simplest way to stay inside it is one database with **shared** throughput of 1000, holding up to 25 containers. Containers with their own dedicated throughput add to the total and get billed.

## 1. Names

The account name must be globally unique and lowercase: `<project>-cosmos-<4 random>`.

## 2. Create the account, database and container

```
az cosmosdb create -n <account> -g <rg> --enable-free-tier true --default-consistency-level Session --locations regionName=<region> failoverPriority=0 isZoneRedundant=False -o none
az cosmosdb sql database create -a <account> -g <rg> -n <db> --throughput 1000 -o table
az cosmosdb sql container create -a <account> -g <rg> -d <db> -n <container> --partition-key-path "/id" -o table
```

- **Creation takes a few minutes.**
- **Partition key:** choose one that spreads data evenly across values the app filters on often, such as `/userId` or `/category`. Use `/id` when unsure.
- **If create fails** with a message that free tier is already used, find the existing free account (see the database skill, step 2) and offer to add a database to it instead.

## 3. Secrets into `.env` (never printed)

The keys give full access to the account, so they go straight into `.env`:

bash:
```bash
{ printf 'COSMOS_ENDPOINT=%s\n' "$(az cosmosdb show -n <account> -g <rg> --query documentEndpoint -o tsv)"; printf 'COSMOS_KEY=%s\n' "$(az cosmosdb keys list -n <account> -g <rg> --query primaryMasterKey -o tsv)"; printf 'COSMOS_DATABASE=%s\n' "<db>"; } >> .env && echo "saved to .env"
```

PowerShell:
```powershell
$ep = az cosmosdb show -n <account> -g <rg> --query documentEndpoint -o tsv; $key = az cosmosdb keys list -n <account> -g <rg> --query primaryMasterKey -o tsv; Add-Content -Path .env -Value "COSMOS_ENDPOINT=$ep","COSMOS_KEY=$key","COSMOS_DATABASE=<db>"; 'saved to .env'
```

The SDKs are `@azure/cosmos` (Node), `azure-cosmos` (Python) and `Microsoft.Azure.Cosmos` (.NET). Each takes an endpoint and a key.

## 4. Network

By default, the account accepts connections from any network that has a valid key. That works for local development and for Azure-hosted apps without any extra firewall rules.

## 5. Check you're inside the free tier

Confirm free tier is on:

```
az cosmosdb show -n <account> -g <rg> --query enableFreeTier
```

Check the shared database throughput:

```
az cosmosdb sql database throughput show -a <account> -g <rg> -n <db> --query resource.throughput
```

List the containers:

```
az cosmosdb sql container list -a <account> -g <rg> -d <db> --query "[].name" -o tsv
```

For each container, run `az cosmosdb sql container throughput show -a <account> -g <rg> -d <db> -n <container> --query resource.throughput`. An error means the container uses the shared throughput, which is what you want.

Add up the database throughput and any dedicated container throughput. Keep the total at 1000 or below.

---

## Azure DocumentDB (MongoDB) free tier

This was formerly called Cosmos DB for MongoDB (vCore).

**Free amount:** 32 GB of storage, with one free cluster per subscription.

**Limits:**
- The cluster pauses after 60 days without activity.
- No high availability or backup and restore on the free tier.

**Regions:** brazilsouth, canadacentral, centralus, eastus, westus, westus2, francecentral, germanynorth, northeurope, norwayeast, switzerlandnorth, australiacentral2, australiaeast, centralindia, southindia, eastasia, japaneast, japanwest.

There's no documented CLI path for the free tier, so **guide the user through the portal**:

1. Open https://portal.azure.com/#create/Microsoft.DocumentDB. Offer to open it in their browser.
2. Choose **Azure DocumentDB** (MongoDB vCore) and then **Create**.
3. Fill in the **Basics** tab:
   - Subscription and resource group: the ones in `.azure-free.json`.
   - Cluster name: lowercase and globally unique.
   - Location: a region from the list above.
   - **Cluster tier: tick "Free tier".**
   - Admin user name: they choose one.
   - Password: they type it straight into `.env` as `DB_ADMIN_PASSWORD` in their editor. They shouldn't paste it into chat.
4. On the **Networking** tab, allow their current IP, and allow Azure services if an Azure-hosted app needs access.
5. Review and create. It takes about a minute.

Then build the connection string:

```
az resource show -g <rg> -n <cluster> --resource-type Microsoft.DocumentDB/mongoClusters --query properties.connectionString -o tsv
```

The result has `<user>:<password>` placeholders. Build `DATABASE_URL` from it and the values in `.env` inside one command, so the password is never printed. Then use it with `mongoose` or `mongodb` as usual.
