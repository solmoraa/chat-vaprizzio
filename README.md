# chat-vaprizzio

Agente de atención y ventas para Vaprizzio. WhatsApp (mediante OpenClaw) e Instagram (Meta Webhooks) comparten un único núcleo comercial: Google Sheets, memoria SQLite, carrito, mayorista, takeover humano y registro de ventas.

> Estado inicial: **TEST**. Producción está bloqueada por defecto y no hay números, cuentas, IDs, precios reales ni credenciales en el repositorio.

## Qué está implementado

- Barrera `APP_ENV=test|production` + `ALLOW_PRODUCTION=false`.
- Catálogo Google Sheets y fixtures de prueba.
- Búsqueda global por sabor, modelo, producto y perfil con fuzzy matching conservador.
- Filtro obligatorio `Activo=SI` y `Stock>0`.
- Herramientas deterministas para precio, stock, negocio, mayorista, carrito, resumen y takeover.
- Memoria SQLite aislada por `channel + customer_id`.
- Debounce real de 6 segundos desde el último mensaje, igual en WhatsApp, Messenger e Instagram.
- Estados `AI_ACTIVE`, `WAITING_HUMAN`, `HUMAN_ACTIVE`; en los dos últimos la capa bloquea herramientas de IA.
- Precio negociado persistente y reanudación explícita.
- Instagram con verificación de webhook y firma HMAC.
- Telegram desacoplado para notificaciones humanas (fallback seguro a logs en TEST).
- Venta y stock con revalidación, pero confirmación desactivada hasta definir la regla comercial.
- Tests críticos y auditoría de archivos sensibles.

## Arquitectura

```text
WhatsApp TEST -> OpenClaw --\
                              -> Skill ventas -> API de herramientas -> reglas comerciales
Instagram TEST -> Meta ------/                                  |-> Google Sheets
                                                                    |-> SQLite
                                                                    |-> Telegram/humano
```

OpenClaw se ocupa del canal WhatsApp, sesiones y conversación. Este servicio conserva la fuente de verdad: el LLM no puede crear precios o stock porque solo obtiene esos valores desde herramientas. Instagram manda el mensaje al mismo agente y usa el mismo `conversation_id` aislado por canal.

## Estructura

```text
src/agent          cliente OpenClaw y dispatcher de herramientas
src/catalog        proveedores fixture y Google Sheets
src/channels       adaptadores de canal y seguridad Meta
src/config         validación de entorno y barrera de producción
src/database       memoria SQLite
src/domain         tipos centrales
src/notifications  consola/Telegram
src/services       catálogo, carrito, ventas, debounce, takeover
skills/ventas      instrucciones del agente OpenClaw
openclaw           configuración TEST de referencia
fixtures           catálogo exclusivamente ficticio
tests              pruebas unitarias y anti-alucinación
scripts            auditoría de secretos
```

## Requisitos e instalación

- Node.js 22 o superior.
- OpenClaw instalado en la máquina/gateway.
- Para integración real de TEST: proyecto Google Cloud, Sheet TEST y credenciales de service account.

```bash
npm install
copy .env.example .env
npm run dev
```

Comprobar: `GET http://localhost:3000/health`. Debe responder `env: test` y `productionAllowed: false`.

## Variables de entorno

Copiar `.env.example` a `.env`. Nunca versionar `.env`.

- `APP_ENV`: `test` inicialmente.
- `ALLOW_PRODUCTION`: `false` inicialmente. Con `APP_ENV=production` el proceso falla si no es `true`.
- `CATALOG_PROVIDER`: `fixture` para prueba local o `sheets` para Sheet TEST.
- `DATABASE_PATH`: usar una base diferente para TEST y PROD.
- `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_FILE`: Sheet y JSON local; el JSON queda fuera del repo.
- `OPENCLAW_*`, `WHATSAPP_*`: gateway, agente, token y cuentas TEST.
- `META_*`, `INSTAGRAM_ACCOUNT_ID`: Meta App y cuenta Instagram TEST.
- `TELEGRAM_*`, `INTERNAL_WEBHOOK_SECRET`: canal interno.
- `SALE_CONFIRMATION_MODE`: debe permanecer `disabled` hasta definir la confirmación.

