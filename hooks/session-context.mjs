#!/usr/bin/env node
// azure-free session context: a SessionStart hook.
//
// If the project has a .azure-free.json state file (written by the plugin's skills), add a
// short summary of it to Claude's context so a new session knows what is already deployed.
// Projects without the file get no output, so the hook costs nothing there.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const STATE_FILE = ".azure-free.json";
const MAX_CHARS = 2000;

export function summarize(state) {
  const lines = ["This project has Azure free-tier resources tracked in .azure-free.json (azure-free plugin):"];
  const sub = state.subscription ?? {};
  const where = [
    sub.name && `subscription "${sub.name}"${sub.offer ? ` (${sub.offer})` : ""}`,
    state.region && `region ${state.region}`,
    state.resourceGroup && `resource group ${state.resourceGroup}`,
  ].filter(Boolean);
  if (where.length) lines.push(`- ${where.join(", ")}`);
  for (const r of Array.isArray(state.resources) ? state.resources : []) {
    const bits = [
      `${r.role ?? "resource"}: ${r.service ?? "?"} "${r.name ?? "?"}"`,
      r.tier && `tier ${r.tier}`,
      r.auth && `auth ${r.auth}`,
      Array.isArray(r.appAccess) && r.appAccess.length && `access: ${r.appAccess.join(", ")}`,
      r.url && r.url,
      r.deploy && `redeploy: ${r.deploy}`,
      r.secrets && `secrets in ${r.secrets}`,
    ].filter(Boolean);
    lines.push(`- ${bits.join(" | ")}`);
  }
  if (state.budget?.name) lines.push(`- cost alert: budget "${state.budget.name}" (${state.budget.amount ?? "?"} per month)`);
  else lines.push("- no budget alert recorded yet");
  const g = state.goals ?? {};
  const list = (v) => (Array.isArray(v) ? v.join(", ") : v);
  const goalBits = [
    g.purpose && `purpose ${g.purpose}`,
    g.privateData && `private data ${g.privateData}`,
    g.sensitive?.length && `sensitive ${list(g.sensitive)}`,
    g.needs?.length && `needs ${list(g.needs)}`,
  ].filter(Boolean);
  if (goalBits.length) lines.push(`- goals: ${goalBits.join("; ")}`);
  const declined = (Array.isArray(state.declined) ? state.declined : []).map((d) => d?.feature).filter(Boolean);
  if (declined.length) lines.push(`- declined suggestions (don't raise again unless goals change): ${declined.join(", ")}`);
  if (state.updated) lines.push(`- state last updated ${state.updated}`);
  lines.push(
    "Use the azure-free skills (/azure-free:start, :web, :database, :status, :cleanup) for changes, keep everything on free tiers unless the user explicitly agrees to pay, and update .azure-free.json after creating or deleting resources."
  );
  const text = lines.join("\n");
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text;
}

export function contextFor(projectDir) {
  const path = join(projectDir, STATE_FILE);
  if (!existsSync(path)) return null;
  try {
    return summarize(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return `This project has a ${STATE_FILE} file (azure-free plugin), but it couldn't be parsed. Read and repair it before relying on it.`;
  }
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const event = input ? JSON.parse(input) : {};
  const projectDir = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();
  const text = contextFor(projectDir);
  if (!text) return;
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } })
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => process.exit(0));
}
