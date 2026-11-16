"""FIRMS country-year downloader.

    uv run python -m firms.fetch --check
    uv run python -m firms.fetch --download --country Canada --pause 50
    uv run python -m firms.fetch --download --country Argentina --years 2019

Sequential, one request at a time, pauses between files, skips existing files, retries
twice with backoff, validates the CSV header, writes through a .part file, and stops
after N consecutive failures.
"""

from __future__ import annotations

import argparse
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

from .config import COUNTRIES, RAW, SENSOR_YEARS, local_path, url

LOG = RAW.parent / "download.log"
PART_SUFFIX = ".part"


def _log(message: str) -> None:
    stamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
    line = f"[{stamp}] {message}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def _size(resp: requests.Response) -> int:
    try:
        return int(resp.headers.get("content-length", 0) or 0)
    except (TypeError, ValueError):
        return 0


def _probe(target: str) -> tuple[int, int]:
    """HEAD only. Falls back to a streamed GET when HEAD is refused."""
    resp = requests.head(target, allow_redirects=True, timeout=30)
    if resp.status_code == 405:
        resp = requests.get(target, stream=True, timeout=30)
        size = _size(resp)
        resp.close()
        return resp.status_code, size
    return resp.status_code, _size(resp)


def _is_firms_csv(path: Path) -> bool:
    with path.open("rb") as handle:
        header = handle.readline(400).decode("utf-8", "ignore").lower()
    return "latitude" in header and "longitude" in header


def _download_one(target: str, dest: Path, attempts: int = 3) -> int:
    """Write to .part, verify size and header, then atomically rename. Returns bytes."""
    partial = dest.with_suffix(dest.suffix + PART_SUFFIX)
    for attempt in range(1, attempts + 1):
        try:
            with requests.get(target, stream=True, timeout=180) as resp:
                if resp.status_code != 200:
                    raise RuntimeError(f"HTTP {resp.status_code}")
                expected = _size(resp)
                written = 0
                with partial.open("wb") as handle:
                    for chunk in resp.iter_content(chunk_size=1 << 20):
                        handle.write(chunk)
                        written += len(chunk)
            if expected and written != expected:
                raise RuntimeError(f"short read {written}/{expected} bytes")
            if not _is_firms_csv(partial):
                raise RuntimeError("response is not a FIRMS CSV")
            partial.replace(dest)
            return written
        except (requests.RequestException, RuntimeError, OSError) as exc:
            partial.unlink(missing_ok=True)
            _log(f"    attempt {attempt}/{attempts} failed: {exc}")
            if attempt < attempts:
                time.sleep(20 * attempt)
    return 0


def _years(sensor: str, spec: str) -> list[int]:
    allowed = list(SENSOR_YEARS[sensor])
    if not spec:
        return allowed
    wanted = {int(item) for item in spec.split(",") if item.strip()}
    unknown = wanted - set(allowed)
    if unknown:
        raise SystemExit(f"{sensor}: years outside range: {sorted(unknown)}")
    return [year for year in allowed if year in wanted]


def check(countries: list[str], sensors: list[str], pause: float) -> None:
    total = 0
    missing = 0
    for country in countries:
        for sensor in sensors:
            for year in SENSOR_YEARS[sensor]:
                target = url(sensor, year, country)
                try:
                    status, size = _probe(target)
                except requests.RequestException as exc:
                    _log(f"ERR  {country:14s} {sensor:11s} {year}  {exc}")
                    missing += 1
                    continue
                total += size
                missing += status != 200
                _log(f"{status}  {size / 1e6:8.2f} MB  {country:14s} {sensor:11s} {year}")
                time.sleep(pause)
    _log(f"missing: {missing}   total: {total / 1e9:.2f} GB")


def download(
    countries: list[str],
    sensors: list[str],
    years_spec: str,
    pause: float,
    max_errors: int,
    attempts: int,
) -> None:
    errors = 0
    for country in countries:
        for sensor in sensors:
            for year in _years(sensor, years_spec):
                dest = local_path(sensor, year, country)
                if dest.exists() and dest.stat().st_size > 0:
                    _log(f"skip  {dest.name}  {dest.stat().st_size / 1e6:.2f} MB")
                    continue

                target = url(sensor, year, country)
                _log(f"get   {country} {sensor} {year}")
                written = _download_one(target, dest, attempts)
                if written:
                    _log(f"ok    {dest.name}  {written / 1e6:.2f} MB")
                    errors = 0
                else:
                    _log(f"FAIL  {target}")
                    errors += 1
                    if errors >= max_errors:
                        raise SystemExit(f"stopped after {errors} consecutive failures")
                time.sleep(pause)


def _split(value: str, allowed: tuple[str, ...] | None = None) -> list[str]:
    items = [item.strip() for item in value.split(",") if item.strip()]
    if allowed is not None:
        bad = [item for item in items if item not in allowed]
        if bad:
            raise SystemExit(f"unknown value(s): {bad}. Choose from {allowed}")
    return items


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="HEAD only, print sizes")
    mode.add_argument("--download", action="store_true", help="GET into data/raw")
    parser.add_argument("--country", default=",".join(COUNTRIES))
    parser.add_argument("--sensor", default=",".join(SENSOR_YEARS))
    parser.add_argument("--years", default="", help="comma-separated subset, e.g. 2019,2020")
    parser.add_argument("--pause", type=float, default=1.0, help="seconds after each file")
    parser.add_argument("--max-errors", type=int, default=5)
    parser.add_argument("--attempts", type=int, default=3)
    args = parser.parse_args()

    countries = _split(args.country, COUNTRIES)
    sensors = _split(args.sensor, tuple(SENSOR_YEARS))

    if args.check:
        check(countries, sensors, args.pause)
    else:
        download(countries, sensors, args.years, args.pause, args.max_errors, args.attempts)


if __name__ == "__main__":
    main()