## Google Cloud y Sheet TEST

1. Crear un proyecto Google Cloud exclusivo de prueba.
2. Habilitar **Google Sheets API**.
3. Crear una service account exclusiva de TEST y descargar su JSON fuera del repositorio, por ejemplo `C:\vaprizzio-secrets\google-test.json`.
4. Crear una Google Sheet TEST y compartirla con el email de la service account como editor.
5. Crear las pestañas y encabezados exactos:

| Pestaña | Columnas |
|---|---|
| `PRODUCTOS` | SKU, Marca, Modelo, Sabor, Stock, Precio, Perfil, Descripcion, Activo |
| `SABORES` | Sabor, Tipo, Dulzor, Frescura, Descripcion, SimilarA |
| `MAYORISTA` | Desde, Hasta, PrecioUnitario, Accion |
| `NEGOCIO` | Clave, Valor |
| `VENTAS` | Fecha, ID, Cliente, Canal, Productos, Total, TipoPrecio, PrecioNegociado, Estado |

6. Cargar solo datos ficticios al principio. `Activo` debe ser `SI`; un producto solo se ofrece con stock mayor a cero.
7. Configurar `.env`: `CATALOG_PROVIDER=sheets`, ID y ruta del JSON.
8. Reiniciar y probar búsquedas antes de conectar un canal.

La pestaña `NEGOCIO` debe contener envíos, retiros, horarios, pagos, ubicaciones, garantías y otras reglas. El código no las inventa.

## OpenClaw y WhatsApp TEST

OpenClaw actual se instala y opera como gateway autoalojado. La documentación oficial indica:

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
openclaw dashboard
```

1. Copiar/adaptar `openclaw/openclaw.test.example.json5` a la configuración local de OpenClaw (`~/.openclaw/openclaw.json`). No versionar la configuración real.
2. Apuntar el workspace del agente a este repositorio para que cargue `skills/ventas/SKILL.md`.
3. Instalar el plugin local: `openclaw plugins install ./extensions/vaprizzio-tools` y verificarlo con `openclaw plugins inspect vaprizzio-tools --runtime --json`.
4. Permitir únicamente `vaprizzio-tools` como muestra el ejemplo de configuración.
5. Configurar un proveedor LLM desde `openclaw onboard`; no guardar su clave aquí.
4. Elegir WhatsApp e instalar el plugin cuando el onboarding lo solicite.
5. Usar `openclaw channels login` y escanear el QR desde **un número WhatsApp TEST** en Dispositivos vinculados.
6. Restringir `channels.whatsapp.allowFrom` a teléfonos propios de prueba.
7. Configurar un `OPENCLAW_HOOK_TOKEN` exclusivo y el mismo valor en `.env` y en la configuración local del gateway.
8. Iniciar este servicio y luego el gateway; comprobar `openclaw gateway status`.
9. Enviar desde un teléfono permitido: `Hola`, luego dentro de seis segundos `tenes Miami?`, luego `cuanto sale?`. Debe procesarse como un bloque.

Para conservar el debounce, el hook de mensajes entrantes de WhatsApp debe reenviar cada mensaje a `POST /webhooks/openclaw/inbound` y no activar una segunda ruta directa al agente. Esa ruta persiste el mensaje, respeta takeover y recién despacha a OpenClaw tras seis segundos de silencio. Messenger e Instagram usan la misma espera. Verificar en TEST que cada bloque genera una sola ejecución antes de habilitar más remitentes.

Para desconectar: cerrar la sesión desde Dispositivos vinculados y quitar/deshabilitar el canal en OpenClaw. Las credenciales de WhatsApp residen fuera del repo bajo el estado local de OpenClaw.

## Instagram TEST / Meta Developers

1. Crear una Meta App de tipo Business exclusiva de TEST.
2. Añadir Instagram y Webhooks.
3. Usar una cuenta Instagram profesional de TEST vinculada a una Página de Facebook de TEST.
4. Generar un access token de prueba con los permisos que Meta muestre para Instagram Messaging; no copiarlo al repo.
5. Configurar `META_INSTAGRAM_ACCESS_TOKEN`, `META_INSTAGRAM_APP_SECRET` y un `META_VERIFY_TOKEN` aleatorio en `.env`. Con Instagram Login el backend usa `/me`; `INSTAGRAM_ACCOUNT_ID` queda solo como referencia y no debe reemplazarse por el `instagram_business_account.id` obtenido mediante Facebook Login.
6. Publicar temporalmente `https://TU-HOST/webhooks/instagram` mediante un túnel HTTPS o entorno TEST.
7. En Meta Webhooks, usar esa callback URL y el mismo verify token.
8. Suscribir los eventos de mensajes requeridos por la versión actual de Meta y agregar las cuentas de prueba/roles a la app.
9. Mantener la app en modo Development durante pruebas.
10. Enviar un DM desde otra cuenta TEST y revisar logs/SQLite.

