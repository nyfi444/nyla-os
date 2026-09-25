#!/usr/bin/env python3
"""Rebuilds agent-uploads.js for Nyla OS and the Business OS.

Both OSes let you attach any file to an agent chat, and the reading is
done by the same code Semester HQ uses for syllabus uploads. Rather than
keep three copies in step by hand, that file is the source and this
script generates the other two: it takes everything up to Semester HQ's
own upload-zone UI and puts a small prelude in front supplying the few
helpers the student app would otherwise provide.

Run after changing student-planner/js/uploads.js:

    python3 build-agent-uploads.py --check   # report only, writes nothing
    python3 build-agent-uploads.py           # write both copies

It refuses to write anything if the output still depends on something
only the student app has. uploads.js keeps growing ties to Semester HQ
(a local vendor/ copy of heic2any, the diag logger in diagnostics.js),
and a blind copy would break photo uploads in both OSes. So the output is
checked for: vendor/ files that OS doesn't have, script addresses its
security policy blocks, any top-level name from the
student app's other js/ files that the prelude doesn't supply, and a
syntax error (node --check). Anything it finds is listed; fix it here
(HEIC_SRC, or a prelude stand-in), then run it again.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
SOURCE = HERE / 'student-planner' / 'js' / 'uploads.js'
TARGETS = [HERE / 'agent-uploads.js', HERE / 'semester-hq-dashboard' / 'agent-uploads.js']

PRELUDE = '''/* ── Reading any file people attach to an agent chat ────────────────
   Lifted from Semester HQ, where it reads syllabi and assignment
   sheets, so the same file types work here: Word, PowerPoint, Excel,
   OpenDocument, RTF, web pages, plain text, CSV, the 97-2003 formats,
   and photos including iPhone HEIC. PDFs are the exception — they go
   to Claude whole, because it reads a PDF's layout better than any
   text we could scrape out of it.

   Nothing in here filters a file picker by type. That filtering is
   exactly what greys out files you can plainly see.
   Generated from student-planner/js/uploads.js by build-agent-uploads.py
   — edit that file and rerun the script; don't hand-edit this copy.
──────────────────────────────────────────────────────────────── */
const _loadedScripts = {};
function loadScriptOnce(src) {
  if (_loadedScripts[src]) return _loadedScripts[src];
  return (_loadedScripts[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('needed file could not be loaded'));
    document.head.appendChild(s);
  }));
}
function withTimeout(promise, ms, message) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(message || 'Timed out')), ms))]);
}
// PDFs never reach these: they are sent to Claude as documents instead.
async function extractPdfText() { throw new Error('PDFs are sent to Claude whole.'); }
async function extractPdfPageImages() { throw new Error('PDFs are sent to Claude whole.'); }
function toast(msg) { if (typeof showToast === 'function') showToast(msg); else console.info(msg); }
// uploads.js reports problems through Semester HQ's diag logger; neither OS has one.
if (typeof diag === 'undefined') window.diag = { warn: function () { console.warn.apply(console, arguments); }, error: function () { console.error.apply(console, arguments); } };
function fileExt(name) { const m = String(name || '').toLowerCase().match(/\\.([a-z0-9]{1,8})$/); return m ? m[1] : ''; }

'''


NAIVE_TOAST = "function toast(msg) { if (typeof showToast === 'function') showToast(msg); else console.info(msg); }"
GUARDED_TOAST = "if (typeof toast !== 'function') window.toast = function (msg) { if (typeof showToast === 'function') showToast(msg); else console.info(msg); };"


# Where each OS loads heic2any from. Nyla OS has no Content Security Policy and
# uses the pinned CDN build. The Business OS serves its own vendored copy
# (semester-hq-dashboard/vendor/VENDOR.md) because its CSP names no CDN, so a
# CDN address there is blocked and iPhone photos stop converting.
HEIC_SRC = {
    0: "'https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js';",
    1: "'/vendor/heic2any/heic2any.min.js';   // served from this site, see vendor/VENDOR.md",
}
STUDENT_HEIC_SRC = re.compile(r"(const HEIC2ANY_SRC = )'[^']*';[^\n]*")
# Names the prelude above supplies, so the body may use them.
PRELUDE_PROVIDES = {'toast', 'diag', 'loadScriptOnce', 'withTimeout', 'extractPdfText', 'extractPdfPageImages', 'fileExt', 'showToast'}


def student_globals():
    """Top-level names declared by the student app's other js/ files."""
    names = set()
    for f in SOURCE.parent.glob('*.js'):
        if f.name == SOURCE.name:
            continue
        for m in re.finditer(r'^(?:export\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)', f.read_text(), re.M):
            names.add(m.group(1))
    return names


