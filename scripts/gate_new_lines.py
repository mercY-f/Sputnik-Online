#!/usr/bin/env python3
# gate_new_lines.py — grep-гейт ворот стадии ПО НОВЫМ СТРОКАМ (PLAN-MIGRATE-1BIT §3).
# Строка считается «перенесённой» (не новой), если её текст без учёта отступа уже
# встречается в HEAD (resources/, app/, tailwind.config.js) — нужно для чистых move
# (Шаг 4). Полная чистота всего дерева проверяется финальными воротами F2.
# Окружение: GATE_ALLOWED_HEX ("F4F1EA 0E0E0E ..."), GATE_PATTERN_EXCEPTIONS (через пробел).
# Выход: 0 — новых нарушений нет; 2 — есть нарушения.
import os
import re
import subprocess
import sys

STYLE_PAT = re.compile(r"border-radius:\s*[1-9]|rounded-|blur\(\s*[0-9.]|backdrop-|text-shadow|gradient\(")
HEX_PAT = re.compile(r"#[0-9a-f]{3,8}", re.I)
MAX_PRINT = 20


def git_lines(repo, args):
    p = subprocess.run(["git"] + args, cwd=repo, capture_output=True, text=True)
    return p.stdout.splitlines()


def main():
    if len(sys.argv) < 3:
        print("usage: gate_new_lines.py <repo> <file>...", file=sys.stderr)
        return 2
    repo, files = sys.argv[1], sys.argv[2:]
    allowed = {
        "#" + h.lstrip("#").upper()
        for h in os.environ.get("GATE_ALLOWED_HEX", "F4F1EA 0E0E0E 5C5A54 E8E4DA").split()
    }
    exceptions = os.environ.get("GATE_PATTERN_EXCEPTIONS", "radial-gradient(#0E0E0E").split()

    # Строки HEAD (без учёта отступа) = «не новые».
    legacy = {
        ln.strip()
        for ln in git_lines(repo, ["grep", "-h", "-I", "", "HEAD", "--", "resources/", "app/", "tailwind.config.js"])
        if ln.strip()
    }
    untracked = set(git_lines(repo, ["ls-files", "--others", "--exclude-standard"]))

    found = []
    for f in files:
        path = os.path.join(repo, f)
        if not os.path.isfile(path):
            continue
        if f in untracked:
            with open(path, encoding="utf-8", errors="replace") as fh:
                new_lines = list(enumerate(fh.read().splitlines(), 1))
        else:
            # Новые строки дифа с номерами строк нового файла (git diff -U0).
            new_lines = []
            n = 0
            for ln in git_lines(repo, ["diff", "-U0", "HEAD", "--", f]):
                if ln.startswith("+++"):
                    continue
                m = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)", ln)
                if m:
                    n = int(m.group(1))
                    continue
                if ln.startswith("+"):
                    new_lines.append((n, ln[1:]))
                    n += 1
                elif ln.startswith("-") or ln.startswith("\\"):
                    continue
                else:
                    n += 1
        for lineno, text in new_lines:
            if not text.strip() or text.strip() in legacy:
                continue
            if STYLE_PAT.search(text) and not any(ex in text for ex in exceptions):
                found.append(f"  СТИЛЬ {f}:{lineno}: {text.strip()}")
            for h in HEX_PAT.findall(text):
                if h.upper() not in allowed:
                    found.append(f"  HEX {f}:{lineno}: {h}")

    for line in found[:MAX_PRINT]:
        print(line)
    if len(found) > MAX_PRINT:
        print(f"  ... и ещё {len(found) - MAX_PRINT}")
    return 2 if found else 0


if __name__ == "__main__":
    sys.exit(main())
