#!/usr/bin/env python3
"""Build a credential-free Hostinger release from an explicit source allowlist."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ASSET_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.wav', '.mp3', '.woff', '.woff2', '.js', '.bcmap', '.pfb', '.ttf', '.wasm'}
PRIVATE_FILES = ('lib.php', 'reports.php', 'poster-images.php', 'optimize-posters.php', 'schema.sql', 'config.example.php', 'install.php', 'check.php', 'backup.php', 'restore.php', 'import.php')


def sources():
    result = {}
    for name in ('index.html', 'theme.css', 'app.js'):
        result['public_html/' + name] = ROOT / 'prototype' / name
    result['public_html/api.php'] = ROOT / 'hostinger/api.php'
    for path in (ROOT / 'prototype/assets').rglob('*'):
        if path.is_file() and not path.is_symlink() and path.suffix.lower() in ASSET_EXTENSIONS:
            result['public_html/assets/' + path.relative_to(ROOT / 'prototype/assets').as_posix()] = path
    for name in PRIVATE_FILES:
        path = ROOT / 'hostinger' / name
        if name in ('lib.php', 'schema.sql', 'config.example.php', 'install.php') or path.is_file():
            result['portal-private/' + name] = path
    for name in ('.htaccess', '.user.ini'):
        result['public_html/' + name] = ROOT / 'deploy' / name
    result['README-HOSTINGER.md'] = ROOT / 'docs/README-HOSTINGER.md'
    return result


def validate(names):
    for name in names:
        path = Path(name)
        if path.is_absolute() or '..' in path.parts or any(p in path.parts for p in ('data', 'node_modules', '.git', '__pycache__')):
            raise ValueError('Unsafe release member: ' + name)
        if path.name in ('config.php', '.env') or path.suffix in ('.sqlite', '.sqlite3', '.log'):
            raise ValueError('Runtime/secret file in release: ' + name)
        if name.startswith('public_html/') and name.endswith('.php') and name != 'public_html/api.php':
            raise ValueError('Private PHP file inside document root: ' + name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'deploy/hostinger-release.zip')
    parser.add_argument('--check-only', action='store_true', help='Validate source allowlist without creating a release archive')
    args = parser.parse_args()
    mapping = sources()
    validate(mapping)
    missing = [str(path.relative_to(ROOT)) for path in mapping.values() if not path.is_file()]
    if missing:
        parser.error('Required sources not ready: ' + ', '.join(missing))
    for path in mapping.values():
        if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
            raise ValueError('Release source must be a regular workspace file: ' + str(path))
    # Local frontend references must remain usable without URL or layout edits.
    for match in re.finditer(r'(?:src|href)="([^"?#]+)', (ROOT / 'prototype/index.html').read_text()):
        url = match[1]
        if not url.startswith(('https:', 'http:', '/', '#')) and 'public_html/' + url not in mapping:
            raise ValueError('Unpackaged frontend dependency: ' + url)
    if args.check_only:
        print(json.dumps({'validated_files': len(mapping), 'archive_created': False, 'private_checks_included': 'portal-private/check.php' in mapping}))
        return
    manifest = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in sorted(mapping.items())}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        parser.error('Release exists; choose a new --output filename to preserve it')
    with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, path in sorted(mapping.items()):
            archive.write(path, name)
        archive.writestr('release-manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    with zipfile.ZipFile(args.output) as archive:
        validate(archive.namelist())
        if archive.testzip() is not None:
            raise ValueError('ZIP integrity failed')
        for name, digest in manifest.items():
            if hashlib.sha256(archive.read(name)).hexdigest() != digest:
                raise ValueError('Release hash mismatch: ' + name)
    print(json.dumps({'archive': str(args.output.resolve()), 'files': len(manifest), 'bytes': args.output.stat().st_size, 'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}, indent=2))


if __name__ == '__main__':
    main()
