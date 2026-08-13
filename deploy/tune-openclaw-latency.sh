#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${HOME}/.openclaw/openclaw.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "No existe $CONFIG_FILE" >&2
  exit 1
fi

BACKUP_FILE="${CONFIG_FILE}.backup-latency-$(date +%Y%m%d_%H%M%S)"
cp -a "$CONFIG_FILE" "$BACKUP_FILE"

# Primero validamos todos los cambios. Si la version instalada no reconoce
# alguno, no se modifica ninguna clave.
SETTINGS=(
  'session.dmScope|"per-account-channel-peer"'
  'session.reset|{"mode":"idle","idleMinutes":720}'
  'messages.queue.mode|"steer"'
  'messages.queue.debounceMs|250'
  'messages.queue.debounceMsByChannel.telegram|250'
  'channels.telegram.streaming.mode|"partial"'
)

for setting in "${SETTINGS[@]}"; do
  key="${setting%%|*}"
  value="${setting#*|}"
  openclaw config set "$key" "$value" --strict-json --dry-run >/dev/null
done

for setting in "${SETTINGS[@]}"; do
  key="${setting%%|*}"
  value="${setting#*|}"
  openclaw config set "$key" "$value" --strict-json >/dev/null
done

openclaw config validate
echo "Configuracion de latencia aplicada. Backup: $BACKUP_FILE"
