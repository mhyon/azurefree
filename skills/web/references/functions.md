# Azure Functions (Flex Consumption)

**Best for:** a serverless API or background jobs when there's no web front end to host. If there is a static front end, it's simpler to put the API in Static Web Apps' `api/` folder instead.

**Free grant, per subscription, every month:** 250,000 executions and 100,000 GB-seconds (on-demand only).

**This grant isn't a cap.** Past it, the app keeps running and the overage is billed:
- Prices (East US list, checked 2026-10-25): $0.000026 per GB-second of execution and $0.40 per million executions.
- At 512 MB, that's about **$0.047 per busy instance-hour**. One instance busy all month comes to about **$31**.
- **Max instances defaults to 100.** Always pass `--maximum-instance-count 1` (or 2) so a traffic spike or a runaway trigger can't fan out.

**Not free:**
- The storage account every function app needs. Usually a few cents a month.
- Always-ready instances.
- Application Insights data beyond its free allowance.

## Before you create anything

Same rule as Container Apps: if the subscription's `spendingLimit` is `Off` or `CurrentPeriodOff`, a budget alert is **required** before you deploy. Check and create it the same way; see [container-apps.md step 0](container-apps.md).

**Creation card.** Fill in the real values, and include the storage account:

```
About to create
  What:     Function App (Flex Consumption), 512 MB, max 1 instance; storage account <storage>
  Where:    <region> · resource group <rg>
  Cost:     $0 for the first 250,000 executions and 100,000 GB-seconds each month;
            storage account usually a few cents a month
  If over:  keeps running and bills about $0.047 per busy instance-hour plus $0.40 per million executions
  Undo:     /azure-free:cleanup
```

## Create

1. Check that the region supports Flex Consumption: `az functionapp list-flexconsumption-locations -o table`.
2. Choose names:
   - Storage: `<project><4 random>`, lowercase letters and digits only, 3 to 24 characters.
   - App: globally unique.
3. Create the storage account and the app:

```
az storage account create -n <storage> -g <rg> -l <region> --sku Standard_LRS --allow-blob-public-access false -o table
az functionapp create -g <rg> -n <app> -s <storage> --flexconsumption-location <region> --runtime node --runtime-version 22 --instance-memory 512 --maximum-instance-count 1 -o table
```

- `--runtime` can be `node`, `python`, `dotnet-isolated`, `java` or `powershell`. `--instance-memory 512` is the smallest size and stretches the GB-second grant the furthest.
- `--maximum-instance-count 1` caps scale-out at one instance. For an existing app, use `az functionapp scale config set -g <rg> -n <app> --maximum-instance-count 1`.
- `az functionapp create` also creates Application Insights by default. That's fine for a hobby app. Add `--disable-app-insights true` if the user wants nothing that could ever bill.
- Avoid the legacy Linux Consumption plan (`--consumption-plan-location` with Linux). It retires on 2028-09-30.

## Deploy

**Option A: Azure Functions Core Tools.** Install it with `npm i -g azure-functions-core-tools@4`, or follow https://learn.microsoft.com/azure/azure-functions/functions-run-local. Then deploy from the project folder:

```
func azure functionapp publish <app>
```

**Option B: zip deploy, without Core Tools.**
1. Build the project.
2. Zip the contents of the function app folder. `host.json` must be at the root of the zip.
3. Run:
   ```
   az functionapp deployment source config-zip -g <rg> -n <app> --src app.zip
   ```

The URL is `https://<app>.azurewebsites.net/api/<function>`.

## Settings

```
az functionapp config appsettings set -g <rg> -n <app> --settings KEY=value -o none
```

For secrets, read the value from `.env` inside the same command, the same way as in [app-service.md](app-service.md). Keep `-o none`, because this command prints every setting.

## Azure SQL (passwordless)

Flex Consumption supports managed identity. The database skill sets it up; see [azure-sql.md](../../database/references/azure-sql.md) steps 6–8.

The app identity command is:

```
az functionapp identity assign -g <rg> -n <app> --query principalId -o tsv
```

## Logs

- Run `func azure functionapp logstream <app>` (Core Tools).
- Or open the app in the portal and look under Log stream or Application Insights.
- Test locally first with `func start`.
