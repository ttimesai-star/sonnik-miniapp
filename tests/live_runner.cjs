// helper for parity_live.py: reads JSON {cases:[{text,lang}], recurring:{...}} from stdin, prints engine results
const fs = require("fs");
const path = require("path");
const E = require("../engine.js");
const root = path.resolve(__dirname, "..");
const dicts = {
  ru: E.compile(JSON.parse(fs.readFileSync(path.join(root, "dictionary/symbols.json"), "utf8"))),
  en: E.compile(JSON.parse(fs.readFileSync(path.join(root, "dictionary/symbols_en.json"), "utf8"))),
};
const inp = JSON.parse(fs.readFileSync(0, "utf8"));
const cases = inp.cases.map((c) => {
  const r = E.read(c.text, c.lang, dicts, true);
  const s = E.read(c.text, c.lang, dicts, false);
  return { norm: E.norm(c.text), symbols: r.symbols, tone: r.tone, said: r.moodSaid,
           short: s.shown.map((e) => e.key), note_in_short: s.toneNote !== null };
});
const rec = inp.recurring
  ? E.recurring(inp.recurring.entries, inp.recurring.now_ms, inp.recurring.days, inp.recurring.min_times)
  : null;
process.stdout.write(JSON.stringify({ cases, recurring: rec }));
