#!/usr/bin/env python3
"""The task tree as nested bubbles: a picture and an interactive page beside every tree.

A task tree is a Markdown list in which every entry reads
`- <status><priority><complexity> <Title> - <Description> [#id] [^]`, as the
project skill `todo` defines it. This reads the task tree `doc/TODO.md` of the
workspace and draws it as circles packed inside their parents, with the
packing of d3 `pack`:

- the area of a task grows with its complexity, a 9 has ten times the area of a 0;
- the fill shows its status; a structural branch without priority has none;
- the thickness of the border shows its priority;
- the colour of the border marks what was worked on this week, blue, read from
  the work log `WORK-DONE.md`, found in the workspace by its name, and what is planned for next
  week, orange, the entries that end in `^`; a task of both weeks carries the
  blue border and an orange ring around it.

Beside `<name>.md` it writes `<name>.svg`, which the PDF converter embeds, and
`<name>.html`, one self-contained page in which a click on a circle opens it,
the path above leads back, and Escape or a click beside the circles goes up.

    build-todo-tree.py              the tree `doc/TODO.md`
    build-todo-tree.py --png        the same, and a PNG beside the SVG
    build-todo-tree.py --labels inside   parent titles in free interior space, not on free arcs
    build-todo-tree.py <file.md>    the trees named
"""
import argparse
import base64
import datetime
import functools
import html
import json
import math
import os
import pathlib
import re
import shutil
import subprocess
import sys

from PIL import ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
ENTRY = re.compile(r'^(?P<indent>\s*)- (?P<status>\S️?)(?P<priority>[HML]?)(?P<complexity>\d) '
                   r'(?:(?P<due>\d{8}) )?'
                   r'(?P<title>.+?) - (?P<description>.+?)(?: (?P<id>#\S+))?(?: (?P<next>\^))?\s*$')
# A task with a due date turns red before it: a week before for complexity 0, two months before for
# complexity 9, in between in proportion; from light red at the start of that span to dark red at the due date
# and after it. A task that is done, dropped or merged carries no due colour.
DUE_DAYS = {'least': 7, 'most': 61}
DUE_LIGHT, DUE_DARK = (0xF9, 0xD6, 0xD4), (0x7A, 0x10, 0x10)
DUE_CLOSED = {'✅', '❌', '🔀'}
DUE_LEGEND = (('due date approaching', '#F9D6D4'), ('due date close', '#BA7372'), ('due or overdue', '#7A1010'))
# Directories that never carry a tree of this workspace: other repositories,
# their dependencies and what a build leaves behind.
PRUNE = {'.git', 'node_modules', 'worktrees', 'build', 'png', '__pycache__'}

# Brand colours of the PLIM design, and the surfaces mixed from them. The page
# is a light grey of the brand grey; «planned» is a darker mix of it, so the
# two stay apart, and «open» is white.
INK = '#121212'
GREY = '#BDB7BA'
SURFACE = '#F0EDEE'
QUIET = '#6E686B'
# The thin border of a structural branch, which carries no priority.
BRANCH = '#A79FA3'
STATUS = {
    '⬜': ('open', '#FFFFFF', INK),
    '📄': ('planned', '#CFC8CB', INK),
    '⏳': ('in work', '#CDE8C9', INK),
    '🔀': ('merged, not in production', '#7DBF74', INK),
    '✅': ('done', '#2F7A33', '#FFFFFF'),
    '⏸': ('waiting for others', '#F6D9A6', INK),
    '❌': ('dropped', '#D9534F', '#FFFFFF'),
}
BORDER = {'H': 4.0, 'M': 2.2, 'L': 1.0, '': 0.0}
BLUE, ORANGE = '#2F6FD0', '#E8892B'
# A task worked on this week and planned for next week carries both: the blue
# border and an orange ring around it.
WEEK = {'this': ('worked on this week', BLUE), 'next': ('planned next week', ORANGE),
        'both': ('this week and next week', BLUE), '': ('neither', GREY)}
MIN_FONT = 7.5
LINE_HEIGHT = 1.15
# Allow for glyph hinting and subpixel rounding in SVG and browser renderers.
LABEL_CLEARANCE = 0.16


def walk():
    """The directories of the workspace, without other repositories and build output."""
    submodules = set()
    gitmodules = ROOT / '.gitmodules'
    if gitmodules.exists():
        for line in gitmodules.read_text(encoding='utf-8').splitlines():
            if line.strip().startswith('path'):
                submodules.add(line.split('=', 1)[1].strip())
    for directory, names, files in os.walk(ROOT):
        relative = pathlib.Path(directory).relative_to(ROOT)
        names[:] = [n for n in names if n not in PRUNE and str(relative / n) not in submodules]
        yield directory, names, files


def trees():
    """The task tree of the workspace, where it carries at least one entry."""
    path = ROOT / 'doc' / 'TODO.md'
    return [path] if path.exists() and parse(path) else []


def parse(path):
    """The entries of a tree as nested nodes; an empty list where the file has none."""
    roots, stack = [], []
    for line in path.read_text(encoding='utf-8').splitlines():
        match = ENTRY.match(line)
        if not match:
            continue
        status = match.group('status').replace('️', '')
        due = None
        if match.group('due'):
            try:
                due = datetime.datetime.strptime(match.group('due'), '%Y%m%d').date()
            except ValueError:
                sys.exit(f'{path}: «{match.group("due")}» is no date in the form YYYYMMDD: {line.strip()}')
        node = {
            'level': len(match.group('indent')) // 2,
            'status': status if status in STATUS else '⬜',
            'priority': match.group('priority'),
            'complexity': int(match.group('complexity')),
            'due': due,
            'title': match.group('title'),
            'description': match.group('description'),
            'id': match.group('id') or '',
            'week': 'next' if match.group('next') else '',
            'children': [],
        }
        while stack and stack[-1]['level'] >= node['level']:
            stack.pop()
        (stack[-1]['children'] if stack else roots).append(node)
        stack.append(node)
    return roots


def normal(text):
    return ' '.join(re.sub(r'[^a-z0-9]+', ' ', text.lower()).split())


def done_this_week(tree_path, today):
    """The titles of this week's entries in the work log, normalised."""
    log = tree_path.parent / 'WORK-DONE.md'
    if not log.exists():
        # The tree of the workspace has no log beside it; the log is found where
        # it lies in the workspace, by its name.
        found = [pathlib.Path(d) / 'WORK-DONE.md' for d, names, files in walk() if 'WORK-DONE.md' in files]
        if not found:
            return []
        # The order of a directory walk depends on the file system; sorted, the
        # same log is read on every machine.
        log = sorted(found)[0]
    monday = today - datetime.timedelta(days=today.weekday())
    entries, day = [], None
    for line in log.read_text(encoding='utf-8').splitlines():
        head = re.match(r'^### (\d{4}-\d{2}-\d{2})', line)
        if head:
            day = datetime.date.fromisoformat(head.group(1))
            continue
        # Only the title of a log entry: its text names many subjects in passing,
        # and «Handover» or «Data» stand in half of them.
        title = re.match(r'^- \*\*(.+?):\*\*', line)
        if day and monday <= day <= today and title:
            entries.append(normal(title.group(1)))
    return entries


