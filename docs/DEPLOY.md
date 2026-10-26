# Запуск

Два варианта. Код один и тот же, Yandex Cloud не нужен ни в одном.

| | А. PythonAnywhere (бесплатно) | Б. Свой VPS (платно) |
|---|---|---|
| Цена | 0 ₽ | аренда сервера |
| Адрес | `https://ЛОГИН.pythonanywhere.com` | свой домен или `IP.sslip.io` |
| Напоминания бота | будильник GitHub Actions, раз в день | встроены |
| Обслуживание | раз в месяц нажать «продлить» (бот напомнит) | обновления сервера |

Яндекс Диск — отдельный сервис, со сбоем Yandex Cloud не связан. На бесплатном PythonAnywhere выход в интернет открыт только к разрешённым сайтам. Яндекс (`.yandex.net`) и Telegram в этом списке есть.

**Токены бота, Диска и секреты вводятся только на сервере и в настройках GitHub. В чат и в код их не отправляйте.**

## Вариант А. PythonAnywhere + GitHub

### А1. Аккаунт

https://www.pythonanywhere.com → Pricing & signup → **Create a Beginner account** (бесплатно). Логин станет адресом приложения, например `priemka.pythonanywhere.com`.

### А2. Код

Вкладка **Consoles** → **Bash**:
```bash
git clone https://github.com/photoforkamelot-ship-it/priemka.git ~/priemka
pip3.12 install --user -r ~/priemka/backend/requirements.txt
```
Если репозиторий закрытый, git спросит логин и пароль. Вместо пароля нужен токен GitHub: Settings → Developer settings → Personal access tokens.

### А3. Токен Яндекс Диска

Лучше завести отдельный Яндекс-аккаунт команды открытия: фото будут складываться на его Диск.

1. Войдите в этот аккаунт → https://oauth.yandex.ru → «Создать приложение».
2. Платформа «Веб-сервисы», Redirect URI: `https://oauth.yandex.ru/verification_code`.
3. Доступы «Яндекс Диск REST API»: «Запись в любом месте на Диске» и «Чтение всего Диска». Скопируйте **ClientID**.
4. Откройте `https://oauth.yandex.ru/authorize?response_type=token&client_id=ВАШ_ClientID` → «Разрешить» → появится токен.

Токен действует около года.

### А4. Настройки

В той же консоли:
```bash
cd ~/priemka/backend && cp .env.example .env
python3.12 -c "import secrets; print(secrets.token_hex(24)); print(secrets.token_hex(24))"
```
Две строки, которые выведет команда, — это `WEBHOOK_SECRET` и `CRON_SECRET`.

Вкладка **Files** → `priemka/backend/.env` → заполните:
- `BOT_TOKEN` — от @BotFather;
- `DISK_TOKEN` — токен из шага А3;
- `APP_URL` — `https://ЛОГИН.pythonanywhere.com`;
- `WEBHOOK_SECRET` и `CRON_SECRET` — две строки выше;
- `ADMIN_TG` — ваш числовой id в Telegram: его покажет бот @userinfobot. На этот id бот будет напоминать о продлении.

Нажмите Save.

### А5. Сайт

1. Вкладка **Web** → **Add a new web app** → Next → **Manual configuration** → **Python 3.12**.
2. Ссылка **WSGI configuration file**: удалите всё содержимое и вставьте (вместо ЛОГИН — ваш логин):
   ```python
   import sys; sys.path.insert(0, "/home/ЛОГИН/priemka/backend")
   from wsgi import application
   ```
   Нажмите Save.
3. На вкладке Web включите **Force HTTPS** → нажмите **Reload**.
4. Откройте `https://ЛОГИН.pythonanywhere.com` с телефона: должна появиться страница приложения с ошибкой «нет доступа». Это нормально, вход работает только из Telegram.

### А6. Вебхук бота

В Bash-консоли:
```bash
cd ~/priemka/backend && python3.12 -c "from wsgi import app; print(app.set_webhook())"
```
Должно быть `'ok': True`.

### А7. Будильник для напоминаний (GitHub)

На бесплатном PythonAnywhere нет задач по расписанию, поэтому раз в день приложение будит GitHub.

1. Репозиторий на GitHub → Settings → Secrets and variables → Actions → **New repository secret**. Добавьте два секрета:
   - `APP_URL` = `https://ЛОГИН.pythonanywhere.com`;
   - `CRON_SECRET` = то же значение, что в `.env`.
2. Вкладка **Actions** → daily-reminders → **Run workflow**. Через минуту должна появиться зелёная галочка.