La ruta `GET /webhooks/instagram` valida el challenge y `POST` rechaza payloads sin firma `X-Hub-Signature-256` válida. Los pasos/permisos exactos pueden cambiar en Meta; verificar siempre el panel actual antes de producción.

## Herramientas del agente

`POST /api/tools/:name` con JSON. Herramientas: `buscar_sabor`, `buscar_modelo`, `buscar_producto`, `buscar_por_perfil`, `consultar_stock`, `consultar_precio`, `consultar_negocio`, `consultar_mayorista`, `carrito_agregar`, `carrito_establecer`, `carrito_consultar`, `resumir_pedido`, `solicitar_intervencion_humana`, `registrar_venta`.

Todas las llamadas conversacionales deben incluir `channel` y `customerId`. Cuando el estado no es `AI_ACTIVE`, el dispatcher devuelve `AI_NOT_ACTIVE`. `registrar_venta` rechaza al agente aun cuando más adelante se habilite la confirmación: será un comando interno explícito.

## Takeover humano

- `AI_ACTIVE`: herramientas y respuestas habilitadas.
- `WAITING_HUMAN`: ya se avisó al cliente y se notificó internamente; IA bloqueada.
- `HUMAN_ACTIVE`: humano escribió; IA bloqueada.

Comandos internos vía `POST /webhooks/internal` con header `X-Internal-Secret`:

```json
{"command":"human_message","channel":"whatsapp","customerId":"TEST","text":"por 50 te los dejo a 19.500"}
{"command":"set_negotiated_price","channel":"whatsapp","customerId":"TEST","quantity":50,"unitPrice":19500,"conditions":"combinables"}
{"command":"resume","channel":"whatsapp","customerId":"TEST"}
```

El primer comando intenta extraer cantidad/precio de forma conservadora y entra en `HUMAN_ACTIVE`. Solo `resume` reactiva la IA. En el canal interno, `/reanudar` debe mapearse a `command=resume`.

## Confirmación, ventas y stock

La regla de venta confirmada no fue definida. Por seguridad:

- `SALE_CONFIRMATION_MODE=disabled`.
- Decir “quiero 3” solo modifica carrito.
- Se puede revalidar y mostrar resumen.
- No se registra ni descuenta stock.

Cuando se defina el evento exacto, se habilitará `explicit_internal_command`. El servicio revalida todo el stock inmediatamente antes, registra la venta y recién luego descuenta. Si falla disponibilidad, no descuenta nada en el proveedor fixture; para producción conviene migrar el write path a una base transaccional o Apps Script con lock porque Sheets no ofrece transacciones multioperación.

## Tests y debugging

```bash
npm test
npm run typecheck
npm run audit:secrets
npm run verify
```

Los tests cubren matching, productos agotados/inactivos, perfiles, mayorista, carrito, debounce, producción accidental, takeover, reanudación, precio negociado y prohibición de descontar sin confirmación.

Los logs estructurados incluyen request, herramienta y error. Headers de autorización y secretos internos se redactan. No almacenar tokens, mensajes innecesariamente sensibles ni credenciales. SQLite y logs están ignorados por Git.