def mark_weeks(nodes, entries):
    """A task whose title stands in this week's work log was worked on this week."""
    for node in nodes:
        # Whole words only: «AI» must not match inside «email».
        title = ' ' + normal(node['title']) + ' '
        task = bool(node['priority'])
        if task and node['status'] != '❌' and title.strip() and any(title in ' ' + entry + ' ' for entry in entries):
            node['week'] = 'both' if node['week'] == 'next' else 'this'
        mark_weeks(node['children'], entries)


def place(b, a, c):
    """Put circle c tangent to circles a and b (d3-hierarchy `place`)."""
    dx, dy = b['x'] - a['x'], b['y'] - a['y']
    d2 = dx * dx + dy * dy
    if d2:
        a2, b2 = (a['r'] + c['r']) ** 2, (b['r'] + c['r']) ** 2
        if a2 > b2:
            x = (d2 + b2 - a2) / (2 * d2)
            y = math.sqrt(max(0.0, b2 / d2 - x * x))
            c['x'], c['y'] = b['x'] - x * dx - y * dy, b['y'] - x * dy + y * dx
        else:
            x = (d2 + a2 - b2) / (2 * d2)
            y = math.sqrt(max(0.0, a2 / d2 - x * x))
            c['x'], c['y'] = a['x'] + x * dx - y * dy, a['y'] + x * dy + y * dx
    else:
        c['x'], c['y'] = a['x'] + c['r'], a['y']


def intersects(a, b):
    dr = a['r'] + b['r'] - 1e-6
    dx, dy = b['x'] - a['x'], b['y'] - a['y']
    return dr > 0 and dr * dr > dx * dx + dy * dy


# Circle packing and enclosure ported from d3-hierarchy, Copyright 2010-2021 Mike Bostock.
# Permission to use, copy, modify, and/or distribute this software for any purpose
# with or without fee is hereby granted, provided that the above copyright notice
# and this permission notice appear in all copies.
# THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
# REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
# FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
# INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
# OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
# TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
# THIS SOFTWARE.
def enclose(circles):
    """The minimum enclosing circle from d3-hierarchy's support basis."""
    ordered = list(circles)
    seed = 1
    for remaining in range(len(ordered), 0, -1):
        seed = (1664525 * seed + 1013904223) % 4294967296
        index = math.floor(seed / 4294967296 * remaining)
        ordered[remaining - 1], ordered[index] = ordered[index], ordered[remaining - 1]

    def encloses_not(a, b):
        dr, dx, dy = a['r'] - b['r'], b['x'] - a['x'], b['y'] - a['y']
        return dr < 0 or dr * dr < dx * dx + dy * dy

    def encloses_weak(a, b):
        dr = a['r'] - b['r'] + max(a['r'], b['r'], 1) * 1e-9
        dx, dy = b['x'] - a['x'], b['y'] - a['y']
        return dr > 0 and dr * dr > dx * dx + dy * dy

    def encloses_all(circle, basis):
        return all(encloses_weak(circle, item) for item in basis)

    def pair(a, b):
        dx, dy, dr = b['x'] - a['x'], b['y'] - a['y'], b['r'] - a['r']
        distance = math.sqrt(dx * dx + dy * dy)
        return {'x': (a['x'] + b['x'] + dx / distance * dr) / 2,
                'y': (a['y'] + b['y'] + dy / distance * dr) / 2,
                'r': (distance + a['r'] + b['r']) / 2}

    def triple(a, b, c):
        x1, y1, r1 = a['x'], a['y'], a['r']
        a2, a3 = x1 - b['x'], x1 - c['x']
        b2, b3 = y1 - b['y'], y1 - c['y']
        c2, c3 = b['r'] - r1, c['r'] - r1
        d1 = x1 * x1 + y1 * y1 - r1 * r1
        d2 = d1 - b['x'] * b['x'] - b['y'] * b['y'] + b['r'] * b['r']
        d3 = d1 - c['x'] * c['x'] - c['y'] * c['y'] + c['r'] * c['r']
        ab = a3 * b2 - a2 * b3
        xa = (b2 * d3 - b3 * d2) / (ab * 2) - x1
        xb = (b3 * c2 - b2 * c3) / ab
        ya = (a3 * d2 - a2 * d3) / (ab * 2) - y1
        yb = (a2 * c3 - a3 * c2) / ab
        aa = xb * xb + yb * yb - 1
        bb = 2 * (r1 + xa * xb + ya * yb)
        cc = xa * xa + ya * ya - r1 * r1
        radius = -((bb + math.sqrt(bb * bb - 4 * aa * cc)) / (2 * aa)
                   if abs(aa) > 1e-6 else cc / bb)
        return {'x': x1 + xa + xb * radius, 'y': y1 + ya + yb * radius, 'r': radius}

    def enclosing_basis(basis):
        if len(basis) == 1:
            return {key: basis[0][key] for key in ('x', 'y', 'r')}
        return pair(*basis) if len(basis) == 2 else triple(*basis)

    def extend(basis, point):
        if encloses_all(point, basis):
            return [point]
        for item in basis:
            if encloses_not(point, item) and encloses_all(pair(item, point), basis):
                return [item, point]
        for i, a in enumerate(basis[:-1]):
            for b in basis[i + 1:]:
                if (encloses_not(pair(a, b), point)
                        and encloses_not(pair(a, point), b)
                        and encloses_not(pair(b, point), a)
                        and encloses_all(triple(a, b, point), basis)):
                    return [a, b, point]
        raise ValueError('The task circles could not be enclosed by their supporting circles')

    index, basis, enclosing = 0, [], None
    while index < len(ordered):
        point = ordered[index]
        if enclosing is not None and encloses_weak(enclosing, point):
            index += 1
        else:
            basis = extend(basis, point)
            enclosing = enclosing_basis(basis)
            index = 0
    if enclosing is None:
        return 0.0, 0.0, 0.0
    return enclosing['x'], enclosing['y'], enclosing['r']

