#!/usr/bin/env python3
"""Rebuilds agent-uploads.js for Nyla OS and the Business OS.

Both OSes let you attach any file to an agent chat, and the reading is
done by the same code Semester HQ uses for syllabus uploads. Rather than
keep three copies in step by hand, that file is the source and this
script generates the other two: it takes everything up to Semester HQ's
own upload-zone UI and puts a small prelude in front supplying the few
helpers the student app would otherwise provide.

Run after changing student-planner/js/uploads.js:

    python3 build-agent-uploads.py
"""
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
function fileExt(name) { const m = String(name || '').toLowerCase().match(/\\.([a-z0-9]{1,8})$/); return m ? m[1] : ''; }

'''


def main():
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
    out = PRELUDE + body + '\n'
    for target in TARGETS:
        target.write_text(out)
        print(f'wrote {target} ({len(out.splitlines())} lines)')


if __name__ == '__main__':
    main()