def code_only(js):
    """The code with comments and string contents blanked, for name scanning."""
    js = re.sub(r'/\*[\s\S]*?\*/', ' ', js)
    js = re.sub(r'(?<![:\\])//[^\n]*', ' ', js)
    return re.sub(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"|`(?:\\.|[^`\\])*`", "''", js)


def problems_in(out, host):
    found = []
    # Any vendor/ file it loads must exist in that OS's own folder.
    missing_files = sorted({v for v in re.findall(r"/?vendor/[\w./-]+", out) if not (TARGETS[host].parent / v.lstrip('/')).exists()})
    if missing_files:
        found.append('vendor/ files this OS does not have: ' + ', '.join(missing_files))
    # Any other site it loads scripts from must be allowed by that OS's CSP.
    allowed = SCRIPT_SRC.get(host)
    if allowed is not None:
        blocked = sorted({u for u in re.findall(r"https://[\w.-]+", out) if u not in allowed and u in scripts_loaded(out)})
        if blocked:
            found.append("script addresses this OS's security policy blocks: " + ', '.join(blocked))
    code = code_only(out)
    declared = set(re.findall(r'(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)', code))
    used = set(re.findall(r'(?<![\w$.])([A-Za-z_$][\w$]*)\b', code))
    missing = sorted(n for n in (student_globals() & used) - declared - PRELUDE_PROVIDES)
    if missing:
        found.append('names only the student app defines: ' + ', '.join(missing))
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as tmp:
        tmp.write(out)
    try:
        r = subprocess.run(['node', '--check', tmp.name], capture_output=True, text=True)
        if r.returncode != 0:
            lines = r.stderr.strip().splitlines()
            found.append('a syntax error: ' + next((l for l in lines if 'Error' in l), lines[0] if lines else '?'))
    except FileNotFoundError:
        found.append('node is not installed, so the syntax check could not run')
    finally:
        Path(tmp.name).unlink(missing_ok=True)
    found += clashes_with_host(out, host)
    return found


# The pages that load each copy, and the scripts whose top-level names share one
# global scope with it. A const/let/class in one and any declaration of the same
# name in the other stops the later script from running: that is how Nyla OS's
# `const toast` and this file's `function toast` broke the app on Sept 24 2026.
HOSTS = {
    0: [HERE / 'nyla-os.html', *sorted((HERE / 'js').glob('*.jsx'))],
    1: [HERE / 'semester-hq-dashboard' / 'semester-hq-biz.html', *sorted((HERE / 'semester-hq-dashboard').glob('os-*.js'))],
}
DECL = re.compile(r'^(?:export\s+)?(?:async\s+)?(const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)', re.M)


def top_level(js):
    return {m.group(2): m.group(1) for m in DECL.finditer(js)}


HOST_NAMES = {0: 'Nyla OS', 1: 'the Business OS'}


def csp_script_origins(path):
    m = re.search(r"'script-src':\s*\[([^\]]*)\]", path.read_text()) if path.exists() else None
    return set(re.findall(r"'(https://[^']+)'", m.group(1))) if m else set()


# Script origins each OS's CSP allows (None = no CSP). The Business OS's lives in its Worker.
SCRIPT_SRC = {0: None, 1: csp_script_origins(HERE / 'semester-hq-dashboard' / 'worker' / 'gate-lib.js')}


