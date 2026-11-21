#!/usr/bin/env python3
"""Splice the Send a task loop into index.html between the @@BBCC_THULAIB_VIEW@@ markers.
Parts are pasted byte for byte: h3-reader.js, h4-sheet.js, h5-card.js, glue.js, ho.css. Run again after any part changes."""
import pathlib, re, sys
here = pathlib.Path(__file__).resolve().parent
idx = here.parent.parent / 'index.html'
part = lambda n: (here / n).read_text()
BEGIN = '<!-- @@BBCC_THULAIB_VIEW@@ BEGIN'
END = '<!-- @@BBCC_THULAIB_VIEW@@ END -->'
block = (BEGIN + '\n     SEND A TASK, SEE IT DONE (THULAIB CC HANDOFF H3 to H5, 8 Nov 2026). Owners only (body data-role th or sh).\n'
  '     A Send a task button in the topbar, a From card and a Stuck strip above #attention-panel. Writes only through the\n'
  '     bb_handoff_* functions (H1). The parts are pasted from handoff/parts by build-block.py; change the part, then run it. -->\n'
  '<style>\n' + part('ho.css') + '</style>\n<script>\n' + part('h3-reader.js') + '\n' + part('h4-sheet.js') + '\n'
  + part('h5-card.js') + '\n' + part('glue.js') + '</script>\n' + END + '\n')
s = idx.read_text()
if BEGIN in s:
    s = re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END) + r'\n', lambda m: block, s, count=1, flags=re.S)
else:
    anchor = '<!-- @@BBCC_NIRVANA_END@@ -->\n'
    assert s.count(anchor) == 1, 'anchor missing'
    s = s.replace(anchor, anchor + block, 1)
idx.write_text(s)
a = s.index(BEGIN); print('block lines', s[:a].count('\n') + 1, 'to', s[:s.index(END)].count('\n') + 1)
