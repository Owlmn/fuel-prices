import json
import shutil
from datetime import UTC, datetime

from app.config import Settings
from app.locking import writer_lock
from app.operations import backup


def daily_backup(settings: Settings) -> dict:
    root = (settings.data_dir / "backups").resolve()
    root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    result = backup(settings, root / f"fuel-{stamp}.sqlite")
    with writer_lock(settings.data_dir):
        files = sorted(root.glob("fuel-*.sqlite"))
        for old in files[:-7]:
            # Resolve and constrain every recursive target before deletion, also on Windows.
            archive = old.with_suffix(old.suffix + ".originals")
            if not old.resolve().is_relative_to(root) or not archive.resolve().is_relative_to(root):
                raise ValueError("Backup retention target escapes backup directory")
            if archive.is_symlink() or old.is_symlink():
                raise ValueError("Symlink in backup retention directory")
            if archive.exists():
                shutil.rmtree(archive)
            old.unlink()
    return result


if __name__ == "__main__":
    print(json.dumps(daily_backup(Settings()), ensure_ascii=False))
