"""Collect the Python renderer and its linked runtime libraries for the headless image."""
import pathlib
import shutil
import subprocess
import sys

destination=pathlib.Path(sys.argv[1])
sources=[pathlib.Path('/usr/bin/python3'),pathlib.Path('/usr/bin/fc-match')]
sources.append(pathlib.Path('/app/pillow'))
sources.extend(pathlib.Path('/usr/lib').glob('python*'))
sources.extend(pathlib.Path('/usr/lib').glob('libraqm.so*'))
sources.extend(pathlib.Path('/etc/fonts').glob('fonts.dtd'))
libraries=set()
for source in sources:
    files=list(source.rglob('*.so*')) if source.is_dir() else [source]
    for file in files:
        result=subprocess.run(['ldd',str(file)],capture_output=True,text=True)
        for word in (result.stdout+' '+result.stderr).split():
            if word.startswith('/') and pathlib.Path(word).is_file():libraries.add(pathlib.Path(word))
for source in [*sources,*sorted(libraries)]:
    target=destination.joinpath(*source.parts[1:]);target.parent.mkdir(parents=True,exist_ok=True)
    if source.is_dir():shutil.copytree(source,target,dirs_exist_ok=True,symlinks=False,ignore=shutil.ignore_patterns('site-packages','ensurepip'))
    else:shutil.copyfile(source,target,follow_symlinks=True);shutil.copymode(source,target)
