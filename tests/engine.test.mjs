// AC1 + AC3: parity of engine.js with the Python reference (fixtures made by dreams.py)
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const E = require("../engine.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFileSync(path.join(ROOT, p), "utf8");
const sha = (p) => createHash("sha256").update(readFileSync(path.join(ROOT, p))).digest("hex");

const dicts = {
  ru: E.compile(JSON.parse(rd("dictionary/symbols.json"))),
  en: E.compile(JSON.parse(rd("dictionary/symbols_en.json"))),
};
const fx = {
  ru: JSON.parse(rd("fixtures/parity_ru.json")),
  en: JSON.parse(rd("fixtures/parity_en.json")),
};

test("AC3: dictionary sha256 equals the one the fixtures were made from", () => {
  for (const lang of ["ru", "en"]) {
    const meta = fx[lang]._;
    assert.equal(sha("dictionary/symbols.json"), meta["symbols.json"], lang);
    assert.equal(sha("dictionary/symbols_en.json"), meta["symbols_en.json"], lang);
  }
});

test("AC3: dictionary equals the bot's source of truth when the bot is next to us", (t) => {
  const bot = path.resolve(ROOT, "..", "saas_dream");
  if (!existsSync(path.join(bot, "symbols.json"))) return t.skip("bot dictionary not present (CI)");
  const h = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
  assert.equal(h(path.join(bot, "symbols.json")), sha("dictionary/symbols.json"));
  assert.equal(h(path.join(bot, "symbols_en.json")), sha("dictionary/symbols_en.json"));
});

test("dictionary: 178 symbols per language, same keys, no empty stems", () => {
  assert.equal(dicts.ru.length, 178);
  assert.equal(dicts.en.length, 178);
  assert.deepEqual(dicts.ru.map((e) => e.key), dicts.en.map((e) => e.key));
  for (const d of [dicts.ru, dicts.en]) {
    for (const e of d) {
      assert.ok(e.stems.length > 0, e.key);
      for (const s of e.stems) assert.ok(s.needle.length > 0, `${e.key}: empty stem`);
    }
  }
});

for (const lang of ["ru", "en"]) {
  const cases = fx[lang].cases;
  test(`AC1: ${lang} fixtures >= 200 cases`, () => assert.ok(cases.length >= (lang === "ru" ? 200 : 200)));

  test(`AC1: ${lang} norm/symbols/tone/mood_said/short/tone_note match Python on every case`, () => {
    let n = 0;
    for (const c of cases) {
      assert.equal(E.norm(c.text), c.norm, `norm: ${c.text}`);
      const full = E.read(c.text, lang, dicts, true);
      assert.deepEqual(full.symbols, c.symbols, `symbols: ${c.text}`);
      assert.equal(full.tone, c.tone, `tone: ${c.text}`);
      assert.equal(full.moodSaid, c.mood_said, `mood_said: ${c.text}`);
      const short = E.read(c.text, lang, dicts, false);
      assert.deepEqual(short.shown.map((e) => e.key), c.short_shown, `short: ${c.text}`);
      // classic() puts the note into the short reading only when feelings were written about
      assert.equal(short.toneNote !== null, c.tone_note_in_short, `note flag: ${c.text}`);
      if (short.toneNote !== null) assert.equal(short.toneNote, c.tone_note, `note: ${c.text}`);
      n++;
    }
    assert.equal(n, cases.length);
  });
}

test("trap: 'рядом' is not 'дом', 'спокойно' is not 'покойник'", () => {
  const r = E.read("Мы сидели рядом, было спокойно", "ru", dicts, true);
  assert.ok(!r.symbols.includes("дом"));
  assert.ok(!r.symbols.includes("покойник"));
});

test("no symbols -> no tone note even if mood words present (never invent)", () => {
  const r = E.read("xyz qwerty было страшно", "ru", dicts, true);
  assert.deepEqual(r.symbols, []);
  assert.equal(r.moodSaid, true);
  assert.equal(r.toneNote, null);
});

test("ё/е and NBSP are normalised; astral characters do not break matching", () => {
  assert.equal(E.norm("Тёмная вода!!"), "темная вода ");
  const r = E.read("😀😀 тёмная вода 😀 и змея", "ru", dicts, true);
  assert.ok(r.symbols.includes("вода") && r.symbols.includes("змея"));
});

test("empty / null input", () => {
  assert.equal(E.norm(null), "");
  assert.deepEqual(E.read("", "ru", dicts, true).symbols, []);
  assert.equal(E.tone("", "ru"), "ровный");
});

test("recurring: once per dream, 30-day window, min 2, order by count", () => {
  const D = 86400000, now = 100 * D;
  const entries = [
    { created: now - 40 * D, symbols: ["вода", "змея"] },      // outside the window
    { created: now - 10 * D, symbols: ["вода", "вода", "дом"] }, // duplicates inside one dream count once
    { created: now - 5 * D, symbols: ["вода", "дом"] },
    { created: now - 1 * D, symbols: ["вода"] },
  ];
  assert.deepEqual(E.recurring(entries, now), [["вода", 3], ["дом", 2]]);
  assert.deepEqual(E.recurring([], now), []);
});

test("timesWord", () => {
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25].map((n) => E.timesWord(n, "ru")),
    ["раз", "раза", "раз", "раз", "раз", "раз", "раза", "раз"]);
  assert.equal(E.timesWord(1, "en"), "time");
  assert.equal(E.timesWord(3, "en"), "times");
});