## Actualizar el servidor y asegurar atención 24/7

Después de cada cambio de instrucciones, sincronizar el workspace real del agente de ventas; editar solamente los archivos del repo no alcanza:

```bash
cd /home/openclaw/apps/chat-vaprizzio
git pull --ff-only
npm ci
npm run verify
npm run build
sed -i 's/^DEBOUNCE_MS=.*/DEBOUNCE_MS=6000/' .env
grep -q '^CATALOG_CACHE_MS=' .env || printf 'CATALOG_CACHE_MS=5000\n' >> .env
grep -q '^EXTERNAL_REQUEST_TIMEOUT_MS=' .env || printf 'EXTERNAL_REQUEST_TIMEOUT_MS=10000\n' >> .env
grep -q '^OPENCLAW_AGENT_TIMEOUT_SECONDS=' .env || printf 'OPENCLAW_AGENT_TIMEOUT_SECONDS=60\n' >> .env
npm run sync:openclaw
systemctl --user restart chat-vaprizzio-test.service
bash deploy/tune-openclaw-latency.sh
sudo systemctl restart openclaw-gateway.service
```

La afinaciÃ³n separa las sesiones directas por cuenta, canal y cliente para que una
conversaciÃ³n lenta no bloquee a las demÃ¡s, conserva el reinicio por 12 horas,
reduce la espera interna de la cola de Telegram y mantiene la vista parcial de
la respuesta. No cambia los agentes, conocimientos, herramientas ni reglas de
atenciÃ³n existentes.

`GET /health` informa `responseDelayMs` y `catalogCacheMs`. En los logs,
`meta_reply_sent` separa `agentMs` y `deliveryMs`, mientras que
`whatsapp_dispatch_accepted` informa `dispatchMs`; esto permite localizar una
demora futura sin modificar el contenido de las respuestas.

El gateway de OpenClaw es compartido por Telegram y los canales comerciales. En este servidor la unidad real es la unidad de sistema; debe estar habilitada al iniciar el VPS y reiniciarse sola si se corta. La unidad de usuario duplicada debe quedar deshabilitada para evitar dos gateways compitiendo:

```bash
sudo install -d -m 755 /etc/systemd/system/openclaw-gateway.service.d
sudo install -m 644 deploy/openclaw-gateway-availability.conf /etc/systemd/system/openclaw-gateway.service.d/availability.conf
systemctl --user disable --now openclaw-gateway.service 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-gateway.service
sudo systemctl restart openclaw-gateway.service
sudo install -m 755 deploy/openclaw-telegram-watchdog.sh /usr/local/sbin/openclaw-telegram-watchdog
sudo install -m 644 deploy/openclaw-telegram-watchdog.service /etc/systemd/system/openclaw-telegram-watchdog.service
sudo install -m 644 deploy/openclaw-telegram-watchdog.timer /etc/systemd/system/openclaw-telegram-watchdog.timer
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-telegram-watchdog.timer
```

Instalar también el monitor, que verifica cada minuto tanto el backend como el gateway y avisa por Telegram luego de fallas consecutivas:

```bash
install -d -m 700 ~/.config/systemd/user
install -m 644 deploy/chat-vaprizzio-monitor.service ~/.config/systemd/user/chat-vaprizzio-monitor.service
install -m 644 deploy/chat-vaprizzio-monitor.timer ~/.config/systemd/user/chat-vaprizzio-monitor.timer
systemctl --user daemon-reload
systemctl --user enable --now chat-vaprizzio-monitor.timer
```

Verificar al final con `systemctl is-enabled openclaw-gateway.service`, `systemctl is-active openclaw-gateway.service`, `openclaw channels status --probe`, `systemctl list-timers openclaw-telegram-watchdog.timer` y `systemctl --user list-timers chat-vaprizzio-monitor.timer`. El watchdog exige dos controles fallidos consecutivos antes de reiniciar el gateway, para evitar reinicios por una demora aislada. Esto fortalece la disponibilidad de Telegram sin modificar el workspace ni los conocimientos de `vaprizziobot`.

