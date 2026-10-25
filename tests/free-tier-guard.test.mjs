// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { review, findInvocations, modeFromEnv } from "../hooks/free-tier-guard.mjs";

const decision = (cmd, mode = "ask") => review(cmd, mode)?.hookSpecificOutput?.permissionDecision ?? null;
const context = (cmd, mode = "ask") => review(cmd, mode)?.hookSpecificOutput?.additionalContext ?? "";

test("ignores commands without az", () => {
  assert.equal(review("npm run build"), null);
  assert.equal(review("git commit -m 'azure docs'"), null);
});

test("ignores az inside quoted strings", () => {
  assert.equal(review('echo "az appservice plan create -g x -n y --sku B1"'), null);
  assert.equal(review("git commit -m 'run az sql db create later'"), null);
});

test("ignores --help", () => {
  assert.equal(review("az sql db create --help"), null);
  assert.equal(review("az appservice plan create -h"), null);
});

test("read-only az commands pass silently", () => {
  assert.equal(review("az group list -o table"), null);
  assert.equal(review("az account show --query id -o tsv"), null);
});

test("App Service plan: F1 passes, paid or missing SKU asks", () => {
  assert.equal(decision("az appservice plan create -g rg -n plan --sku F1 --is-linux"), null);
  assert.equal(decision("az appservice plan create -g rg -n plan --sku free"), null);
  assert.equal(decision("az appservice plan create -g rg -n plan --sku B1"), "ask");
  assert.equal(decision("az appservice plan create -g rg -n plan --sku=P1V3"), "ask");
  assert.equal(decision("az appservice plan create -g rg -n plan --is-linux"), "ask");
  assert.equal(decision("az appservice plan create -g rg -n plan --sku $SKU"), "ask");
});

test("sees az after || even though bash would skip it", () => {
  assert.equal(decision("echo ok || az appservice plan create -g x -n y --sku B1"), "ask");
});

test("finds az in command substitution and after the PowerShell call operator", () => {
  const subst = findInvocations('TOKEN=$(az staticwebapp secrets list -n a -g b --query "properties.apiKey" -o tsv) && swa deploy');
  assert.equal(subst[0].path, "staticwebapp secrets list");
  assert.equal(decision('& "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd" appservice plan create -g a -n b --sku S1'), "ask");
});

test("redirections don't leak into flag values", () => {
  assert.equal(decision("az appservice plan create -g a -n b --sku F1 2>&1"), null);
  assert.equal(decision("az appservice plan create -g a -n b --sku F1 > out.txt"), null);
});

test("Static Web Apps: Free or default passes, Standard asks", () => {
  assert.equal(decision("az staticwebapp create -n web -g rg -l eastus2"), null);
  assert.equal(decision("az staticwebapp create -n web -g rg -l eastus2 --sku Free"), null);
  assert.equal(decision("az staticwebapp create -n web -g rg --sku Standard"), "ask");
});

test("Azure SQL free offer", () => {
  const free =
    "az sql db create -g rg -s srv -n db -e GeneralPurpose -f Gen5 -c 2 --compute-model Serverless \\\n" +
    "  --use-free-limit --free-limit-exhaustion-behavior AutoPause";
  assert.equal(review(free), null);
  assert.equal(decision("az sql db create -g rg -s srv -n db"), "ask");
  assert.equal(decision("az sql db create -g rg -s srv -n db --use-free-limit false"), "ask");
  assert.equal(decision("az sql db create -g rg -s srv -n db --use-free-limit"), "ask");
  assert.equal(decision("az sql db create -g rg -s srv -n db --free-limit true --fleb BillOverUsage"), "ask");
});

test("PowerShell backtick continuation", () => {
  const ps =
    "az sql db update -g rg -s srv -n db `\n" +
    "  --free-limit-exhaustion-behavior BillOverUsage";
  assert.equal(decision(ps), "ask");
});

