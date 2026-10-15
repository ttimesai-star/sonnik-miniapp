// AC8 + AC9 static checks: no payment calls, no HTML injection sinks, CSP present.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFileSync(path.join(ROOT, p), "utf8");
const CODE = ["app.js", "engine.js", "storage.js", "index.html"];

test("AC8: no payment calls in the client (stub only)", () => {
  for (const f of CODE) {
    const s = rd(f);
    for (const bad of ["openInvoice", "createInvoiceLink", "sendInvoice", "invoice_link", "XTR"]) {
      assert.ok(!s.includes(bad), `${f} contains ${bad}`);
    }
  }
});

test("AC9: no innerHTML/outerHTML/insertAdjacentHTML/document.write/eval", () => {
  for (const f of ["app.js", "engine.js", "storage.js"]) {
    const s = rd(f);
    for (const bad of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) {
      assert.ok(!s.includes(bad), `${f} contains ${bad}`);
    }
  }
});

test("AC9: CSP meta allows scripts only from self and telegram.org, no inline", () => {
  const h = rd("index.html");
  const m = h.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, "CSP meta present");
  assert.match(m[1], /script-src 'self' https:\/\/telegram\.org;/);
  assert.ok(!m[1].includes("unsafe-inline") && !m[1].includes("unsafe-eval"));
  assert.match(m[1], /connect-src 'self'/);
  assert.ok(!/<script>[^<]/.test(h), "no inline scripts");
});

test("AC4: the only external URL loaded by the page is telegram-web-app.js", () => {
  const h = rd("index.html");
  const srcs = [...h.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]);
  const loads = srcs.filter((u) => !u.startsWith("https://t.me/"));
  assert.deepEqual(loads, ["https://telegram.org/js/telegram-web-app.js"]);
});
