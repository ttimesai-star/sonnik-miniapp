// AC5 (storage part): CloudStorage primary, localStorage fallback, nothing dropped silently
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const S = require("../storage.js");

function mockLocal() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _m: m,
  };
}

// CloudStorage mock with the real limits and callback API (async like Telegram's)
function mockCloud({ failSet = false, failGet = false } = {}) {
  const m = new Map();
  const later = (cb, ...a) => setTimeout(() => cb(...a), 0);
  return {
    _m: m, failSet, failGet,
    setItem(k, v, cb) {
      if (this.failSet) return later(cb, "SERVER_ERROR");
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(k)) return later(cb, "KEY_INVALID");
      if (String(v).length > 4096) return later(cb, "VALUE_INVALID");
      if (!m.has(k) && m.size >= 1024) return later(cb, "KEYS_TOO_MANY");
      m.set(k, String(v)); later(cb, null, true);
    },
    getItem(k, cb) { later(cb, null, m.get(k) ?? ""); },
    getItems(keys, cb) {
      if (this.failGet) return later(cb, "SERVER_ERROR");
      const o = {}; keys.forEach((k) => (o[k] = m.get(k) ?? "")); later(cb, null, o);
    },
    getKeys(cb) { this.failGet ? later(cb, "SERVER_ERROR") : later(cb, null, [...m.keys()]); },
    removeItem(k, cb) { m.delete(k); later(cb, null, true); },
    removeItems(ks, cb) { ks.forEach((k) => m.delete(k)); later(cb, null, true); },
  };
}

const dream = (n, extra = {}) => ({ created: 1000 + n, text: `сон ${n}`, symbols: ["вода"], mood: "ровный", lang: "ru", ...extra });

test("cloud: add -> list round-trip, newest first, keys valid for CloudStorage", async () => {
  const cloud = mockCloud();
  const st = S.create({ cloud, local: mockLocal() });
  assert.equal(st.kind, "cloud");
  assert.deepEqual(await st.add(dream(1)), { ok: true, where: "cloud", id: (await st.list()).entries[0].id });
  await st.add(dream(2));
  const { entries, pending, cloudError } = await st.list();
  assert.deepEqual(entries.map((e) => e.text), ["сон 2", "сон 1"]);
  assert.equal(pending, 0);
  assert.equal(cloudError, false);
  for (const k of cloud._m.keys()) assert.match(k, /^[A-Za-z0-9_-]{1,128}$/);
});

test("cloud: 60 entries are read in batches", async () => {
  const st = S.create({ cloud: mockCloud(), local: mockLocal() });
  for (let i = 0; i < 60; i++) await st.add(dream(i));
  assert.equal((await st.list()).entries.length, 60);
});

test("cloud write failure -> entry kept locally, shown, pushed to the cloud on the next list()", async () => {
  const cloud = mockCloud({ failSet: true });
  const local = mockLocal();
  const st = S.create({ cloud, local });
  const r = await st.add(dream(1));
  assert.equal(r.where, "local");
  assert.equal(r.cloudError, true);
  let l = await st.list();
  assert.equal(l.entries.length, 1);          // not lost, visible
  assert.equal(l.pending, 1);                 // reported as not synced
  cloud.failSet = false;
  l = await st.list();
  assert.equal(l.pending, 0);
  assert.equal(cloud._m.size, 1);             // now in the cloud
  assert.equal([...local._m.keys()].filter((k) => k.includes(":d_")).length, 0); // local copy removed
});

test("cloud read failure -> falls back to local entries, flagged", async () => {
  const cloud = mockCloud({ failGet: true });
  const st = S.create({ cloud, local: mockLocal() });
  await st.add(dream(1));
  const l = await st.list();
  assert.equal(l.cloudError, true);
});

test("local only (no CloudStorage): add/list/remove/clear", async () => {
  const st = S.create({ cloud: null, local: mockLocal() });
  assert.equal(st.kind, "local");
  const a = await st.add(dream(1));
  const b = await st.add(dream(2));
  assert.equal(a.where, "local");
  let l = await st.list();
  assert.equal(l.entries.length, 2);
  await st.remove(a.id);
  l = await st.list();
  assert.deepEqual(l.entries.map((e) => e.id), [b.id]);
  await st.clear([b.id]);
  assert.equal((await st.list()).entries.length, 0);
});

test("no storage at all (private mode): works in memory", async () => {
  const st = S.create({ cloud: null, local: null });
  await st.add(dream(1));
  assert.equal((await st.list()).entries.length, 1);
});

test("localStorage that throws (quota/blocked) does not crash", async () => {
  const bad = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); },
                removeItem() { throw new Error("blocked"); }, key() { throw new Error("blocked"); }, length: 1 };
  const st = S.create({ cloud: null, local: bad });
  const r = await st.add(dream(1));
  assert.equal(r.ok, true);
  assert.equal((await st.list()).entries.length, 1);
});

test("limits: text cut to 2000, value under 4096 even for escaped/emoji text, 900 entries cap", async () => {
  const cloud = mockCloud();
  const st = S.create({ cloud, local: mockLocal() });
  const r = await st.add(dream(1, { text: "ё😀\"\\\n".repeat(1000) }));
  assert.equal(r.where, "cloud");                // would be 'local' if the cloud had rejected the size
  const e = (await st.list()).entries[0];
  assert.ok(e.text.length <= 2000);
  for (const v of cloud._m.values()) assert.ok(v.length <= 4096);
  assert.deepEqual(await st.add(dream(2), 900), { ok: false, reason: "full" });
});

test("unpack ignores corrupted values", () => {
  assert.equal(S.unpack("d_x", "not json"), null);
  assert.equal(S.unpack("d_x", JSON.stringify({ t: "no created" })), null);
});

test("settings round-trip (language) cloud and local", async () => {
  const st = S.create({ cloud: mockCloud(), local: mockLocal() });
  await st.setSetting("lang", "en");
  assert.equal(await st.getSetting("lang"), "en");
  const st2 = S.create({ cloud: null, local: mockLocal() });
  assert.equal(await st2.getSetting("lang"), null);
  await st2.setSetting("lang", "ru");
  assert.equal(await st2.getSetting("lang"), "ru");
});