test("Cosmos DB free tier and throughput", () => {
  assert.equal(decision("az cosmosdb create -n acct -g rg --enable-free-tier true"), null);
  assert.equal(decision("az cosmosdb create -n acct -g rg"), "ask");
  assert.equal(decision("az cosmosdb create -n acct -g rg --enable-free-tier true --capabilities EnableServerless"), "ask");
  assert.equal(
    decision("az cosmosdb create -n a -g rg --enable-free-tier true --locations regionName=eastus failoverPriority=0 --locations regionName=westus failoverPriority=1"),
    "ask"
  );
  assert.equal(decision("az cosmosdb sql database create -a acct -g rg -n db --throughput 1000"), null);
  assert.equal(decision("az cosmosdb sql database create -a acct -g rg -n db --throughput 4000"), "ask");
  assert.equal(decision("az cosmosdb sql container throughput update -a a -g rg -d db -n c --max-throughput 4000"), "ask");
  assert.match(context("az cosmosdb sql container create -a a -g rg -d db -n c -p /id --throughput 400"), /shared/);
});

test("PostgreSQL flexible server", () => {
  const free =
    "az postgres flexible-server create -g rg -n pg -l eastus --tier Burstable --sku-name Standard_B1ms --storage-size 32";
  assert.equal(decision(free), null);
  assert.match(context(free), /12 months/);
  assert.equal(decision("az postgres flexible-server create -g rg -n pg --tier Burstable --sku-name Standard_B1ms"), "ask");
  assert.equal(decision("az postgres flexible-server create -g rg -n pg"), "ask");
  assert.equal(decision(`${free} --high-availability ZoneRedundant`), "ask");
  assert.equal(decision(`${free} --zonal-resiliency Disabled`), null);
  assert.equal(decision("az postgres flexible-server update -g rg -n pg --sku-name Standard_D2s_v3"), "ask");
});

test("MySQL flexible server", () => {
  const free = "az mysql flexible-server create -g rg -n my --auto-scale-iops Disabled";
  assert.equal(decision(free), null);
  assert.match(context("az mysql flexible-server create -g rg -n my"), /auto-scale IOPS/);
  assert.equal(decision("az mysql flexible-server create -g rg -n my --storage-size 64"), "ask");
});

test("Container Apps traps", () => {
  assert.equal(decision("az containerapp up -n app -g rg --source ."), "ask");
  assert.match(review("az containerapp up -n app -g rg --image ghcr.io/me/app:1").hookSpecificOutput.permissionDecisionReason, /max-replicas/);
  assert.match(context("az containerapp env create -n env -g rg -l eastus"), /Log Analytics/);
  assert.equal(review("az containerapp env create -n env -g rg -l eastus --logs-destination none"), null);
  assert.equal(decision("az containerapp create -n a -g rg --environment env --image i --min-replicas 1 --max-replicas 1"), "ask");
  assert.equal(decision("az acr create -n reg -g rg --sku Basic"), "ask");
});

test("Container Apps replica ceiling", () => {
  const base = "az containerapp create -n a -g rg --environment env --image i --min-replicas 0";
  assert.equal(review(`${base} --max-replicas 1`), null);
  assert.match(review(base).hookSpecificOutput.permissionDecisionReason, /up to 10 replicas/);
  assert.equal(decision(`${base} --max-replicas 3`), "ask");
  assert.equal(decision(`${base} --max-replicas $MAX`), "ask");
  assert.equal(decision(`${base} --max-replicas=1`), null);
  assert.equal(decision("az containerapp update -n a -g rg --image i:v2"), null);
  assert.equal(decision("az containerapp update -n a -g rg --max-replicas 5"), "ask");
  assert.equal(decision("az containerapp update -n a -g rg --max-replicas 1 --min-replicas 0"), null);
  assert.equal(decision("az containerapp create -n a -g rg --environment env --yaml app.yaml"), null);
  assert.match(context("az containerapp create -n a -g rg --environment env --yaml app.yaml"), /maxReplicas: 1/);
});

test("always-paid services ask", () => {
  assert.equal(decision("az aks create -g rg -n k"), "ask");
  assert.equal(decision("az redis create -g rg -n r -l eastus --sku Basic --vm-size c0"), "ask");
  assert.equal(decision("az functionapp plan create -g rg -n p --sku EP1"), "ask");
});

