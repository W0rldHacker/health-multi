# Пример unit-файлов systemd для health-multi

Ниже приведены минимальные unit-файлы для запуска `health-multi` в режиме экспорта
метрик через systemd. Конфигурация повторяет пример из пользовательской
спецификации и может служить отправной точкой для собственной автоматизации.

## Сервис `health-multi.service`

```ini
[Unit]
Description=health-multi Prometheus exporter
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/health-multi export \
  --config /etc/health/services.yaml \
  --format prometheus \
  --file /var/lib/node_exporter/textfile/health.prom
Restart=on-failure
RestartSec=5

# По умолчанию health-multi пишет диагностический вывод в stderr,
# поэтому перенаправляем его в journald.
StandardError=journal

[Install]
WantedBy=multi-user.target
```

## Таймер `health-multi.timer`

```ini
[Unit]
Description=Periodic health-multi run

[Timer]
OnBootSec=30s
OnUnitActiveSec=1m
AccuracySec=10s
Unit=health-multi.service

[Install]
WantedBy=timers.target
```

## Развёртывание

1. Скопируйте файлы `health-multi.service` и `health-multi.timer` в
   `/etc/systemd/system/`.
2. Обновите путь до бинарника или конфигурации при необходимости.
3. Создайте каталог `/var/lib/node_exporter/textfile/`, если он ещё не существует,
   и убедитесь, что права доступа позволяют `health-multi` записывать файлы.
4. Примените конфигурацию:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now health-multi.timer
   ```

5. Проверяйте статус через `systemctl status health-multi.service` и журнал с
   помощью `journalctl -u health-multi.service`.

Таймер запускает сервис каждую минуту. При необходимости скорректируйте значения
`OnUnitActiveSec` и `AccuracySec`, чтобы подстроить частоту опроса под вашу
инфраструктуру.
