#!/usr/bin/env python3
# coding: utf-8
"""E2E of the Mini App in Chromium (Playwright), mobile viewport 390x844.

Covers AC4 (no foreign requests), AC5 (CloudStorage / localStorage diary, reload, delete,
recurring), AC6 (themeParams + themeChanged), AC7 (RU/EN), AC8 (payment stub), AC9 (XSS).
telegram-web-app.js is replaced by a local mock (route), so the test needs no network;
with --real-sdk one extra check loads the real script from telegram.org and fails on CSP
violations or page errors.

Run:  python tests/e2e_playwright.py [--shots DIR] [--real-sdk]
Exit: 0 all passed, 1 a check failed.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SDK = "https://telegram.org/js/telegram-web-app.js"
VIEWPORT = {"width": 390, "height": 844}

# Plain browser: the SDK request "fails" -> window.Telegram is undefined.
MOCK_NONE = "/* no telegram */"

# Telegram client mock: version 8.0, CloudStorage in memory (with a log), events.
MOCK_TG = r"""
(function(){
  var cloud = {}; window.__cloudLog = [];
  var handlers = {};
  var cfg = window.__tgCfg || {};
  function cb(f, e, r){ setTimeout(function(){ f && f(e, r); }, 5); }
  window.Telegram = { WebApp: {
    initData: "query_id=TEST&user=%7B%22id%22%3A1%7D",
    initDataUnsafe: { user: { id: 1, language_code: cfg.lang || "ru" } },
    version: "8.0", platform: "android", colorScheme: cfg.scheme || "light",
    themeParams: cfg.theme || {},
    isVersionAtLeast: function(v){ return parseFloat(v) <= 8.0; },
    ready: function(){}, expand: function(){},
    setHeaderColor: function(){}, setBackgroundColor: function(){},
    onEvent: function(n, f){ (handlers[n] = handlers[n] || []).push(f); },
    __emit: function(n){ (handlers[n] || []).forEach(function(f){ f(); }); },
    BackButton: { show: function(){}, hide: function(){} },
    HapticFeedback: { notificationOccurred: function(){} },
    showConfirm: function(t, f){ setTimeout(function(){ f(true); }, 5); },
    openTelegramLink: function(u){ window.__opened = u; },
    CloudStorage: {
      setItem: function(k, v, f){ window.__cloudLog.push(["set", k]);
        if (cfg.cloudFail) return cb(f, "UNKNOWN_ERROR");
        cloud[k] = v; cb(f, null, true); },
      getItem: function(k, f){ cb(f, null, cloud[k] || ""); },
      getItems: function(ks, f){ var o = {}; ks.forEach(function(k){ o[k] = cloud[k] || ""; }); cb(f, null, o); },
      getKeys: function(f){ cb(f, null, Object.keys(cloud)); },
      removeItem: function(k, f){ window.__cloudLog.push(["del", k]); delete cloud[k]; cb(f, null, true); },
      removeItems: function(ks, f){ ks.forEach(function(k){ delete cloud[k]; }); cb(f, null, true); }
    }
  }};
})();
"""

DREAM_RU = ("Мне снилось, что я иду по тёмному лесу у воды, за мной гналась змея, "
            "потом я оказалась дома, рядом стояла мама. Было очень страшно.")
DREAM_RU2 = "Снова видела воду, чистую и спокойную, было легко."
DREAM_EN = "I was swimming in clear water and a snake was watching me. I felt calm."
XSS = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    h = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/"


class Run:
    def __init__(self):
        self.fails: list[str] = []
        self.passed = 0

    def check(self, cond, name, extra=""):
        if cond:
            self.passed += 1
            print("PASS", name)
        else:
            self.fails.append(name)
            print("FAIL", name, extra)


def new_page(browser, base, mock, cfg=None, foreign=None):
    ctx = browser.new_context(viewport=VIEWPORT, device_scale_factor=2, is_mobile=True,
                              has_touch=True, locale="ru-RU")
    ctx.add_init_script("window.__tgCfg = " + json.dumps(cfg or {}) + ";")
    ctx.route(SDK, lambda r: r.fulfill(status=200, content_type="application/javascript", body=mock))
    page = ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    if foreign is not None:
        page.on("request", lambda req: foreign.append(req.url)
                if not req.url.startswith(base) and not req.url.startswith(SDK) else None)
    page.goto(base)
    page.wait_for_selector("body[data-ready='1']", timeout=15000)
    return ctx, page, errors


def write(page, text):
    page.fill("#dream", text)
    page.click("#btn-read")
    page.wait_for_selector("#result:not([hidden])", timeout=10000)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", type=Path, default=None)
    ap.add_argument("--real-sdk", action="store_true")
    a = ap.parse_args()
    if a.shots:
        a.shots.mkdir(parents=True, exist_ok=True)

    def shot(page, name):
        if a.shots:
            page.screenshot(path=str(a.shots / name), full_page=True)

    run = Run()
    srv, base = serve()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()

            # ---- 1. plain browser: localStorage diary, reload, recurring, delete, XSS, network ----
            foreign: list[str] = []
            ctx, page, errors = new_page(browser, base, MOCK_NONE, foreign=foreign)
            run.check(page.evaluate("typeof window.Telegram") == "undefined", "browser mode: no Telegram object")
            run.check(page.inner_text("#tab-write") == "Записать сон", "RU by default for ru-RU browser")
            page.fill("#dream", "Мне снилось море и старый дом у воды")
            shot(page, "00_write_ru.png")
            page.fill("#dream", "")
            page.click("#btn-read")
            run.check(page.is_visible("#input-error"), "empty dream -> inline error, nothing saved")
            write(page, DREAM_RU)
            body = page.text_content("#result-body")
            run.check("Классическое толкование" in body, "reading card shown")
            run.check(body.count("— ") >= 3, "three symbols with short meaning", body[:300])
            run.check("ещё образы" in body, "rest of symbols listed by name (bot's short reading)")
            run.check("Сон тревожный" in body, "tone note shown when feelings were written")
            run.check("покойник" not in body, "trap: 'рядом'/'спокойно' do not give false symbols")
            run.check("на этом устройстве" in page.inner_text("#save-status"), "saved locally in browser mode")
            shot(page, "01_result_ru.png")
            n_local = page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('sonnik:d_')).length")
            run.check(n_local == 1, "entry is in localStorage", str(n_local))
            page.click("#btn-again")
            write(page, DREAM_RU2)
            run.check("Повторяется" in page.text_content("#result-body"), "recurring block after 2nd dream with water")
            page.click("#btn-again")
            write(page, XSS)
            page.wait_for_timeout(300)
            run.check(page.evaluate("window.__xss") is None, "XSS: user text is not executed")
            page.reload()
            page.wait_for_selector("body[data-ready='1']")
            run.check(page.inner_text("#diary-count") == "3", "diary survives reload (3 entries)")
            page.click("#tab-diary")
            page.wait_for_selector(".entry")
            diary = page.inner_text("#view-diary")
            run.check("вода · 2 раза" in diary, "diary: 'вода · 2 раза' over 30 days", diary[:300])
            run.check("<img src=x" in diary, "XSS text shown literally in diary")
            shot(page, "02_diary_ru.png")
            page.once("dialog", lambda d: d.accept())
            page.click(".entry >> nth=0 >> .entry-toggle")
            page.wait_for_selector(".entry.open .entry-reading:not([hidden])")
            page.click(".entry.open .link.danger")
            page.wait_for_function("document.querySelectorAll('.entry').length === 2")
            run.check(page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('sonnik:d_')).length") == 2,
                      "delete removes the entry from storage")
            page.click("#btn-support")
            sheet = page.inner_text("#sheet")
            run.check(not page.is_hidden("#sheet") and "не включены" in sheet, "payment stub: honest text, nothing charged")
            shot(page, "03_support_ru.png")
            page.click("#sheet-ok")
            run.check(page.is_hidden("#sheet"), "stub closes")
            run.check(not foreign, "AC4: no requests to foreign domains", str(foreign[:5]))
            run.check(not errors, "no page errors (browser mode)", str(errors[:3]))
            ctx.close()

            # ---- 2. Telegram mock: CloudStorage, EN by language_code, themeParams + themeChanged ----
            theme = {"bg_color": "#17212b", "secondary_bg_color": "#0e1621", "section_bg_color": "#17212b",
                     "text_color": "#f5f5f5", "hint_color": "#708499", "link_color": "#6ab3f3",
                     "button_color": "#5288c1", "button_text_color": "#ffffff",
                     "accent_text_color": "#6ab2f2", "destructive_text_color": "#ec3942"}
            foreign = []
            ctx, page, errors = new_page(browser, base, MOCK_TG, {"lang": "en", "scheme": "dark", "theme": theme},
                                         foreign=foreign)
            run.check(page.inner_text("#tab-write") == "New dream", "EN from Telegram language_code")
            css = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()")
            run.check(css == "#0e1621", "AC6: --bg from themeParams.secondary_bg_color", css)
            run.check("Telegram cloud" in page.inner_text("#privacy"), "privacy text says Telegram cloud")
            write(page, DREAM_EN)
            body = page.text_content("#result-body")
            run.check("Classic reading" in body and "Water" in body, "EN reading with EN dictionary", body[:200])
            log = page.evaluate("window.__cloudLog")
            run.check(any(op == "set" and k.startswith("d_") for op, k in log), "AC5: CloudStorage.setItem called", str(log))
            run.check(page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('sonnik:d_')).length") == 0,
                      "cloud mode: nothing left in localStorage")
            shot(page, "04_result_en_dark.png")
            page.evaluate("""() => { const W = Telegram.WebApp;
                W.themeParams = Object.assign({}, W.themeParams, {secondary_bg_color: '#ffffff', bg_color: '#ffffff', text_color: '#000000'});
                W.__emit('themeChanged'); }""")
            css2 = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--text').trim()")
            run.check(css2 == "#000000", "AC6: themeChanged updates CSS variables", css2)
            page.click("#lang-ru")
            run.check(page.inner_text("#tab-write") == "Записать сон", "AC7: switch to RU")
            run.check("Classic reading" in page.text_content("#result-body"),
                      "AC7: the shown reading keeps the language the dream was read in")
            page.click("#btn-again")
            write(page, DREAM_RU2)
            run.check("Классическое толкование" in page.text_content("#result-body"), "AC7: new reading uses RU dictionary")
            page.click("#btn-bot")
            run.check(page.evaluate("window.__opened") == "https://t.me/sonnik_morfey_bot?start=miniapp",
                      "bot link via openTelegramLink with source tag")
            run.check(not foreign, "AC4: no foreign requests (Telegram mode)", str(foreign[:5]))
            run.check(not errors, "no page errors (Telegram mode)", str(errors[:3]))
            ctx.close()

            # ---- 3. Telegram mock, cloud write fails -> kept locally, flagged ----
            ctx, page, errors = new_page(browser, base, MOCK_TG, {"lang": "ru", "cloudFail": True})
            write(page, DREAM_RU2)
            st = page.inner_text("#save-status")
            run.check("недоступно" in st, "cloud failure -> honest status, entry kept on device", st)
            run.check(page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('sonnik:d_')).length") == 1,
                      "cloud failure -> entry in localStorage")
            ctx.close()

            # ---- 4. optional: the real SDK from telegram.org (network) ----
            if a.real_sdk:
                ctx = browser.new_context(viewport=VIEWPORT, is_mobile=True, locale="ru-RU")
                page = ctx.new_page()
                errs: list[str] = []
                page.on("pageerror", lambda e: errs.append(str(e)))
                page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
                page.add_init_script("""document.addEventListener('securitypolicyviolation',
                    e => console.error('CSP ' + e.violatedDirective + ' ' + e.blockedURI));""")
                page.goto(base)
                page.wait_for_selector("body[data-ready='1']", timeout=20000)
                run.check(page.evaluate("typeof Telegram === 'object' && typeof Telegram.WebApp === 'object'"),
                          "real SDK loaded")
                write(page, DREAM_RU)
                run.check(not errs, "real SDK: no CSP violations / page errors", str(errs[:3]))
                ctx.close()
            browser.close()
    finally:
        srv.shutdown()
    print(f"\n{run.passed} passed, {len(run.fails)} failed")
    for f in run.fails:
        print("  FAILED:", f)
    return 1 if run.fails else 0


if __name__ == "__main__":
    sys.exit(main())
