/* engine.js — the dictionary engine of "Veshiy" (dream diary), ported 1:1 from
 * projects/saas_dream/dreams.py: norm, _has_stem, find_symbols, tone, mood_said,
 * the dictionary part of classic()/folk(), recurring(), times_word().
 *
 * Why no RegExp for word boundaries: in JS `\b` and `\w` are ASCII-only, in Python
 * they are Unicode-aware. Character classes are spelled out (as in the Kotlin port
 * in projects/android_dream_diary) so the same text gives the same result in the
 * bot, on a phone and here.
 *
 * Works in a browser (window.DreamEngine) and in Node (module.exports).
 * No network, no storage, no DOM: pure functions.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DreamEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FREE_SYMBOLS = 3; // symbols in the short reading (dreams.FREE_SYMBOLS)

  // Mood words, verbatim from dreams.py. "тяжёл"/"лёгк" with ё never match the
  // normalised text (ё -> е); kept as-is for parity with the bot.
  var DARK = ["страш", "жутк", "боял", "боюсь", "тревож", "паник", "ужас", "кошмар",
    "плак", "грустн", "тоск", "злил", "злост", "одинок", "тяжел", "тяжёл",
    "не мог", "не могл", "задыха", "кричал", "убега", "преслед", "терял",
    "потерял", "больно", "холодн", "темн", "мрачн"];
  var LIGHT = ["радост", "счастл", "легк", "лёгк", "спокойн", "тепл", "свет", "смея",
    "улыб", "приятн", "хорошо", "красив", "любл", "обнял", "нежн", "ярк",
    "летал", "свобод"];
  var DARK_EN = ["scared", "scary", "afraid", "fear", "terrif", "anxious", "anxiety",
    "panic", "horror", "horrif", "nightmare", "dread", "cried", "crying",
    "sad ", "sadness", "lonely", "alone", "angry", "anger", "upset",
    "worried", "worry", "couldn t", "screamed", "screaming", "chased",
    "running away", "ran away", "hurt", "pain ", "painful", "gloomy",
    "creepy", "helpless", "desperate", "frighten", "nervous", "tense"];
  var LIGHT_EN = ["happy", "happiness", "joy", "calm", "peaceful", "warm", "laugh",
    "smil", "pleasant", "beautiful", "love ", "loved", "lovely", "gentle",
    "bright", "flying", "free ", "freedom", "relief", "relieved", "safe ",
    "wonderful", "cozy", "cosy", "light hearted", "excited", "glad"];

  var TONE_NOTE = {
    "тревожный": "Сон тревожный. Это не предсказание беды: тревожные сны " +
      "снимают напряжение, которое днём держится под контролем. " +
      "После такого сна обычно становится легче, в этом его работа.",
    "светлый": "Сон светлый. Такие сны возвращают ресурс и обычно приходят " +
      "тогда, когда решение уже принято, даже если вы это ещё " +
      "не проговорили.",
    "ровный": "Сон ровный, без сильных чувств. Такие сны разбирают " +
      "накопившееся за день и редко несут отдельное послание."
  };
  var TONE_NOTE_EN = {
    "тревожный": "An uneasy dream. That doesn't predict trouble: anxious dreams " +
      "let out tension you keep under control during the day. People " +
      "often feel lighter after one, and that's its job.",
    "светлый": "A bright dream. Dreams like this restore your energy and often " +
      "come when a decision has already been made, even if you haven't " +
      "said it out loud yet.",
    "ровный": "An even dream, without strong feelings. Dreams like this sort " +
      "through the day and rarely carry a separate message."
  };
  var MOOD_EN = { "тревожный": "uneasy", "светлый": "bright", "ровный": "even" };

  function langOf(lang) { return lang === "en" ? "en" : "ru"; }

  // ---- character classes (Python str semantics) ----
  var RE_LETTER = /^\p{L}$/u;
  var RE_NUMBER = /^\p{N}$/u;
  var RE_ZS = /^\p{Zs}$/u;

  /** Python `\w` for str: letter, any numeric, or underscore. */
  function isWordCp(ch) {
    return ch === "_" || RE_LETTER.test(ch) || RE_NUMBER.test(ch);
  }
  /** Python `str.isspace()` / `\s` for str. */
  function isSpaceCp(ch) {
    var c = ch.codePointAt(0);
    if ((c >= 0x09 && c <= 0x0d) || (c >= 0x1c && c <= 0x20) || c === 0x85) return true;
    if (c === 0x2028 || c === 0x2029) return true;
    return RE_ZS.test(ch);
  }

  /** norm(): lower-case, NBSP -> space, ё -> е, each run of non-word non-space -> one space. */
  function norm(text) {
    var t = String(text == null ? "" : text).toLowerCase()
      .replace(/ /g, " ").replace(/ё/g, "е");
    var out = "";
    var inRun = false;
    for (var ch of t) { // iterates by code point
      if (isWordCp(ch) || isSpaceCp(ch)) { out += ch; inRun = false; }
      else if (!inRun) { out += " "; inRun = true; }
    }
    return out;
  }

  /** Python `str.strip()` without arguments. */
  function pyStrip(s) {
    var cps = Array.from(s);
    var a = 0, b = cps.length;
    while (a < b && isSpaceCp(cps[a])) a++;
    while (b > a && isSpaceCp(cps[b - 1])) b--;
    return cps.slice(a, b).join("");
  }

  function cpAt(t, i) { // code point string starting at UTF-16 index i, or ""
    if (i < 0 || i >= t.length) return "";
    var c = t.codePointAt(i);
    return String.fromCodePoint(c);
  }
  function cpBefore(t, i) { // code point string that ends at UTF-16 index i, or ""
    if (i <= 0) return "";
    var lo = t.charCodeAt(i - 1);
    if (lo >= 0xdc00 && lo <= 0xdfff && i >= 2) {
      var hi = t.charCodeAt(i - 2);
      if (hi >= 0xd800 && hi <= 0xdbff) return t.slice(i - 2, i);
    }
    return t.charAt(i - 1);
  }
  /** Python `\b` at index i of t. */
  function boundary(t, i) {
    var b = cpBefore(t, i), a = cpAt(t, i);
    return (b !== "" && isWordCp(b)) !== (a !== "" && isWordCp(a));
  }

  /** A stem prepared once: normalised needle plus the "whole word" flag. */
  function prepStem(raw) {
    return { whole: raw.slice(-1) === " ", needle: pyStrip(norm(raw)) };
  }

  /** Index of the first `\b<stem>` (plus `\b` for whole-word stems) in normalised t, or -1. */
  function findStem(t, stem) {
    var s = stem.needle;
    if (s === "") return -1; // never in our dictionaries; guarded by a test
    var from = 0;
    for (;;) {
      var i = t.indexOf(s, from);
      if (i < 0) return -1;
      if (boundary(t, i) && (!stem.whole || boundary(t, i + s.length))) return i;
      from = i + 1;
    }
  }

  var DARK_EN_P = DARK_EN.map(prepStem);
  var LIGHT_EN_P = LIGHT_EN.map(prepStem);

  /**
   * Compile a dictionary object (parsed symbols*.json) once.
   * Returns [{key, name, short, long, folk, tag, stems: prepared[]}] in dictionary order.
   */
  function compile(dict) {
    var out = [];
    Object.keys(dict).forEach(function (key) {
      if (key === "_") return;
      var e = dict[key];
      if (!e || typeof e !== "object" || !Array.isArray(e.stems)) return;
      out.push({
        key: key,
        name: typeof e.name === "string" ? e.name : key,
        short: e.short || "",
        long: e.long || "",
        folk: e.folk || "",
        tag: e.tag || "",
        stems: e.stems.map(prepStem)
      });
    });
    return out;
  }

  /** find_symbols(): symbols in order of first appearance in the text; ties keep dictionary order. */
  function findSymbols(text, compiled) {
    var t = norm(text);
    var found = [];
    for (var n = 0; n < compiled.length; n++) {
      var entry = compiled[n];
      var pos = -1;
      for (var k = 0; k < entry.stems.length; k++) {
        var i = findStem(t, entry.stems[k]);
        if (i >= 0 && (pos < 0 || i < pos)) pos = i;
      }
      if (pos >= 0) found.push({ pos: pos, entry: entry, order: n });
    }
    found.sort(function (a, b) { return a.pos - b.pos || a.order - b.order; });
    return found.map(function (f) { return f.entry; });
  }

  function countSub(t, words) {
    var c = 0;
    for (var i = 0; i < words.length; i++) if (t.indexOf(words[i]) >= 0) c++;
    return c;
  }
  function countStem(t, stems) {
    var c = 0;
    for (var i = 0; i < stems.length; i++) if (findStem(t, stems[i]) >= 0) c++;
    return c;
  }

  /** tone(): always returns the Russian key (it is what the bot stores). */
  function tone(text, lang) {
    var t = norm(text), dark, light;
    if (langOf(lang) === "en") { dark = countStem(t, DARK_EN_P); light = countStem(t, LIGHT_EN_P); }
    else { dark = countSub(t, DARK); light = countSub(t, LIGHT); }
    if (dark > light) return "тревожный";
    if (light > dark) return "светлый";
    return "ровный";
  }

  /** mood_said(): did the person write anything about feelings. */
  function moodSaid(text, lang) {
    var t = norm(text);
    if (langOf(lang) === "en") {
      return countStem(t, DARK_EN_P) > 0 || countStem(t, LIGHT_EN_P) > 0;
    }
    return countSub(t, DARK) > 0 || countSub(t, LIGHT) > 0;
  }

  function toneNote(mood, lang) {
    return (langOf(lang) === "en" ? TONE_NOTE_EN : TONE_NOTE)[mood];
  }

  /**
   * Dictionary reading = classic() + folk() without markup.
   * dicts = {ru: compiled, en: compiled}. full=false -> first FREE_SYMBOLS only.
   * toneNote only when the person wrote about feelings AND something was found
   * (classic() returns "" without symbols; never invent a mood, lesson 14.09).
   */
  function read(text, lang, dicts, full) {
    lang = langOf(lang);
    var found = findSymbols(text, dicts[lang]);
    var mood = tone(text, lang);
    var said = moodSaid(text, lang);
    var shown = full ? found : found.slice(0, FREE_SYMBOLS);
    var more = (!full && found.length > shown.length) ? found.slice(shown.length) : [];
    return {
      symbols: found.map(function (e) { return e.key; }),
      tone: mood,
      moodSaid: said,
      shown: shown,
      more: more,
      toneNote: (said && found.length) ? toneNote(mood, lang) : null,
      folk: full ? found.filter(function (e) { return e.folk; }) : []
    };
  }

  /**
   * recurring(): symbols that came back. entries = [{created: ms, symbols: [keys]}];
   * counts a symbol once per dream. Order: count desc, ties by first appearance in
   * created-ascending order (the order the bot's SQL iterates rows in).
   */
  function recurring(entries, nowMs, days, minTimes) {
    days = days == null ? 30 : days;
    minTimes = minTimes == null ? 2 : minTimes;
    var since = nowMs - days * 86400000;
    var sorted = entries.slice().sort(function (a, b) { return a.created - b.created; });
    var counts = new Map();
    sorted.forEach(function (e) {
      if (e.created < since) return;
      new Set(e.symbols || []).forEach(function (n) { counts.set(n, (counts.get(n) || 0) + 1); });
    });
    var out = [];
    counts.forEach(function (c, n) { if (c >= minTimes) out.push([n, c]); });
    out.sort(function (a, b) { return b[1] - a[1]; }); // stable, like Python's sort
    return out;
  }

  /** times_word(): "раз/раза", "time/times". */
  function timesWord(n, lang) {
    if (langOf(lang) === "en") return n === 1 ? "time" : "times";
    if (n % 10 === 1 && n % 100 !== 11) return "раз";
    if ([2, 3, 4].indexOf(n % 10) >= 0 && [12, 13, 14].indexOf(n % 100) < 0) return "раза";
    return "раз";
  }

  return {
    FREE_SYMBOLS: FREE_SYMBOLS, MOOD_EN: MOOD_EN,
    norm: norm, compile: compile, findSymbols: findSymbols, tone: tone, moodSaid: moodSaid,
    toneNote: toneNote, read: read, recurring: recurring, timesWord: timesWord,
    _internal: { findStem: findStem, prepStem: prepStem, isWordCp: isWordCp, pyStrip: pyStrip }
  };
});