def pack_siblings(circles):
    """Front-chain packing of sibling circles (d3-hierarchy `packSiblings`)."""
    n = len(circles)
    if n == 0:
        return 0.0
    a = circles[0]
    a['x'] = a['y'] = 0.0
    if n == 1:
        return a['r']
    b = circles[1]
    a['x'], b['x'], b['y'] = -b['r'], a['r'], 0.0
    if n == 2:
        cx, cy, radius = enclose(circles)
        for circle in circles:
            circle['x'] -= cx
            circle['y'] -= cy
        return radius
    place(b, a, circles[2])

    def node(circle):
        return {'_': circle, 'next': None, 'previous': None}

    def score(item):
        p, q = item['_'], item['next']['_']
        pq = p['r'] + q['r']
        dx = (p['x'] * q['r'] + q['x'] * p['r']) / pq
        dy = (p['y'] * q['r'] + q['y'] * p['r']) / pq
        return dx * dx + dy * dy

    a, b, c = node(a), node(b), node(circles[2])
    a['next'] = c['previous'] = b
    b['next'] = a['previous'] = c
    c['next'] = b['previous'] = a
    i = 3
    while i < n:
        place(a['_'], b['_'], circles[i])
        c = node(circles[i])
        j, k, sj, sk = b['next'], a['previous'], b['_']['r'], a['_']['r']
        restart = False
        while True:
            if sj <= sk:
                if intersects(j['_'], c['_']):
                    b = j
                    a['next'], b['previous'] = b, a
                    restart = True
                    break
                sj += j['_']['r']
                j = j['next']
            else:
                if intersects(k['_'], c['_']):
                    a = k
                    a['next'], b['previous'] = b, a
                    restart = True
                    break
                sk += k['_']['r']
                k = k['previous']
            if j is k['next']:
                break
        if restart:
            continue
        c['previous'], c['next'] = a, b
        a['next'] = b['previous'] = b = c
        best, best_score, item = a, score(a), c['next']
        while item is not b:
            item_score = score(item)
            if item_score < best_score:
                best, best_score = item, item_score
            item = item['next']
        a = best
        b = a['next']
        i += 1
    cx, cy, radius = enclose(circles)
    for circle in circles:
        circle['x'] -= cx
        circle['y'] -= cy
    return radius


def outline_width(node):
    if node.get('root'):
        return 0.0
    width = BORDER[node.get('priority', '')] or 0.9
    return width * (2 if node.get('week') == 'both' and node.get('priority') else 1)


def layout(node, unit=1.0):
    """Pack the outer ink footprints; the enclosing border lies outside the children."""
    if not node['children']:
        node['r'] = math.sqrt(node['complexity'] + 1) * unit
        return node['r']
    for child in node['children']:
        layout(child, unit=unit)
    circles = sorted(({'r': child['r'], 'node': child} for child in node['children']),
                     key=lambda c: -c['r'])
    radius = pack_siblings(circles)
    for circle in circles:
        circle['node']['dx'], circle['node']['dy'] = circle['x'], circle['y']
    node['r'] = radius + outline_width(node)
    return node['r']


def fit_layout(node, radius):
    unit = radius / layout(node)
    for _ in range(60):
        measured = layout(node, unit=unit)
        if abs(measured-radius) < 0.000001:
            return
        unit *= radius / measured
    raise ValueError('The task tree could not be fitted to its drawing area')


