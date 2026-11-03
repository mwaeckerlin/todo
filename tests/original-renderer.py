"""Execute the unchanged original build entry point in the image's own runtime."""
import contextlib
import datetime
import importlib.util
import io
import json
import pathlib
import sys
import tempfile

spec=importlib.util.spec_from_file_location('task_tree',pathlib.Path('renderer/task-tree.py'))
tree=importlib.util.module_from_spec(spec)
spec.loader.exec_module(tree)
payload=json.load(sys.stdin)
with tempfile.TemporaryDirectory(dir='/tmp') as directory:
    path=pathlib.Path(directory)/'TODO.md'
    path.write_text(payload['source'],encoding='utf-8')
    path.with_name('WORK-DONE.md').write_text('',encoding='utf-8')
    with contextlib.redirect_stdout(io.StringIO()):
        tree.build(path,False,datetime.date.fromisoformat(payload['today']))
    print(json.dumps(dict(svg=path.with_suffix('.svg').read_text(encoding='utf-8'),html=path.with_suffix('.html').read_text(encoding='utf-8')),ensure_ascii=False))
