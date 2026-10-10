"""Package only explicit application sources; never include local customer state."""
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
dest=root/'dist'/'Outreach-Desk-2.0.0.zip'
dest.parent.mkdir(exist_ok=True)
files=[root/name for name in ['package.json','package-lock.json','README.md','Setup-Windows.cmd','Start-Windows.cmd','Setup-Mac.command','Start-Mac.command']]
for directory in ['src','public','scripts','tests']:
 files.extend(p for p in (root/directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ['.pyc','.log'])
with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(files):
  info=zipfile.ZipInfo.from_file(p,Path('Outreach-Desk')/p.relative_to(root))
  info.compress_type=zipfile.ZIP_DEFLATED
  z.writestr(info,p.read_bytes())
with zipfile.ZipFile(dest) as z:
 assert all(not any(part in ['data','team-data','node_modules','outputs','.git'] for part in Path(name).parts) for name in z.namelist())
print(dest)
