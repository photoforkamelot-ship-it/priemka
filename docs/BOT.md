# Создание бота

1. Telegram → **@BotFather** → Start.
2. `/newbot` → имя `Приёмка магазина` → username на `bot` (например `priemka_yarche_bot`).
3. Сохраните токен у себя. Никому не пересылайте — он вставляется только в Lockbox при запуске (DEPLOY.md).
4. `/setdescription` — «Обход и приёмка магазина: замечания, письмо, первый день, памятка.»
5. `/setcommands`:
   ```
   start - Открыть приложение
   objects - Мои объекты
   help - Помощь
   ```
6. После выкладки приложения: `/newapp` (или `/setmenubutton`) → ссылка на Mini App из DEPLOY.md, шаг «Статика».
