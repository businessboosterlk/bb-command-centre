#!/usr/bin/env python3
"""
BB Command Centre — pre-deploy QA check.
Catches the class of bugs that ship silently in a single-file HTML app:
  1. onclick/onchange handlers that call a function that is never defined
  2. showPage('x') targets that have no matching page / case
  3. duplicate element id="" attributes
Run:  python3 qa-check.py
Exits non-zero (blocks commit) if any real problem is found.
"""
import re, sys, pathlib

HTML = pathlib.Path(__file__).with_name("index.html")
src = HTML.read_text(encoding="utf-8")

# ---- 1. collect every function name that IS defined -------------------------
defined = set()
defined |= set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*\(', src))          # function foo(
defined |= set(re.findall(r'(?:window\.)?([A-Za-z_$][\w$]*)\s*=\s*function', src))  # foo = function
defined |= set(re.findall(r'(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(', src))  # const foo = (
defined |= set(re.findall(r'(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>', src))  # const foo = x =>
defined |= set(re.findall(r'window\.([A-Za-z_$][\w$]*)\s*=', src))              # window.foo =

# JS built-ins / DOM globals that are always available
BUILTINS = {
    'alert','confirm','prompt','console','setTimeout','setInterval','clearTimeout','clearInterval',
    'parseInt','parseFloat','JSON','Math','Date','Object','Array','String','Number','Boolean',
    'event','this','window','document','localStorage','sessionStorage','fetch','Promise',
    'requestAnimationFrame','encodeURIComponent','decodeURIComponent','isNaN','return','if','for',
    # browser constructors used inside handlers (new Event('change') on the Finance month picker, 7 Oct 2026)
    'Event','CustomEvent','KeyboardEvent','MouseEvent','Set','Map','URL','URLSearchParams','RegExp','Error',
    'while','typeof','new','void','delete','await','async','function','true','false','null','undefined',
    # CSS functions that appear inside inline style="" strings set within handlers
    'var','calc','rgb','rgba','hsl','hsla','url','translate','translateX','translateY','scale','rotate','linear',
}

# ---- 2. scan inline handlers ------------------------------------------------
problems = []
for m in re.finditer(r'on(?:click|change|input|submit|keyup|keydown|mouseover|blur|focus)\s*=\s*"([^"]+)"', src):
    code = m.group(1)
    # find top-level function calls: name(  not preceded by a dot
    for call in re.finditer(r'(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(', code):
        name = call.group(1)
        if name in BUILTINS or name in defined:
            continue
        problems.append(f"UNDEFINED FUNCTION  '{name}(' called in handler: {code[:70]}")

# ---- 3. showPage targets must exist -----------------------------------------
page_targets = set(re.findall(r"showPage\(\s*'([a-zA-Z0-9_]+)'", src))
for t in sorted(page_targets):
    has_page = f'id="page-{t}"' in src or f"id='page-{t}'" in src
    has_case = f"=== '{t}'" in src or f'=== "{t}"' in src or f"page === '{t}'" in src
    if not (has_page or has_case):
        problems.append(f"BROKEN showPage  showPage('{t}') has no page-{t} element and no matching case")

# ---- 4. duplicate ids -------------------------------------------------------
ids = re.findall(r'\sid="([^"]+)"', src)
seen, dupes = set(), set()
for i in ids:
    if i in seen: dupes.add(i)
    seen.add(i)
for d in sorted(dupes):
    problems.append(f"DUPLICATE id  id=\"{d}\" appears more than once")

# ---- 5. every inline <script> must parse (added 2026-10-07) ------------------
# The platform restyle swapped a font name inside a single-quoted JS string and
# one bad quote killed the whole script block: 20 functions vanished, every page
# blank. Checks 1 to 4 cannot see that. node --check can.
import shutil, subprocess, tempfile, os
node = shutil.which("node") or os.path.expanduser("~/.local/node/bin/node")
if os.path.exists(node):
    blocks = re.findall(r'<script(?![^>]*\bsrc=)(?![^>]*type="(?:application/ld\+json|application/json)")[^>]*>(.*?)</script>', src, re.S)
    with tempfile.TemporaryDirectory() as tmp:
        for n, body in enumerate(blocks):
            f = pathlib.Path(tmp) / f"s{n}.js"
            f.write_text(body, encoding="utf-8")
            r = subprocess.run([node, "--check", str(f)], capture_output=True, text=True)
            if r.returncode:
                msg = [l for l in r.stderr.splitlines() if "Error" in l][:1]
                problems.append(f"SCRIPT DOES NOT PARSE  inline script {n}: {(msg or ['?'])[0][:120]}")
else:
    problems.append("SCRIPT PARSE CHECK SKIPPED  node not found; install it or fix the path")

# ---- report -----------------------------------------------------------------
problems = sorted(set(problems))
if problems:
    print("\n❌ QA CHECK FAILED — fix before deploying:\n")
    for p in problems:
        print("   • " + p)
    print(f"\n{len(problems)} issue(s) found.\n")
    sys.exit(1)
print("✅ QA check passed — no broken handlers, pages, or duplicate ids.")