def run_inkscape(*arguments):
    """Run Inkscape with the schemas installed beside its executable."""
    executable = shutil.which('inkscape')
    if executable is None:
        raise FileNotFoundError('inkscape is not on the PATH, so the drawing cannot be rendered')
    environment = os.environ.copy()
    schemas = pathlib.Path(executable).resolve().parents[1] / 'share' / 'glib-2.0' / 'schemas'
    if schemas.is_dir():
        environment['GSETTINGS_SCHEMA_DIR'] = str(schemas)
    try:
        return subprocess.run([executable, *map(str, arguments)], env=environment,
                              capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as error:
        raise RuntimeError('Inkscape could not render the drawing: ' + error.stderr.strip()) from error


@functools.lru_cache(maxsize=2)
def font_profile(weight):
    query = 'Montserrat:weight=' + ('demibold' if weight == 600 else 'medium')
    path = subprocess.run(['fc-match', '-f', '%{file}', query], check=True,
                          capture_output=True, text=True).stdout.strip()
    if not path:
        raise ValueError('Fontconfig found no font for the task tree')
    return ImageFont.truetype(path, 1000), pathlib.Path(path)


@functools.lru_cache(maxsize=8192)
def text_metrics(value, weight):
    font, _ = font_profile(weight)
    left, top, right, bottom = font.getbbox(value, anchor='ls')
    return max(font.getlength(value), right-left)/1000, top/1000, bottom/1000


@functools.lru_cache(maxsize=1)
def font_css():
    # Inkscape 1.4.3 warns about limited @font-face support; CLI measurements need the same Fontconfig fonts.
    # Browsers load the embedded rules. The README records the measured renderer limitation.
    rules = []
    for weight in (500, 600):
        _, path = font_profile(weight)
        data = base64.b64encode(path.read_bytes()).decode('ascii')
        # The declared format follows the file Fontconfig chose: OpenType with CFF outlines, or TrueType.
        kind = ('otf', 'opentype') if path.suffix.lower() == '.otf' else ('ttf', 'truetype')
        rules.append('@font-face{font-family:PLIMTaskTree;font-weight:' + str(weight)
                     + ';src:url(data:font/' + kind[0] + ';base64,' + data + ') format("' + kind[1] + '");}')
    return ''.join(rules)


def visible_due(node):
    return node.get('due') if node.get('priority') and node['status'] not in DUE_CLOSED else None


def fitted_lines(node, radius):
    """Fit measured glyph bounds into the chords occupied by each line."""
    weight = 600 if node['children'] else 500
    words = node['title'].split()
    due = visible_due(node)
    if due:
        words.append(due.strftime('%d\u00a0%b\u00a0%Y'))
    best = None
    for count in range(2 if due else 1, min(6, len(words))+1):
        def wrapped(size):
            @functools.lru_cache(maxsize=None)
            def visit(line, start):
                if line == count:
                    return () if start == len(words) else None
                if due and line == count-1 and start != len(words)-1:
                    return None
                centre = (line-(count-1)/2)*LINE_HEIGHT*size
                for end in range(len(words)-(count-line-1), start, -1):
                    value = ' '.join(words[start:end])
                    width, top, bottom = text_metrics(value, weight)
                    far = abs(centre)+(bottom-top)*size/2+size*LABEL_CLEARANCE
                    if far >= radius or width*size+size*LABEL_CLEARANCE*2 > 2*math.sqrt(radius*radius-far*far):
                        continue
                    rest = visit(line+1, end)
                    if rest is not None:
                        return (value,)+rest
                return None
            return visit(0, 0)
        low, high = 0.01, min(24.0, radius*1.2)
        for _ in range(20):
            middle = (low+high)/2
            if wrapped(middle) is None:
                high = middle
            else:
                low = middle
        lines = wrapped(low)
        if lines and (best is None or low > best['size']+0.01):
            best = {'kind': 'lines', 'size': low, 'weight': weight,
                    'lines': [{'text': value, 'middle': sum(text_metrics(value, weight)[1:])/2}
                              for value in lines]}
    return best


def free_arcs(node, size):
    inner = node['R']-outline_width(node)
    radius = inner-size*0.6
    if radius <= 0:
        return []
    blocked = []
    for child in node['children']:
        dx, dy = child['cx']-node['cx'], child['cy']-node['cy']
        distance = math.hypot(dx, dy)
        expanded = child['R']+size*0.65
        if distance == 0:
            if radius <= expanded:
                return []
            continue
        cosine = (radius*radius+distance*distance-expanded*expanded)/(2*radius*distance)
        if cosine <= -1:
            return []
        if cosine >= 1:
            continue
        middle, half = math.atan2(dy, dx) % math.tau, math.acos(cosine)
        start, end = middle-half, middle+half
        for shift in (-math.tau, 0, math.tau):
            a, b = max(0, start+shift), min(math.tau, end+shift)
            if a < b:
                blocked.append((a, b))
    merged = []
    for start, end in sorted(blocked):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    if not merged:
        return [(0, math.tau, radius)]
    free = [(merged[i][1], merged[i+1][0], radius) for i in range(len(merged)-1)]
    free.append((merged[-1][1], merged[0][0]+math.tau, radius))
    return [(a, b, r) for a, b, r in free if b > a]


def plan_label(node, mode):
    if not node['children']:
        return fitted_lines(node, max(0.1, node['R']-outline_width(node)))
    if mode == 'inside':
        inner = node['R']-outline_width(node)
        candidates = []
        for ix in range(-12, 13):
            for iy in range(-12, 13):
                dx, dy = ix*inner/13, iy*inner/13
                radius = inner-math.hypot(dx, dy)
                for child in node['children']:
                    radius = min(radius, math.hypot(node['cx']+dx-child['cx'], node['cy']+dy-child['cy'])-child['R'])
                if radius > 0:
                    candidates.append((radius, dx, dy))
        if candidates:
            radius, dx, dy = max(candidates)
            config = fitted_lines(node, radius)
            if config:
                config.update(dx=dx, dy=dy)
                return config
        return None
    value = node['title']
    if visible_due(node):
        value += ' · ' + node['due'].strftime('%d %b %Y')
    size = min(30.0, node['R']*0.28)
    while size >= 2.5:
        width = text_metrics(value, 600)[0]*size
        candidates = [(a, b, r) for a, b, r in free_arcs(node, size)
                      if (b-a)*r >= width+size]
        if candidates:
            a, b, radius = max(candidates, key=lambda arc: (arc[1]-arc[0], -math.sin((arc[0]+arc[1])/2)))
            return {'kind': 'arc', 'size': size, 'weight': 600,
                    'radius': radius, 'start': a, 'end': b, 'text': value}
        size *= 0.92
    return None


def draw_label(node, config, defs):
    if not config:
        return ''
    size = config['size']
    colour = (node.get('due_ink') or STATUS[node['status']][2]) if node['priority'] else INK
    background = fill_of(node)
    if background == 'none':
        background = SURFACE
    common = (f'id="label{node["index"]}" data-label-for="{node["index"]}" '
              f'font-size="{size:.4f}" font-weight="{config["weight"]}" fill="{colour}" '
              f'stroke="{background}" stroke-width="{size*0.08:.4f}" paint-order="stroke" '
              f'text-anchor="middle"')
    if config['kind'] == 'lines':
        spans = []
        for i, line in enumerate(config['lines']):
            y = node['cy'] + config.get('dy', 0) + ((i-(len(config['lines'])-1)/2)*LINE_HEIGHT-line['middle'])*size
            spans.append(f'<tspan id="label{node["index"]}-line{i}" x="{node["cx"]+config.get("dx", 0):.4f}" y="{y:.4f}">{html.escape(line["text"])}</tspan>')
        return '<text '+common+'>'+''.join(spans)+'</text>'
    start, end, radius = config['start'], config['end'], config['radius']
    sweep = 1 if math.sin((start+end)/2) < 0 else 0
    if not sweep:
        start, end = end, start
    x1, y1 = node['cx']+radius*math.cos(start), node['cy']+radius*math.sin(start)
    x2, y2 = node['cx']+radius*math.cos(end), node['cy']+radius*math.sin(end)
    ident = f'arc{node["index"]}'
    defs.append(f'<path id="{ident}" d="M {x1:.4f} {y1:.4f} A {radius:.4f} {radius:.4f} '
                f'0 {int(abs(end-start)>math.pi)} {sweep} {x2:.4f} {y2:.4f}"/>')
    return ('<text '+common+' dominant-baseline="middle"><textPath href="#'+ident
            +'" xlink:href="#'+ident+'" startOffset="50%">'
            +html.escape(config['text'])+'</textPath></text>')


def position(node, x, y, scale, out, depth, parent):
    node['cx'], node['cy'], node['R'] = x, y, node['r'] * scale
    node['depth'], node['parent'], node['index'] = depth, parent, len(out)
    out.append(node)
    for child in node['children']:
        position(child, x + child['dx'] * scale, y + child['dy'] * scale, scale, out, depth + 1, node['index'])


def due_shade(node, today):
    """The red of a task close to or past its due date, and the ink that reads on it; None outside that span."""
    due = node.get('due')
    if due is None or node['status'] in DUE_CLOSED:
        return None
    span = DUE_DAYS['least'] + node['complexity'] * (DUE_DAYS['most'] - DUE_DAYS['least']) / 9
    left = (due - today).days
    if left > span:
        return None
    depth = min(1.0, max(0.0, 1 - left / span))
    colour = '#' + ''.join(f'{round(a + (b - a) * depth):02X}' for a, b in zip(DUE_LIGHT, DUE_DARK))
    return colour, '#FFFFFF' if depth >= 0.5 else INK


def mark_due(nodes, today):
    for node in nodes:
        shade = due_shade(node, today)
        node['due_fill'], node['due_ink'] = shade if shade else (None, None)
        mark_due(node['children'], today)


def fill_of(node):
    """A structural branch without priority shows the page behind it."""
    if node['children'] and not node['priority']:
        return 'none'
    return node.get('due_fill') or STATUS[node['status']][1]


def stroke_of(node):
    width = BORDER[node['priority']]
    colour = WEEK[node['week']][1]
    if not width:
        return BRANCH, 0.9
    return colour, width


def legend_svg(x, y):
    parts = [f'<text x="{x}" y="{y}" font-size="16" font-weight="600" fill="{INK}">Status</text>']
    y += 14
    for name, fill, _ in STATUS.values():
        y += 24
        parts.append(f'<circle cx="{x + 9}" cy="{y - 5}" r="9" fill="{fill}" stroke="{GREY}" stroke-width="1"/>')
        parts.append(f'<text x="{x + 26}" y="{y}" font-size="13" fill="{INK}">{html.escape(name)}</text>')
    y += 24
    parts.append(f'<circle cx="{x + 9}" cy="{y - 5}" r="9" fill="none" stroke="{BRANCH}" stroke-width="0.9"/>')
    parts.append(f'<text x="{x + 26}" y="{y}" font-size="13" fill="{INK}">branch of the structure</text>')
    y += 40
    parts.append(f'<text x="{x}" y="{y}" font-size="16" font-weight="600" fill="{INK}">Priority</text>')
    y += 14
    for letter, name in (('H', 'high'), ('M', 'medium'), ('L', 'low')):
        y += 24
        parts.append(f'<circle cx="{x + 9}" cy="{y - 5}" r="9" fill="#FFFFFF" stroke="{QUIET}" '
                     f'stroke-width="{BORDER[letter]}"/>')
        parts.append(f'<text x="{x + 26}" y="{y}" font-size="13" fill="{INK}">{letter} {name}</text>')
    y += 40
    parts.append(f'<text x="{x}" y="{y}" font-size="16" font-weight="600" fill="{INK}">Border colour</text>')
    y += 14
    for key, (name, colour) in WEEK.items():
        y += 24
        parts.append(f'<circle cx="{x + 9}" cy="{y - 5}" r="{7.5 if key == "both" else 9}" fill="#FFFFFF" '
                     f'stroke="{colour}" stroke-width="3"/>')
        if key == 'both':
            parts.append(f'<circle cx="{x + 9}" cy="{y - 5}" r="10.5" fill="none" stroke="{ORANGE}" stroke-width="3"/>')
        parts.append(f'<text x="{x + 26}" y="{y}" font-size="13" fill="{INK}">{html.escape(name)}</text>')
    y += 40
    parts.append(f'<text x="{x}" y="{y}" font-size="16" font-weight="600" fill="{INK}">Due date</text>')
    y += 14
    for name, colour in DUE_LEGEND:
        y += 24
        parts.append(f'<circle cx="{x + 9}" cy="{y - 5}" r="9" fill="{colour}" stroke="{GREY}" stroke-width="1"/>')
        parts.append(f'<text x="{x + 26}" y="{y}" font-size="13" fill="{INK}">{html.escape(name)}</text>')
    y += 40
    parts.append(f'<text x="{x}" y="{y}" font-size="16" font-weight="600" fill="{INK}">Size</text>')
    y += 22
    parts.append(f'<text x="{x}" y="{y}" font-size="13" fill="{INK}">area grows with complexity,</text>')
    y += 18
    parts.append(f'<text x="{x}" y="{y}" font-size="13" fill="{INK}">9 is ten times the area of 0</text>')
    return parts


def hover_of(node):
    code = node['status'] + node['priority'] + str(node['complexity'])
    due = f'due {node["due"].isoformat()}' if node.get('due') else ''
    return ' '.join(filter(None, [code, node['title'], '-', node['description'], node['id'], due]))


def draw_svg(nodes, title, plot, side, margin, head, labels='inside'):
    first = min(n['cy'] - n['R'] for n in nodes[1:])
    for node in nodes:
        node['cy'] += head - first
    bottom = max(n['cy'] + n['R'] for n in nodes[1:])
    width, height = margin * 3 + plot + side, max(bottom, head + 600) + margin
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
             f'width="{width}" height="{height:.0f}" '
             f'viewBox="0 0 {width} {height:.0f}" font-family="PLIMTaskTree, {font_profile(500)[0].getname()[0]}, sans-serif">',
             '<title>'+html.escape(title)+'</title><style>'+font_css()+'</style>',
             f'<rect width="100%" height="100%" fill="{SURFACE}"/>']
    for node in nodes[1:]:
        colour, width_ = stroke_of(node)
        both = node['week'] == 'both' and node['priority']
        parts.append(f'<circle cx="{node["cx"]:.4f}" cy="{node["cy"]:.4f}" r="{node["R"]-width_/2:.4f}" fill="{fill_of(node)}" '
                     f'stroke="{ORANGE if both else colour}" stroke-width="{width_}"><title>{html.escape(hover_of(node))}</title></circle>')
        if node['week'] == 'both' and node['priority']:
            parts.append(f'<circle cx="{node["cx"]:.4f}" cy="{node["cy"]:.4f}" r="{node["R"]-width_*1.5:.4f}" '
                         f'fill="none" stroke="{colour}" stroke-width="{width_}" pointer-events="none"/>')
    defs = []
    for node in nodes[1:]:
        node['label'] = plan_label(node, labels)
        text = draw_label(node, node['label'], defs)
        if text:
            parts.append(text)
    if defs:
        parts.insert(2, '<defs>' + ''.join(defs) + '</defs>')
    parts += legend_svg(margin * 2 + plot, head + 20)
    parts.append('</svg>')
    return '\n'.join(parts) + '\n'


