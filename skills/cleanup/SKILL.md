---
name: cleanup
description: Safely pauses or removes Azure free-tier resources. Can stop a PostgreSQL/MySQL server to save free hours, scale an app to zero, delete a single app or database, or tear down the project's whole resource group, always after showing exactly what will go and getting confirmation. Use when the user wants to stop paying, shut down, pause, delete or tear down their Azure app, database or project, or start over from scratch.
---

# Pause or remove Azure resources safely

Deleting is permanent. There's no recycle bin for databases or resource groups. Go slowly here:
- List exactly what will be affected.
- Offer to save the data first.
- Get an explicit yes.

The plugin's guard also pauses every delete command for confirmation. That's expected, so don't try to work around it.

## 1. Inventory

1. Read `.azure-free.json`.
2. List what's actually there:
   ```
   az resource list -g <rg> --query "[].{name:name, type:type}" -o table
   ```
3. If Azure and the file disagree, trust Azure. Mention the difference to the user.

## 2. What does the user want?

Ask with AskUserQuestion. Put the least destructive option first:

| Option | Section |
|---|---|
| **Pause to save free hours (keep everything)** | Step 3 |
| **Delete one app or database** | Step 4 |
| **Delete everything for this project** | Step 5 |
| **Nothing, just checking** | Hand off to `azure-free:status` |

## 3. Pause (nothing is deleted)

| Service | How to pause |
|---|---|
| PostgreSQL / MySQL | `az <engine> flexible-server stop -g <rg> -n <server>`. Azure starts it again automatically after 7 days (PostgreSQL) or 30 days (MySQL). Tell the user. |
| Container Apps | `az containerapp update -n <app> -g <rg> --min-replicas 0 -o none`. It scales to zero when idle. |
| App Service F1 | `az webapp stop -g <rg> -n <app>`. It's already free; stopping just takes it offline. |
| Azure SQL free offer | Nothing to do. It pauses by itself when idle. |
| Static Web Apps, Cosmos DB free tier | No pause needed. They cost nothing while idle within the free limits. |

## 4. Delete one resource

1. **Name the resource and say what's lost:** the data, the URL, and any free slot it was using.
   - Deleting the free-tier Cosmos DB account frees the subscription's single free slot.
   - A deleted free SQL database frees its slot within about an hour.
2. **If it holds data, offer to export it first:**
   - Azure SQL: export with `sqlpackage /Action:Export` to a local `.bacpac`, or query out the tables.
   - PostgreSQL: `pg_dump`. MySQL: `mysqldump`. Pass the password through the environment, as in the database references.
   - Cosmos DB: a small script that reads every container and writes it to JSON.
3. **Ask the user to confirm,** naming the exact resource:
   - **"Yes, delete <name>"**
   - **"Cancel"**
4. **Run the delete:**

| Resource | Command |
|---|---|
| Web app | `az webapp delete -g <rg> -n <app>` |
| Static Web App | `az staticwebapp delete -n <n> -g <rg> --yes` |
| Container app | `az containerapp delete -n <n> -g <rg> --yes` |
| SQL database | `az sql db delete -g <rg> -s <srv> -n <db> --yes` |
| Cosmos DB account | `az cosmosdb delete -n <n> -g <rg> --yes` |
| PostgreSQL / MySQL server | `az <engine> flexible-server delete -g <rg> -n <srv> --yes` |

Also delete the pieces that only existed to support it, once nothing else uses them: an App Service plan with no apps left, an empty SQL server, a Container Apps environment, or a storage account for Functions.

**Deleting an app that used Azure SQL:** its database user stays behind. It's harmless, but tidy it up:
1. Write `DROP USER IF EXISTS [<app>];` to a temp `.sql` file.
2. Run it with `sqlcmd ... --authentication-method ActiveDirectoryAzCli -i <file>`.

**Deleting an Azure SQL server whose admin was a `sqladmins-<server>` group:** offer to delete the group too, with `az ad group delete --group sqladmins-<server>`. Entra groups are free, so this is only housekeeping.

## 5. Delete the whole project

1. **Show the full list** from step 1. Say plainly: "This deletes every one of these, including all database data. It can't be undone."
2. **Offer the data export** from step 4.
3. **Confirm** with AskUserQuestion:
   - **"Yes, delete <rg> and everything in it"**
   - **"Cancel"**
4. **Delete the resource group:**
   ```
   az group delete -n <rg> --yes --no-wait
   ```
5. **Check it's gone** a few minutes later with `az group exists -n <rg>`. That should print `false`.
6. **Look for leftovers outside the resource group.**
   - Run `az resource list --query "[].{name:name, type:type, rg:resourceGroup}" -o table` and look for anything this project created elsewhere. The usual one is an automatic Log Analytics workspace in `DefaultResourceGroup-*`.
   - If the SQL admin was a `sqladmins-<server>` Entra group, it also survives. Groups are directory objects, not resources.
   - Offer to delete these too, after confirming.
7. **Keep the budget alert,** because it's useful for any future project. Only delete it if the user asks:
   ```
   az rest --method delete --url "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.Consumption/budgets/azure-free-monthly?api-version=2023-11-01"
   ```

## 6. Update the state file

- **Something was deleted:** remove its entries from `.azure-free.json` and set `updated`.
- **The whole project was deleted:** ask whether to delete `.azure-free.json`, or keep it with an empty `resources` list so the region and subscription choices are remembered.
- **Secrets:** remind the user that `.env` still holds credentials for resources that no longer exist. Offer to remove those lines.

## 7. Closing the account (only if they ask)

You can't close the account for them. Explain where to do it:

- **Free Trial or pay-as-you-go:** Azure portal → Subscriptions → the subscription → Cancel subscription.
- **Students:** they can simply let the credit expire.

Cancelling deletes everything in the subscription after a retention period.
