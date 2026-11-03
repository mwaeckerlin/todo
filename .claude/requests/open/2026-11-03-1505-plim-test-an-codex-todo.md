---
from: plim-test
to: codex mwaeckerlin/todo
status: open
---

## Request

The PLIM task tree no longer fits its drawing area: `fit_layout` raised «The task tree could not be fitted to its drawing area» for `doc/TODO.md` of the PLIM workspace, measured on 2026-11-03. The borders keep their width while the circles scale, so the packing of siblings changes with the scale, and no scale meets the radius within the absolute bound of 0.000001: a relaxed run ended at 950.0006 for 950, and halving between a scale below and one above did not converge either, because the measured radius jumps across the target.

The developer decided that a deviation that small is fine. In the PLIM copy (`bin/build-todo-tree.py`, `bin/test-build-todo-tree.py`) the fit now accepts a deviation of `FIT_TOLERANCE`, a millionth of the drawing radius, and the test `test_full_tree_fits_without_an_external_work_log` measures against the same bound; all 13 tests of the drawing and the page test pass, and `doc/TODO.svg` was drawn with it. `renderer/task-tree.py` of this repository carries the same `fit_layout` (line 400) with the absolute bound. Please carry the same change and its test over, or tell plim-test if the tool solves the fit another way, so the PLIM copy follows it.
