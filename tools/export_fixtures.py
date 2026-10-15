#!/usr/bin/env python3
# coding: utf-8
"""export_fixtures.py — эталон для порта движка толкований (engine.js; копия из projects/android_dream_diary).

Что делает:
  1. Копирует словари образов symbols.json / symbols_en.json из бота
     (projects/saas_dream) в dictionary/ этого репозитория. Только словари:
     данные бота и пользователей (dreams.db) не трогаются.
  2. Прогоняет корпус снов через эталонный dreams.py (norm, find_symbols,
     tone, mood_said, classic) и пишет fixtures/parity_{ru,en}.json.
     node-тест tests/engine.test.mjs сверяет engine.js с этими файлами 1:1.

Корпус: tools/corpus_{ru,en}.txt (наши синтетические сны, по одному на
строку) плюс фразы-ловушки и позитивы из проверок словаря в saas_dream
(читаются через ast, файлы проверок не исполняются).

Запуск (изолированно, без PYTHONPATH и каталога скрипта в sys.path):
  python -I tools/export_fixtures.py [--source C:/claude-workspace/projects/saas_dream]
Код выхода 0 — фикстуры записаны; 1 — корпус меньше порогов приёмки (AC4).
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = Path("C:/claude-workspace/projects/saas_dream")
MIN_RU, MIN_EN = 60, 30
DICT_FILES = ("symbols.json", "symbols_en.json")


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def load_dreams(source: Path):
    spec = importlib.util.spec_from_file_location("dreams_ref", source / "dreams.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)          # на импорте dreams.py только читает словари
    return mod


def literal_lists(path: Path, names: tuple[str, ...]) -> list[str]:
    """Достать строки из списков-литералов NAME = [...] без исполнения файла."""
    if not path.exists():
        return []
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out: list[str] = []
    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        t = node.targets[0]
        if not isinstance(t, ast.Name) or t.id not in names:
            continue
        try:
            val = ast.literal_eval(node.value)
        except ValueError:
            continue
        for item in val:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, (tuple, list)) and item and isinstance(item[0], str):
                out.append(item[0])
    return out


def corpus(path: Path) -> list[str]:
    lines = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        s = raw.rstrip("\n")
        if not s.strip() or s.lstrip().startswith("#"):
            continue
        lines.append(s.replace("\\n", "\n"))
    return lines


def dedup(items: list[str]) -> list[str]:
    seen, out = set(), []
    for s in items:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def case(d, text: str, lang: str) -> dict:
    found = d.find_symbols(text, lang)
    mood = d.tone(text, lang)
    said = d.mood_said(text, lang)
    short = d.classic(found, mood, False, said, lang)
    note = (d.TONE_NOTE_EN if lang == "en" else d.TONE_NOTE)[mood]
    return {
        "text": text,
        "norm": d.norm(text),
        "symbols": [n for n, _ in found],
        "tone": mood,
        "mood_said": said,
        # короткий разбор: какие образы показаны и есть ли фраза о настроении
        "short_shown": [n for n, _ in found[: d.FREE_SYMBOLS]],
        "tone_note_in_short": bool(short) and note in short,
        # фраза о настроении — только если человек сам написал о чувствах
        "tone_note": note if (found and said) else None,
    }


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    a = ap.parse_args()
    src: Path = a.source

    dict_dir = REPO / "dictionary"
    dict_dir.mkdir(exist_ok=True)
    for name in DICT_FILES:
        shutil.copyfile(src / name, dict_dir / name)

    d = load_dreams(src)
    ru = corpus(REPO / "tools" / "corpus_ru.txt")
    ru += literal_lists(src / "test_symbols_2026-09-24.py", ("COUNTER", "POSITIVE", "OLD_PHRASES"))
    en = corpus(REPO / "tools" / "corpus_en.txt")
    en += literal_lists(src / "test_symbols_en.py", ("TRAPS", "POSITIVE"))
    ru, en = dedup(ru), dedup(en)

    fx = REPO / "fixtures"
    fx.mkdir(exist_ok=True)
    meta = {name: sha256(dict_dir / name) for name in DICT_FILES}
    meta["free_symbols"] = d.FREE_SYMBOLS
    for lang, texts in (("ru", ru), ("en", en)):
        cases = [case(d, t, lang) for t in texts]
        payload = {"_": {"generator": "tools/export_fixtures.py", "lang": lang, **meta},
                   "cases": cases}
        (fx / f"parity_{lang}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        hit = sum(1 for c in cases if c["symbols"])
        print(f"{lang}: {len(cases)} cases, {hit} with symbols, "
              f"{sum(1 for c in cases if c['mood_said'])} with mood")

    if len(ru) < MIN_RU or len(en) < MIN_EN:
        print(f"FAIL: corpus below AC4 thresholds (ru {len(ru)}/{MIN_RU}, en {len(en)}/{MIN_EN})")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
