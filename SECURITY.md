# Seguridad operativa

## Secretos

- `.env`, credenciales de Google, bases SQLite, claves privadas y sesiones nunca se versionan.
- En producción, `TOOL_API_TOKEN`, `INTERNAL_WEBHOOK_SECRET` y `OPENCLAW_HOOK_TOKEN` deben ser distintos y tener al menos 32 caracteres aleatorios.
- La credencial de Google debe pertenecer únicamente a Vaprizzio, tener el mínimo acceso necesario y permisos de archivo `600`.
- Rotar inmediatamente todo secreto que haya aparecido en Git, una captura, un chat o un registro. Borrarlo del último commit no invalida una copia histórica.
- Rotación trimestral recomendada y también ante cambios de personal, incidentes o pérdida de dispositivos.

## Exposición

- El backend escucha exclusivamente en `127.0.0.1`.
- `/api/tools/*` usa token Bearer y límite de solicitudes.
- `/webhooks/internal` conserva un secreto independiente.
- No abrir el puerto del backend en firewall, proxy inverso ni Docker.

## Datos

- Las conversaciones se purgan según `CONVERSATION_RETENTION_DAYS` (30 días por defecto).
- Telegram enmascara secuencias financieras de 16 a 24 dígitos.
- No almacenar archivos de comprobantes en este servicio.

## Incidentes

1. Deshabilitar el canal afectado.
2. Rotar tokens y credenciales.
3. Revisar logs sin compartir secretos.
4. Verificar `/health`, `/ready`, Google Sheets, Telegram y OpenClaw.
5. Reactivar primero en TEST.
