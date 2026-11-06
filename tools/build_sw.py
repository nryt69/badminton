#!/usr/bin/env python3
"""Regenerates sw.js (offline cache list). Run after adding/changing any asset:  python3 tools/build_sw.py"""
import hashlib, json, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
skip_dirs = {'.git', '.github', 'tools', 'node_modules'}
skip_files = {'sw.js', 'README.md', '.nojekyll', '.gitignore'}
files, h = ['./'], hashlib.sha1()
for d, ds, fs in os.walk(root):
    ds[:] = sorted(x for x in ds if x not in skip_dirs)
    for f in sorted(fs):
        if f in skip_files: continue
        p = os.path.join(d, f); rel = os.path.relpath(p, root).replace(os.sep, '/')
        files.append(rel); h.update(rel.encode()); h.update(open(p, 'rb').read())
tpl = open(os.path.join(root, 'tools', 'sw.template.js')).read()
tpl = tpl.replace('__FILES__', json.dumps(files, indent=1)).replace("badminton-offline-v1", "badminton-offline-" + h.hexdigest()[:10])
open(os.path.join(root, 'sw.js'), 'w').write(tpl)
print('sw.js written:', len(files), 'files, cache', h.hexdigest()[:10])
