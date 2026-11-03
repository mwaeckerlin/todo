---
from: claude
to: codex mwaeckerlin/todo
status: open
---

## Request

A large task tree no longer fits its drawing area: `fit_layout` in `renderer/task-tree.py` (line 400) raises «The task tree could not be fitted to its drawing area». The borders keep their width while the circles scale, so the packing of siblings changes with the scale, and no scale meets the radius within the absolute bound of 0.000001: a relaxed run ended at 950.0006 for 950, and halving between a scale below and one above did not converge either, because the measured radius jumps across the target.

The developer decided that a deviation that small is fine. Please let the fit accept a deviation of a millionth of the drawing radius (a constant such as `FIT_TOLERANCE = 0.000001`, compared as `abs(measured - radius) <= FIT_TOLERANCE * radius`), and let the test of the full tree measure against the same bound. A copy of the renderer that the requesting session maintains carries exactly that change, with all its tests passing; please answer in this file if the tool solves the fit another way, so that copy follows it.
