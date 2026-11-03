"""Verify byte provenance and complete SVG/HTML parity with the original renderer."""
import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import tempfile
import unittest

os.environ['FONTCONFIG_FILE']=str(pathlib.Path('renderer/fonts.conf').resolve())
os.environ['PYTHONDONTWRITEBYTECODE']='1'
subprocess.run(['fc-cache','-f'],check=True,capture_output=True,text=True)
spec=importlib.util.spec_from_file_location('task_tree',pathlib.Path('renderer/task-tree.py'))
tree=importlib.util.module_from_spec(spec)
spec.loader.exec_module(tree)

class OriginalRenderer(unittest.TestCase):
    def test_original_source_matches_the_build_source(self):
        canonical=pathlib.Path('renderer/task-tree.py').read_bytes()
        provenance=json.loads(pathlib.Path('renderer/provenance.json').read_text())
        self.assertEqual(hashlib.sha256(canonical).hexdigest(),provenance['sha256'])
        if os.environ.get('TODO_RENDERER_SOURCE'):
            self.assertEqual(canonical,pathlib.Path(os.environ['TODO_RENDERER_SOURCE']).read_bytes())
        module=pathlib.Path('frontend/src/original-task-tree.js').read_text()
        self.assertTrue(module.startswith(tree.browser_module()),'React must compile the same custom element as the standalone page')

    def parity(self,source,capture=False):
        annotated=[]
        for index,line in enumerate(source.splitlines()):
            match=tree.ENTRY.match(line)
            if match and not match.group('id'):
                suffix=' ^' if match.group('next') else ''
                line=line.removesuffix(suffix) if suffix else line
                line+=f' #task-{index}'+suffix
            annotated.append(line)
        pathlib.Path('artifacts').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='renderer-',dir='artifacts') as temporary:
            source_path=pathlib.Path(temporary)/'TODO.md'
            source_path.write_text('\n'.join(annotated),encoding='utf-8')
            source_path.with_name('WORK-DONE.md').write_text('',encoding='utf-8')
            roots=tree.parse(source_path);tasks=[]
            statuses=dict(zip(tree.STATUS,('open','planned','in_work','merged','done','waiting','dropped')))
            def visit(nodes,parent=None):
                for node in nodes:
                    ident=node['id'].removeprefix('#')
                    tasks.append(dict(id=ident,parent_id=parent,title=node['title'],description=node['description'],status=statuses[node['status']],priority=node['priority'],complexity=node['complexity'],due_date=node['due'].isoformat() if node['due'] else None,reference=ident,next_week=node['week']=='next',order=len(tasks)))
                    visit(node['children'],ident)
            visit(roots)
            self.assertGreater(len(tasks),0)
            today=datetime.date.today()
            tree.build(source_path,False,today)
            payload=dict(tasks=tasks,today=today.isoformat(),worked=[])
            result=subprocess.run(['python3','renderer/render.py'],input=json.dumps(payload),text=True,capture_output=True,timeout=60)
            self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stderr,'')
            drawing=json.loads(result.stdout)
            self.assertEqual(drawing['svg'],source_path.with_suffix('.svg').read_text(encoding='utf-8'))
            self.assertEqual(drawing['html'],source_path.with_suffix('.html').read_text(encoding='utf-8'))
            if capture:pathlib.Path('artifacts/renderer-reference.json').write_text(json.dumps(dict(input=payload,source='\n'.join(annotated),output=drawing,source_sha256=hashlib.sha256(pathlib.Path('renderer/task-tree.py').read_bytes()).hexdigest())),encoding='utf-8')

    def test_svg_and_html_are_identical_to_the_original_output(self):
        self.parity('# Task Tree\n\n| | |\n| --- | --- |\n| Purpose | Task planning |\n\n- ⏳3 Delivery - Coordinate Work #delivery\n  - ⬜H2 First Task - Preserve the Original Layout #first\n  - 📄M3 Second Task - Preserve Planned Work #second ^\n  - ✅L1 Completed Task - Keep the Completed Work #complete\n- ⏸H2 Review - Wait for Review #review\n- ❌M1 Experiment - Keep the Dropped Experiment #experiment\n')

    def test_complex_open_source_sample_retains_original_svg_and_html(self):
        self.parity(pathlib.Path('tests/fixtures/opensource.md').read_text(encoding='utf-8'))

    def test_operator_supplied_task_file(self):
        filename=os.environ.get('TODO_IMPORT_FILE') or ('artifacts/import-TODO.md' if pathlib.Path('artifacts/import-TODO.md').is_file() else None)
        if filename:self.parity(pathlib.Path(filename).read_text(encoding='utf-8'),capture=True)
        else:self.parity('- ⬜4 Structure - Keep Structural Branches\n  - ⏳H2 20261101 Task - Keep Dates and Priorities ^\n')

if __name__=='__main__':unittest.main()
