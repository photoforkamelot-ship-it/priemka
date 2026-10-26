# Запуск на сервере (без Yandex Cloud)

Приложение — один процесс на Python. Ему нужно:
- сервер с Ubuntu 22.04/24.04, где программа работает постоянно и может выходить в интернет по 443 (к Telegram и Яндекс Диску);
- адрес с HTTPS — без него Telegram не откроет Mini App.

Подойдёт любой VPS (например, VPS у Beget, где у вас уже есть аккаунт). **Бесплатный хостинг Beget не подойдёт**: там сервер может выходить только на порт 80, поэтому бот не сможет писать в Telegram и загружать фото в Диск.

Яндекс Диск — отдельный сервис, на сбой Yandex Cloud он не завязан: фото идут в ваш Диск через его API по OAuth-токену.

Токены (бота и Диска) вводятся только на сервере в файл `backend/.env`. В чат и в git их не отправляйте.

## 1. Сервер

Создайте VPS с Ubuntu, 1 ядро и 1 ГБ памяти хватит. Запишите IP и пароль root. Подключитесь: `ssh root@IP` (в Windows — PowerShell или PuTTY).

```bash
apt update && apt install -y python3-venv git caddy
git clone https://github.com/photoforkamelot-ship-it/priemka.git /opt/priemka
cd /opt/priemka && python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
```

## 2. Адрес с HTTPS

- **Свой домен.** В DNS добавьте A-запись, например `priemka.вашдомен.ru` → IP сервера.
- **Без домена.** Используйте `IP-через-дефисы.sslip.io`, например `85-192-10-20.sslip.io`. Такой адрес сам указывает на ваш IP.

Файл `/etc/caddy/Caddyfile`:
```
priemka.вашдомен.ru {
    reverse_proxy 127.0.0.1:8080
}
```
Затем `systemctl reload caddy`. Caddy сам получит и будет продлевать сертификат.

## 3. Токен Яндекс Диска

Токен даёт доступ к Диску, на который будут складываться фото. Лучше завести отдельный Диск команды открытия, а не личный.

1. Войдите в этот Яндекс-аккаунт → https://oauth.yandex.ru → «Создать приложение».
2. Название «Приёмка магазина», платформа «Веб-сервисы», Redirect URI: `https://oauth.yandex.ru/verification_code`.
3. Доступы → «Яндекс Диск REST API»: «Запись в любом месте на Диске» и «Чтение всего Диска». Создайте приложение и скопируйте **ClientID**.
4. Откройте `https://oauth.yandex.ru/authorize?response_type=token&client_id=ВАШ_ClientID` → «Разрешить». На странице появится токен.

Токен действует около года. За месяц до конца срока повторите шаг 4.

## 4. Настройки

```bash
cd /opt/priemka/backend && cp .env.example .env && nano .env
```
Заполните поля:
- `BOT_TOKEN` — токен от @BotFather;
- `DISK_TOKEN` — токен из шага 3;
- `APP_URL` — `https://` + адрес из шага 2;
- `WEBHOOK_SECRET` — длинная случайная строка (команда для неё есть в файле).

Сохраните: Ctrl+O, Enter, Ctrl+X. Затем `chmod 600 .env`.

## 5. Автозапуск

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

## 6. Подключить Mini App к боту

@BotFather → `/mybots` → @priemka_yarche_bot → Bot Settings → Menu Button → ссылка `APP_URL`. Для полноэкранного приложения: `/newapp` → тот же адрес.

Проверка: в боте нажмите /start → «Открыть приложение» → создайте объект → в замечании добавьте фото. Оно должно появиться на Диске в папке `Приёмка/<КОД>/<Зона>/`.

## Как это работает

- Данные лежат в `backend/data/priemka.sqlite`. Каждое утро сохраняется копия в `backend/data/backup/`: 7 файлов, по одному на день недели.
- Напоминания бота уходят раз в день в `REMIND_HOUR` по времени `TZ_HOURS`.
- Обновление: `cd /opt/priemka && git pull && systemctl restart priemka`.
