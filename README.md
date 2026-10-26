# Приёмка магазина — Telegram Mini App + бот

Бот: @priemka_yarche_bot.

Приложение для руководителей команды открытия «Ярче!»: данные объекта, «Первый день»,
договоры, заявка АХЧ, дворник, напоминания бота. ТЗ: https://claude.ai/artifact/XXwqmcL5jBzszWcXuSfqHS ·
макеты: https://claude.ai/artifact/M18VYyd7nceQcNpfeYnPLC

## Состав

| Папка | Что внутри |
|---|---|
| `backend/app/telegram_auth.py` | проверка подписи Telegram (initData) |
| `backend/app/models.py` | объект: код, адрес, округ, даты, люди, договоры |
| `backend/app/api.py` | HTTP API (без фреймворка) |
| `backend/app/firstday.py` | список «Первый день» и напоминания бота |
| `backend/app/generators/` | заявка АХЧ, запрос договоров, подпись Outlook, группа WhatsApp, вкладыш на конверт, объявление о дворнике, распознавание договоров, .vcf |
| `backend/app/storage.py` | хранилище: память / файл (локально), YDB (облако) |
| `backend/function.py` | точки входа Yandex Cloud Functions |
| `bot/bot.py` | бот: /start, кнопки, файлы «на печать», ежедневные напоминания |
| `miniapp/` | экраны приложения (HTML/CSS/JS без сборки) |
| `docs/` | инструкции по запуску |

## Локальный запуск

```bash
pip install -r backend/requirements.txt pytest
cd backend && python -m pytest -q        # тесты
python devserver.py                       # http://localhost:8080 — без Telegram, пользователь «Тест»
```

## Готово / дальше

- [x] Данные объекта и люди, «Первый день», договоры (загрузка, распознавание, «Запросить у …»), заявка АХЧ, дворник (объявление, конверт), .vcf, напоминания
- [ ] Обход по блокам, замечания с фото и сроком, Яндекс Диск
- [ ] Письмо и апдейты (копирование в Outlook), «принято», недовозы по нормам, блок статусов
- [ ] Запуск в Yandex Cloud — `docs/DEPLOY.md`