PAGE = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PLIM Task Tree</title>
<style>
__FONTS__
:root { --ink: __INK__; --surface: __SURFACE__; --quiet: __QUIET__; --paper: #fff; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface); color: var(--ink); font-family: __FONT_FAMILY__; }
header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem 1rem; padding: 1rem 1rem 0.25rem; }
h1 { font-size: 1.4rem; font-weight: 600; margin: 0; }
nav { display: flex; flex-wrap: wrap; gap: 0.25rem; }
nav button { border: none; background: none; padding: 0 0.15rem; font: inherit; font-size: 1rem; color: #A65F5E; cursor: pointer; }
nav button::after { content: '\\203A'; padding-inline-start: 0.4rem; color: var(--quiet); }
nav button:last-child { color: var(--ink); cursor: default; font-weight: 600; }
nav button:last-child::after { content: none; }
main { display: flex; flex-wrap: wrap; gap: 1rem; padding: 0 1rem 1rem; }
#chart { flex: 1 1 36rem; min-inline-size: 0; }
#chart svg { inline-size: 100%; block-size: auto; display: block; max-block-size: calc(100vh - 6rem); }
aside { flex: 0 1 16rem; font-size: 0.85rem; }
aside section { display: contents; }
aside h2 { font-size: 0.95rem; font-weight: 600; margin: 1rem 0 0.4rem; }
aside ul { list-style: none; margin: 0; padding: 0; }
aside li { display: flex; align-items: center; gap: 0.5rem; margin: 0.25rem 0; }
.swatch { inline-size: 1rem; block-size: 1rem; border-radius: 50%; flex: none; }
#detail { position:fixed; inset-inline-start:var(--tip-x,0); inset-block-start:var(--tip-y,0); z-index:20; max-inline-size:min(26rem,var(--tip-width,calc(100vw - 1rem))); padding:.9rem 1rem; background:#fff; border:.0625rem solid var(--quiet); border-radius:.65rem; box-shadow:0 .25rem 1rem color-mix(in srgb,var(--ink) 20%,transparent); line-height:1.45; pointer-events:none; overflow-wrap:anywhere; overflow:hidden; }
#detail[hidden] { display:none; }
#detail strong { display:block; font-size:1.05rem; }
#detail p { margin:.45rem 0; }
#detail dl { display:grid; grid-template-columns:max-content minmax(0,1fr); gap:.2rem .8rem; margin:.6rem 0 0; font-size:.85rem; }
#detail dt { color:var(--quiet); }
#detail dd { margin:0; font-variant-numeric:tabular-nums; }
circle { cursor: pointer; transition: filter 0.15s; }
circle:hover { filter: brightness(0.93); }
text { pointer-events: none; text-anchor: middle; paint-order: stroke; stroke-linejoin: round; }
@media print {
  .tree-document { block-size: 100vh; display: flex; flex-direction: column; background: var(--paper); }
  header { flex: none; padding: 0.5rem 1rem 0.25rem; }
  h1 { font-size: 1rem; }
  nav button { font-size: 0.75rem; }
  main { flex: 1; min-block-size: 0; flex-direction: column; flex-wrap: nowrap; }
  #chart { flex: 0 1 auto; min-block-size: 0; }
  #chart svg { block-size: 100%; max-block-size: none; }
  aside { flex: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0 1rem; font-size: 0.75rem; line-height: 1.2; }
  aside section { display: block; }
  aside h2 { font-size: 1em; margin: 0.75em 0 0.25em; }
  aside li { margin: 0.1em 0; }
  .swatch { inline-size: 1em; block-size: 1em; }
}
</style>
</head>
<body>
<header><h1>PLIM Task Tree</h1><nav id="path" aria-label="Path in the tree"></nav></header>
<main>
<div id="chart"><svg id="svg" viewBox="0 0 1000 1000" role="application" tabindex="0" aria-label="Task tree as nested circles"></svg><div id="detail" role="tooltip" hidden></div></div>
<aside>
<section><h2>Status</h2><ul id="status"></ul></section>
<section><h2>Priority</h2><ul id="priority"></ul></section>
<section><h2>Border colour</h2><ul id="week"></ul></section>
<section><h2>Due date</h2><ul id="due"></ul></section>
<section><h2>Size</h2><p>Area grows with complexity; 9 is ten times the area of 0.</p></section>
</aside>
</main>
<script>
const NODES = __NODES__;
const STATUS = __STATUS__;
const WEEK = __WEEK__;
const BORDER = __BORDER__;
const DUE = __DUE__;
const THEME = __THEME__;
const SVG = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('svg');
const pathNav = document.getElementById('path');
const detail = document.getElementById('detail');
let focus = 0, view = null;

function children(p) { return NODES.map((n, i) => (n.parent === p ? i : -1)).filter(i => i >= 0); }
function ancestors(i) { const out = []; while (i !== null && i !== undefined) { out.unshift(i); i = NODES[i].parent; } return out; }
function inside(i, root) { while (i !== null && i !== undefined) { if (i === root) return true; i = NODES[i].parent; } return false; }

function fill(n) { return n.children && !n.priority ? 'none' : (n.dueFill || STATUS[n.status][1]); }
function stroke(n) { return BORDER[n.priority] ? [WEEK[n.week][1], BORDER[n.priority]] : [THEME.branch, 0.9]; }

const circles = NODES.map((n, i) => {
  if (i === 0) return null;
  const c = document.createElementNS(SVG, 'circle');
  const [colour, width] = stroke(n);
  c.setAttribute('cx', n.x); c.setAttribute('cy', n.y); c.setAttribute('r', n.r-width/2);
  c.setAttribute('fill', fill(n));
  // A transparent branch still takes the click on its whole area, not only on its border.
  c.setAttribute('pointer-events', 'all');
  c.setAttribute('stroke', n.week === 'both' && n.priority ? THEME.orange : colour); c.setAttribute('stroke-width', width);
  c.setAttribute('aria-label', 'Bubble ' + n.title);
  c.setAttribute('aria-description', n.hover);
  c.addEventListener('click', e => { e.stopPropagation(); open(i); });
  svg.appendChild(c);
  if (n.week === 'both' && n.priority) {
    // Worked on this week and planned for next week: an orange ring around the blue border.
    const ring = document.createElementNS(SVG, 'circle');
    const w = BORDER[n.priority];
    ring.setAttribute('cx', n.x); ring.setAttribute('cy', n.y); ring.setAttribute('r', n.r-w*1.5);
    ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', colour);
    ring.setAttribute('stroke-width', w);
    ring.style.pointerEvents = 'none';
    ring.dataset.ring = i;
    svg.appendChild(ring);
  }
  c.addEventListener('mouseenter', event => show(i, event));
  c.addEventListener('mousemove', event => show(i, event));
  c.addEventListener('mouseleave', () => { detail.hidden = true; });
  return c;
});
const labelLayer = document.createElementNS(SVG, 'g');
svg.appendChild(labelLayer);

function show(i, point) {
  const n = NODES[i];
  detail.dataset.reference = n.id;
  if (point) { detail.dataset.pointerX = point.clientX; detail.dataset.pointerY = point.clientY; }
  const signature = JSON.stringify([n.title, n.description, n.status, n.priority, n.complexity, n.due, n.week]);
  if (detail.dataset.task !== signature) {
    detail.dataset.task = signature;
    const title = document.createElement('strong'); title.textContent = n.title;
    const text = document.createElement('p'); text.textContent = n.description;
    const fields = document.createElement('dl');
    const values = [['Status', STATUS[n.status][0]], ['Priority', n.priority || 'None'], ['Complexity', String(n.complexity)]];
    if (n.due) values.push(['Due date', n.due]);
    if (WEEK[n.week][0] !== 'neither') values.push(['Planning', WEEK[n.week][0]]);
    for (const [name, value] of values) {
      const label = document.createElement('dt'); label.textContent = name;
      const content = document.createElement('dd'); content.textContent = value;
      fields.append(label, content);
    }
    detail.replaceChildren(title, text, fields);
  }
  detail.hidden = false;
  const chart = document.getElementById('chart').getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(detail).fontSize) / 2;
  const left = Math.max(gap, chart.left + gap), top = Math.max(gap, chart.top + gap);
  const right = Math.min(innerWidth - gap, chart.right - gap), bottom = Math.min(innerHeight - gap, chart.bottom - gap);
  detail.style.setProperty('--tip-width', Math.max(0, right - left) + 'px');
  detail.style.maxHeight = Math.max(0, bottom - top) + 'px';
  const bounds = detail.getBoundingClientRect();
  const x = point?.clientX ?? circles[i].getBoundingClientRect().right;
  const y = point?.clientY ?? circles[i].getBoundingClientRect().top;
  detail.style.setProperty('--tip-x', Math.max(left, Math.min(x + gap, right - bounds.width)) + 'px');
  detail.style.setProperty('--tip-y', Math.max(top, Math.min(y + gap, bottom - bounds.height)) + 'px');
}

