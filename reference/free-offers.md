# Azure free offers for web apps and databases

**Last verified: 2026-10-19** against azure.microsoft.com and learn.microsoft.com.

Free offers change. Before you tell a user that something is free, check anything marked **(unverified)** below. If this file is more than about three months old, re-check the specific limit you're quoting. Use the Microsoft Learn MCP tools (`microsoft_docs_search`, `microsoft_docs_fetch`) if they're available. Otherwise fetch the source URL.

## Contents
1. Account types and the 30-day cliff
2. Detecting the offer type from the CLI
3. Web hosting
4. Databases
5. Cost guardrails
6. Known conflicts and unverified points

---

## 1. Account types and the 30-day cliff

### Azure free account (offer MS-AZR-0044P)
- **Credit:** USD 200, usable for 30 days.
- **12-month free services**, for new customers only. Includes:
  - PostgreSQL and MySQL flexible server B1MS: 750 h/month, 32 GB storage, 32 GB backup.
  - VMs B1s, B2pts v2 and B2ats v2: 750 h each.
  - Container Registry Standard.
  - A SQL Managed Instance allowance.
- **Always-free services (65+).** Section 3 and 4 cover the web and database ones.
- **Sign-up requirements:**
  - A Microsoft account or GitHub account.
  - A phone number.
  - A credit or debit card that isn't prepaid. Azure places a temporary $1 hold and then releases it.
  - One free account per person.
- **Spending limit:**
  - On by default and equal to the credit. You can't set a different amount.
  - When the limit is hit, resources are taken out of production: VMs stop and storage becomes read-only.
- **Day 30, or when the credit runs out:**
  - The subscription is **disabled** unless you upgrade to pay-as-you-go.
  - To keep the 12-month services, you must upgrade within 30 days. The always-free services also need an active (upgraded) subscription.
- **Upgrading:**
  - The spending limit is **removed permanently**, because pay-as-you-go can't have one.
  - From then on, free services stay free within their limits. Anything above the limits is billed to the card.
  - This is why a budget alert is mandatory after upgrading.
- **Free allowances:**
  - Reset monthly and don't roll over.
  - Apply only to the subscription created at sign-up.
  - Usage shows up in the portal 1–2 days late.
