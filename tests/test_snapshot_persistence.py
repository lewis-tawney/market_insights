import hashlib
import json
from pathlib import Path

import pytest

from server.jobs import eod_snapshot


def test_persist_snapshot_writes_checksum(tmp_path, monkeypatch):
    target = tmp_path / "snapshots" / "snapshot.json"
    payload = {"foo": "bar"}
    temp_dir = tmp_path / "tmp"
    monkeypatch.setenv("SNAPSHOT_TMP_DIR", str(temp_dir))
    checksum_dir = target.parent / "checksums"
    monkeypatch.setattr(eod_snapshot, "SNAPSHOT_CHECKSUM_DIR", checksum_dir)

    eod_snapshot.persist_snapshot(payload, (target,))

    assert json.loads(target.read_text()) == payload
    checksum_path = target.parent / "checksums" / f"{target.name}.sha256"
    assert checksum_path.exists()
    expected_checksum = hashlib.sha256(target.read_bytes()).hexdigest()
    assert checksum_path.read_text().strip() == expected_checksum


def test_persist_snapshot_atomic_failure_preserves_existing_files(tmp_path, monkeypatch):
    target_dir = tmp_path / "snapshots"
    target_dir.mkdir()
    target = target_dir / "snapshot.json"
    target.write_text("existing-content")
    checksum_dir = target_dir / "checksums"
    checksum_dir.mkdir()
    monkeypatch.setattr(eod_snapshot, "SNAPSHOT_CHECKSUM_DIR", checksum_dir)
    checksum_path = checksum_dir / f"{target.name}.sha256"
    checksum_path.write_text("existing-checksum")

    payload = {"foo": "bar"}

    temp_dir = tmp_path / "tmp"
    monkeypatch.setenv("SNAPSHOT_TMP_DIR", str(temp_dir))

    original_replace = eod_snapshot.os.replace

    def failing_replace(src: str, dst: str):
        if Path(dst) == target:
            raise OSError("simulated failure")
        return original_replace(src, dst)

    monkeypatch.setattr(eod_snapshot.os, "replace", failing_replace)

    with pytest.raises(OSError):
        eod_snapshot.persist_snapshot(payload, (target,))

    assert target.read_text() == "existing-content"
    assert checksum_path.read_text() == "existing-checksum"
