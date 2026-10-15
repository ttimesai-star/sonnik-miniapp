/* app.js — UI of the "Veshiy" dream diary Mini App.
 *
 * Everything runs on the client: the reading comes from engine.js and our dictionary,
 * the diary lives in Telegram CloudStorage (fallback: localStorage). No requests leave the
 * page except telegram-web-app.js itself and the dictionary file from the same origin.
 *
 * Safety rule: user text and dictionary text go into the DOM only through textContent
 * (helper el()); HTML-parsing DOM sinks are never used (tests/static.test.mjs).
 *
 * Payments: NOT implemented on purpose (Stars withdrawal for Belarus is unverified). The
 * "support" button only shows an honest text; there are no invoice calls in this file.
 */
(function () {
  "use strict";

  var E = window.DreamEngine;
  var S = window.DreamStore;
  var BOT = "sonnik_morfey_bot";
  var RU_CODES = ["ru", "uk", "be", "kk", "uz", "ky"]; // same as bot.py lang_from_code

  var T = {
    ru: {
      title: "Вещий", sub: "дневник снов", docTitle: "Вещий — дневник снов",
      tabWrite: "Записать сон", tabDiary: "Дневник",
      dreamLabel: "Текст сна",
      placeholder: "Что вам приснилось? Опишите сон своими словами: где вы были, кто был рядом, что чувствовали и чем всё кончилось.",
      read: "Толковать", reading: "Читаю сон…",
      emptyInput: "Опишите сон хотя бы парой слов.",
      privacyCloud: "Сон сохранится в дневник в облаке Telegram, его видите только вы. Толкование считается прямо на устройстве.",
      privacyLocal: "Сон сохранится в дневник на этом устройстве. Толкование считается прямо здесь, текст никуда не отправляется.",
      classicHead: "Классическое толкование",
      more: "В этом сне есть ещё образы: {list}. Они разбираются в полном толковании.",
      nothingHead: "Образы не найдены",
      nothing: "Знакомых образов из словаря в этом сне не нашлось. Сон сохранён в дневник. Целиком, вместе с психологическим разбором, его разберёт бот.",
      recurringHead: "Повторяется",
      recurring: "За последний месяц у вас уже встречалось: {list}. Повторяющийся образ говорит больше одного сна: значит, тема не закрыта.",
      fullInBot: "Полный разбор в боте", again: "Записать ещё сон",
      savedCloud: "Сохранено в дневник (облако Telegram).",
      savedLocal: "Сохранено в дневник на этом устройстве.",
      savedPending: "Облако Telegram сейчас недоступно: сон сохранён на устройстве и уйдёт в облако при следующем открытии дневника.",
      saveFull: "Дневник заполнен ({n} снов). Удалите старые записи, чтобы сохранять новые.",
      diaryEmpty: "Здесь будут ваши сны. Записывайте их утром, пока помните: через пару недель станет видно, какие образы возвращаются.",
      diaryRecurringHead: "Возвращается за 30 дней",
      diaryNoRecurring: "За последние 30 дней повторов пока нет.",
      noSymbols: "без знакомых образов",
      showReading: "Толкование", hideReading: "Свернуть",
      del: "Удалить", delConfirm: "Удалить этот сон из дневника?",
      clearAll: "Очистить дневник", clearConfirm: "Удалить все сны из дневника? Это нельзя отменить.",
      delFailed: "Не получилось удалить из облака Telegram. Попробуйте ещё раз.",
      pending: "Ждут отправки в облако: {n}.",
      cloudDown: "Облако Telegram недоступно, показаны записи с этого устройства.",
      support: "Поддержать проект",
      supportTitle: "Подписка за Telegram Stars",
      supportText: "Скоро здесь можно будет поддержать проект звёздами Telegram и оформить подписку. Сейчас платежи в мини-приложении не включены, ничего не списывается. Дневник и словарное толкование бесплатны.",
      ok: "Понятно",
      disclaimer: "Толкование в традиции сонников, для самонаблюдения и интереса. Это не предсказание.",
      status: "Ранняя версия · словарь из {n} образов",
      loadError: "Не удалось загрузить словарь. Проверьте связь и откройте приложение ещё раз.",
      moods: { "тревожный": "тревожный сон", "светлый": "светлый сон", "ровный": "ровный сон" },
      locale: "ru-RU"
    },
    en: {
      title: "Veshiy", sub: "dream diary", docTitle: "Veshiy — dream diary",
      tabWrite: "New dream", tabDiary: "Diary",
      dreamLabel: "Your dream",
      placeholder: "What did you dream about? Tell it in your own words: where you were, who was there, how it felt and how it ended.",
      read: "Read my dream", reading: "Reading…",
      emptyInput: "Describe the dream in at least a few words.",
      privacyCloud: "The dream is saved to your diary in Telegram cloud storage, visible only to you. The reading is made right on your device.",
      privacyLocal: "The dream is saved to your diary on this device. The reading is made right here; the text is not sent anywhere.",
      classicHead: "Classic reading",
      more: "There's more in this dream: {list}. Those are covered in the full reading.",
      nothingHead: "No symbols found",
      nothing: "No familiar symbols from our dictionary in this dream. It's saved to your diary. The bot can read it as a whole, with a psychological reading.",
      recurringHead: "Recurring",
      recurring: "In the past month you've already dreamt of: {list}. A recurring symbol says more than a single dream: the theme is still open.",
      fullInBot: "Full reading in the bot", again: "Write another dream",
      savedCloud: "Saved to your diary (Telegram cloud).",
      savedLocal: "Saved to your diary on this device.",
      savedPending: "Telegram cloud is unavailable right now: the dream is saved on this device and will be sent to the cloud next time you open the diary.",
      saveFull: "The diary is full ({n} dreams). Delete old entries to save new ones.",
      diaryEmpty: "Your dreams will appear here. Write them down in the morning while you remember: in a couple of weeks you'll see which symbols come back.",
      diaryRecurringHead: "Coming back over 30 days",
      diaryNoRecurring: "No recurring symbols in the last 30 days yet.",
      noSymbols: "no familiar symbols",
      showReading: "Reading", hideReading: "Hide",
      del: "Delete", delConfirm: "Delete this dream from your diary?",
      clearAll: "Clear diary", clearConfirm: "Delete all dreams from your diary? This can't be undone.",
      delFailed: "Couldn't delete from Telegram cloud. Please try again.",
      pending: "Waiting to be sent to the cloud: {n}.",
      cloudDown: "Telegram cloud is unavailable; showing entries from this device.",
      support: "Support the project",
      supportTitle: "Telegram Stars subscription",
      supportText: "Soon you'll be able to support the project with Telegram Stars and subscribe. Payments are not enabled in this mini app yet; nothing is charged. The diary and dictionary readings are free.",
      ok: "Got it",
      disclaimer: "Readings follow the dream-book tradition. They are for self-reflection and curiosity, not a prediction.",
      status: "Early version · dictionary of {n} symbols",
      loadError: "Couldn't load the dictionary. Check your connection and open the app again.",
      moods: { "тревожный": "uneasy dream", "светлый": "bright dream", "ровный": "even dream" },
      locale: "en-GB"
    }
  };

  // ---------- Telegram ----------
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var inTelegram = !!(tg && tg.initData);
  function tgAtLeast(v) {
    try { return !!(tg && tg.isVersionAtLeast && tg.isVersionAtLeast(v)); } catch (e) { return false; }
  }

  var COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

  function applyTheme() {
    var root = document.documentElement.style;
    var p = (tg && tg.themeParams) || {};
    function c(k) { var v = p[k]; return typeof v === "string" && COLOR_RE.test(v) ? v : null; }
    // grouped style, like Telegram settings: page = secondary_bg, cards = section_bg / bg
    var vals = {
      "--bg": c("secondary_bg_color") || c("bg_color"),
      "--card": c("section_bg_color") || c("bg_color"),
      "--text": c("text_color"), "--hint": c("hint_color"), "--link": c("link_color"),
      "--btn": c("button_color"), "--btn-text": c("button_text_color"),
      "--accent": c("accent_text_color") || c("link_color"), "--danger": c("destructive_text_color")
    };
    Object.keys(vals).forEach(function (k) {
      if (vals[k]) root.setProperty(k, vals[k]); else root.removeProperty(k);
    });
    if (tg && tg.colorScheme) document.documentElement.setAttribute("data-scheme", tg.colorScheme);
    if (inTelegram && tgAtLeast("6.1")) {
      try { tg.setHeaderColor("secondary_bg_color"); } catch (e) { /* old client */ }
      try { if (vals["--bg"]) tg.setBackgroundColor(vals["--bg"]); } catch (e) { /* old client */ }
    }
  }

  function haptic(kind) {
    if (inTelegram && tgAtLeast("6.1") && tg.HapticFeedback) {
      try { tg.HapticFeedback.notificationOccurred(kind); } catch (e) { /* ignore */ }
    }
  }

  function confirmBox(text) {
    if (inTelegram && tgAtLeast("6.2") && tg.showConfirm) {
      return new Promise(function (resolve) { tg.showConfirm(text, function (ok) { resolve(!!ok); }); });
    }
    return Promise.resolve(window.confirm(text));
  }

  // ---------- language ----------
  function langFromCode(code) { // bot.py lang_from_code: no code -> ru
    var c = String(code || "").split("-")[0].trim().toLowerCase();
    if (!c) return "ru";
    return RU_CODES.indexOf(c) >= 0 ? "ru" : "en";
  }
  function defaultLang() {
    if (inTelegram) {
      var u = tg.initDataUnsafe && tg.initDataUnsafe.user;
      return langFromCode(u && u.language_code);
    }
    return langFromCode((navigator.language || "").toLowerCase());
  }

  // ---------- state ----------
  var state = { lang: "ru", entries: [], store: null, dicts: {}, raw: {}, last: null, view: "write", busy: false };

  function fmt(s, vars) {
    Object.keys(vars || {}).forEach(function (k) { s = s.split("{" + k + "}").join(String(vars[k])); });
    return s;
  }
  function t(key, vars) { return fmt(T[state.lang][key], vars); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- dictionary ----------
  var DICT_FILE = { ru: "dictionary/symbols.json", en: "dictionary/symbols_en.json" };
  var loading = {};
  function loadDict(lang) {
    if (state.dicts[lang]) return Promise.resolve(state.dicts[lang]);
    if (!loading[lang]) {
      loading[lang] = fetch(DICT_FILE[lang], { credentials: "same-origin" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (d) {
          state.raw[lang] = d;
          state.dicts[lang] = E.compile(d);
          return state.dicts[lang];
        })
        .catch(function (e) { delete loading[lang]; throw e; });
    }
    return loading[lang];
  }
  function dictsFor() { return { ru: state.dicts.ru || [], en: state.dicts.en || [] }; }

  /** Display name of a symbol (keys are Russian, like in the bot's database). */
  function label(key, lang) {
    if ((lang || state.lang) === "en") {
      var e = state.raw.en && state.raw.en[key];
      return e && typeof e.name === "string" ? e.name : key;
    }
    return key;
  }

  // ---------- reading ----------
  function moodClass(m) { return m === "тревожный" ? "dark" : m === "светлый" ? "light" : ""; }

  /** Builds the reading card (short reading = bot's free classic(): 3 symbols + the rest by name). */
  function readingNode(text, lang, againList) {
    var r = E.read(text, lang, dictsFor(), false);
    var wrap = el("div");
    var card = el("div", "card");
    if (r.symbols.length) {
      var head = el("h2", null, T[lang].classicHead);
      card.appendChild(head);
      r.shown.forEach(function (e) {
        var s = el("div", "sym");
        s.appendChild(el("p", "sym-title", cap(lang === "en" ? e.name : e.key) + " — " + e.short));
        s.appendChild(el("p", "sym-long", e.long));
        card.appendChild(s);
      });
      if (r.more.length) {
        var names = r.more.map(function (e) { return lang === "en" ? e.name : e.key; }).join(", ");
        card.appendChild(el("p", "more", fmt(T[lang].more, { list: names })));
      }
      if (r.toneNote) {
        var note = el("p", "note");
        var badge = el("span", "mood " + moodClass(r.tone), T[lang].moods[r.tone]);
        note.appendChild(badge);
        note.appendChild(document.createElement("br"));
        note.appendChild(document.createTextNode(r.toneNote));
        card.appendChild(note);
      }
    } else {
      card.appendChild(el("h2", null, T[lang].nothingHead));
      card.appendChild(el("p", "sym-long", T[lang].nothing));
    }
    wrap.appendChild(card);
    if (againList && againList.length) {
      var rc = el("div", "card");
      rc.appendChild(el("h2", null, T[lang].recurringHead));
      var bits = againList.slice(0, 3).map(function (p) { return label(p[0], lang) + " — " + p[1] + " " + E.timesWord(p[1], lang); });
      rc.appendChild(el("p", "sym-long", fmt(T[lang].recurring, { list: bits.join(", ") })));
      wrap.appendChild(rc);
    }
    return { node: wrap, result: r };
  }

  function recurringNow() { return E.recurring(state.entries, Date.now(), 30, 2); }

  // ---------- views ----------
  function setView(v) {
    state.view = v;
    $("view-write").hidden = v !== "write";
    $("view-diary").hidden = v !== "diary";
    $("tab-write").classList.toggle("active", v === "write");
    $("tab-diary").classList.toggle("active", v === "diary");
    $("tab-write").setAttribute("aria-selected", String(v === "write"));
    $("tab-diary").setAttribute("aria-selected", String(v === "diary"));
    if (v === "diary") renderDiary();
    updateBackButton();
    window.scrollTo(0, 0);
  }

  function showResult(on) {
    $("write-form").hidden = on;
    $("result").hidden = !on;
    updateBackButton();
  }

  function updateBackButton() {
    if (!inTelegram || !tgAtLeast("6.1") || !tg.BackButton) return;
    var need = state.view === "diary" || !$("result").hidden || !$("sheet").hidden;
    try { if (need) tg.BackButton.show(); else tg.BackButton.hide(); } catch (e) { /* ignore */ }
  }
  function onBack() {
    if (!$("sheet").hidden) { closeSheet(); return; }
    if (state.view === "diary") { setView("write"); return; }
    if (!$("result").hidden) { showResult(false); }
  }

  function renderTexts() {
    var L = T[state.lang];
    document.documentElement.lang = state.lang;
    document.title = L.docTitle;
    $("t-title").textContent = L.title;
    $("t-sub").textContent = L.sub;
    $("tab-write").textContent = L.tabWrite;
    $("tab-diary-label").textContent = L.tabDiary;
    $("t-dream-label").textContent = L.dreamLabel;
    $("dream").placeholder = L.placeholder;
    $("btn-read").textContent = state.busy ? L.reading : L.read;
    $("privacy").textContent = state.store && state.store.kind === "cloud" ? L.privacyCloud : L.privacyLocal;
    $("btn-again").textContent = L.again;
    $("btn-bot").textContent = L.fullInBot;
    $("btn-bot").href = "https://t.me/" + BOT + "?start=" + (state.lang === "en" ? "en_miniapp" : "miniapp");
    $("t-support").textContent = L.support;
    $("t-disclaimer").textContent = L.disclaimer;
    $("t-status").textContent = t("status", { n: (state.dicts[state.lang] || []).length || 178 });
    $("btn-clear").textContent = L.clearAll;
    $("sheet-title").textContent = L.supportTitle;
    $("sheet-text").textContent = L.supportText;
    $("sheet-ok").textContent = L.ok;
    ["ru", "en"].forEach(function (l) { $("lang-" + l).setAttribute("aria-pressed", String(l === state.lang)); });
    var err = $("input-error");
    if (!err.hidden) err.textContent = L.emptyInput;
    updateCount();
  }

  function updateCount() {
    var c = $("diary-count");
    c.hidden = !state.entries.length;
    c.textContent = String(state.entries.length);
  }

  function rerenderResult() {
    if (!state.last || $("result").hidden) return;
    var again = againFor(state.last.symbols);
    var body = $("result-body");
    body.textContent = "";
    body.appendChild(readingNode(state.last.text, state.last.lang, again).node);
  }

  function againFor(names) {
    return recurringNow().filter(function (p) { return names.indexOf(p[0]) >= 0; });
  }

  function formatDate(ms) {
    try {
      return new Intl.DateTimeFormat(T[state.lang].locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
    } catch (e) { return new Date(ms).toISOString().slice(0, 16).replace("T", " "); }
  }

  function renderDiary() {
    var L = T[state.lang];
    var rec = $("diary-recurring");
    var list = $("diary-list");
    rec.textContent = "";
    list.textContent = "";
    $("btn-clear").hidden = !state.entries.length;
    if (!state.entries.length) {
      var empty = el("div", "empty");
      empty.appendChild(moonSvg());
      empty.appendChild(el("p", null, L.diaryEmpty));
      list.appendChild(empty);
      return;
    }
    var r = recurringNow();
    var card = el("div", "card");
    card.appendChild(el("h2", null, L.diaryRecurringHead));
    if (r.length) {
      var ul = el("ul", "chips");
      r.forEach(function (p) {
        var li = el("li", "chip");
        li.appendChild(el("b", null, label(p[0])));
        li.appendChild(document.createTextNode(" · " + p[1] + " " + E.timesWord(p[1], state.lang)));
        ul.appendChild(li);
      });
      card.appendChild(ul);
    } else {
      card.appendChild(el("p", "hint", L.diaryNoRecurring));
    }
    rec.appendChild(card);

    state.entries.forEach(function (en) { list.appendChild(entryNode(en)); });
  }

  function moonSvg() {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 32 32");
    s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M21.5 4.2A12 12 0 1 0 27.8 21 10 10 0 0 1 21.5 4.2z");
    s.appendChild(p);
    return s;
  }

  function entryNode(en) {
    var L = T[state.lang];
    var box = el("article", "entry");
    box.dataset.id = en.id;
    var toggle = el("button", "entry-toggle");
    toggle.type = "button";
    var head = el("div", "entry-head");
    head.appendChild(el("span", "entry-date", formatDate(en.created)));
    if (en.mood) head.appendChild(el("span", "mood " + moodClass(en.mood), L.moods[en.mood] || ""));
    toggle.appendChild(head);
    if (en.symbols.length) {
      var ul = el("ul", "chips");
      en.symbols.slice(0, 8).forEach(function (k) { ul.appendChild(el("li", "chip", label(k))); });
      if (en.symbols.length > 8) ul.appendChild(el("li", "chip", "+" + (en.symbols.length - 8)));
      toggle.appendChild(ul);
    } else {
      toggle.appendChild(el("p", "hint", L.noSymbols));
    }
    toggle.appendChild(el("p", "entry-text", en.text));
    toggle.setAttribute("aria-expanded", "false");
    box.appendChild(toggle);

    var more = el("div", "entry-reading");
    more.hidden = true;
    box.appendChild(more);

    toggle.addEventListener("click", function () {
      var open = more.hidden;
      box.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      if (!open) { more.hidden = true; more.textContent = ""; return; }
      loadDict(en.lang).then(function () {
        more.textContent = "";
        more.appendChild(readingNode(en.text, en.lang, null).node);
        var act = el("div", "entry-actions");
        var del = el("button", "link danger", L.del);
        del.type = "button";
        del.addEventListener("click", function () { removeEntry(en.id); });
        act.appendChild(del);
        more.appendChild(act);
        more.hidden = false;
      }).catch(function () { setStatus("diary-status", T[state.lang].loadError, true); });
    });
    return box;
  }

  function setStatus(id, text, warn) {
    var s = $(id);
    s.textContent = text || "";
    s.classList.toggle("warn", !!warn);
  }

  // ---------- actions ----------
  function refreshEntries() {
    return state.store.list().then(function (res) {
      state.entries = res.entries;
      updateCount();
      var msg = res.cloudError ? T[state.lang].cloudDown : (res.pending ? t("pending", { n: res.pending }) : "");
      setStatus("diary-status", msg, res.cloudError);
      if (state.view === "diary") renderDiary();
    });
  }

  function onRead() {
    if (state.busy) return;
    var text = $("dream").value;
    var err = $("input-error");
    if (!text.trim()) {
      err.textContent = T[state.lang].emptyInput;
      err.hidden = false;
      $("dream").focus();
      return;
    }
    err.hidden = true;
    state.busy = true;
    $("btn-read").disabled = true;
    $("btn-read").textContent = T[state.lang].reading;
    var lang = state.lang;
    loadDict(lang).then(function () {
      var r = E.read(text, lang, dictsFor(), true);
      var entry = { created: Date.now(), text: text.slice(0, S.MAX_TEXT), symbols: r.symbols,
                    mood: r.moodSaid ? r.tone : "", lang: lang };
      return state.store.add(entry, state.entries.length).then(function (res) {
        if (res.ok) {
          state.entries.unshift({ id: res.id, created: entry.created, text: entry.text, symbols: entry.symbols, mood: entry.mood, lang: lang });
          updateCount();
          setStatus("save-status", res.cloudError ? T[lang].savedPending : (res.where === "cloud" ? T[lang].savedCloud : T[lang].savedLocal), !!res.cloudError);
        } else {
          setStatus("save-status", t("saveFull", { n: S.MAX_ENTRIES }), true);
        }
        state.last = { text: text, symbols: r.symbols, lang: lang };
        var body = $("result-body");
        body.textContent = "";
        body.appendChild(readingNode(text, lang, againFor(r.symbols)).node);
        showResult(true);
        window.scrollTo(0, 0);
        haptic("success");
      });
    }).catch(function () {
      err.textContent = T[state.lang].loadError;
      err.hidden = false;
    }).then(function () {
      state.busy = false;
      $("btn-read").disabled = false;
      $("btn-read").textContent = T[state.lang].read;
    });
  }

  function removeEntry(id) {
    confirmBox(T[state.lang].delConfirm).then(function (ok) {
      if (!ok) return;
      state.store.remove(id).then(function (done) {
        if (!done) { setStatus("diary-status", T[state.lang].delFailed, true); return; }
        state.entries = state.entries.filter(function (e) { return e.id !== id; });
        updateCount();
        setStatus("diary-status", "");
        renderDiary();
      });
    });
  }

  function clearAll() {
    confirmBox(T[state.lang].clearConfirm).then(function (ok) {
      if (!ok) return;
      var ids = state.entries.map(function (e) { return e.id; });
      state.store.clear(ids).then(function (done) {
        if (!done) { setStatus("diary-status", T[state.lang].delFailed, true); return refreshEntries(); }
        state.entries = [];
        updateCount();
        setStatus("diary-status", "");
        renderDiary();
      });
    });
  }

  function setLang(lang) {
    if (lang !== "ru" && lang !== "en") return;
    state.lang = lang;
    state.store.setSetting("lang", lang);
    loadDict(lang).then(function () {
      renderTexts();
      rerenderResult();
      if (state.view === "diary") renderDiary();
    }).catch(function () { setStatus("save-status", T[state.lang].loadError, true); });
    renderTexts();
  }

  var lastFocus = null;
  function openSheet() {
    lastFocus = document.activeElement;
    $("sheet").hidden = false;
    $("sheet-ok").focus();
    updateBackButton();
    if (inTelegram && tgAtLeast("6.1") && tg.BackButton) { try { tg.BackButton.show(); } catch (e) { /* ignore */ } }
  }
  function closeSheet() {
    $("sheet").hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    updateBackButton();
  }

  function openBot(ev) {
    if (inTelegram && tgAtLeast("6.1") && tg.openTelegramLink) {
      ev.preventDefault();
      try { tg.openTelegramLink($("btn-bot").href); } catch (e) { window.open($("btn-bot").href, "_blank", "noopener"); }
    }
  }

  // ---------- start ----------
  function localStore() {
    try {
      var ls = window.localStorage;
      var k = "sonnik:probe";
      ls.setItem(k, "1"); ls.removeItem(k);
      return ls;
    } catch (e) { return null; }
  }

  function start() {
    if (tg) { try { tg.ready(); tg.expand(); } catch (e) { /* ignore */ } }
    applyTheme();
    if (tg && tg.onEvent) {
      tg.onEvent("themeChanged", applyTheme);
      if (tgAtLeast("6.1")) tg.onEvent("backButtonClicked", onBack);
    }
    var cloud = inTelegram && tgAtLeast("6.9") && tg.CloudStorage ? tg.CloudStorage : null;
    state.store = S.create({ cloud: cloud, local: localStore() });

    $("tab-write").addEventListener("click", function () { setView("write"); });
    $("tab-diary").addEventListener("click", function () { setView("diary"); });
    $("lang-ru").addEventListener("click", function () { setLang("ru"); });
    $("lang-en").addEventListener("click", function () { setLang("en"); });
    $("btn-read").addEventListener("click", onRead);
    $("btn-again").addEventListener("click", function () { $("dream").value = ""; updateCounter(); showResult(false); $("dream").focus(); });
    $("btn-bot").addEventListener("click", openBot);
    $("btn-clear").addEventListener("click", clearAll);
    $("btn-support").addEventListener("click", openSheet);
    $("sheet-ok").addEventListener("click", closeSheet);
    $("sheet").addEventListener("click", function (ev) { if (ev.target === $("sheet")) closeSheet(); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !$("sheet").hidden) closeSheet(); });
    $("dream").addEventListener("input", updateCounter);

    state.lang = defaultLang();
    renderTexts();
    state.store.getSetting("lang").then(function (saved) {
      if (saved === "ru" || saved === "en") state.lang = saved;
      renderTexts();
      return loadDict(state.lang).then(function () { renderTexts(); });
    }).catch(function () {
      setStatus("save-status", T[state.lang].loadError, true);
    }).then(function () {
      var need = {};
      return refreshEntries().then(function () {
        // labels/readings of old entries in the other language need that dictionary too
        state.entries.forEach(function (e) { need[e.lang] = true; });
        if (state.lang === "en") need.en = true;
        return Promise.all(Object.keys(need).map(function (l) { return loadDict(l).catch(function () {}); }));
      }).then(function () { if (state.view === "diary") renderDiary(); });
    }).then(function () { document.body.setAttribute("data-ready", "1"); });
  }

  function updateCounter() {
    $("counter").textContent = $("dream").value.length + " / " + S.MAX_TEXT;
    if ($("dream").value.trim()) $("input-error").hidden = true;
  }

  // exported for tests only (pure helpers, no state)
  window.__sonnikApp = { langFromCode: langFromCode };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