- **Sign-up:** https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account (direct link: https://go.microsoft.com/fwlink/?linkid=2227353)

### Azure for Students (MS-AZR-0170P)
- **Credit:** USD 100 for 12 months. **No card required.**
- **Eligibility:** age 18+, full-time student at an accredited degree-granting school, verified with a school email.
- **Free services:** the same always-free and 12-month lists as the free account.
- **End of credit or term:** the subscription is disabled or canceled. Students renew yearly while still eligible.
- **Use:** education and non-commercial only.
- **Budgets:** Cost Management **doesn't support** this offer, so budgets don't work. Students have to rely on the credit cap.
- **Check your credit:** https://www.microsoftazuresponsorships.com
- **Sign up:** https://azure.microsoft.com/en-us/free/students/

### Azure for Students Starter (MS-AZR-0144P)
- **Who:** no card, ages 13+ in the US and 16+ elsewhere.
- **Services:** only App Service, Functions, Notification Hubs, Application Insights and DevOps.
- **Not included:** the Azure SQL free offer.

### Pay-as-you-go (MS-AZR-0003P)
- **Spending limit:** none.
- **Always-free services:** available. These include the Azure SQL free offer, Cosmos DB free tier, Static Web Apps Free, App Service F1 and the Container Apps and Functions grants.
- **12-month services on a direct pay-as-you-go sign-up:** **(unverified)**. Sources conflict.
- **Sign up:** https://go.microsoft.com/fwlink/?linkid=2234155

## 2. Detecting the offer type from the CLI

`az account show` does **not** include the offer type. Query the subscription instead. The `{subscriptionId}` placeholder is filled in by `az rest`, so the command works the same in bash and PowerShell:

```
az rest --method get --url "https://management.azure.com/subscriptions/{subscriptionId}?api-version=2022-12-01" --query "{state:state, quotaId:subscriptionPolicies.quotaId, spendingLimit:subscriptionPolicies.spendingLimit}"
```

`spendingLimit` is `On`, `Off` or `CurrentPeriodOff`.

| quotaId (match case-insensitively) | Offer | Budgets work? |
|---|---|---|
| `FreeTrial_2014-09-01` | Free account (in its first 30 days, or not yet upgraded) | Yes |
| `PayAsYouGo_2014-09-01` / `Pay-as-you-go_2014-09-01` | Pay-as-you-go, including upgraded free accounts | Yes |
| `AzureForStudents_2018-01-01` | Azure for Students | **No** |
| `DreamSpark_2015-02-01` | Azure for Students Starter | **No** |
| `MSDN_2014-09-01` | Visual Studio subscriber credit | Yes |
| `MSDNDevTest_2014-09-01` | Dev/Test | Yes |
| `MPN_2014-09-01` | Partner network | Yes |
| `AzurePass_2014-09-01` | Azure Pass (event or promo credit) | Yes |
| `Sponsored_2016-01-01` | Sponsorship | **No** |
| `EnterpriseAgreement_2014-09-01` | EA / Microsoft Customer Agreement (often a work or school subscription) | Yes |
| `CSP_*` | Cloud Solution Provider | Varies |

If the quotaId is EA or CSP, the user is probably on an employer's or reseller's subscription. Point that out and suggest they use a personal subscription for hobby projects.

## 3. Web hosting

**Capped or billed?** Some free options stop at their limit; others keep running and bill the overage. Say which on every creation card. Overage prices are East US list prices from the Azure Retail Prices API, checked 2026-10-25.

| Option | At the limit |
|---|---|
| Static Web Apps Free | Site unavailable until next month. **Never bills.** |
| App Service F1 | App stops until the next day. **Never bills.** |
| Container Apps (Consumption) | **Keeps running and bills the overage.** No cap. |
| Functions (Flex Consumption) | **Keeps running and bills the overage.** No cap. |

During a Free Trial the spending limit protects the user. On a subscription whose `spendingLimit` is `Off` (an upgraded free account, or pay-as-you-go), the billed rows can cost money. Require a budget alert before deploying them.

**Choose in this order on a Free Trial:** Static Web Apps, then Container Apps, then Functions Flex. App Service F1 comes last, because new Free Trial subscriptions have been seen with **zero App Service quota** since July 2026. Quota increases aren't available until you upgrade. **Outside a Free Trial,** prefer the capped options (Static Web Apps, App Service F1) when they fit the app.

### Static Web Apps, Free plan (always free)
| Limit | Value |
|---|---|
| Apps | 10 per subscription |
| Bandwidth | 100 GB/month per subscription. Over the limit, traffic is **unavailable, not billed**. |
| Storage | 250 MB per environment, 500 MB across all environments, up to 15,000 files |
| Request size | 30 MB max |
| Environments | 3 preview environments |
| Custom domains | 2, with free auto-renewing SSL |
| API | Managed Functions only, in an `api/` folder. You can't link your own Functions app; "bring your own API" is Standard-plan only. Managed Functions **can't use managed identity**, so they can't reach passwordless Azure SQL. |
| Sign-in | Preconfigured providers only (GitHub, Microsoft Entra ID). Up to 25 invitations. |
| Not included | Private endpoints, IP restrictions, SLA |

- **Regions with Functions support:** centralus, eastus2, westus2, westeurope, eastasia.
- **Create:** `az staticwebapp create -n <app> -g <rg> -l <region> --sku Free`. Leaving out `--source` means no GitHub link.
- **Deploy:** use the SWA CLI (`@azure/static-web-apps-cli`, version ≥ 2.0.2) with a deployment token, and pass `--env production` (the default is preview).
- The Dedicated plan was retired on 2025-10-31.

### App Service F1 Free (always free)
| Limit | Value |
|---|---|
| CPU | 60 minutes/day, 3 minutes per 5 minutes, one shared instance |
| Memory and storage | 1 GB RAM, 1 GB storage |
| Apps | Up to 10 apps per plan |
| Custom domains | None, so azurewebsites.net only (HTTPS works there) |
| Not included | Always On (apps sleep after ~20 min idle), slots, autoscale, SLA |

- **OS:** Linux supports code and containers; Windows is code only.
- **Free Linux plans:** possibly **1 per region per subscription** **(unverified**: the official table says 10). Put several apps in one F1 plan.
- **`az webapp up`** is deprecated. Use `az appservice plan create --sku F1 --is-linux`, then `az webapp create`, then `az webapp deploy`.
- Not supported for production workloads.

### Container Apps, Consumption (always free grant)
- **Free each month, per subscription:** 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 M requests. That's roughly 200 active hours at 0.25 vCPU / 0.5 GiB.
- **Scale to zero** (`--min-replicas 0`) costs nothing while idle. A minimum above 0 bills idle time once the grant is used up.
- **Past the grant, usage is billed. There's no cap.**
  - Prices: active vCPU $0.000024/s, idle vCPU $0.000003/s, memory $0.000003 per GiB-second, and $0.40 per million requests.
  - At 0.25 vCPU / 0.5 GiB, that's about **$0.027 per active replica-hour**. One replica busy all month comes to about **$14**.
  - Bot traffic on a public URL counts as active.
- **Max replicas defaults to 10**, which multiplies the worst case by ten. Always pass `--max-replicas 1` for hobby apps; the cost guard asks if it's missing or higher.
- **Custom domains:** yes, with free managed certificates.
- **Logs:** the environment defaults to Log Analytics, which bills past its free ingestion. For hobby apps, use `--logs-destination none`.
- **Images:** an Azure Container Registry is **not free** (except Standard for 12 months on new free accounts). Use a free registry such as a public ghcr.io package, or a public Docker Hub image.

### Azure Functions
| Plan | Free per month | Notes |
|---|---|---|
| Flex Consumption (recommended, Linux) | 250,000 executions and 100,000 GB-s | Always-ready instances aren't free. Free Trial and Students get a 15-core quota per region. |
| Consumption (legacy) | 1 M executions and 400,000 GB-s | Linux Consumption retires 2028-09-30 |

- **Past the grant, Flex usage is billed. There's no cap.**
  - Prices: $0.000026 per GB-second of on-demand execution and $0.40 per million executions.
  - At the smallest size (512 MB), that's about **$0.047 per busy instance-hour**. One instance busy all month comes to about **$31**.
- **Max instances defaults to 100.** Pass `--maximum-instance-count 1` (or 2) for hobby apps, or change it later with `az functionapp scale config set`. Microsoft warns that values below 40 can throttle busy HTTP apps; for a hobby app that's the point.
- Each function app needs a storage account, which bills separately (usually cents).
- "Free grants apply to paid, consumption subscriptions only." Whether that covers Free Trial is **(unverified)**.

## 4. Databases

The plugin defaults to Azure SQL for any app that stores data, and names the alternatives in one line. The other rows apply when the user asks for that engine, chooses to keep the engine their app already uses, or the app can't run on SQL Server without a rewrite.

| Need | Best free option | Free for | Watch out for | At the limit |
|---|---|---|---|---|
| Any app that stores data (**default**) | **Azure SQL Database free offer** | Always | Choose AutoPause; BillOverUsage is one-way | With AutoPause, pauses until the 1st. **Never bills.** |
| JSON documents, key-value | **Cosmos DB free tier** | Always | One per subscription, chosen at creation only | **Bills** throughput above 1000 RU/s and storage above 25 GB |
| MongoDB API | **Azure DocumentDB free tier** | Always | One per subscription; created in the portal | Fixed free cluster; moving to a paid tier is a manual upgrade |
| Must be PostgreSQL | PostgreSQL flexible server B1ms | **12 months**, free account only | CLI defaults are paid | **Bills** usage above the allowance, and everything after 12 months |
| Must be MySQL (WordPress, Laravel) | MySQL flexible server B1ms | **12 months**, free account only | Auto-scale IOPS | **Bills** usage above the allowance, and everything after 12 months |

### Azure SQL Database free offer (always free)
- **Per database, per month:** 100,000 vCore-seconds of serverless compute, 32 GB data and 32 GB backup. The allowance resets on the 1st and doesn't roll over.
- **How many:** up to **10** free databases per subscription. Available on every subscription type except Students Starter.
- **When the allowance runs out**, the database does one of two things:
  - `AutoPause`: pauses until next month and never bills. Limits: max 4 vCores, 32 GB, 7-day point-in-time restore, locally redundant backups.
  - `BillOverUsage`: stays online and bills at serverless rates. **Can't be switched back.**
- **Create:**
  - `az sql server create ...` (the server itself is free)
  - `az sql db create ... -e GeneralPurpose -f Gen5 -c 2 --compute-model Serverless --use-free-limit --free-limit-exhaustion-behavior AutoPause`
- **Not supported:** elastic pools, failover groups, database copy, converting an existing database.
- **No restrictions on sign-in:** Entra-only authentication and managed identities work normally with the free offer.
- **Personal Microsoft accounts as Entra admin:** the docs conflict. The `Set-AzSqlServerActiveDirectoryAdministrator` reference says outlook.com and gmail.com accounts aren't supported, while the guest-users page says they can be admin. The plugin uses an Entra security group as admin for `#EXT#` accounts **(unverified either way)**.
- **`CREATE USER ... FROM EXTERNAL PROVIDER WITH OBJECT_ID`:** generally available since November 2024. Run by a user identity, it needs no server-side Graph permissions.
- **Region:** the region of your first free database becomes fixed for the rest.
- **Check usage:** `az monitor metrics list --resource <db id> --metric free_amount_remaining free_amount_consumed --interval PT1H --aggregation Minimum -o table`. The portal Overview also shows it.
- **CLI help text is out of date:** it says "one database" and "BillForUsage". The docs say 10 and `BillOverUsage`.

### Cosmos DB free tier (always free)
- **Free amount:** 1000 RU/s and 25 GB per account, for the account's life. **One per subscription.**
- **Free tier must be chosen at creation:** `--enable-free-tier true`. You can't add it later.
- **Not available on serverless accounts.**
- **Throughput:** 1000 RU/s is shared across every database and container in the account. A shared-throughput database at `--throughput 1000` is the simplest setup (up to 25 containers).
- **Find an existing free-tier account:** `az cosmosdb list --query "[?enableFreeTier].{name:name, rg:resourceGroup}" -o table`
- **Free account bonus:** an extra 400 RU/s and 25 GB for 12 months **(unverified**, may be outdated).

### Azure DocumentDB free tier (formerly Cosmos DB for MongoDB vCore; always free)
- **Free amount:** 32 GB, one cluster per subscription. Provisioning is near-instant.
- **Pauses** after 60 days without activity.
- **Not included:** HA, Entra ID, backup/restore, vector indexes.
- **Regions:** brazilsouth, canadacentral, centralus, eastus, westus, westus2, francecentral, germanynorth, northeurope, norwayeast, switzerlandnorth, australiacentral2, australiaeast, centralindia, southindia, eastasia, japaneast, japanwest.
- **Create in the portal** (Free tier checkbox). There's no documented CLI path for the free tier **(unverified)**.

### PostgreSQL / MySQL flexible server (12 months, free account)
- **Free amount:** 750 h/month of Burstable B1ms, 32 GB storage and 32 GB backup. That's one server running all month.
- **Who gets it:** only subscriptions with the free account's 12-month services. Afterwards it's billed monthly.
- **Stopping the server** saves hours. It auto-starts after 7 days.
- **PostgreSQL CLI defaults are paid:** General Purpose and 128 GB. Always pass `--tier Burstable --sku-name Standard_B1ms --storage-size 32`.
  - Leave out HA flags (HA is off by default).
  - CLI ≥ 2.87 renamed `--high-availability` to `--zonal-resiliency` for PostgreSQL.
- **MySQL defaults** are already Burstable B1ms with 32 GB. Add `--auto-scale-iops Disabled` and `--storage-auto-grow Disabled`.
- **Track usage:** portal → Subscriptions → your subscription → "View all free services".

## 5. Cost guardrails

- **Budgets alert; they don't stop anything.** They're evaluated about once a day, and cost data lags 8–24 h.
- **Budgets don't work on Students and Sponsorship offers.**
- **Create a budget with an email alert:** `az rest --method put --url ".../providers/Microsoft.Consumption/budgets/<name>?api-version=2023-11-01" --body @budget.json`. See the setup skill for the body.
  - `az consumption budget create` can't send email.
  - The start date must be the 1st of a month.
- **Month-to-date cost:** `az rest --method post --url "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-11-01" --body @cost-query.json`. Cost Management figures leave out credits and free-tier usage.
- **Credit remaining:** there's no CLI command for standard free accounts.
  - Free accounts: portal → Cost Management + Billing.
  - Students: microsoftazuresponsorships.com.
- **Free-service usage:** portal → Subscriptions → your subscription → "View all free services".

## 6. Known conflicts and unverified points

| Topic | Conflict or gap |
|---|---|
| Free Trial App Service quota | Some new Free Trial subscriptions have 0 App Service quota (July 2026 reports). Support says to upgrade before requesting more. |
| Free Linux F1 plans | 1 per region in error messages, 10 per region in the docs |
| Functions free grant | "Paid subscriptions only" may exclude Free Trial |
| Cosmos DB 12-month bonus | Possibly outdated |
| DocumentDB free tier | No documented CLI or Bicep path |
| 12-month services on direct pay-as-you-go sign-ups | Unclear |
| Pay-as-you-go quotaId | Docs say `Pay-as-you-go_…`, real responses show `PayAsYouGo_…` |
| Students at end of term | Microsoft Learn says "canceled", the offer terms say "disabled" |