def scripts_loaded(out):
    """Origins of the script URLs the file loads: *_SRC constants and loadScriptOnce('...') calls."""
    urls = re.findall(r"_SRC\s*=\s*'(https://[^']+)'", out) + re.findall(r"loadScriptOnce\(\s*'(https://[^']+)'", out)
    return {re.match(r'https://[\w.-]+', u).group(0) for u in urls}


def clashes_with_host(out, i):
    mine = top_level(out)
    found = []
    if True:
        theirs = {}
        for f in HOSTS[i]:
            if f.exists():
                text = f.read_text()
                if f.suffix == '.html':
                    text = '\n'.join(re.findall(r'<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)</script>', text))
                theirs.update(top_level(text))
        bad = sorted(n for n in mine.keys() & theirs.keys() if 'const' in (mine[n], theirs[n]) or 'let' in (mine[n], theirs[n]) or 'class' in (mine[n], theirs[n]))
        if bad:
            found.append(f'top-level names that clash with {HOST_NAMES[i]}: ' + ', '.join(bad))
    return found


def main():
    check_only = '--check' in sys.argv[1:]
    src = SOURCE.read_text()
    body = src[:src.index('function uploadZoneHtml(')].rstrip()
    # Wording: these messages are shown to Nyla inside her own OSes, not to
    # a student, so the product name is swapped out of every sentence.
    for old, new_text in [
        ('Everything Semester HQ reads for you', 'Everything an agent reads for you'),
        ('which Semester HQ can\u2019t read', 'which can\u2019t be read here'),
        ('which Semester HQ can\u2019t open yet', 'which can\u2019t be read here yet'),
        ('which Semester HQ can\u2019t open.', 'which can\u2019t be read here.'),
        ('Semester HQ can\u2019t read ${name}', 'Can\u2019t read ${name}'),
        ('Semester HQ can\u2019t read ${file.name}', 'Can\u2019t read ${file.name}'),
        ('Semester HQ can\u2019t open e-books like ${name}', 'E-books like ${name} can\u2019t be read here'),
        ('an older Word file Semester HQ can\u2019t open', 'an older Word file that can\u2019t be read here'),
        ('an older Excel file (.xls), which Semester HQ', 'an older Excel file (.xls), which this'),
        ('so a student couldn\'t even\n   select the Word syllabus they had', 'so you couldn\'t even\n   select the Word document you had'),
    ]:
        body = body.replace(old, new_text)
    if not STUDENT_HEIC_SRC.search(body):
        sys.exit('HEIC2ANY_SRC is no longer a plain string in uploads.js; update HEIC_SRC handling here.')
    out = PRELUDE + body + '\n'
    texts = []
    for i, target in enumerate(TARGETS):
        text = STUDENT_HEIC_SRC.sub(lambda m: m.group(1) + HEIC_SRC[i], out)
        if i == 0:
            # Nyla OS runs its own code as modern JS (data-presets="react"), where its
            # `const toast` and a global `function toast` here can't both exist. So
            # this copy only supplies toast when the page has none.
            text = text.replace(NAIVE_TOAST, GUARDED_TOAST)
            assert GUARDED_TOAST in text
        texts.append(text)
    found = [f'{HOST_NAMES[i]}: {p}' for i, text in enumerate(texts) for p in problems_in(text, i)]
    if found:
        print('Not writing anything. The generated file still has:', file=sys.stderr)
        for f in found:
            print('  - ' + f, file=sys.stderr)
        sys.exit(1)
    for target, text in zip(TARGETS, texts):
        same = target.exists() and target.read_text() == text
        if check_only:
            print(f'ok: {target} would be {"unchanged" if same else "updated"}')
        elif not same:
            target.write_text(text)
            print(f'wrote {target} ({len(text.splitlines())} lines)')
        else:
            print(f'unchanged {target}')


if __name__ == '__main__':
    main()
