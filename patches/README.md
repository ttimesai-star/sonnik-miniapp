# Включение Mini App в боте @sonnik_morfey_bot (решает владелец)

**Статус: включено 16.10.2026 ~01:00.** Патч наложен на живой bot.py, бот перезапущен,
кнопка меню = «Дневник» (проверено getChatMenuButton). Где задан URL: переменная пользователя
`SONNIK_WEBAPP_URL` (HKCU\Environment, её наследует сторож bots_keepalive через планировщик)
и явная строка `set` в `Startup\start_veshiy_bot.bat`. Стартовая строка лога бота показывает
`mini app: <url>` или `mini app: выкл` — так видно, увидел ли процесс переменную.

Патч `bot_webapp.patch` ничего не включает сам. Без переменной `SONNIK_WEBAPP_URL` бот ведёт
себя как раньше (проверено `python tests/patch_check.py`: патч применяется к текущему bot.py,
компилируется, без переменной `/app` не перехватывается и меню не меняется).

Что добавляет:
- `/app` (и `/дневник_снов`) — сообщение с кнопкой web_app «Открыть дневник»;
- `python bot.py --set-webapp-menu` — кнопка меню слева от поля ввода открывает Mini App;
- `python bot.py --reset-menu` — вернуть кнопку меню к списку команд (откат);
- `--set-commands` при заданной переменной добавляет команду `/app` в меню команд.

Шаги включения:
1. `cd C:/claude-workspace/projects/saas_dream && copy bot.py bot.py.bak_<дата>_webapp`
2. Из КОРНЯ репозитория: `git apply --directory=projects/saas_dream projects/sonnik_miniapp/patches/bot_webapp.patch`
   (из папки saas_dream `git apply ../...` молча ничего не делает: путь `bot.py` берётся от корня репо и пропускается;
   проверить: `grep -c WEBAPP_URL bot.py` > 0)
3. Задать переменную для процесса бота: `SONNIK_WEBAPP_URL=https://ttimesai-star.github.io/sonnik-miniapp/`
   (в том же месте, откуда бот стартует: bots_keepalive / ярлык автозагрузки), перезапустить бота.
4. По желанию: `python bot.py --set-webapp-menu` и `python bot.py --set-commands`.
5. Проверить с телефона: `/app` → кнопка → дневник открывается, запись сохраняется.

Откат: `python bot.py --reset-menu`; `reg delete HKCU\Environment /v SONNIK_WEBAPP_URL /f`;
убрать строку `set "SONNIK_WEBAPP_URL=..."` из Startup\start_veshiy_bot.bat (копия до правки —
saas_dream/start_veshiy_bot.bat.bak_2026-10-16_webapp); вернуть bot.py из bot.py.bak_2026-10-16_webapp;
перезапустить бота одной копией (мьютекс Localeshiy_sonnik_bot).

Риск: Mini App открывается с GitHub Pages аккаунта ttimesai-star; если аккаунт или Pages
недоступны, кнопка откроет ошибку. Платежей в Mini App нет.