test("deletes ask even in block mode, paid creates deny in block mode", () => {
  assert.equal(decision("az group delete -n rg --yes"), "ask");
  assert.equal(decision("az group delete -n rg --yes", "block"), "ask");
  assert.equal(decision("az appservice plan create -g rg -n p --sku B1", "block"), "deny");
});

test("warn mode only adds context; off mode is silent", () => {
  assert.equal(decision("az appservice plan create -g rg -n p --sku B1", "warn"), null);
  assert.match(context("az appservice plan create -g rg -n p --sku B1", "warn"), /warn mode/);
  assert.equal(review("az appservice plan create -g rg -n p --sku B1", "off"), null);
});

test("several az commands in one line are all checked", () => {
  const cmd = "az group create -n rg -l eastus && az appservice plan create -g rg -n p --sku F1 && az sql db create -g rg -s s -n d";
  const out = review(cmd).hookSpecificOutput;
  assert.equal(out.permissionDecision, "ask");
  assert.match(out.permissionDecisionReason, /free offer/);
});

test("template deployments and azd get a note, not a prompt", () => {
  assert.equal(decision("az deployment group create -g rg -f main.bicep"), null);
  assert.match(context("az deployment group create -g rg -f main.bicep"), /what-if/);
  assert.match(context("azd up"), /infra/);
});

test("passwordless Azure SQL setup commands pass silently", () => {
  const cmds = [
    'az sql server create -n blog-sql-k3x9a -g rg -l eastus2 --enable-ad-only-auth --external-admin-principal-type User --external-admin-name "sam_gmail.com#EXT#@samgmail.onmicrosoft.com" --external-admin-sid 00000000-0000-0000-0000-000000000000 --minimal-tls-version 1.2 -o table',
    'IP=$(curl -s https://api.ipify.org) && az sql server firewall-rule create -g rg -s srv -n azure-free-client --start-ip-address "$IP" --end-ip-address "$IP" -o none',
    "$ip = (Invoke-RestMethod https://api.ipify.org); az sql server firewall-rule create -g rg -s srv -n azure-free-client --start-ip-address $ip --end-ip-address $ip -o none",
    "az webapp identity assign -g rg -n blog-api --query principalId -o tsv",
    "az containerapp identity assign -g rg -n blog-api --system-assigned --query principalId -o tsv",
    "sqlcmd -S tcp:srv.database.windows.net,1433 -d blogdb --authentication-method ActiveDirectoryAzCli -l 60 -b -i grant-app.sql",
    'az webapp config appsettings set -g rg -n app --settings AZURE_SQL_SERVER=srv.database.windows.net AZURE_SQL_DATABASE=blogdb "ConnectionStrings__Default=Server=tcp:srv.database.windows.net,1433;Database=blogdb;Authentication=Active Directory Default" -o none',
  ];
  for (const cmd of cmds) assert.equal(review(cmd), null, cmd);
});

test("stretching the free amount is silent, scaling up asks", () => {
  assert.equal(
    review("az sql db create -g rg -s srv -n db -e GeneralPurpose -f Gen5 -c 2 --compute-model Serverless --min-capacity 0.5 --auto-pause-delay 15 --use-free-limit --free-limit-exhaustion-behavior AutoPause -o table"),
    null
  );
  assert.equal(review("az sql db update -g rg -s srv -n db --auto-pause-delay 15 --min-capacity 0.5"), null);
  assert.equal(decision("az sql db update -g rg -s srv -n db --capacity 8 --min-capacity 1"), "ask");
  assert.equal(decision("az sql db update -g rg -s srv -n db --edition Hyperscale --service-objective HS_Gen5_2"), "ask");
});

test("mode comes from the plugin option, falling back to ask", () => {
  assert.equal(modeFromEnv({}), "ask");
  assert.equal(modeFromEnv({ CLAUDE_PLUGIN_OPTION_COST_GUARD: "Block" }), "block");
  assert.equal(modeFromEnv({ CLAUDE_PLUGIN_OPTION_cost_guard: "warn" }), "warn");
  assert.equal(modeFromEnv({ CLAUDE_PLUGIN_OPTION_COST_GUARD: "nonsense" }), "ask");
});