## Corrección del medio de venta en vaprizziobot

El instalador `deploy/install-vaprizziobot-sale-platform-fix.sh` agrega una
operación administrativa que modifica exclusivamente la plataforma de una
venta existente. Antes de instalar crea un respaldo privado del agente. La
instalación no modifica ninguna venta; una actualización real requiere número
de orden y plataforma. También agrega una validación obligatoria para impedir
que una venta manual se registre sin que el usuario haya confirmado el canal.
Además normaliza los nombres alternativos de la forma de pago (incluido
`forma_de_pago`, que algunos modelos generan) y obliga al agente a ejecutar un
solo intento por pedido. La comprobación del instalador usa una lista de
productos vacía y por eso no escribe en Sheets ni modifica stock.
Los errores del dispatcher se entregan como JSON estructurado con `ok=false`
sin un fallo de shell, evitando que Telegram exponga tarjetas `Exec failed`,
rutas o nombres internos; el agente sigue considerándolos operaciones no
realizadas.

```bash
cd /home/openclaw/apps/chat-vaprizzio
bash deploy/install-vaprizziobot-sale-platform-fix.sh
```

## Mantenimiento

- Catálogo/precios/stock: editar `PRODUCTOS`.
- Recomendaciones: editar `SABORES`.
- Tramos: editar `MAYORISTA`; `CONSULTAR` jamás expone precio automático.
- Políticas: editar `NEGOCIO`.
- Cambios de comportamiento: editar `skills/ventas/SKILL.md` y agregar tests.

## Paso TEST → PRODUCTION

1. Hacer backup y ejecutar `npm run verify`.
2. Crear credenciales, Sheet, base, números y cuentas **separados** de TEST.
3. Repetir pruebas de humo con las credenciales de producción aún desconectadas.
4. Cambiar variables, manteniendo `ALLOW_PRODUCTION=false`.
5. Validar que el proceso se niega a iniciar.
6. En ventana controlada, cambiar `ALLOW_PRODUCTION=true`, iniciar un único worker y verificar allowlists/webhooks.
7. Monitorear logs y takeover.

No copiar `.env` TEST sobre PROD ni reutilizar tokens.

## Rollback inmediato a TEST

1. Detener el servicio y OpenClaw.
2. Cambiar `ALLOW_PRODUCTION=false` antes de cualquier otro cambio.
3. Desconectar WhatsApp/Instagram PROD o quitar sus suscripciones webhook.
4. Restaurar `.env` TEST, `APP_ENV=test`, Sheet/base TEST y allowlists de prueba.
5. Reiniciar y comprobar `/health`.

## Problemas comunes

- `PRODUCTION_BLOCKED`: la barrera funciona; revisar entorno y no habilitar sin checklist.
- `Google Sheets requiere...`: faltan ID/ruta o el JSON no es legible.
- No aparecen productos: revisar `Activo=SI`, stock numérico positivo y encabezados.
- `AI_NOT_ACTIVE`: conversación en takeover; usar reanudación interna solo cuando el humano terminó.
- Meta devuelve 401: firma/secret incorrecto o proxy modificando el body.
- OpenClaw no responde: comprobar gateway, plugin, allowlist, agent ID y hook token.
- Telegram falla: revisar bot/chat ID; en TEST sin credenciales se registra una notificación local.

## Seguridad

- Repositorio privado; no cambiar visibilidad.
- `.env`, service accounts, sesiones, SQLite, cookies y logs están ignorados.
- Nunca exponer el gateway directamente sin autenticación.
- Usar token dedicado para hooks, distinto del token del gateway.
- Instalar únicamente plugins/skills confiables y mantener OpenClaw actualizado.
- Ejecutar con usuario sin privilegios y mínimo acceso a red/archivos.

Documentación oficial consultada: [OpenClaw](https://docs.openclaw.ai/), [configuración del Gateway](https://docs.openclaw.ai/gateway/configuration) y [canales](https://docs.openclaw.ai/channels).
