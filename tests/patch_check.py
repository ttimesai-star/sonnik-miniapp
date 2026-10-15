#!/usr/bin/env python3
# coding: utf-8
"""AC11: patches/bot_webapp.patch applies to the current bot.py (or is already applied), compiles, and is inert
without SONNIK_WEBAPP_URL. Works on a temporary copy; the live bot is never touched and
no Telegram request is made (api/send are replaced by stubs).

Run:  python tests/patch_check.py      (needs git and ../saas_dream next to this repo)
Exit: 0 ok, 1 a check failed, 2 the bot is not next to us.
"""
import importlib.util
import json
import os
import py_compile
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOT = ROOT.parent / "saas_dream"
PATCH = ROOT / "patches" / "bot_webapp.patch"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load(path: Path, url: str | None):
    if url is None:
        os.environ.pop("SONNIK_WEBAPP_URL", None)
    else:
        os.environ["SONNIK_WEBAPP_URL"] = url
    spec = importlib.util.spec_from_file_location(f"bot_patched_{abs(hash(url))}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    if not (BOT / "bot.py").exists():
        print("нет бота рядом:", BOT)
        return 2
    fails = []

    def check(cond, name):
        print("PASS" if cond else "FAIL", name)
        if not cond:
            fails.append(name)

    tmp = Path(tempfile.mkdtemp(prefix="sonnik_patch_"))
    shutil.copy(BOT / "bot.py", tmp / "bot.py")
    r = subprocess.run(["git", "apply", "--check", str(PATCH)], cwd=tmp, capture_output=True, text=True)
    if r.returncode:
        # live bot.py may already carry the patch (enabled 16.10.2026): then test it as is
        rr = subprocess.run(["git", "apply", "-R", "--check", str(PATCH)], cwd=tmp,
                            capture_output=True, text=True)
        check(rr.returncode == 0, "patch applies to current bot.py or is already applied"
              + ("" if rr.returncode == 0 else " " + r.stderr.strip()))
        if rr.returncode:
            return 1
        print("     (patch already applied to the live bot.py, checking it as is)")
    else:
        check(True, "patch applies to current bot.py")
        subprocess.run(["git", "apply", str(PATCH)], cwd=tmp, check=True)
    py_compile.compile(str(tmp / "bot.py"), doraise=True)
    check(True, "patched bot.py compiles")

    # card, dreams and shop resolve from the real bot folders (bot.py looks for ../shop)
    sys.path.insert(0, str(BOT))
    sys.path.insert(0, str(BOT.parent / "shop"))
    calls = []

    m = load(tmp / "bot.py", None)
    check(m.WEBAPP_URL == "", "no env -> feature off")
    src = (tmp / "bot.py").read_text(encoding="utf-8")
    check('if WEBAPP_URL and low.startswith(("/app"' in src, "/app handled only when the URL is set")
    m.api = lambda method, **kw: calls.append((method, kw)) or {"ok": True}
    check(m.set_webapp_menu() is False and not calls, "no env -> --set-webapp-menu refuses, no API call")

    m = load(tmp / "bot.py", "http://insecure.example")
    check(m.WEBAPP_URL == "", "http:// URL rejected")

    url = "https://ttimesai-star.github.io/sonnik-miniapp/"
    m = load(tmp / "bot.py", url)
    check(m.WEBAPP_URL == url, "https URL accepted")
    sent = []
    m.send = lambda chat_id, text, **kw: sent.append((chat_id, text, kw)) or True
    m.webapp_button(1, "ru")
    kb = json.loads(sent[0][2]["reply_markup"])
    check(kb["inline_keyboard"][0][0]["web_app"]["url"] == url, "/app sends a web_app button")
    calls.clear()
    m.api = lambda method, **kw: calls.append((method, kw)) or {"ok": True}
    check(m.set_webapp_menu() and calls[0][0] == "setChatMenuButton"
          and json.loads(calls[0][1]["menu_button"])["web_app"]["url"] == url, "menu button set to the Mini App")
    calls.clear()
    check(m.set_webapp_menu(reset=True) and json.loads(calls[0][1]["menu_button"]) == {"type": "commands"},
          "--reset-menu restores the commands menu")
    os.environ.pop("SONNIK_WEBAPP_URL", None)
    print(f"{'OK' if not fails else 'FAILED'}: {len(fails)} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
