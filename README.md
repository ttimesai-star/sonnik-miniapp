# Veshiy: dream diary — Telegram Mini App

Status: **prototype** — tests pass, no external users or feedback yet. Not a finished product.

Write a dream, get a reading from our own dictionary of 178 dream symbols (RU/EN), keep a diary
and see which symbols come back over 30 days. It is the Mini App companion of the Telegram bot
[@sonnik_morfey_bot](https://t.me/sonnik_morfey_bot); the bot keeps the paid full reading with a
psychological layer, the Mini App itself takes no money.

- Everything runs in the browser: no server, no build step, no dependencies.
- The only external script is `telegram-web-app.js` from telegram.org; the page has a strict CSP.
- Diary storage: Telegram CloudStorage (per user, inside Telegram); outside Telegram or on old
  clients — `localStorage`. An entry that failed to reach the cloud stays on the device and is
  synced on the next open.
- Theme follows Telegram `themeParams` and `themeChanged`; language RU/EN (default from the
  Telegram language, same rule as the bot).
- "Support / Stars subscription" is a **stub**: payments are not enabled, nothing is charged.
- Readings follow the dream-book tradition, for self-reflection and curiosity, not prediction.

## Layout

| Path | What |
|---|---|
| `index.html`, `styles.css`, `app.js` | The page: UI, i18n, theme, Telegram glue. User text reaches the DOM only via `textContent`. |
| `engine.js` | 1:1 port of the bot's dictionary engine (`norm`, `find_symbols`, `tone`, `mood_said`, short `classic()`, `recurring`). Unicode word boundaries are spelled out (JS `\b` is ASCII-only). |
| `storage.js` | Diary storage: CloudStorage with localStorage fallback, within CloudStorage limits. |
| `dictionary/` | Copy of the bot's `symbols.json` / `symbols_en.json` (the bot is the source of truth). |
| `fixtures/` | Reference outputs of the Python engine (495 cases). |
| `tools/export_fixtures.py` | Re-syncs the dictionaries and regenerates fixtures from the bot's `dreams.py`. |
| `patches/` | Patch for the bot that adds the Mini App button (off unless `SONNIK_WEBAPP_URL` is set). |
| `docs/SPEC_2026-10-15_miniapp.md` | Spec and acceptance criteria. |

## Tests

```
node --test tests/*.test.mjs        # parity on fixtures, storage, static safety checks
python tests/e2e_playwright.py      # Chromium, 390x844: diary, cloud/local, theme, RU/EN, XSS, no foreign requests
python -I tests/parity_live.py      # local only: ~3000 fresh texts through dreams.py and engine.js (needs ../saas_dream)
python tests/patch_check.py         # local only: the bot patch applies, compiles, is inert without the env variable
```

CI runs gitleaks, the node tests and the e2e test; GitHub Pages is deployed only after they pass.

## Updating the dictionary

1. Edit `projects/saas_dream/symbols*.json` in the bot.
2. `python -I tools/export_fixtures.py` — copies the dictionaries and re-runs the Python reference.
3. Commit `dictionary/` and `fixtures/` together; tests fail if fixtures don't match the dictionary hash.

## License

MIT
