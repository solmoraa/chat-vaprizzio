#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${VAPRIZZIOBOT_TARGET:-/home/openclaw/.openclaw/workspace/vaprizziobot}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_ROOT="${VAPRIZZIOBOT_BACKUP_ROOT:-/home/openclaw/secure-backups}"
BACKUP="${BACKUP_ROOT}/vaprizziobot-platform-fix-${STAMP}"

test -d "$TARGET/scripts"
test -f "$TARGET/scripts/agente_vaprizzio.py"
test -f "$TARGET/AGENTS.md"
test -f "$TARGET/TOOLS.md"

umask 077
mkdir -p "$BACKUP"
cp -a "$TARGET/scripts/agente_vaprizzio.py" "$BACKUP/"
cp -a "$TARGET/AGENTS.md" "$TARGET/TOOLS.md" "$BACKUP/"
test -f "$TARGET/scripts/modificar_plataforma_venta.py" \
  && cp -a "$TARGET/scripts/modificar_plataforma_venta.py" "$BACKUP/" \
  || true

install -m 700 \
  "$SOURCE_DIR/vaprizziobot/modificar_plataforma_venta.py" \
  "$TARGET/scripts/modificar_plataforma_venta.py"

"$TARGET/.venv/bin/python" - "$TARGET" <<'PY'
from pathlib import Path
import sys

target = Path(sys.argv[1])
agent_script = target / "scripts" / "agente_vaprizzio.py"
source = agent_script.read_text(encoding="utf-8")
original_source = source

platform_block = '''    plataforma = requerido(
        payload,
        "plataforma",
        "la plataforma de venta",
    )
'''
platform_guard = '''    plataforma = requerido(
        payload,
        "plataforma",
        "la plataforma de venta",
    )
    if payload.get("plataforma_confirmada") is not True:
        raise BusinessError(
            "Falta confirmar la plataforma de venta con el usuario."
        )
'''
if "plataforma_confirmada" not in source:
    if platform_block not in source:
        raise SystemExit(
            "No se encontró la validación de plataforma en agente_vaprizzio.py"
        )
    source = source.replace(platform_block, platform_guard, 1)

if '"modificar-plataforma-venta"' not in source:
    marker = "ACCIONES = {"
    if marker not in source:
        raise SystemExit("No se encontró ACCIONES en agente_vaprizzio.py")
    function = '''def ejecutar_modificar_plataforma_venta(
    payload: dict[str, Any],
) -> dict[str, Any]:
    from modificar_plataforma_venta import cambiar_plataforma_venta

    orden = payload.get("orden") or payload.get("numero_orden")
    if orden in (None, ""):
        raise BusinessError("Falta indicar la orden.")
    plataforma = requerido(
        payload,
        "plataforma",
        "la nueva plataforma de venta",
    )
    return cambiar_plataforma_venta(
        orden=orden,
        plataforma=plataforma,
        hoja=payload.get("hoja"),
    )


'''
    source = source.replace(marker, function + marker, 1)
    source = source.replace(
        marker,
        marker + '\n    "modificar-plataforma-venta": ejecutar_modificar_plataforma_venta,',
        1,
    )
if source != original_source:
    agent_script.write_text(source, encoding="utf-8")

agent_rules = '''

<!-- INICIO FIX PLATAFORMA VENTA 20260813 -->
## Plataforma obligatoria y corrección posterior

- Para registrar ventas usar exclusivamente `agente_vaprizzio.py registrar-venta`.
- La plataforma debe estar expresamente indicada por el usuario en la conversación actual.
- Si falta, no ejecutar ninguna herramienta y preguntar solamente: `¿Por qué medio realizaste la venta?`
- Solo después de la respuesta explícita, ejecutar `registrar-venta` incluyendo `"plataforma_confirmada":true`.
- Nunca deducir `Venta presencial` por proximidad, entrega, efectivo, retiro ni falta de información.
- Nunca usar forma de pago como plataforma.
- Para corregir el medio de una venta existente, pedir la orden si falta y ejecutar una sola vez `modificar-plataforma-venta`.
- Esa operación modifica únicamente la plataforma. No volver a registrar la venta y no cambiar stock, cantidades, precios, pagos ni ganancias.
- Nunca mencionar al usuario scripts, nombres de hojas, rutas, trazas ni diagnósticos internos.
- Si la orden aparece en varios meses, preguntar únicamente: `¿De qué mes es la venta?` y reintentar cuando responda.
- Nunca inventar la causa de otro error. Si la herramienta falla, responder únicamente: `No pude modificar la venta y no se realizó ningún cambio. Revisemos el número de orden y volvé a intentarlo.`
- No prometer reintentos ni acciones futuras que no se ejecuten en ese mismo turno.
<!-- FIN FIX PLATAFORMA VENTA 20260813 -->
'''

tool_rules = '''

<!-- INICIO TOOL MODIFICAR PLATAFORMA 20260813 -->
## Modificar la plataforma de una venta existente

Ejecutar mediante el dispatcher seguro:

`/home/openclaw/.openclaw/workspace/vaprizziobot/.venv/bin/python /home/openclaw/.openclaw/workspace/vaprizziobot/scripts/agente_vaprizzio.py modificar-plataforma-venta --json '{"orden":"123","plataforma":"Instagram"}'`

Si el número de orden aparece en más de una hoja, repetir únicamente después de que el usuario identifique el mes:

`{"orden":"123","plataforma":"Instagram","hoja":"Ventas Agosto"}`

Cuando el resultado tenga `"ok": true`, responder:

`Medio de venta actualizado correctamente:\n\nOrden: {orden}\nMedio anterior: {plataforma_anterior}\nMedio nuevo: {plataforma}`

Esta herramienta modifica exclusivamente la columna de plataforma. Si una venta ocupa varias filas en la misma hoja, actualiza esa columna en todas ellas. Está prohibido usar `modificar_venta.py`, `ajustar-venta-manual` o volver a registrar la venta para cambiar la plataforma.
<!-- FIN TOOL MODIFICAR PLATAFORMA 20260813 -->
'''

for filename, block, end_marker in (
    ("AGENTS.md", agent_rules, "FIN FIX PLATAFORMA VENTA 20260813"),
    ("TOOLS.md", tool_rules, "FIN TOOL MODIFICAR PLATAFORMA 20260813"),
):
    path = target / filename
    text = path.read_text(encoding="utf-8")
    if end_marker not in text:
        path.write_text(text.rstrip() + block + "\n", encoding="utf-8")
PY

"$TARGET/.venv/bin/python" -m py_compile \
  "$TARGET/scripts/modificar_plataforma_venta.py" \
  "$TARGET/scripts/agente_vaprizzio.py"

"$TARGET/.venv/bin/python" \
  "$TARGET/scripts/agente_vaprizzio.py" --help \
  | grep -q 'modificar-plataforma-venta'

printf 'Corrección instalada. Backup: %s\n' "$BACKUP"
printf 'No se modificaron ventas durante la instalación.\n'
