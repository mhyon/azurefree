# Container Apps (Consumption, scale to zero)

**Best for:**
- Any server app or server-side-rendering framework
- Anything with a Dockerfile
- Custom domains with free managed certificates

**Free grant per subscription, every month:**
- 180,000 vCPU-seconds
- 360,000 GiB-seconds
- 2 million requests

That's about 200 active hours at 0.25 vCPU / 0.5 GiB. With `--min-replicas 0`, idle time costs nothing.

**This grant isn't a cap.** Past it, the app keeps running and the overage is billed:
- Prices (East US list, checked 2026-10-25): active vCPU $0.000024/s, idle vCPU $0.000003/s, memory $0.000003 per GiB-second, and $0.40 per million requests.
- At the settings below, that's about **$0.027 per active hour per replica**. One replica busy all month comes to about **$14**.
- Bot and crawler traffic on a public URL counts as active.
- `--max-replicas 1` keeps the worst case at one replica. The default is 10. The cost guard asks if it's missing or higher.

## 0. Before you create anything

1. **Check the spending limit:** `az rest --method get --url "https://management.azure.com/subscriptions/{subscriptionId}?api-version=2022-12-01" --query subscriptionPolicies.spendingLimit -o tsv`.
2. **If it's `Off` or `CurrentPeriodOff`,** a budget alert is **required** before you deploy. This covers upgraded free accounts and pay-as-you-go. Check for one:
   ```
   az rest --method get --url "https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.Consumption/budgets?api-version=2023-11-01" --query "value[].name" -o tsv
   ```
   If none is listed, create one first. Follow [setup skill step 7](${CLAUDE_PLUGIN_ROOT}/skills/setup/SKILL.md). Don't deploy until it exists. If Cost Management isn't available yet on a brand-new subscription, say so, and deploy only if the user accepts the risk.
3. **If it's `On`** (Free Trial or Visual Studio credit), the spending limit protects the user. A budget is still recommended but not required.
4. **On Azure for Students,** budgets aren't supported. The credit cap is the protection; say so.

**Creation card for a container app.** Fill in the real values:

```
About to create
  What:     Container App (Consumption plan), 0.25 vCPU / 0.5 GiB, 0–1 replicas
  Name:     <app> in environment <project>-env
  Where:    <region> · resource group <rg>
  Cost:     $0 for the first ~200 active hours each month; $0 while scaled to zero
  If over:  keeps running and bills about $0.027 per active hour (~$14/month worst case)
  Undo:     /azure-free:cleanup
```

## 1. Get an image into a free registry

Container Apps runs an image from a registry. **Azure Container Registry is not free.** New free accounts get its Standard tier free for 12 months; otherwise Basic is billed daily. Pick a free route with the user:

| Route | When | Steps |
|---|---|---|
| **A. GitHub Container Registry with local Docker** | Docker Desktop is installed and the code is on GitHub | 1. The user signs Docker in to ghcr.io. A good way is `gh auth token \| docker login ghcr.io -u <github-user> --password-stdin`. Let them run it.<br>2. `docker build -t ghcr.io/<github-user>/<app>:v1 .`<br>3. `docker push ghcr.io/<github-user>/<app>:v1`<br>4. Make the package **public** in GitHub → Packages → Package settings. |
| **B. GitHub Actions builds it** | No local Docker, and the code is on GitHub | Add `.github/workflows/container.yml`. It uses `docker/login-action` with `GITHUB_TOKEN` and `docker/build-push-action` to push `ghcr.io/<owner>/<app>:${{ github.sha }}` on every push to main. Then make the package public. Free for public repositories, and within the free Actions minutes for private ones. |
| **C. Azure Container Registry + `az acr build`** | The user accepts the registry's cost, or is on a new free account (Standard free for 12 months) | Needs an explicit cost OK. The guard will pause `az acr create`. |

No Dockerfile? Write a small one for their stack, and test it with `docker build` if Docker is available.

**Avoid `az containerapp up --source .`.** It quietly creates a paid container registry.

## 2. Create the environment (once per region; free)

```
az extension add -n containerapp --upgrade -y
az containerapp env create -n <project>-env -g <rg> -l <region> --logs-destination none -o table
```

`--logs-destination none` skips Log Analytics, whose ingestion isn't part of the free grant. You can still stream console logs (see below).

## 3. Create the app

```
az containerapp create -n <app> -g <rg> --environment <project>-env \
  --image ghcr.io/<github-user>/<app>:v1 --target-port <port> --ingress external \
  --min-replicas 0 --max-replicas 1 --cpu 0.25 --memory 0.5Gi -o table
az containerapp show -n <app> -g <rg> --query properties.configuration.ingress.fqdn -o tsv
```

- The URL is `https://<fqdn>`.
- `<port>` is the port the app listens on inside the container.
- In PowerShell, replace the trailing `\` with a backtick, or put the command on one line.

If the image is private, add `--registry-server ghcr.io --registry-username <user> --registry-password <token>`. The token is a GitHub token with `read:packages`. Have the user put it in `.env`, then read it inside the same command so it's never printed.

## Redeploy

Push a new tag, then:

```
az containerapp update -n <app> -g <rg> --image ghcr.io/<github-user>/<app>:v2 -o table
```

Record this as the `deploy` command, and include the build and push steps if you used route A.

## Secrets and settings

Store secrets as Container Apps secrets and reference them from environment variables.

bash:
```bash
az containerapp secret set -n <app> -g <rg> --secrets "db-url=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" -o none
az containerapp update -n <app> -g <rg> --set-env-vars "DATABASE_URL=secretref:db-url" -o none
```

PowerShell:
```powershell
$v = (Select-String -Path .env -Pattern '^DATABASE_URL=(.*)$').Matches[0].Groups[1].Value; az containerapp secret set -n <app> -g <rg> --secrets "db-url=$v" -o none
az containerapp update -n <app> -g <rg> --set-env-vars "DATABASE_URL=secretref:db-url" -o none
```

Plain values can be set directly: `--set-env-vars KEY=value`.

## Azure SQL (passwordless)

The app connects with its own managed identity. No secrets are needed; plain environment variables are enough. The database skill sets it up; see [azure-sql.md](../../database/references/azure-sql.md) steps 6–8.

The app identity command is:

```
az containerapp identity assign -g <rg> -n <app> --system-assigned --query principalId -o tsv
```

## Logs and troubleshooting

To stream console logs:

```
az containerapp logs show -n <app> -g <rg> --follow
```

Run it in the background; it keeps streaming.

To check the app's revisions:

```
az containerapp revision list -n <app> -g <rg> -o table
```

Common problems:
- **First request takes a few seconds:** the app is starting from zero. That's normal and it's what keeps the app free.
- **Revision failing:** usually a wrong `--target-port`, or the app listening on `localhost` instead of `0.0.0.0`.
- **Image pull error:** the ghcr.io package is still private. Make it public, or add registry credentials.

## Custom domain (free managed certificate)

1. The user adds a CNAME record pointing to the app's FQDN.
2. Add the hostname:
   ```
   az containerapp hostname add -n <app> -g <rg> --hostname www.example.com
   ```
3. Bind it with a free managed certificate:
   ```
   az containerapp hostname bind -n <app> -g <rg> --hostname www.example.com --environment <project>-env --validation-method CNAME
   ```

Apex domains need an A record and a TXT record. Run `az containerapp show -n <app> -g <rg> --query properties.customDomainVerificationId -o tsv` to get the verification ID for the TXT record.
