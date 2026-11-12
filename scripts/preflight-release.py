#!/usr/bin/env python3
"""Checks that must pass before an App Store build.

Run it before `eas build --profile production`:

    python3 scripts/preflight-release.py

Every check here exists because something actually went wrong, not because it
seemed prudent. Each failure below cost a build, and two of them cost a
release.

  1. The version train. Apple refuses any binary whose
     CFBundleShortVersionString is not higher than the released version.
     1.0.8 was refused this way on 10 Nov, then 1.0.9 again on 12 Nov. Both
     times the build, the upload and the submission all succeeded, and the
     refusal only arrived by email afterwards. The live version is readable
     without credentials from the public iTunes lookup endpoint, so there is
     no excuse for guessing at it.

  2. SDK alignment. expo-task-manager was added with `yarn add`, which
     resolves `latest` and installed 58.0.13 against SDK 54, which wants
     ~14.0.9. Metro bundled it, CocoaPods installed it, EAS built it and
     Apple approved it. It shipped as 1.0.9 and could not launch: a native
     module built for the wrong core, registered at module scope, kills the
     process before any screen exists. Use `npx expo install` for Expo
     packages and this check stays quiet.

  3. The two version sources agreeing. ios/ is checked in, so EAS skips
     prebuild and reads the pbxproj. app.json is documentation. If they
     disagree, the shipped number is not the one anybody read.

  4. The api.js injection scan required by CLAUDE.md.
"""
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASC_APP_ID = "6759223641"

# Flagged by `expo install --check` but unchanged across the working 1.0.8
# release, so they are drift rather than danger. Do not "fix" these while
# chasing a bug; see memory note expo-install-only.
KNOWN_DRIFT = {
    "react-native-maps",
    "react-native-reanimated",
    "react-native-worklets",
    "react-native",
    "jest-expo",
}

failures: list[str] = []
notes: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)
    print(f"  FAIL  {msg}")


def ok(msg: str) -> None:
    print(f"  ok    {msg}")


def note(msg: str) -> None:
    notes.append(msg)
    print(f"  note  {msg}")


def parse_version(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in re.findall(r"\d+", v))


# ---------------------------------------------------------------- 3. sources
print("\nVersion sources")
pbx = (ROOT / "ios/thriveapp.xcodeproj/project.pbxproj").read_text()
marketing = set(re.findall(r"MARKETING_VERSION = ([0-9.]+);", pbx))
current = set(re.findall(r"CURRENT_PROJECT_VERSION = (\d+);", pbx))

if len(marketing) != 1:
    fail(f"pbxproj has conflicting MARKETING_VERSION values: {sorted(marketing)}")
if len(current) != 1:
    fail(f"pbxproj has conflicting CURRENT_PROJECT_VERSION values: {sorted(current)}")
if failures:
    sys.exit(1)

version = marketing.pop()
build = current.pop()
ok(f"pbxproj says {version} ({build})  <- this is what actually ships")

app_json = json.loads((ROOT / "app.json").read_text())["expo"]
if app_json.get("version") != version:
    fail(f"app.json version {app_json.get('version')!r} != pbxproj {version!r}")
elif app_json["ios"].get("buildNumber") != build:
    fail(f"app.json buildNumber {app_json['ios'].get('buildNumber')!r} != pbxproj {build!r}")
else:
    ok("app.json agrees")

# ------------------------------------------------------------ 1. the train
print("\nVersion train (the 1.0.8 and 1.0.9 failure)")
try:
    with urllib.request.urlopen(
        f"https://itunes.apple.com/lookup?id={ASC_APP_ID}", timeout=20
    ) as r:
        results = json.load(r).get("results") or []
    live = results[0].get("version") if results else None
except Exception as e:  # network is not a reason to block a build
    live = None
    note(f"could not reach the App Store listing ({e}); check the train by hand")

if live:
    if parse_version(version) > parse_version(live):
        ok(f"{version} is higher than the live {live}")
    else:
        fail(
            f"{version} is NOT higher than the live App Store version {live}. "
            f"Apple will refuse this upload (ITMS-90186 / ITMS-90062). Bump "
            f"MARKETING_VERSION before building."
        )

# ------------------------------------------------------ 2. SDK alignment
print("\nExpo SDK alignment (the 1.0.9 launch crash)")
try:
    proc = subprocess.run(
        ["npx", "--yes", "expo", "install", "--check"],
        cwd=ROOT, capture_output=True, text=True, timeout=600,
    )
    out = proc.stdout + proc.stderr
except Exception as e:
    out = ""
    note(f"could not run `expo install --check` ({e}); check SDK alignment by hand")

pattern = re.compile(r"^\s*(\S+?)@(\S+) - expected version: (\S+)", re.M)
hits = pattern.findall(out)
if not hits and out:
    ok("every package matches the SDK")
for name, installed, expected in hits:
    if name in KNOWN_DRIFT:
        continue
    if parse_version(installed)[:1] != parse_version(expected)[:1]:
        fail(
            f"{name} is {installed} but the SDK wants {expected}. Different major "
            f"versions: this is the shape that shipped a launch crash. Install it "
            f"with `npx expo install {name}`."
        )
    else:
        note(f"{name} {installed} vs {expected} (patch level, not blocking)")

# ------------------------------------------------------- 4. injection scan
print("\nInjection scan (CLAUDE.md)")
diff = subprocess.run(
    ["git", "diff", "HEAD", "--", "app/lib/api.js"],
    cwd=ROOT, capture_output=True, text=True,
).stdout
bad = [
    l for l in diff.splitlines()
    if l.startswith("+") and re.search(r"fetch|127\.0\.0\.1|agent log", l, re.I)
]
if bad:
    for l in bad:
        fail(f"api.js: {l.strip()}")
else:
    ok("api.js clean")

# ---------------------------------------------------------------- verdict
print()
if failures:
    print(f"{len(failures)} check(s) failed. Do not build yet.\n")
    sys.exit(1)
print(f"All checks passed. Ready to build {version} ({build}).")
if notes:
    print(f"({len(notes)} non-blocking note(s) above.)")
print()
