#!/usr/bin/env node
// azure-free cost guard: a PreToolUse hook for the Bash and PowerShell tools.
//
// It reads the command Claude is about to run, finds every `az` / `azd` invocation in it,
// and flags the ones that would create a paid resource, move something onto a paid tier,
// or delete stored data. It never runs anything itself and fails open: if anything goes
// wrong inside the guard, the command proceeds through the normal permission flow.
//
// Mode comes from the plugin option `cost_guard` (ask | block | warn | off), default ask.

import { pathToFileURL } from "node:url";

const MODES = new Set(["ask", "block", "warn", "off"]);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Split a command line into segments of tokens. Understands single and double quotes,
 * bash (`\`) and PowerShell (backtick) line continuations, comments, redirections, and
 * the separators both shells share: newlines ; && || | & ( ) { } $( and backticks.
 * Text inside quotes never starts a new segment, so `echo "az sql db create"` is inert.
 */
export function segments(command) {
  const text = command.replace(/\\\r?\n/g, " ").replace(/`\r?\n/g, " ");
  const out = [];
  let tokens = [];
  let cur = null; // token in progress, or null between tokens
  let quote = null;

  const endToken = () => {
    if (cur !== null) tokens.push(cur);
    cur = null;
  };
  const endSegment = () => {
    endToken();
    if (tokens.length) out.push(tokens);
    tokens = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if ((ch === "\\" || ch === "`") && text[i + 1] === '"') cur += text[++i];
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      if (cur === null) cur = "";
      continue;
    }
    if (ch === " " || ch === "\t") {
      endToken();
      continue;
    }
    if (ch === "#" && cur === null) {
      while (i + 1 < text.length && text[i + 1] !== "\n") i++;
      continue;
    }
    if (ch === ">" || ch === "<") {
      if (cur !== null && /^\d$/.test(cur)) cur = null; // drop the fd in 2>&1
      endSegment();
      continue;
    }
    if ("\r\n;|&(){}`".includes(ch)) {
      endSegment();
      continue;
    }
    if (ch === "$" && text[i + 1] === "(") {
      endSegment();
      i++;
      continue;
    }
    if (cur === null) cur = "";
    cur += ch;
  }
  endSegment();
  return out;
}

const AZ_RE = /^(?:.*[\\/])?az(?:\.cmd|\.exe|\.ps1)?$/i;
const AZD_RE = /^(?:.*[\\/])?azd(?:\.exe)?$/i;
const isFlag = (t) => /^--?[a-zA-Z]/.test(t);

/** Turn the tokens after `az` into a lowercase command path and a map of flags. */
export function parseArgs(args) {
  const path = [];
  let j = 0;
  while (j < args.length && !isFlag(args[j])) path.push(args[j++].toLowerCase());
  const flags = new Map();
  while (j < args.length) {
    const tok = args[j++];
    if (!isFlag(tok)) continue;
    let name = tok;
    let value;
    const eq = tok.indexOf("=");
    if (tok.startsWith("--") && eq > 2) {
      name = tok.slice(0, eq);
      value = tok.slice(eq + 1);
    } else {
      const vals = [];
      while (j < args.length && !isFlag(args[j])) vals.push(args[j++]);
      value = vals.length ? vals.join(" ") : true;
    }
    name = name.toLowerCase();
    const prev = flags.get(name);
    flags.set(name, prev === undefined ? value : `${prev} ${value}`);
  }
  return { path: path.join(" "), flags };
}

