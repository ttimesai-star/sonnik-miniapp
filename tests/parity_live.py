#!/usr/bin/env python3
# coding: utf-8
"""AC2: живой паритет engine.js с эталоном projects/saas_dream/dreams.py.

Тексты НЕ из фикстур: ручные + случайные (зерно фиксировано), собранные из корней
словаря, слов настроения, ё/NBSP/эмодзи/пунктуации. Сравниваются norm, образы (порядок),
настроение, mood_said, «короткий» набор, наличие пометки настроения, а также recurring()
на синтетическом дневнике (реальная sqlite-база dreams.py во временном файле).

Запуск: python -I tests/parity_live.py   (нужны node и каталог ../saas_dream рядом)
Код выхода: 0 — всё совпало; 1 — расхождение; 2 — нет эталона/node (не «зелёный»).
"""
import importlib.util
import json
import random
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOT = ROOT.parent / "saas_dream"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load_dreams():
    spec = importlib.util.spec_from_file_location("dreams_ref", BOT / "dreams.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


HAND_RU = [
    "Мне снилось, что я иду по тёмному лесу и за мной кто-то гонится, было жутко.",
    "Приснился отец. Мы сидели на кухне и пили чай, было тепло и спокойно.",
    "Сон: море, большая волна накрыла лодку, я не мог дышать.",
    "Летала над городом, очень легко, внизу блестела река",
    "Потеряла зуб, потом нашла деньги в кармане старой куртки.",
    "Кошка родила котят в моей постели, а рядом стояла мама.",
    "ДОМ горел, а я смотрела из окна и ничего не чувствовала",
    "Был в больнице, врач сказал, что всё хорошо, я улыбался.",
    "Ехал в поезде, потом опоздал на самолёт и плакал",
    "Просто текст про погоду без образов 123",
    "Я видела змею во дворе, очень страшно!!!",
    "Мёртвая рыба в чистой воде. \U0001F642 Свет в окне.",
    "Бывший муж вернулся, мы поссорились, я кричала",
]
HAND_EN = [
    "I was running through a dark forest and something was chasing me, I was scared.",
    "My dad and I sat in the kitchen drinking tea, it felt warm and calm.",
    "A huge wave hit the boat and I couldn t breathe.",
    "I was flying over the city, it felt free, a river shone below.",
    "Lost a tooth and then found money in my old jacket.",
    "The cat gave birth in my bed and my mother stood nearby.",
    "The house was on fire and I watched from the window.",
    "At the hospital the doctor said everything was fine and I smiled.",
    "Missed my flight, then the train, and cried a lot.",
    "Just a plain text about weather, nothing else 42",
    "I saw a snake in the yard, so scary!!!",
    "My ex came back and we fought, I screamed. Pain everywhere.",
    "A dead fish in clear water \U0001F600 light in the window",
]
MOOD_RU = ["страшно", "жутко", "радостно", "было легко", "тревожно", "спокойно", "холодно", "тепло", "не могла", "свет"]
MOOD_EN = ["scared", "calm", "happy", "alone", "I was sad ", "warm", "freedom", "panic", "safe ", "pain "]
FILL_RU = ["и", "потом", "рядом", "мы", "было", "очень", "тёмная", "дом", "большой", "ночью", "я", "видел"]
FILL_EN = ["and", "then", "next to", "we", "was", "very", "dark", "big", "night", "I", "saw", "near"]
JUNK = ["!", "?", "...", ",", "«", "»", "—", "\U0001F600", " ", "\n", "(", ")", "ё", "Ё"]


def fuzz(lang, symbols, n, rnd):
    mood = MOOD_RU if lang == "ru" else MOOD_EN
    fill = FILL_RU if lang == "ru" else FILL_EN
    keys = [k for k in symbols]
    out = []
    for _ in range(n):
        parts = []
        for _ in range(rnd.randint(2, 9)):
            r = rnd.random()
            if r < 0.40:
                e = symbols[rnd.choice(keys)]
                st = rnd.choice(e["stems"])
                w = st.strip()
                if not st.endswith(" ") and rnd.random() < 0.6:
                    w += rnd.choice(["а", "ой", "у", "ами", "ов", "ая", ""])
                if rnd.random() < 0.15:
                    w = w.upper()
                parts.append(w)
            elif r < 0.55:
                parts.append(rnd.choice(mood))
            elif r < 0.9:
                parts.append(rnd.choice(fill))
            else:
                parts.append(rnd.choice(JUNK))
        out.append(" ".join(parts))
    return out


def main():
    if not (BOT / "dreams.py").exists():
        print("нет эталона:", BOT / "dreams.py")
        return 2
    dreams = load_dreams()
    fixtures = set()
    for f in ("ru", "en"):
        d = json.loads((ROOT / "fixtures" / f"parity_{f}.json").read_text(encoding="utf-8"))
        fixtures |= {c["text"] for c in d["cases"]}

    rnd = random.Random(20261015)
    cases = [{"text": t, "lang": "ru"} for t in HAND_RU] + [{"text": t, "lang": "en"} for t in HAND_EN]
    hand_cases = [c for c in cases if c["text"] not in fixtures]
    cases += [{"text": t, "lang": "ru"} for t in fuzz("ru", dreams.SYMBOLS, 1500, rnd)]
    cases += [{"text": t, "lang": "en"} for t in fuzz("en", dreams.SYMBOLS_EN, 1500, rnd)]
    cases = [c for c in cases if c["text"] not in fixtures]
    hand = len(hand_cases)
    assert hand >= 10, hand

    # дневник: реальная база dreams.py во временном файле
    now = time.time()
    day = 86400
    diary = [  # (смещение в днях назад, образы)
        (45, ["вода", "змея"]), (29.5, ["вода", "дом"]), (20, ["вода", "дом", "змея"]),
        (10.25, ["вода", "огонь"]), (3, ["змея", "огонь", "огонь"]), (0.5, ["дом"]),
        (31, ["дом", "дом"]), (15, []),
    ]
    tmp = Path(tempfile.mkdtemp(prefix="sonnik_live_")) / "t.db"
    dreams.DB = tmp
    con = dreams.connect()
    entries = []
    for off, names in diary:
        created = now - off * day
        con.execute("INSERT INTO dreams(user_id, created, body, symbols, mood) VALUES(?,?,?,?,?)",
                    (1, created, "x", json.dumps(names, ensure_ascii=False), "ровный"))
        entries.append({"created": created * 1000, "symbols": names})
    con.commit()
    py_rec = [[n, c] for n, c in dreams.recurring(con, 1, 30, 2)]

    payload = {"cases": cases,
               "recurring": {"entries": entries, "now_ms": now * 1000, "days": 30, "min_times": 2}}
    p = subprocess.run(["node", str(ROOT / "tests" / "live_runner.cjs")], input=json.dumps(payload),
                       capture_output=True, text=True, encoding="utf-8")
    if p.returncode != 0:
        print("node упал:", p.stderr[:800])
        return 2
    js = json.loads(p.stdout)
    assert len(js["cases"]) == len(cases)

    bad = 0
    nonempty = 0
    for c, j in zip(cases, js["cases"]):
        lang, text = c["lang"], c["text"]
        found = dreams.find_symbols(text, lang)
        mood = dreams.tone(text, lang)
        said = dreams.mood_said(text, lang)
        names = [n for n, _ in found]
        short = dreams.classic(found, mood, False, said, lang)
        note = (dreams.TONE_NOTE_EN if lang == "en" else dreams.TONE_NOTE)[mood]
        py = {"norm": dreams.norm(text), "symbols": names, "tone": mood, "said": said,
              "short": names[:dreams.FREE_SYMBOLS], "note_in_short": bool(short) and note in short}
        if names:
            nonempty += 1
        if py != j:
            bad += 1
            if bad <= 5:
                print("РАСХОЖДЕНИЕ", lang, repr(text))
                for k in py:
                    if py[k] != j[k]:
                        print("  ", k, "py=", py[k], "js=", j[k])
    # Порядок при равном счёте в боте случаен: set() строк зависит от PYTHONHASHSEED.
    # Поэтому сравниваем множество пар (образ, счёт) и порядок по убыванию счёта.
    canon = lambda r: sorted((n, c) for n, c in r)
    counts_desc = lambda r: [c for _, c in r] == sorted((c for _, c in r), reverse=True)
    if canon(js["recurring"]) != canon(py_rec) or not counts_desc(js["recurring"]):
        bad += 1
        print("РАСХОЖДЕНИЕ recurring: py=", py_rec, "js=", js["recurring"])
    print(f"живой паритет: {len(cases)} текстов (ручных не из фикстур {hand}, с образами {nonempty}); "
          f"recurring py={py_rec}; расхождений: {bad}")
    if nonempty < len(cases) * 0.3:
        print("СЛИШКОМ МАЛО текстов с образами: проверка пустая")
        return 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
