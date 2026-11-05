"""Prepare only allowlisted public/private files for SSH deployment. Never includes config/data."""
import argparse, hashlib, json, shutil
from pathlib import Path
from build_hostinger import sources, validate
p=argparse.ArgumentParser();p.add_argument('destination',type=Path);args=p.parse_args()
files=sources();validate(files)
if args.destination.exists():raise SystemExit('Destination must not exist; refusing to overwrite')
for name,source in files.items():
 if not source.is_file() or source.is_symlink():raise SystemExit('Invalid source: '+name)
for name,source in files.items():
 target=args.destination/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
manifest={name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in files.items()}
(args.destination/'release-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Prepared',len(files),'allowlisted files; credentials and databases excluded.')
