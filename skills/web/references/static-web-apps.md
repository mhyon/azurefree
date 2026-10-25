# Static Web Apps (Free plan)

**Best for:** static sites and SPAs, plus a small API in `api/` (managed Functions).
**Free limits:**
- 100 GB bandwidth/month per subscription. Past that, the site is unavailable until next month; it isn't billed.
- 250 MB per environment.
- 2 custom domains with free SSL.
- 10 apps per subscription.

## Create

- **Name:** `<project>-web`. It only needs to be unique within the resource group; Azure adds a random hostname.
- **Region:** one of `centralus`, `eastus2`, `westus2`, `westeurope`, `eastasia`. Pick the one nearest the project's region. Content is served globally either way.

```
az staticwebapp create -n <name> -g <rg> -l <swa-region> --sku Free -o table
az staticwebapp show -n <name> -g <rg> --query defaultHostname -o tsv
```

The site's URL is `https://<defaultHostname>`.

Leaving out `--source` means there's no GitHub link, and you deploy from this machine.

## Deploy from this machine (SWA CLI, needs Node 18+)

1. Build first, for example `npm run build`.
2. Run the deploy below. It fetches the deployment token and uses it in the same command, so the token is never printed. Replace `./dist` with the build output folder.

bash:
```bash
SWA_CLI_DEPLOYMENT_TOKEN="$(az staticwebapp secrets list -n <name> -g <rg> --query properties.apiKey -o tsv)" \
  npx -y @azure/static-web-apps-cli@latest deploy ./dist --env production
```

PowerShell:
```powershell
$env:SWA_CLI_DEPLOYMENT_TOKEN = az staticwebapp secrets list -n <name> -g <rg> --query properties.apiKey -o tsv; npx -y @azure/static-web-apps-cli@latest deploy ./dist --env production; Remove-Item Env:SWA_CLI_DEPLOYMENT_TOKEN
```

- **Always pass `--env production`.** Without it, the CLI deploys to a preview environment.
- **If the project has an API in `api/`,** add `--api-location ./api`. Set its runtime in `staticwebapp.config.json`:
  ```json
  { "platform": { "apiRuntime": "node:20" } }
  ```
- **Recorded `deploy` command:** `npx -y @azure/static-web-apps-cli@latest deploy ./dist --env production`. It needs `SWA_CLI_DEPLOYMENT_TOKEN`, which comes from `az staticwebapp secrets list`.

## Optional: auto-deploy on every push (GitHub)

If the code is on GitHub and the user wants deploys to happen automatically:

```
az staticwebapp create -n <name> -g <rg> -l <swa-region> --sku Free --source https://github.com/<owner>/<repo> --branch main --app-location "/" --output-location "dist" --login-with-github
```

- This opens a GitHub device login for the user.
- It commits a workflow file to their repository. Tell them before you run it.

## SPA routing

Client-side routes need a fallback, or deep links return 404. Add `staticwebapp.config.json` next to `index.html` in the build output (or in `public/`):

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "*.{css,js,png,jpg,jpeg,gif,svg,ico,webp,woff,woff2}"]
  }
}
```

## Databases

Managed Functions on the Free plan **can't use managed identity**, so they can't reach the plugin's passwordless Azure SQL setup. Linking your own Functions or App Service backend needs the paid Standard plan.

For an app with an Azure SQL database:
1. Keep the static front end here.
2. Host the API on App Service F1 ([app-service.md](app-service.md)), Container Apps ([container-apps.md](container-apps.md)) or Functions Flex ([functions.md](functions.md)).
3. Call the API's URL from the front end.
4. Allow the site's origin in the API's CORS settings. On App Service, that's `az webapp cors add -g <rg> -n <api> --allowed-origins https://<defaultHostname>`.

Cosmos DB with an account key in the settings below still works from managed Functions.

## Settings for the API

These are environment variables for the managed Functions.

Set a plain value directly:

```
az staticwebapp appsettings set -n <name> -g <rg> --setting-names KEY=value -o none
```

For a secret, read it from `.env` inside the same command so it never shows up in output.

bash:
```bash
az staticwebapp appsettings set -n <name> -g <rg> --setting-names "DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" -o none
```

PowerShell:
```powershell
$v = (Select-String -Path .env -Pattern '^DATABASE_URL=(.*)$').Matches[0].Groups[1].Value; az staticwebapp appsettings set -n <name> -g <rg> --setting-names "DATABASE_URL=$v" -o none
```

## Custom domain (2 free, with free SSL)

**Subdomain (`www.example.com`):**
1. The user adds a CNAME record at their DNS provider pointing to the `defaultHostname`.
2. Then run:
   ```
   az staticwebapp hostname set -n <name> -g <rg> --hostname www.example.com
   ```

**Apex domain (`example.com`):**
1. Request a TXT-token check:
   ```
   az staticwebapp hostname set -n <name> -g <rg> --hostname example.com --validation-method dns-txt-token
   ```
2. Show the token:
   ```
   az staticwebapp hostname show -n <name> -g <rg> --hostname example.com --query validationToken -o tsv
   ```
3. The user adds that token as a TXT record, plus an ALIAS/ANAME (or A) record, as their DNS provider supports.

## Logs and troubleshooting

- Test locally with `npx @azure/static-web-apps-cli start ./dist --api-location ./api`. It emulates routing, auth and the API.
- **404 on refresh:** add the SPA routing fallback above.
- **Blank page:** the wrong folder was deployed. Deploy the build output, not the source folder.
- **API returns 500:** check that its settings are set (see above). Managed Functions on Free have no live log stream; reproduce with `swa start`.
- **Next.js with server-side rendering:** use `output: 'export'`, or host it on Container Apps instead. Hybrid Next.js on SWA is limited to 250 MB on the Free plan.
