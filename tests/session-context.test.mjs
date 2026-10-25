// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextFor, summarize, STATE_FILE } from "../hooks/session-context.mjs";

test("no state file means no context", () => {
  const dir = mkdtempSync(join(tmpdir(), "azfree-"));
  try {
    assert.equal(contextFor(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("summarizes resources, budget and redeploy commands", () => {
  const text = summarize({
    subscription: { name: "Azure subscription 1", offer: "Free Trial" },
    region: "eastus2",
    resourceGroup: "rg-blog-free",
    budget: { name: "azure-free-monthly", amount: 1 },
    resources: [
      { role: "web", service: "static-web-app", name: "blog-web", tier: "Free", url: "https://x.azurestaticapps.net", deploy: "swa deploy ./dist --env production" },
      {
        role: "database",
        service: "azure-sql-free",
        name: "blogdb",
        auth: "Entra only; admin: signed-in user",
        appAccess: ["blog-api (system-assigned identity) in app_readwrite"],
        secrets: "none (passwordless)",
      },
    ],
  });
  assert.match(text, /rg-blog-free/);
  assert.match(text, /static-web-app "blog-web"/);
  assert.match(text, /redeploy: swa deploy/);
  assert.match(text, /budget "azure-free-monthly"/);
  assert.match(text, /auth Entra only/);
  assert.match(text, /access: blog-api \(system-assigned identity\) in app_readwrite/);
});

test("includes goals and declined suggestions when recorded", () => {
  const text = summarize({
    goals: { purpose: "small-group", privateData: "per-person", sensitive: ["contact"], needs: ["search", "history"] },
    declined: [{ feature: "temporal", on: "2026-10-29" }, { feature: "defender", on: "2026-10-29" }],
  });
  assert.match(text, /goals: purpose small-group; private data per-person; sensitive contact; needs search, history/);
  assert.match(text, /declined suggestions \(don't raise again unless goals change\): temporal, defender/);
});

test("omits goal lines when nothing is recorded", () => {
  const text = summarize({ region: "eastus2" });
  assert.doesNotMatch(text, /goals:/);
  assert.doesNotMatch(text, /declined/);
});

test("broken state file produces a repair hint instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "azfree-"));
  try {
    writeFileSync(join(dir, STATE_FILE), "{ not json");
    assert.match(contextFor(dir), /couldn't be parsed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