function open(i) {
  detail.hidden = true;
  const n = NODES[i];
  const target = n.children ? i : (n.parent === null ? 0 : n.parent);
  focus = target;
  render(true);
}
function up() { detail.hidden = true; if (focus !== 0) { focus = NODES[focus].parent; render(true); } }
svg.addEventListener('click', up);
document.addEventListener('keydown', e => { if (e.key === 'Escape') up(); });

function labels() {
  if (!view) return;
  const previous = new Map([...labelLayer.children].map(element => [element.dataset.labelKey, element]));
  const retained = new Set();
  const retain = (element, key) => {
    element.dataset.labelKey = key;
    retained.add(element);
    if (!element.isConnected) labelLayer.appendChild(element);
  };
  const bounds = svg.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  NODES.forEach((n, i) => {
    const cfg = n.label;
    if (i === focus || !cfg || !inside(i, focus)) return;
    const size = cfg.size;
    const key = String(n.id || i);
    const signature = JSON.stringify([i, n.x, n.y, cfg, n.priority, n.dueInk, n.status, fill(n)]);
    const t = previous.get('text:' + key) || document.createElementNS(SVG, 'text');
    if (t.dataset.signature === signature) {
      retain(t, 'text:' + key);
      const path = previous.get('path:' + key);
      if (path) retain(path, 'path:' + key);
      return;
    }
    t.replaceChildren();
    t.removeAttribute('dominant-baseline');
    t.dataset.signature = signature;
    t.dataset.labelFor = i;
    t.setAttribute('font-size', size);
    t.setAttribute('font-weight', cfg.weight);
    t.setAttribute('fill', n.priority ? (n.dueInk || STATUS[n.status][2]) : THEME.ink);
    t.setAttribute('stroke', fill(n) === 'none' ? THEME.surface : fill(n));
    t.setAttribute('stroke-width', size * 0.08);
    if (cfg.kind === 'lines') {
      cfg.lines.forEach((line, j) => {
        const span = document.createElementNS(SVG, 'tspan');
        span.setAttribute('x', n.x + (cfg.dx || 0));
        span.setAttribute('y', n.y + (cfg.dy || 0) + ((j - (cfg.lines.length - 1) / 2) * THEME.lineHeight - line.middle) * size);
        span.textContent = line.text;
        t.appendChild(span);
      });
    } else {
      let start = cfg.start, end = cfg.end;
      const sweep = Math.sin((start + end) / 2) < 0 ? 1 : 0;
      if (!sweep) [start, end] = [end, start];
      const path = previous.get('path:' + key) || document.createElementNS(SVG, 'path');
      const id = 'arc' + i;
      path.setAttribute('id', id);
      path.setAttribute('fill', 'none');
      path.setAttribute('d', 'M ' + (n.x + cfg.radius * Math.cos(start)) + ' ' + (n.y + cfg.radius * Math.sin(start))
        + ' A ' + cfg.radius + ' ' + cfg.radius + ' 0 ' + (Math.abs(end - start) > Math.PI ? 1 : 0) + ' ' + sweep
        + ' ' + (n.x + cfg.radius * Math.cos(end)) + ' ' + (n.y + cfg.radius * Math.sin(end)));
      retain(path, 'path:' + key);
      t.setAttribute('dominant-baseline', 'middle');
      const text = document.createElementNS(SVG, 'textPath');
      text.setAttribute('href', '#' + id);
      text.setAttribute('startOffset', '50%');
      text.textContent = cfg.text;
      t.appendChild(text);
    }
    retain(t, 'text:' + key);
  });
  for (const element of previous.values()) if (!retained.has(element)) element.remove();
}

