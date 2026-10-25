# App Service (F1 Free plan, Linux)

**Best for:** Node, Python, .NET, Java or PHP server apps, deployed as a zip with no Docker.

**Free limits:**
- **CPU:** 60 minutes a day. Past that, the app stops until the next day.
- **Storage and memory:** 1 GB each.
- **Idle sleep:** the app sleeps after about 20 minutes idle, so the first request afterwards is slow.
- **Domain:** azurewebsites.net only, with no custom domain.
- **Apps per plan:** up to 10.

**Free Trial caveat:** some new Free Trial subscriptions have **zero App Service quota**. If plan creation fails with a quota error (mentions "quota", "Total VMs", "Free VMs" or `FreeLinuxAtRegionalCapacity`):
- **Don't** suggest a quota request. It isn't available on trials.
- Offer **Container Apps** ([container-apps.md](container-apps.md)) instead.
- Or, if an F1 plan already exists, reuse it. Find one with:
  ```
  az appservice plan list --query "[?sku.name=='F1'].{name:name, rg:resourceGroup, location:location}" -o table
  ```

## Create

1. Pick the runtime. List them with `az webapp list-runtimes --os linux -o tsv`. Examples: `NODE:22-lts`, `PYTHON:3.12`, `DOTNETCORE:8.0`, `JAVA:21-java21`.
2. Choose names:
   - Plan: `<project>-plan`.
   - App: must be **globally unique**, because it becomes `<app>.azurewebsites.net`. Use `<project>-<4 random lowercase letters or digits>`.
3. Create the plan and the app:

```
az appservice plan create -g <rg> -n <plan> -l <region> --sku F1 --is-linux -o table
az webapp create -g <rg> -p <plan> -n <app> --runtime "NODE:22-lts" -o table
```

To have App Service install dependencies on deploy (`npm install`, `pip install -r requirements.txt`):

```
az webapp config appsettings set -g <rg> -n <app> --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true -o none
```

## Startup

**Node**
- App Service runs `npm start`. Make sure `package.json` has a start script.
- The app must listen on `process.env.PORT`.

**Python**
- Set a startup command, for example:
  - Flask: `gunicorn --bind=0.0.0.0 --timeout 600 app:app`
  - FastAPI: `gunicorn -k uvicorn.workers.UvicornWorker app.main:app`
  - Django: `gunicorn --bind=0.0.0.0 myproject.wsgi`
- Apply it:
  ```
  az webapp config set -g <rg> -n <app> --startup-file "<command>" -o none
  ```

**.NET**
- Publish first: `dotnet publish -c Release -o publish`.
- Zip the contents of the `publish` folder, not the folder itself.

## Deploy (zip)

Leave out `node_modules`, `.git` and `.env*` from the zip. If dependencies are installed on deploy, the zip should contain source only.

- If the project is a git repository and everything's committed, this is the simplest option and respects `.gitignore`:
  ```
  git archive --format=zip -o ../app.zip HEAD
  ```
- PowerShell:
  ```powershell
  Compress-Archive -Path (Get-ChildItem -Force | Where-Object { $_.Name -notin @('node_modules','.git','.env','.venv') }) -DestinationPath ..\app.zip -Force
  ```
- bash with zip installed:
  ```bash
  zip -r ../app.zip . -x 'node_modules/*' '.git/*' '.env*' '.venv/*'
  ```

Then deploy:

```
az webapp deploy -g <rg> -n <app> --src-path ../app.zip --type zip
```

- The URL is `https://<app>.azurewebsites.net`.
- Record the zip and deploy pair of commands as the `deploy` command.

## Settings (environment variables)

Set a plain value directly:

```
az webapp config appsettings set -g <rg> -n <app> --settings KEY=value -o none
```

`-o none` matters, because this command prints every setting and its value. For secrets, read the value from `.env` inside the same command.

bash:
```bash
az webapp config appsettings set -g <rg> -n <app> --settings "DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" -o none
```

PowerShell:
```powershell
$v = (Select-String -Path .env -Pattern '^DATABASE_URL=(.*)$').Matches[0].Groups[1].Value; az webapp config appsettings set -g <rg> -n <app> --settings "DATABASE_URL=$v" -o none
```

## Azure SQL (passwordless)

The app connects with its own managed identity, which works on F1. The database skill sets it up; see [azure-sql.md](../../database/references/azure-sql.md) steps 6–8.

The app identity commands are:

```
az webapp identity assign -g <rg> -n <app> --query principalId -o tsv
az webapp restart -g <rg> -n <app>
```

F1 has no VNet integration, so the database firewall needs the "Allow Azure services" rule. The database skill adds it.

## Logs and troubleshooting

To stream logs:

1. Turn on container logging:
   ```
   az webapp log config -g <rg> -n <app> --docker-container-logging filesystem -o none
   ```
2. Start streaming:
   ```
   az webapp log tail -g <rg> -n <app>
   ```
   Run it in the background. It keeps streaming until stopped.

Common problems:
- **App stopped and `usageState` is `Exceeded`:** the 60 CPU minutes for today are used up. Check with `az webapp show -g <rg> -n <app> --query "{state:state, usage:usageState}"`. It comes back the next day. If this keeps happening, the app has outgrown F1, so suggest Container Apps.
- **"Application Error" page:** check the log stream. It's usually a missing start script, the wrong port, or a missing dependency.
- **Slow first request:** expected on F1, because Always On isn't available. It's normal and costs nothing.