/** Every az / azd invocation in a command line, parsed. */
export function findInvocations(command) {
  const found = [];
  for (const tokens of segments(command)) {
    const i = tokens.findIndex((t) => AZ_RE.test(t) || AZD_RE.test(t));
    if (i === -1) continue;
    const tool = AZD_RE.test(tokens[i]) ? "azd" : "az";
    found.push({ tool, ...parseArgs(tokens.slice(i + 1)) });
  }
  return found;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const cost = (text) => ({ level: "cost", text });
const danger = (text) => ({ level: "danger", text });
const note = (text) => ({ level: "note", text });

const get = (flags, ...names) => {
  for (const n of names) if (flags.has(n)) return flags.get(n);
  return undefined;
};
const str = (v) => (v === undefined ? "" : v === true ? "true" : String(v));
const isDynamic = (v) => typeof v === "string" && /\$|%\w+%/.test(v);
const truthy = (v) => v === true || /^(true|yes|1|enabled)$/i.test(str(v));
const disabled = (v) => /^(false|no|0|disabled)$/i.test(str(v));
const named = (flags) => {
  const n = get(flags, "--name", "-n", "--resource-group", "-g");
  return n === undefined || n === true ? "" : ` "${n}"`;
};

/** A SKU-ish flag must match `free`; returns a finding or null. */
function requireFree(value, free, { what, missing, fix }) {
  if (value === undefined) return missing ? cost(missing) : null;
  if (isDynamic(value)) return cost(`Couldn't check the ${what} (${value} is a variable). ${fix}`);
  if (!free.test(str(value))) return cost(`${what} ${value} is billed. ${fix}`);
  return null;
}

const F1 = /^(f1|free)$/i;
const B1MS = /^(standard_)?b1ms$/i;
const BURSTABLE = /^burstable$/i;

const ALWAYS_PAID = {
  "aks create": "AKS clusters bill for their node VMs, disks and load balancer around the clock.",
  "redis create": "Azure Cache for Redis has no free tier; even the smallest cache bills hourly.",
  "redisenterprise create": "Azure Managed Redis has no free tier; it bills hourly.",
  "network application-gateway create": "Application Gateway bills hourly whether or not it serves traffic.",
  "network firewall create": "Azure Firewall bills hourly whether or not it serves traffic.",
  "network vnet-gateway create": "VPN and ExpressRoute gateways bill hourly.",
  "network bastion create": "Azure Bastion bills hourly.",
  "network nat gateway create": "NAT Gateway bills hourly plus data processed.",
  "afd profile create": "Azure Front Door profiles carry a monthly base fee.",
  "sql mi create": "SQL Managed Instance bills per vCore-hour; only a limited 12-month free-account allowance exists, and the defaults exceed it.",
  "sql elastic-pool create": "Elastic pools are billed and can't hold free-offer databases.",
  "sql db replica create": "Database replicas are billed and aren't part of the free offer.",
  "sql db copy": "Copies of a free-offer database aren't free; the copy is billed.",
  "postgres flexible-server replica create": "Read replicas are billed separately from the 12-month free server.",
  "mysql flexible-server replica create": "Read replicas are billed separately from the 12-month free server.",
  "postgres server create": "Azure Database for PostgreSQL Single Server is retired and was never free; use postgres flexible-server.",
  "mysql server create": "Azure Database for MySQL Single Server is retired and was never free; use mysql flexible-server.",
  "functionapp plan create": "Functions Premium and Dedicated plans bill continuously. For free usage skip the plan and run az functionapp create --flexconsumption-location <region>.",
  "acr create": "Azure Container Registry has no always-free tier (it bills daily). New free accounts get Standard free for 12 months; otherwise push images to a free registry such as a public ghcr.io package.",
};

const DATA_LOSS = new Set([
  "group delete",
  "sql db delete",
  "sql server delete",
  "cosmosdb delete",
  "cosmosdb sql database delete",
  "cosmosdb sql container delete",
  "cosmosdb mongodb database delete",
  "cosmosdb mongodb collection delete",
  "postgres flexible-server delete",
  "mysql flexible-server delete",
  "storage account delete",
]);

const TEMPLATE_DEPLOYS = new Set([
  "deployment group create",
  "deployment sub create",
  "stack group create",
  "stack sub create",
]);

const RULES = {
  "appservice plan create": (f) => [
    requireFree(get(f, "--sku"), F1, {
      what: "App Service plan SKU",
      missing: "az appservice plan create without --sku makes a paid Basic (B1) plan. Add --sku F1 for the free tier.",
      fix: "The free tier is --sku F1.",
    }),
  ],
  "appservice plan update": (f) => [
    requireFree(get(f, "--sku"), F1, { what: "App Service plan SKU", fix: "The free tier is F1." }),
  ],
  "webapp up": (f) => [
    note("az webapp up is deprecated in newer Azure CLI releases; prefer az appservice plan create --sku F1, then az webapp create and az webapp deploy."),
    requireFree(get(f, "--sku"), F1, {
      what: "App Service SKU",
      missing: "az webapp up without --sku can create a paid App Service plan. Add --sku F1.",
      fix: "The free tier is F1.",
    }),
  ],
  "staticwebapp create": (f) => [
    requireFree(get(f, "--sku"), /^free$/i, {
      what: "Static Web Apps plan",
      fix: "Standard bills monthly per app; use --sku Free (the default).",
    }),
  ],
  "staticwebapp update": (f) => [
    requireFree(get(f, "--sku"), /^free$/i, {
      what: "Static Web Apps plan",
      fix: "Standard bills monthly per app; stay on Free.",
    }),
  ],
  "functionapp create": (f) => {
    const out = [];
    if (get(f, "--always-ready-instances") !== undefined)
      out.push(cost("Always-ready instances aren't covered by the Flex Consumption free grant; they bill continuously."));
    if (get(f, "--consumption-plan-location", "-c") !== undefined && /linux/i.test(str(get(f, "--os-type"))))
      out.push(note("Linux Consumption is a legacy plan retiring on 2028-09-30; prefer --flexconsumption-location <region>."));
    return out;
  },
  "containerapp up": (f) => {
    const out = [
      cost("az containerapp up can't set --max-replicas, so the app gets the default of up to 10 replicas, and every busy replica past the free grant is billed. Use az containerapp create with --min-replicas 0 --max-replicas 1 instead."),
    ];
    const source = get(f, "--source", "--repo");
    if (source !== undefined && get(f, "--registry-server") === undefined)
      out.push(cost("az containerapp up --source/--repo builds an image and can create an Azure Container Registry for it, which has no always-free tier. To stay at $0, push the image to a free registry (for example a public ghcr.io package) and pass --image, or pass --registry-server for a registry you already pay for."));
    return out;
  },
  "containerapp env create": (f) => {
    const dest = get(f, "--logs-destination");
    if (dest !== undefined && !/log-analytics/i.test(str(dest))) return [];
    return [
      note("This Container Apps environment will send logs to a new Log Analytics workspace; ingestion past the monthly free allowance is billed. For a hobby app, --logs-destination none avoids that (az containerapp logs show still streams console logs)."),
    ];
  },
  "containerapp env workload-profile add": (f) => workloadProfile(f),
  "containerapp env workload-profile update": (f) => workloadProfile(f),
  "containerapp create": (f) => [...minReplicas(f), ...maxReplicas(f, { creating: true })],
  "containerapp update": (f) => [...minReplicas(f), ...maxReplicas(f, { creating: false })],
  "sql db create": (f) => {
    const free = get(f, "--use-free-limit", "--free-limit");
    if (free === undefined || disabled(free))
      return [
        cost("This Azure SQL database isn't using the free offer, so it's a regular billed database. Add --use-free-limit --free-limit-exhaustion-behavior AutoPause (with -e GeneralPurpose -f Gen5 -c 2 --compute-model Serverless)."),
      ];
    const out = [];
    const fleb = get(f, "--free-limit-exhaustion-behavior", "--exhaustion-behavior", "--fleb");
    if (fleb === undefined)
      out.push(cost("Free-offer database without --free-limit-exhaustion-behavior. Set it to AutoPause explicitly so the database pauses, instead of billing, when the monthly free amount runs out."));
    else if (/billoverusage|billforusage/i.test(str(fleb)))
      out.push(cost("BillOverUsage keeps the database running and bills for everything past the monthly free amount, and it can never be switched back to AutoPause."));
    if (get(f, "--elastic-pool") !== undefined)
      out.push(cost("Free-offer databases can't live in an elastic pool, and elastic pools are billed."));
    return out;
  },
  "sql db update": (f) => {
    const out = [];
    const fleb = get(f, "--free-limit-exhaustion-behavior", "--exhaustion-behavior", "--fleb");
    if (/billoverusage|billforusage/i.test(str(fleb)))
      out.push(cost("Switching to BillOverUsage is one-way: the database will bill past the monthly free amount and can't go back to AutoPause."));
    const free = get(f, "--use-free-limit", "--free-limit");
    if (free !== undefined && disabled(free)) out.push(cost("Turning off the free limit makes this a regular billed database."));
    if (get(f, "--edition", "--tier", "-e", "--service-objective", "--capacity", "-c", "--compute-model", "--family", "-f") !== undefined)
      out.push(cost("Changing the edition, size or compute model can take a database out of the free offer, after which it bills normally."));
    return out;
  },
  "cosmosdb create": (f) => {
    const out = [];
    if (/enableserverless/i.test(str(get(f, "--capabilities"))))
      out.push(cost("Serverless Cosmos DB accounts can't use the free tier; every request is billed. Drop EnableServerless and use --enable-free-tier true."));
    if (!truthy(get(f, "--enable-free-tier")))
      out.push(cost("This Cosmos DB account isn't on the free tier, and free tier can only be chosen when the account is created. Add --enable-free-tier true (one free-tier account per subscription)."));
    if ((str(get(f, "--locations")).match(/regionname=/gi) || []).length > 1)
      out.push(cost("Each extra Cosmos DB region multiplies throughput and storage charges; the free tier covers one region's worth (1000 RU/s, 25 GB)."));
    return out;
  },
  "cosmosdb mongocluster create": (f) => {
    if (/^free$/i.test(str(get(f, "--shard-node-tier", "--tier")))) return [];
    return [
      cost("Couldn't confirm this Azure DocumentDB (MongoDB vCore) cluster is on the free tier; paid tiers bill hourly. The free tier is easiest to pick in the Azure portal with the Free tier checkbox."),
    ];
  },
  "postgres flexible-server create": (f) => {
    const out = flexibleServerChecks(f, "PostgreSQL", { defaultsArePaid: true });
    if (!out.some((x) => x.level === "cost"))
      out.push(note("PostgreSQL Burstable B1ms with 32 GB is free for 12 months only on subscriptions that got the free account's 12-month services; afterwards it bills monthly. Stopping the server (az postgres flexible-server stop) saves free hours."));
    return out;
  },
  "postgres flexible-server update": (f) => flexibleServerChecks(f, "PostgreSQL", { defaultsArePaid: false }),
  "mysql flexible-server create": (f) => {
    const out = flexibleServerChecks(f, "MySQL", { defaultsArePaid: false });
    if (!disabled(get(f, "--auto-scale-iops")))
      out.push(note("MySQL auto-scale IOPS defaults to Enabled and extra IOPS can bill; add --auto-scale-iops Disabled to stay inside the free offer."));
    if (!out.some((x) => x.level === "cost"))
      out.push(note("MySQL Burstable B1ms with 32 GB is free for 12 months only on subscriptions that got the free account's 12-month services; afterwards it bills monthly."));
    return out;
  },
  "mysql flexible-server update": (f) => flexibleServerChecks(f, "MySQL", { defaultsArePaid: false }),
  "vm create": (f) => {
    const size = get(f, "--size");
    if (size !== undefined && /^standard_(b1s|b2pts_v2|b2ats_v2)$/i.test(str(size)))
      return [note("This VM size is free for 750 hours/month for 12 months only on new free accounts; its disks and public IP can still bill.")];
    return [
      cost(size === undefined
        ? "az vm create without --size uses a paid default size. VMs are free only as Standard_B1s, Standard_B2pts_v2 or Standard_B2ats_v2, for 12 months on new free accounts."
        : `VM size ${size} bills hourly. Free-account sizes are Standard_B1s, Standard_B2pts_v2 and Standard_B2ats_v2 (12 months only).`),
    ];
  },
};

function workloadProfile(f) {
  const type = get(f, "--workload-profile-type");
  if (type === undefined || /^consumption$/i.test(str(type))) return [];
  return [cost(`Dedicated workload profile ${type} bills per instance-hour plus a management fee; the free grant covers the Consumption profile only.`)];
}

function minReplicas(f) {
  const min = get(f, "--min-replicas");
  if (min === undefined) return [];
  if (isDynamic(min)) return [cost(`Couldn't check --min-replicas (${min} is a variable). Anything above 0 keeps replicas running all month and can outrun the free grant.`)];
  if (Number(min) >= 1)
    return [cost(`--min-replicas ${min} keeps a replica running all month, which can use up the Container Apps free grant and then bill. Use --min-replicas 0 to scale to zero when idle.`)];
  return [];
}

// Container Apps bills every busy replica past the free grant, with no cap, so the replica
// ceiling is the only limit on the bill. The platform default is 10.
function maxReplicas(f, { creating }) {
  const max = get(f, "--max-replicas");
  if (max === undefined) {
    if (!creating) return [];
    if (get(f, "--yaml") !== undefined)
      return [note("Couldn't check the replica limits inside the YAML file. Make sure it sets maxReplicas: 1; the default is 10, and busy replicas past the free grant are billed.")];
    return [cost("No --max-replicas given, so Container Apps allows up to 10 replicas, and every busy replica past the free grant is billed (about $0.027/hour each at 0.25 vCPU). Add --max-replicas 1.")];
  }
  if (isDynamic(max)) return [cost(`Couldn't check --max-replicas (${max} is a variable). Each busy replica past the free grant is billed; use --max-replicas 1.`)];
  if (Number(max) > 1)
    return [cost(`--max-replicas ${max} lets the app run up to ${max} replicas, and every busy replica past the free grant is billed (about $0.027/hour each at 0.25 vCPU). Use --max-replicas 1 for a hobby app.`)];
  return [];
}

function flexibleServerChecks(f, engine, { defaultsArePaid }) {
  const out = [];
  const fix = "The free offer is --tier Burstable --sku-name Standard_B1ms --storage-size 32.";
  const tier = requireFree(get(f, "--tier"), BURSTABLE, {
    what: `${engine} tier`,
    missing: defaultsArePaid ? `No --tier given; ${engine} defaults to General Purpose, which bills hourly. ${fix}` : null,
    fix,
  });
  const sku = requireFree(get(f, "--sku-name"), B1MS, {
    what: `${engine} compute size`,
    missing: defaultsArePaid ? `No --sku-name given; ${engine} defaults to a General Purpose size, which bills hourly. ${fix}` : null,
    fix,
  });
  if (tier) out.push(tier);
  if (sku) out.push(sku);
  const storage = get(f, "--storage-size");
  if (storage === undefined) {
    if (defaultsArePaid) out.push(cost(`No --storage-size given; ${engine} defaults to 128 GB and only 32 GB is free. Add --storage-size 32.`));
  } else if (isDynamic(storage) || !(Number(storage) <= 32)) {
    out.push(cost(`${engine} storage ${storage} GB is over the 32 GB free allowance.`));
  }
  const ha = get(f, "--high-availability", "--zonal-resiliency");
  if (ha !== undefined && !disabled(ha)) out.push(cost(`High availability doubles ${engine} compute and isn't covered by the free offer.`));
  if (truthy(get(f, "--geo-redundant-backup"))) out.push(cost(`Geo-redundant backup storage for ${engine} isn't covered by the free offer.`));
  return out;
}

/** Findings for one parsed invocation. */
export function check({ tool, path, flags }) {
  if (flags.has("--help") || flags.has("-h")) return [];
  if (tool === "azd") {
    if (/^(up|provision)\b/.test(path))
      return [note("azd templates often provision paid SKUs (Basic App Service plans, General Purpose databases, container registries). Check sku/tier values under infra/ before provisioning.")];
    return [];
  }
  if (DATA_LOSS.has(path))
    return [danger(`az ${path}${named(flags)} permanently deletes it and the data it holds. This can't be undone.`)];
  if (TEMPLATE_DEPLOYS.has(path))
    return [note("Template deployments can create paid SKUs this guard can't see. Check sku/tier values in the template (or run the matching what-if command) before deploying.")];
  if (ALWAYS_PAID[path]) return [cost(ALWAYS_PAID[path])];
  if (/^cosmosdb (sql|mongodb|cassandra|gremlin|table) /.test(path) && /( create| update| migrate)$/.test(path))
    return cosmosThroughput(path, flags);
  const rule = RULES[path];
  return rule ? rule(flags).filter(Boolean) : [];
}

function cosmosThroughput(path, f) {
  const out = [];
  for (const name of ["--throughput", "--max-throughput"]) {
    const v = get(f, name);
    if (v === undefined || v === true) continue;
    if (isDynamic(v)) out.push(cost(`Couldn't check ${name} (${v} is a variable). The free tier covers 1000 RU/s for the whole account.`));
    else if (Number(v) > 1000) out.push(cost(`${v} RU/s is more than the free tier's 1000 RU/s for the whole account; the excess bills hourly.`));
    else if (/ (container|collection|graph|table) create$/.test(path))
      out.push(note("The free tier's 1000 RU/s is shared by every database and container in the account; dedicated container throughput adds to that total. A shared-throughput database is the easiest way to stay under it."));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

const bullets = (list) => list.map((f) => `- ${f.text}`).join("\n");

/** The hook's JSON output for a command, or null to stay silent. */
export function review(command, mode = "ask") {
  if (mode === "off" || typeof command !== "string" || !/\bazd?\b/i.test(command)) return null;
  const findings = findInvocations(command).flatMap(check);
  if (!findings.length) return null;

  const costly = findings.filter((f) => f.level === "cost");
  const risky = findings.filter((f) => f.level === "danger");
  const notes = findings.filter((f) => f.level === "note");
  const out = { hookEventName: "PreToolUse" };
  const context = [];

  if (mode === "warn") {
    context.push(`azure-free cost guard (warn mode) flagged this command:\n${bullets(findings)}`);
  } else if (costly.length && mode === "block") {
    out.permissionDecision = "deny";
    out.permissionDecisionReason =
      `azure-free cost guard blocked this command:\n${bullets([...costly, ...risky])}\n` +
      "Use the free option instead. If the user really wants a paid resource, they can switch the plugin's cost_guard option to ask.";
  } else if (costly.length || risky.length) {
    const parts = [];
    if (costly.length) parts.push(`This may cost money:\n${bullets(costly)}`);
    if (risky.length) parts.push(`This deletes data:\n${bullets(risky)}`);
    out.permissionDecision = "ask";
    out.permissionDecisionReason = `azure-free guard. ${parts.join("\n")}`;
    context.push(
      `The azure-free guard paused this command for the user's approval:\n${bullets([...costly, ...risky])}\n` +
        "If they decline, offer the free alternative rather than retrying."
    );
  }
  if (mode !== "warn" && notes.length) context.push(`azure-free notes:\n${bullets(notes)}`);
  if (context.length) out.additionalContext = context.join("\n\n");
  return out.permissionDecision || out.additionalContext ? { hookSpecificOutput: out } : null;
}

export function modeFromEnv(env = process.env) {
  const raw = env.CLAUDE_PLUGIN_OPTION_COST_GUARD ?? env.CLAUDE_PLUGIN_OPTION_cost_guard ?? env.AZURE_FREE_COST_GUARD ?? "ask";
  const mode = String(raw).trim().toLowerCase();
  return MODES.has(mode) ? mode : "ask";
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const event = JSON.parse(input);
  if (event.tool_name !== "Bash" && event.tool_name !== "PowerShell") return;
  const result = review(event.tool_input?.command, modeFromEnv());
  if (result) process.stdout.write(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => process.exit(0));
}