Будильник срабатывает в 9:00 по Томску, иногда с опозданием до часа. Если в репозитории 60 дней не было изменений, GitHub приостанавливает будильник и присылает письмо: включите его кнопкой в письме или на вкладке Actions.

### А8. Кнопка в боте

@BotFather → `/mybots` → @priemka_yarche_bot → Bot Settings → Menu Button → `https://ЛОГИН.pythonanywhere.com`.

### Обслуживание

- **Раз в месяц**: вкладка Web → **Run until 1 month from today**. Без этого сайт остановится. Бот напомнит 1-го и 15-го числа.
- **Обновление**: в Bash-консоли `cd ~/priemka && git pull`, затем Web → Reload.
- **Данные** лежат в `backend/data/priemka.sqlite`. Каждое утро делается копия в `backend/data/backup/`. Чтобы забрать её к себе: Files → Download.

## Вариант Б. Свой VPS

Нужен сервер с Ubuntu и выходом в интернет по 443. Бесплатный хостинг Beget не подходит: там открыт только порт 80.

### Б1. Сервер

Создайте VPS с Ubuntu, 1 ядро и 1 ГБ памяти хватит. Запишите IP и пароль root. Подключитесь: `ssh root@IP` (в Windows — PowerShell или PuTTY).

```bash
apt update && apt install -y python3-venv git caddy
git clone https://github.com/photoforkamelot-ship-it/priemka.git /opt/priemka
cd /opt/priemka && python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
```

### Б2. Адрес с HTTPS

- **Свой домен.** В DNS добавьте A-запись, например `priemka.вашдомен.ru` → IP сервера.
- **Без домена.** Используйте `IP-через-дефисы.sslip.io`, например `85-192-10-20.sslip.io`. Такой адрес сам указывает на ваш IP.

Файл `/etc/caddy/Caddyfile`:
```
priemka.вашдомен.ru {
    reverse_proxy 127.0.0.1:8080
}
```
Затем `systemctl reload caddy`. Caddy сам получит и будет продлевать сертификат.

### Б3. Токен Яндекс Диска

Как в шаге А3. Токен даёт доступ к Диску, на который будут складываться фото. Лучше завести отдельный Диск команды открытия, а не личный.

1. Войдите в этот Яндекс-аккаунт → https://oauth.yandex.ru → «Создать приложение».
2. Название «Приёмка магазина», платформа «Веб-сервисы», Redirect URI: `https://oauth.yandex.ru/verification_code`.
3. Доступы → «Яндекс Диск REST API»: «Запись в любом месте на Диске» и «Чтение всего Диска». Создайте приложение и скопируйте **ClientID**.
4. Откройте `https://oauth.yandex.ru/authorize?response_type=token&client_id=ВАШ_ClientID` → «Разрешить». На странице появится токен.

Токен действует около года. За месяц до конца срока повторите шаг 4.

### Б4. Настройки

```bash
cd /opt/priemka/backend && cp .env.example .env && nano .env
```
Заполните поля:
- `BOT_TOKEN` — токен от @BotFather;
- `DISK_TOKEN` — токен из шага 3;
- `APP_URL` — `https://` + адрес из шага 2;
- `WEBHOOK_SECRET` — длинная случайная строка (команда для неё есть в файле).

Сохраните: Ctrl+O, Enter, Ctrl+X. Затем `chmod 600 .env`.

### Б5. Автозапуск

`/etc/systemd/system/priemka.service`:
```
[Unit]
Description=Priemka bot + Mini App
After=network-online.target

[Service]
WorkingDirectory=/opt/priemka/backend
ExecStart=/opt/priemka/.venv/bin/python server.py
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```
```bash
systemctl daemon-reload && systemctl enable --now priemka
journalctl -u priemka -n 20     # должно быть «setWebhook: True» и «listening»
```

### Б6. Подключить Mini App к боту

@BotFather → `/mybots` → @priemka_yarche_bot → Bot Settings → Menu Button → ссылка `APP_URL`. Для полноэкранного приложения: `/newapp` → тот же адрес.

Проверка: в боте нажмите /start → «Открыть приложение» → создайте объект → в замечании добавьте фото. Оно должно появиться на Диске в папке `Приёмка/<КОД>/<Зона>/`.

### Как это работает на VPS

- Данные лежат в `backend/data/priemka.sqlite`. Каждое утро сохраняется копия в `backend/data/backup/`: 7 файлов, по одному на день недели.
- Напоминания бота уходят раз в день в `REMIND_HOUR` по времени `TZ_HOURS`.
- Обновление: `cd /opt/priemka && git pull && systemctl restart priemka`.