function render(animate) {
  const n = NODES[focus];
  let goal = { x: n.x, y: n.y, w: n.r * 2.08, h: n.r * 2.08 };
  if (focus === 0) {
    const roots = children(0).map(i => NODES[i]);
    const left = Math.min(...roots.map(c => c.x - c.r)), right = Math.max(...roots.map(c => c.x + c.r));
    const top = Math.min(...roots.map(c => c.y - c.r)), bottom = Math.max(...roots.map(c => c.y + c.r));
    goal = { x: (left + right) / 2, y: (top + bottom) / 2, w: (right - left) * 1.04, h: (bottom - top) * 1.04 };
  }
  pathNav.textContent = '';
  for (const i of ancestors(focus)) {
    const b = document.createElement('button'); b.type = 'button';
    b.textContent = i === 0 ? 'All' : NODES[i].title;
    b.setAttribute('aria-label', b.textContent);
    b.addEventListener('click', () => { focus = i; render(true); });
    pathNav.appendChild(b);
  }
  circles.forEach((c, i) => {
    if (!c) return;
    c.style.display = inside(i, focus) ? '' : 'none';
    c.setAttribute('pointer-events', i === focus ? 'none' : 'all');
  });
  svg.querySelectorAll('circle[data-ring]').forEach(r => {
    const i = Number(r.dataset.ring);
    r.style.display = inside(i, focus) ? '' : 'none';
  });
  const start = view || goal, t0 = performance.now(), time = animate && view ? 550 : 0;
  function step(now) {
    const k = time ? Math.min(1, (now - t0) / time) : 1;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    view = { x: start.x + (goal.x - start.x) * e, y: start.y + (goal.y - start.y) * e, w: start.w + (goal.w - start.w) * e, h: start.h + (goal.h - start.h) * e };
    svg.setAttribute('viewBox', (view.x - view.w / 2) + ' ' + (view.y - view.h / 2) + ' ' + view.w + ' ' + view.h);
    labels();
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function legend(id, entries) {
  const ul = document.getElementById(id);
  for (const [name, fill, colour, width, ring] of entries) {
    const li = document.createElement('li');
    const s = document.createElement('span'); s.className = 'swatch';
    s.style.background = fill; s.style.border = width + 'px solid ' + colour;
    if (ring) s.style.boxShadow = '0 0 0 3px ' + ring;
    li.append(s, document.createTextNode(name)); ul.appendChild(li);
  }
}
legend('status', Object.values(STATUS).map(s => [s[0], s[1], THEME.grey, 1]).concat([['branch of the structure', 'transparent', THEME.branch, 1]]));
legend('priority', [['H high', '#fff', THEME.quiet, BORDER.H], ['M medium', '#fff', THEME.quiet, BORDER.M], ['L low', '#fff', THEME.quiet, BORDER.L]]);
legend('week', Object.entries(WEEK).map(([k, w]) => [w[0], '#fff', w[1], 3, k === 'both' ? THEME.orange : '']));
legend('due', DUE.map(([name, colour]) => [name, colour, THEME.grey, 1]));
render(false);
new ResizeObserver(labels).observe(svg);
document.fonts.ready.then(labels);
</script>
</body>
</html>
'''


def script_json(value):
    """JSON to stand inside a `<script>` block.

    `json.dumps` leaves `<`, `>` and `&` as they are, so a task text carrying
    `</script>` or `<!--` would end the block or open a comment and put the
    rest of the text into the page as markup; escaped, it stays a string."""
    return (json.dumps(value, ensure_ascii=False)
            .replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026'))


ELEMENT = r'''
export class TaskTreeElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.resources = [];
  }
  disconnectedCallback() { this.dispose(); }
  dispose() {
    for (const release of this.resources.splice(0)) release();
  }
  setDocument(data) {
    this.dispose();
    const globalDocument = this.ownerDocument;
    const root = this.shadowRoot;
    const abort = new AbortController();
    this.resources.push(() => abort.abort());
    root.replaceChildren();
    const style = globalDocument.createElement('style');
    style.textContent = data.styles.replace(':root {', ':host {').replace('body {', '.tree-document {');
    const body = globalDocument.createElement('div');
    body.className = 'tree-document';
    const template = globalDocument.createElement('template');
    template.innerHTML = data.body;
    body.append(template.content.cloneNode(true));
    root.append(style, body);
    if (!globalDocument.querySelector('style[data-task-tree-fonts]')) {
      const fonts = globalDocument.createElement('style');
      fonts.dataset.taskTreeFonts = '';
      fonts.textContent = data.fonts;
      globalDocument.head.append(fonts);
    }
    const document = {
      body, documentElement: this, fonts: globalDocument.fonts,
      getElementById: id => root.getElementById(id),
      querySelector: selector => root.querySelector(selector.replaceAll('body>', '.tree-document>')),
      querySelectorAll: selector => root.querySelectorAll(selector.replaceAll('body>', '.tree-document>')),
      createElement: name => globalDocument.createElement(name),
      createElementNS: (ns, name) => globalDocument.createElementNS(ns, name),
      createTextNode: text => globalDocument.createTextNode(text),
      addEventListener: (name, callback, options) => root.addEventListener(name, callback, {
        ...(typeof options === 'boolean' ? {capture: options} : options), signal: abort.signal
      })
    };
    const frames = new Set();
    const resources = this.resources;
    const environment = {
      requestAnimationFrame: callback => {
        const id = requestAnimationFrame(time => { frames.delete(id); if (!abort.signal.aborted) callback(time); });
        frames.add(id); return id;
      },
      ResizeObserver: class extends ResizeObserver {
        constructor(callback) { super(callback); resources.push(() => this.disconnect()); }
      }
    };
    resources.push(() => { for (const id of frames) cancelAnimationFrame(id); });
    this.renderer = mountOriginalTree(document, data, environment);
    this.dataset.lifecycle = String((Number(this.dataset.lifecycle) || 0) + 1);
    return this.renderer;
  }
}
if (!customElements.get('task-tree-view')) customElements.define('task-tree-view', TaskTreeElement);
'''


def browser_module():
    """One custom element shared by the self-contained page and the application."""
    script = PAGE.split('<script>', 1)[1].split('</script>', 1)[0]
    for name in ('NODES', 'STATUS', 'WEEK', 'BORDER', 'DUE', 'THEME'):
        script = script.replace('__' + name + '__', 'data.' + name)
    return ('function mountOriginalTree(document, data, environment) {\n'
            'const {requestAnimationFrame, ResizeObserver} = environment;\n' + script + '\n'
            'return {document, NODES, STATUS, WEEK, BORDER, THEME, SVG, svg, circles, labelLayer, '
            'children, ancestors, inside, fill, stroke, show, open, labels, '
            'get focus() { return focus; }, set focus(value) { focus = value; }};\n}\n' + ELEMENT)


def draw_html(nodes):
    data = []
    for node in nodes:
        data.append({
            'parent': node['parent'],
            'x': round(node['cx'], 4), 'y': round(node['cy'], 4), 'r': round(node['R'], 4),
            'label': node.get('label'),
            'title': node['title'], 'description': node['description'], 'id': node['id'],
            'status': node['status'], 'priority': node['priority'], 'complexity': node['complexity'],
            'week': node['week'], 'children': bool(node['children']), 'hover': hover_of(node) if node['parent'] is not None else '',
            'due': node['due'].isoformat() if node.get('due') else '',
            'dueFill': node.get('due_fill') or '', 'dueInk': node.get('due_ink') or '',
        })
    theme = {'ink': INK, 'surface': SURFACE, 'quiet': QUIET, 'grey': GREY, 'branch': BRANCH,
             'orange': ORANGE, 'lineHeight': LINE_HEIGHT, 'minFont': MIN_FONT}
    page = PAGE.replace('__FONTS__', '').replace('__FONT_FAMILY__', 'PLIMTaskTree, ' + font_profile(500)[0].getname()[0] + ', sans-serif')
    for name, value in (('__INK__', INK), ('__SURFACE__', SURFACE), ('__QUIET__', QUIET),
                        ('__DUE__', script_json([list(entry) for entry in DUE_LEGEND])),
                        ('__STATUS__', script_json({k: list(v) for k, v in STATUS.items()})),
                        ('__WEEK__', script_json({k: list(v) for k, v in WEEK.items()})),
                        ('__BORDER__', script_json(BORDER)), ('__THEME__', script_json(theme))):
        page = page.replace(name, value)
    payload = {'NODES': data, 'STATUS': {k: list(v) for k, v in STATUS.items()},
               'WEEK': {k: list(v) for k, v in WEEK.items()}, 'BORDER': BORDER,
               'DUE': [list(entry) for entry in DUE_LEGEND], 'THEME': theme,
               'styles': page.split('<style>', 1)[1].split('</style>', 1)[0],
               'fonts': font_css(),
               'body': page.split('<body>', 1)[1].split('<script>', 1)[0]}
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>PLIM Task Tree</title><style>html,body{margin:0;min-block-size:100%;}'
            'task-tree-view{display:block;}</style></head><body><task-tree-view></task-tree-view>'
            '<script type="application/json" id="task-tree-data">' + script_json(payload) + '</script>'
            '<script type="module">' + browser_module() + '\n'
            "document.querySelector('task-tree-view').setDocument(JSON.parse(document.getElementById('task-tree-data').textContent));"
            '</script></body></html>\n')


def build(path, png, today, labels='arc'):
    roots = parse(path)
    if not roots:
        sys.exit(f'{path}: no tree entry found')
    mark_weeks(roots, done_this_week(path, today))
    mark_due(roots, today)
    top = {'children': roots, 'complexity': 0, 'title': 'All', 'description': '', 'id': '',
           'status': '⬜', 'priority': '', 'week': '', 'due': None, 'root': True}
    plot, side, margin, head = 1900, 300, 30, 20
    fit_layout(top, plot/2)
    scale = 1.0
    nodes = []
    position(top, margin + plot / 2, head + plot / 2, scale, nodes, 0, None)
    svg = draw_svg(nodes, 'PLIM Task Tree', plot, side, margin, head, labels)
    target = path.with_suffix('.svg')
    target.write_text(svg, encoding='utf-8')
    print(os.path.relpath(target, ROOT))
    page = path.with_suffix('.html')
    page.write_text(draw_html(nodes), encoding='utf-8')
    print(os.path.relpath(page, ROOT))
    if png:
        picture = target.with_suffix('.png')
        run_inkscape('--export-type=png', f'--export-filename={picture}', target)
        print(os.path.relpath(picture, ROOT))


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--png', action='store_true', help='also write a PNG beside each SVG')
    parser.add_argument('--labels', choices=['arc', 'inside'], default='arc',
                        help='parent titles on free arcs (default) or in free interior space')
    parser.add_argument('tree', nargs='*', help='Markdown files carrying a tree; default: the task tree doc/TODO.md')
    options = parser.parse_args(arguments)
    files = [pathlib.Path(name).resolve() for name in options.tree] or trees()
    for path in files:
        build(path, options.png, datetime.date.today(), options.labels)
    return 0


if __name__ == '__main__':
    sys.exit(main())
