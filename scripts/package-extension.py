"""Package the built extension for Chrome's Load unpacked installation."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / 'dist' / 'cuesprig'
manifest = json.loads((BUILD / 'manifest.json').read_text(encoding='utf-8'))
version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
if manifest['version'] != version:
    raise SystemExit('Extension and package versions differ.')

archive = BUILD.parent / f'cuesprig-chrome-{version}.zip'
# Whitelist the source directories so stale build files cannot enter a release.
files = [(source.relative_to(ROOT / 'extension'), source)
         for source in (ROOT / 'extension').rglob('*') if source.is_file()]
files += [(Path('app') / source.relative_to(ROOT / 'public'), source)
          for source in (ROOT / 'public').rglob('*') if source.is_file()]
with ZipFile(archive, 'w', compression=ZIP_DEFLATED) as output:
    for relative, source in sorted(files):
        built = BUILD / relative
        if not built.is_file() or source.is_symlink() or built.is_symlink():
            raise SystemExit(f'Unexpected build input: {relative}')
        output.write(built, relative.as_posix())

with ZipFile(archive) as output:
    if output.testzip() is not None or 'manifest.json' not in output.namelist():
        raise SystemExit('Extension ZIP verification failed.')

with archive.open('rb') as stream:
    checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive.name}\n', encoding='ascii')
print(archive.relative_to(ROOT))
