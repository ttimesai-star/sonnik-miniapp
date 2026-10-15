# Включение Mini App в боте @sonnik_morfey_bot (решает владелец)

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
2. `git apply ../sonnik_miniapp/patches/bot_webapp.patch` (или `git apply --check` сначала)
3. Задать переменную для процесса бота: `SONNIK_WEBAPP_URL=https://ttimesai-star.github.io/sonnik-miniapp/`
   (в том же месте, откуда бот стартует: bots_keepalive / ярлык автозагрузки), перезапустить бота.
4. По желанию: `python bot.py --set-webapp-menu` и `python bot.py --set-commands`.
5. Проверить с телефона: `/app` → кнопка → дневник открывается, запись сохраняется.

Откат: `python bot.py --reset-menu`, убрать переменную, вернуть bot.py из копии.

Риск: Mini App открывается с GitHub Pages аккаунта ttimesai-star; если аккаунт или Pages
недоступны, кнопка откроет ошибку. Платежей в Mini App нет.
