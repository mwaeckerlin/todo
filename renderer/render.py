"""Adapt stored tasks to the canonical task-tree renderer."""
import datetime
import importlib.util
import json
import os
import pathlib
import sys

os.environ['FONTCONFIG_FILE']=str(pathlib.Path(__file__).with_name('fonts.conf').resolve())

spec = importlib.util.spec_from_file_location("task_tree", pathlib.Path(__file__).with_name("task-tree.py"))
tree = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tree)

payload = json.load(sys.stdin)
today = datetime.date.fromisoformat(payload["today"])
icons = dict(zip(("open", "planned", "in_work", "merged", "done", "waiting", "dropped"), tree.STATUS))
nodes_by_id = {}
for task in sorted(payload["tasks"], key=lambda task: task["order"]):
    nodes_by_id[task["id"]] = {
        "status": icons[task["status"]], "priority": task["priority"], "complexity": task["complexity"],
        "due": datetime.date.fromisoformat(task["due_date"]) if task["due_date"] else None,
        "title": task["title"], "description": task["description"], "id": "#" + task["reference"],
        "week": "next" if task["next_week"] else "", "children": [],
    }
roots = []
for task in sorted(payload["tasks"], key=lambda task: task["order"]):
    parent = nodes_by_id.get(task["parent_id"])
    (parent["children"] if parent else roots).append(nodes_by_id[task["id"]])
tree.mark_weeks(roots, payload.get("worked", []))
tree.mark_due(roots, today)
top = {"children": roots, "complexity": 0, "title": "All", "description": "", "id": "",
       "status": "⬜", "priority": "", "week": "", "due": None, "root": True}
plot, side, margin, head = 1900, 300, 30, 20
tree.fit_layout(top, plot / 2)
nodes = []
tree.position(top, margin + plot / 2, head + plot / 2, 1.0, nodes, 0, None)
svg = tree.draw_svg(nodes, "PLIM Task Tree", plot, side, margin, head, "arc")
json.dump({"svg": svg, "html": tree.draw_html(nodes)}, sys.stdout, ensure_ascii=False)
