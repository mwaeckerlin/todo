"""Compile the same custom element emitted by the original HTML builder."""
import ast
import json
from pathlib import Path

source = ast.parse(Path('renderer/task-tree.py').read_text())
namespace = {}
for node in source.body:
    if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in ('PAGE', 'ELEMENT') for target in node.targets):
        for target in node.targets:
            if isinstance(target, ast.Name):
                namespace[target.id] = ast.literal_eval(node.value)
    if isinstance(node, ast.FunctionDef) and node.name == 'browser_module':
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'task-tree.py', 'exec'), namespace)
output = namespace['browser_module']()
output += '\n' + Path('frontend/public/task-tree-bridge.js').read_text()
output += '\nexport const applicationTreeStyles = ' + json.dumps(Path('frontend/public/task-tree-bridge.css').read_text()) + ';\n'
Path('frontend/src/original-task-tree.js').write_text(output)
print('Compiled the shared original task-tree element for React and standalone HTML.')
