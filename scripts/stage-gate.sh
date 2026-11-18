#!/usr/bin/env bash
# stage-gate.sh — ворота стадии переноса «1-бит» (PLAN-MIGRATE-1BIT §3).
# Запускать ПЕРЕД git commit: проверяются НЕзакоммиченные файлы (индекс + рабочая директория + untracked).
# Ворота: [1] npm run build [2] grep-гейт стиля/цвета [3] php artisan test если тронут PHP
#         [4] headless Chromium: / и /login без реальных ошибок консоли.
# Выход: 0 — все зелёные; 1..4 — провал соответствующих ворот; 2 (общий) — нет git-репозитория.
set -u

PORT=8099
URL_BASE="http://127.0.0.1:$PORT"
LOG_DIR="${TMPDIR:-/tmp}/stage-gate"
CHROMIUM="$HOME/.local/bin/chromium"
export LD_LIBRARY_PATH="$HOME/.local/lib:${LD_LIBRARY_PATH:-}"

# Разрешённые hex-токены (PLAN-1BIT §2): бумага, чернила, приглушённые чернила, поверхность.
ALLOWED_HEX="F4F1EA 0E0E0E 5C5A54 E8E4DA"
# Точечные разрешённые совпадения запрещённых паттернов (сетка-точки, PLAN-1BIT §2).
PATTERN_EXCEPTIONS=('radial-gradient(#0E0E0E')
# Допустимый шум консоли (базовая линия VitePWA, см. MIGRATE-STATUS.md).
CONSOLE_ALLOW='non-precached-url'

REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "не git-репозиторий"; exit 2; }
cd "$REPO" || exit 2
mkdir -p "$LOG_DIR"
say() { printf '%s\n' "$*"; }

# Незакоммиченные файлы (diff HEAD + untracked), интересуют только кодовые пути.
mapfile -t CHANGED < <({ git diff --name-only HEAD; git ls-files --others --exclude-standard; } \
  | sort -u | grep -E '^(resources/|app/|routes/|tests/|tailwind\.config\.js)' || true)

# ---------- [1/4] Сборка ----------
say "[1/4] npm run build"
if CI=1 NO_COLOR=1 npm run build --silent >"$LOG_DIR/build.log" 2>&1; then
  say "  OK (лог: $LOG_DIR/build.log)"
else
  say "  FAIL — см. $LOG_DIR/build.log"; tail -n 15 "$LOG_DIR/build.log"; exit 1
fi

# ---------- [2/4] Grep-гейт: скругления/блюр/градиенты и чужие hex ----------
say "[2/4] grep-гейт (стиль + цвет), файлов к проверке: ${#CHANGED[@]}"
STYLE_FAIL=0
for f in "${CHANGED[@]}"; do
  [ -f "$f" ] || continue
  case "$f" in resources/*|app/*|tailwind.config.js) : ;; *) continue ;; esac
  grep -Iq . "$f" || continue # только текстовые файлы

  hits=$(grep -nE 'border-radius:[[:space:]]*[1-9]|rounded-|blur\(|backdrop-|text-shadow|gradient\(' "$f" || true)
  for ex in "${PATTERN_EXCEPTIONS[@]}"; do
    [ -n "$hits" ] && hits=$(printf '%s\n' "$hits" | grep -vF "$ex" || true)
  done
  if [ -n "$hits" ]; then
    say "  СТИЛЬ $f:"; printf '%s\n' "$hits" | head -n 5; STYLE_FAIL=1
  fi

  while read -r h; do
    [ -z "$h" ] && continue
    H=$(printf '%s' "$h" | tr 'a-f' 'A-F')
    ok=0
    for a in $ALLOWED_HEX; do [ "$H" = "#$a" ] && ok=1; done
    if [ "$ok" -eq 0 ]; then say "  HEX $f: $h"; STYLE_FAIL=1; fi
  done < <(grep -oiE '#[0-9a-f]{3,8}' "$f" | sort -u || true)
done
if [ "$STYLE_FAIL" -eq 1 ]; then
  say "  FAIL"; exit 2
else
  say "  OK (запрещённого нет; допустимые токены: $ALLOWED_HEX)"
fi

# ---------- [3/4] PHP-тесты, если тронут PHP ----------
NEED_PHP=0
for f in "${CHANGED[@]}"; do case "$f" in app/*|routes/*|tests/*) NEED_PHP=1 ;; esac; done
if [ "$NEED_PHP" -eq 1 ]; then
  say "[3/4] php artisan test (PHP изменён)"
  if php artisan test >"$LOG_DIR/php-test.log" 2>&1; then
    grep -E '^  Tests:|Tests:' "$LOG_DIR/php-test.log" | tail -n 1
    say "  OK (лог: $LOG_DIR/php-test.log)"
  else
    say "  FAIL — см. $LOG_DIR/php-test.log"; tail -n 15 "$LOG_DIR/php-test.log"; exit 3
  fi
else
  say "[3/4] php artisan test — пропущено (PHP не изменён)"
fi

# ---------- [4/4] Headless Chromium ----------
say "[4/4] headless Chromium ($URL_BASE/ и /login), порт $PORT"
if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  say "  FAIL — порт $PORT уже занят (чужой сервер не трогаем)"; exit 4
fi
php artisan serve --port="$PORT" >"$LOG_DIR/serve.log" 2>&1 &
SERVE_PID=$!
trap 'kill "$SERVE_PID" 2>/dev/null || true' EXIT
ready=0
for _ in $(seq 1 20); do
  sleep 0.5
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$URL_BASE/" || true)" = "200" ] && { ready=1; break; }
done
if [ "$ready" -ne 1 ]; then say "  FAIL — сервер не поднялся, см. $LOG_DIR/serve.log"; exit 4; fi

CONSOLE_FAIL=0
for url in / /login; do
  name=$(printf '%s' "$url" | tr '/' '_')
  timeout 90 "$CHROMIUM" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --disable-extensions --enable-logging=stderr --v=0 --virtual-time-budget=10000 \
    --dump-dom "$URL_BASE$url" >/dev/null 2>"$LOG_DIR/console$name.log"
  errs=$(grep -E 'ERROR:CONSOLE|Uncaught' "$LOG_DIR/console$name.log" | grep -vF "$CONSOLE_ALLOW" || true)
  if [ -n "$errs" ]; then
    say "  ОШИБКИ КОНСОЛИ $url:"; printf '%s\n' "$errs" | head -n 5; CONSOLE_FAIL=1
  else
    say "  $url: 0 ошибок консоли (лог: $LOG_DIR/console$name.log)"
  fi
done
[ "$CONSOLE_FAIL" -eq 1 ] && exit 4

say "ВСЕ ВОРОТА ЗЕЛЁНЫЕ"
