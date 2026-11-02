"""Fetch one genuine 1-second recording per physical test, using ZIP range reads.

Original data: Brito et al. (2022), doi:10.17632/zx8pfhdtnb.1, CC BY 4.0.
No generated signal, copied program, or additional dependency is used.
"""

import hashlib
import io
import json
import re
import sys
import zipfile
from pathlib import Path

import httpx
import numpy as np

BACKEND = Path(__file__).resolve().parent.parent
DATA = BACKEND / "data" / "real"
DATASET = "zx8pfhdtnb"
SOURCE = f"https://data.mendeley.com/datasets/{DATASET}/1"
MANIFEST_URL = (
    f"https://data.mendeley.com/public-api/datasets/{DATASET}/files"
    "?folder_id=root&version=1&$start=0&$limit=1000"
)


class RangeFile(io.RawIOBase):
    """Read only requested bytes. Never silently download the whole archive."""

    def __init__(self, client: httpx.Client, url: str, size: int) -> None:
        self.client, self.url, self.size, self.position = client, url, size, 0

    def seekable(self) -> bool:
        return True

    def seek(self, offset: int, whence: int = 0) -> int:
        self.position = offset + (0 if whence == 0 else self.position if whence == 1 else self.size)
        if self.position < 0:
            raise ValueError("negative seek")
        return self.position

    def tell(self) -> int:
        return self.position

    def read(self, size: int = -1) -> bytes:
        size = self.size - self.position if size < 0 else min(size, self.size - self.position)
        if size <= 0:
            return b""
        if size > 2_000_000:
            raise ValueError("refusing an unexpectedly large archive read")
        start, end = self.position, self.position + size - 1
        with self.client.stream("GET", self.url, headers={"Range": f"bytes={start}-{end}"}) as r:
            if r.status_code != 206 or not r.headers.get("content-range", "").startswith(
                f"bytes {start}-{end}/"
            ):
                raise ValueError("source did not honour the requested byte range")
            data = r.read()
        if len(data) != size:
            raise ValueError("incomplete range response")
        self.position += size
        return data


def natural_key(name: str) -> list:
    return [int(p) if p.isdigit() else p for p in re.split(r"(\d+)", name)]


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    raw = DATA / "raw"
    raw.mkdir(exist_ok=True)
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        response = client.get(
            MANIFEST_URL, headers={"Accept": "application/vnd.mendeley-public-dataset.1+json"}
        )
        response.raise_for_status()
        all_entries = response.json()
        entries = sorted(
            (e for e in all_entries if e["filename"].lower().endswith(".zip")),
            key=lambda f: natural_key(f["filename"]),
        )
        if len(entries) != 20:
            raise ValueError("expected exactly 20 source test archives")
        rows = []
        for index, entry in enumerate(entries, 1):
            destination = raw / f"test-{index:02d}.npy"
            metadata = destination.with_suffix(".json")
            if destination.exists() and metadata.exists():
                row = json.loads(metadata.read_text(encoding="utf-8"))
                if hashlib.sha256(destination.read_bytes()).hexdigest() != row["recording_sha256"]:
                    raise ValueError("local recording checksum mismatch")
            else:
                detail = entry["content_details"]
                with zipfile.ZipFile(RangeFile(client, detail["download_url"], entry["size"])) as z:
                    names = sorted(
                        (n for n in z.namelist() if n.lower().endswith(".npy")), key=natural_key
                    )
                    if not names:
                        raise ValueError(f"no NumPy recording in {entry['filename']}")
                    payload = z.read(names[0])  # zipfile checks the entry CRC
                signal = np.load(io.BytesIO(payload), allow_pickle=False)
                if signal.shape != (4, 25000) or not np.isfinite(signal).all():
                    raise ValueError("unexpected recording shape or non-finite measurements")
                destination.write_bytes(payload)
                row = {
                    "test": index,
                    "archive": entry["filename"],
                    "archive_id": entry["id"],
                    "archive_sha256_advertised": detail["sha256_hash"],
                    "archive_hash_verified": False,
                    "member": names[0],
                    "download_url": detail["download_url"],
                    "recording_sha256": hashlib.sha256(payload).hexdigest(),
                    "shape": list(signal.shape),
                    "sample_rate_hz": 25000,
                }
                metadata.write_text(json.dumps(row, indent=2) + "\n", encoding="utf-8")
            rows.append(row)
            print(f"{index}/20 fetched {destination.name}", flush=True)
        photo = next(e for e in all_entries if e["filename"] == "Test Bench.jpg")
        photo_path = DATA / "test-bench.jpg"
        if not photo_path.exists():
            result = client.get(photo["content_details"]["download_url"])
            result.raise_for_status()
            photo_path.write_bytes(result.content)
        if (
            hashlib.sha256(photo_path.read_bytes()).hexdigest()
            != photo["content_details"]["sha256_hash"]
        ):
            raise ValueError("test bench photograph checksum mismatch")
    manifest = {
        "source": "measured_laboratory",
        "dataset_url": SOURCE,
        "doi": "10.17632/zx8pfhdtnb.1",
        "license": "CC BY 4.0",
        "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "attribution": "Lucas Brito, Gian Antonio Susto, Jorge Nei Brito, Marcus Duarte (2022)",
        "selection": "First naturally sorted .npy file from every one of the 20 test archives.",
        "recordings": rows,
    }
    (DATA / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except (httpx.HTTPError, ValueError, zipfile.BadZipFile) as error:
        sys.exit(f"Real recording download failed: {error}")
