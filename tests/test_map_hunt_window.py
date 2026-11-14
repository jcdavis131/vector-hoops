"""Map Hunt / Twin Hunt puzzle window: integrity, and a warning when it runs low.

The window in assets/map-hunt/index.json is built by scripts/build_map_hunt.py and
nothing runs that on a schedule. Days that already shipped must never be rewritten
(a rebuild can differ by a byte of numpy rounding, and a shared ?day= link must
replay the same puzzle), so their entries and file hashes are pinned below from 7c3acec.
Pattern of tests/test_seasons.py: running low warns, it does not fail.
"""

import datetime as dt
import hashlib
import importlib.util
import json
import shutil
import subprocess
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MH = ROOT / "assets" / "map-hunt"
PUZZLES = MH / "puzzles"
ROWS = 12966  # vectors.json player rows; one uint8 per row
WARN_DAYS = 7
LAST_PINNED_DAY = "2026-11-03"

# index.json "days" entries as committed at 7c3acec (2026-10-13 .. 2026-11-03).
BASE_DAYS = {
    "2026-10-13": {"mh": 7622, "th": 12158, "tht": 9149},
    "2026-10-14": {"mh": 3805, "th": 1645, "tht": 1215},
    "2026-10-15": {"mh": 3111, "th": 2380, "tht": 10960},
    "2026-10-16": {"mh": 10555, "th": 7692, "tht": 12840},
    "2026-10-17": {"mh": 9658, "th": 12224, "tht": 9281},
    "2026-10-18": {"mh": 9752, "th": 4143, "tht": 11684},
    "2026-10-19": {"mh": 8452, "th": 2207, "tht": 433},
    "2026-10-20": {"mh": 9469, "th": 1109, "tht": 8712},
    "2026-10-21": {"mh": 3904, "th": 10207, "tht": 448},
    "2026-10-22": {"mh": 7622, "th": 1494, "tht": 1741},
    "2026-10-23": {"mh": 9850, "th": 10207, "tht": 448},
    "2026-10-24": {"mh": 9469, "th": 1215, "tht": 2509},
    "2026-10-25": {"mh": 4036, "th": 1711, "tht": 379},
    "2026-10-26": {"mh": 4424, "th": 12444, "tht": 9566},
    "2026-10-27": {"mh": 5204, "th": 11266, "tht": 9811},
    "2026-10-28": {"mh": 9469, "th": 12431, "tht": 9941},
    "2026-10-29": {"mh": 3904, "th": 2595, "tht": 6264},
    "2026-10-30": {"mh": 11728, "th": 4367, "tht": 5968},
    "2026-10-31": {"mh": 9658, "th": 6545, "tht": 4424},
    "2026-11-01": {"mh": 8310, "th": 4364, "tht": 65},
    "2026-11-02": {"mh": 12408, "th": 5322, "tht": 6275},
    "2026-11-03": {"mh": 214, "th": 9762, "tht": 10601},
}

# sha256 of the 44 puzzle files committed at 7c3acec.
BASE_SHA = {
    "2026-10-13-mh.u8": "346b18da2b1cb339e9b98cc6fdd7b184a2bf7460ecc12896fb292cf0fa3cd338",
    "2026-10-13-th.u8": "91d3acf2f26d7d22b98fe834799558774a9cc9098e2c474f95c1f57e7179740b",
    "2026-10-14-mh.u8": "e4acf64db43e827e87067712098d3afa93146ab6996c21ddc706a5ee84f5ce28",
    "2026-10-14-th.u8": "6365e186b96dcd658ca500f313462b248004b7f2117dff5936d6b055d2a9a4b7",
    "2026-10-15-mh.u8": "4f4d521bfe34c87d2b506cd50c7f3858f3745db2b5d5aee96ab150722b4d4f56",
    "2026-10-15-th.u8": "94a51031d8749c54f4f46614ee21315464f1c2b5d6e9f2c3a8989dba83e38e0b",
    "2026-10-16-mh.u8": "20e29c2d9de13c39fd807a954f17e30e7ce520e05166a424cf4bf900fc9eaff5",
    "2026-10-16-th.u8": "61a0584a795950f80defdf49501fd95d16e99a3bd91a65e0ffc4640c23ac5377",
    "2026-10-17-mh.u8": "330869f745d6bae4fe71a010899575f896afd2512a2d234211be30099316bbe1",
    "2026-10-17-th.u8": "b96f4b52884b5a8426fcefb2c222acc2b571cda8b52bd7a27b5a00ae4bc76802",
    "2026-10-18-mh.u8": "9124df07cd094b3b070375de7ea86f63bf7a9e48102d454555bd03f4c975666a",
    "2026-10-18-th.u8": "664c7982d723770cb9e71afa2697074f08024d001012b6fd8c4e50ff15392a6a",
    "2026-10-19-mh.u8": "df0d8f3ead10507bf46f66a43a5f710889c3dec4f5a207ce1c045b143cce1427",
    "2026-10-19-th.u8": "54a031dc42d8aa7421d697c96e8cdc9977452ee70bb63026c69d26dcfc6448d7",
    "2026-10-20-mh.u8": "6617a2e747a3968ad6283bf00f4309e2817f94fc9182896a9c06262d4dad9aa3",
    "2026-10-20-th.u8": "addd04a3539395fb43627c3056eff0b0abb93edae9bb83c6a0218b92ab76be01",
    "2026-10-21-mh.u8": "6856d436ecae5d85ce43d0299eaf64a11877f404ad37721563f268725f5bce30",
    "2026-10-21-th.u8": "7255330d652b28a79631e056f7cbca56ab07d52abbed4f0855367d2ba797e692",
    "2026-10-22-mh.u8": "346b18da2b1cb339e9b98cc6fdd7b184a2bf7460ecc12896fb292cf0fa3cd338",
    "2026-10-22-th.u8": "332b1b0713fbe44b83e40d605216708362dd734ef707aa307629cfec1ef856c2",
    "2026-10-23-mh.u8": "35623579b03f0421b771066d4472645f33736d63b1739f315800f0d8cd572eb7",
    "2026-10-23-th.u8": "7255330d652b28a79631e056f7cbca56ab07d52abbed4f0855367d2ba797e692",
    "2026-10-24-mh.u8": "6617a2e747a3968ad6283bf00f4309e2817f94fc9182896a9c06262d4dad9aa3",
    "2026-10-24-th.u8": "d1037e241b8dbdf269c6db31f76046ea4584c8032adf75fcb658ddf89ebc9972",
    "2026-10-25-mh.u8": "59fe27d9d6c4742bfea91759e996cd22bb654589d7c0a6ea65b2732971d41741",
    "2026-10-25-th.u8": "35affe0e3fa0bf39072e297520e838b0dd345fc9b49cc70a2d835bf58a1712c8",
    "2026-10-26-mh.u8": "ba78b697102537b6902711ae2cef41be613e440f83fe823eb6169722b01e7c4e",
    "2026-10-26-th.u8": "8eea44e289ef208244d066f266fe78320afd61e53da9e7c82445423503e40301",
    "2026-10-27-mh.u8": "49ed629e25a8222dc6b9f0b50dd64065141e87cdedfd8f0c1accd6aeb00391be",
    "2026-10-27-th.u8": "d1bba45b7cd18f439fa816d50ce49f1163cd1b74a10495c01249392bdc87d1a7",
    "2026-10-28-mh.u8": "6617a2e747a3968ad6283bf00f4309e2817f94fc9182896a9c06262d4dad9aa3",
    "2026-10-28-th.u8": "76f94f58ca7a133223144cdaba06da869e084e271ab2c6b8211fef3b112a398c",
    "2026-10-29-mh.u8": "6856d436ecae5d85ce43d0299eaf64a11877f404ad37721563f268725f5bce30",
    "2026-10-29-th.u8": "12fd4feee0a8f2fa72b7fe8a54fb1606be4eb4d2f6dc52c97597b2fbed32d7d0",
    "2026-10-30-mh.u8": "3915e15bed6cf1f4ffe1a23b024908e69c2f2f8ebfb7bc81d856a5ee41468eca",
    "2026-10-30-th.u8": "223b6c71031fc7e1f76a71cf4678d8fa441bd6479f8d0dccefa78986360c4428",
    "2026-10-31-mh.u8": "330869f745d6bae4fe71a010899575f896afd2512a2d234211be30099316bbe1",
    "2026-10-31-th.u8": "ba78b697102537b6902711ae2cef41be613e440f83fe823eb6169722b01e7c4e",
    "2026-11-01-mh.u8": "b6b611c2e79efafe67c3d8df94e8a60dbae1a6027c8ff960ef80fb07e35d9eb0",
    "2026-11-01-th.u8": "c11907b1a6c5ffd0b786b7a124c0b08313bf12964f10455c06bb45cb1eebc657",
    "2026-11-02-mh.u8": "cefe9523775880bdc4e7419980aea2e2df9407398835107692248fc38135b037",
    "2026-11-02-th.u8": "0df01279b1d82d2d71acd42dd9c3b87ba362678ef63522aaef74329d7e25a546",
    "2026-11-03-mh.u8": "c6975c4aa528eeb2460645958ef74f73f60987c3e63985d5267879bcdc57048e",
    "2026-11-03-th.u8": "26f425b2aa368dd83e3a0dbb2eede34c81eb58c2c1d2b44927b389738f58ffee",
}


def _index():
    return json.loads((MH / "index.json").read_text())


def _days():
    return sorted(_index()["days"])


def test_every_day_has_both_files_of_the_right_size():
    for day in _days():
        for mode in ("mh", "th"):
            f = PUZZLES / f"{day}-{mode}.u8"
            assert f.is_file(), f"missing {f.name}"
            assert f.stat().st_size == ROWS, f"{f.name} is {f.stat().st_size} bytes, want {ROWS}"


def test_days_are_contiguous():
    days = [dt.date.fromisoformat(d) for d in _days()]
    for a, b in zip(days, days[1:]):
        assert (b - a).days == 1, f"gap between {a} and {b}"


def test_mystery_is_its_own_nearest():
    for day, info in sorted(_index()["days"].items()):
        mh = (PUZZLES / f"{day}-mh.u8").read_bytes()
        assert mh[info["mh"]] == 0, f"{day}: the mystery's own distance byte is {mh[info['mh']]}"
        th = (PUZZLES / f"{day}-th.u8").read_bytes()
        assert th[info["tht"]] == 0, f"{day}: the twin target's own distance byte is {th[info['tht']]}"


def test_no_stray_puzzle_files():
    names = sorted(p.name for p in PUZZLES.glob("*.u8"))
    want = sorted(f"{d}-{m}.u8" for d in _days() for m in ("mh", "th"))
    assert names == want


def test_existing_days_are_byte_identical_to_the_base():
    days = _index()["days"]
    for day, entry in BASE_DAYS.items():
        assert days.get(day) == entry, f"index entry for {day} changed"
    for name, sha in BASE_SHA.items():
        got = hashlib.sha256((PUZZLES / name).read_bytes()).hexdigest()
        assert got == sha, f"{name} differs from 7c3acec"


def test_window_still_covers_the_base_days():
    assert _days()[0] == "2026-10-13"
    assert _days()[-1] >= LAST_PINNED_DAY


def test_warn_when_the_window_is_about_to_run_out():
    """A warning, not a failure: extending the window is a decision (each day adds 2 x 12,966 bytes)."""
    last = dt.date.fromisoformat(_days()[-1])
    left = (last - dt.date.today()).days
    if left < WARN_DAYS:
        warnings.warn(
            f"the Map Hunt window ends {last} ({left} days left); run scripts/build_map_hunt.py "
            "to add days, see its header for what is never rewritten",
            stacklevel=1,
        )


# sha256 of the 42 puzzle files added for 2026-11-04 .. 2026-11-24 (the builder's own output).
NEW_SHA = {
    "2026-11-04-mh.u8": "5dccb0d9b325abc681e286963f896faa54ef6d8fed222aaab8750ebaed9ff887",
    "2026-11-04-th.u8": "6f09d1ac2a6532d8f3c14338494e6153b49a603b4dd00830d6e1d79129a13da6",
    "2026-11-05-mh.u8": "9124df07cd094b3b070375de7ea86f63bf7a9e48102d454555bd03f4c975666a",
    "2026-11-05-th.u8": "dd97c80910bf81a2ebc89361185bb5275fe46c1b2f925ecd3d021529bf1d393e",
    "2026-11-06-mh.u8": "59a72e2d8c0bf9b3696edac322c3b8d66f61f8569a31f1e8ea1b2d9ce09e5090",
    "2026-11-06-th.u8": "71d04dbaa74ed5c6bfd1607662eb15a188d1bfaaca4b541b60e9f75ec252ef06",
    "2026-11-07-mh.u8": "f09f72d70180d530fe57f6092bd073788e7ea2cb3d698d361e2ab7e1f8828bd5",
    "2026-11-07-th.u8": "de76c98a8ca2dc54a44e75bbb92cb11ebe2a405f6b01cb44ac96ca9420c39736",
    "2026-11-08-mh.u8": "ede46a496de82df60500b3fdda231787fa1167633ae53122fdce41762c33fe81",
    "2026-11-08-th.u8": "7950172da0d06ab042b16ca8ef1b7ea702ded104da4894da182cc84eaed316ee",
    "2026-11-09-mh.u8": "f09f72d70180d530fe57f6092bd073788e7ea2cb3d698d361e2ab7e1f8828bd5",
    "2026-11-09-th.u8": "e93a9d6931e86750538789b32d1cb5edb70d61a9a07a4b55a0d31fd204c1074c",
    "2026-11-10-mh.u8": "2b2c6bc7617b5a79341eda383fd6156e014bd9e00661f4a1f7d6a1de749559d4",
    "2026-11-10-th.u8": "d869cc6c2e3010a3e100a8e6572bf16dbaefe3b924d1c520a03c5abdf6041270",
    "2026-11-11-mh.u8": "10e4697491a1f1a89d8efa5512c96845374c3605c74a0ac233d25cb57263dbb5",
    "2026-11-11-th.u8": "19a6fa448b32acd88a4efd8e1da79b193d0f178fdf8d85cd6b2cefb6ac3a4c13",
    "2026-11-12-mh.u8": "e2e7dd1d45a1b12484a7630d4bab8e2c62c4ec6755b401705c9e46b5c24400eb",
    "2026-11-12-th.u8": "a1546725aab37e4217b4ce628f1512163c72847d617a02fccacb400d4c80d0cb",
    "2026-11-13-mh.u8": "8e6072b1f46d09f0f8349735e5f848a17eb6d3a36bdedc6f9e4529bc35ef2aa9",
    "2026-11-13-th.u8": "b7128d65d73ce9c3ca2249ea7003245c1b05343aa890367ec0733e633a2a7e09",
    "2026-11-14-mh.u8": "1c42db14775e6819cee1d817e348ad3fb38dd333dfef398041dddcfb4245454c",
    "2026-11-14-th.u8": "36ac06483bbfca37f3d0fb08d5cb3453f66066dbace8a4cb7994003125edfefe",
    "2026-11-15-mh.u8": "bf549cf3374e505a179f0f2fd463a93b3b2b14e819bb208014cb073355380a4c",
    "2026-11-15-th.u8": "22c903ddba2b3cb682377858c0210555b1f03d6b2e7d5d2192fedaa918c0b394",
    "2026-11-16-mh.u8": "29ab42fb8bf123263b4c93b82bac7f50be87ce6072420c31b3af72bb9c7524ae",
    "2026-11-16-th.u8": "4ff54063fb0a16d56f6fe9f8d58b8918ede60d43e82a7052d6c7e74f31c64307",
    "2026-11-17-mh.u8": "0874c70240b80772ba777596b0892d84045dc1c28f23d90819588980559b18fe",
    "2026-11-17-th.u8": "7fa52fc03ee45a3c0de1a3ba77b3caf81ce5c27fee6988cd0a1a59a34998cea3",
    "2026-11-18-mh.u8": "b90ec535b28353c9fa5235187e733a88b870f51482b39261cca61be19bf686cb",
    "2026-11-18-th.u8": "3915e15bed6cf1f4ffe1a23b024908e69c2f2f8ebfb7bc81d856a5ee41468eca",
    "2026-11-19-mh.u8": "35623579b03f0421b771066d4472645f33736d63b1739f315800f0d8cd572eb7",
    "2026-11-19-th.u8": "0184dcebf8b0c45e2641fd127d8c66d4517118d062ef8a4cf4b7d9bcd52f87a2",
    "2026-11-20-mh.u8": "29ab42fb8bf123263b4c93b82bac7f50be87ce6072420c31b3af72bb9c7524ae",
    "2026-11-20-th.u8": "af77dd52d9c60de53055b8ffb38d37d9c9b654b19abe4f995b278747df064d15",
    "2026-11-21-mh.u8": "e9b02cafee2fbbacacf39cf45f29b46dcf2bf377f1cf23ecd4b9c0e9f48f4358",
    "2026-11-21-th.u8": "a8d5da7732a3298afe4506d01e4995c0780acddeb8f4981a000fde018de81767",
    "2026-11-22-mh.u8": "0105ac2002a9c05e441851ba173fb2bfc64ad58a798e3232a2889e61976fc168",
    "2026-11-22-th.u8": "0b054e640e71d542fd0ad7aa585d1e06ffaade6a8e8e2c68f50c28e0e3f054e9",
    "2026-11-23-mh.u8": "e9b02cafee2fbbacacf39cf45f29b46dcf2bf377f1cf23ecd4b9c0e9f48f4358",
    "2026-11-23-th.u8": "38f67874d2d82bc249e929be013a69b4ac13b0f00a65a81e6fca031d3122df0c",
    "2026-11-24-mh.u8": "346b18da2b1cb339e9b98cc6fdd7b184a2bf7460ecc12896fb292cf0fa3cd338",
    "2026-11-24-th.u8": "4ea26f5d52440bf2b0f25322c6a2f34c9551ef1f85127155084c9b3d36b81b45",
}


CANDIDATES_SHA = "f34bb08b6ce23b54338086ca250cca8d88262ea7eed5e96d490f7e2349314a59"  # same as 7c3acec


def test_candidates_file_is_byte_identical_to_the_base():
    got = hashlib.sha256((MH / "candidates.json").read_bytes()).hexdigest()
    assert got == CANDIDATES_SHA, "candidates.json differs from 7c3acec"


def test_new_days_are_pinned_and_follow_the_candidates():
    new = sorted(d for d in _days() if d > LAST_PINNED_DAY)
    assert sorted(NEW_SHA) == sorted(f"{d}-{m}.u8" for d in new for m in ("mh", "th")), (
        "a day was added or removed after 2026-11-03: add or drop its two lines in NEW_SHA (and update LAST_PINNED_DAY only if the base changed)"
    )
    for name, sha in NEW_SHA.items():
        assert hashlib.sha256((PUZZLES / name).read_bytes()).hexdigest() == sha, f"{name} changed"
    cands = {r[0]: r for r in json.loads((MH / "candidates.json").read_text())}
    for day, e in sorted(_index()["days"].items()):
        assert e["mh"] in cands, f"{day}: mystery {e['mh']} is not a candidate"
        assert e["th"] in cands, f"{day}: given player {e['th']} is not a candidate"
        assert cands[e["th"]][3] == e["tht"], f"{day}: twin index does not match the candidate row"


# ---- the builder's --check (the only thing that exits 1 when the page would be dark) ----


def _builder():
    spec = importlib.util.spec_from_file_location("build_map_hunt_under_test", ROOT / "scripts" / "build_map_hunt.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _tree(tmp_path, days):
    (tmp_path / "puzzles").mkdir()
    for d in days:
        for m in ("mh", "th"):
            (tmp_path / "puzzles" / f"{d}-{m}.u8").write_bytes(b"\0")
    (tmp_path / "index.json").write_text(json.dumps({"days": {d: {} for d in days}}))
    return tmp_path


def test_check_passes_on_the_committed_window_for_a_covered_day():
    # not date-dependent; at 7c3acec the window ended 2026-11-03 and this day was dark
    assert _builder().check(dt.date(2026, 11, 10)) == 0
    assert _builder().check(dt.date.fromisoformat(_days()[-1])) == 0


def test_check_exit_codes(tmp_path, monkeypatch, capsys):
    b = _builder()
    days = ["2026-11-01", "2026-11-02", "2026-11-04", "2026-11-05"]  # 11-03 is a gap
    monkeypatch.setattr(b, "OUT", _tree(tmp_path, days))
    d = dt.date.fromisoformat
    assert b.check(d("2026-11-02")) == 0
    (tmp_path / "index.json").write_text(json.dumps({"days": {}}))
    assert b.check(d("2026-11-01")) == 1, "index with no days"
    (tmp_path / "index.json").write_text(json.dumps({"days": {x: {} for x in days}}))
    assert b.check(d("2026-11-06")) == 1, "day after the last"
    assert b.check(d("2026-10-31")) == 1, "day before the first"
    assert b.check(d("2026-11-03")) == 1, "gap day inside the range"
    assert "not covered" in capsys.readouterr().out
    (tmp_path / "puzzles" / "2026-11-02-th.u8").unlink()
    assert b.check(d("2026-11-01")) == 1, "missing puzzle file"
    (tmp_path / "index.json").write_text("{not json")
    assert b.check(d("2026-11-01")) == 1, "unreadable index"
    (tmp_path / "index.json").unlink()
    assert b.check(d("2026-11-01")) == 1, "missing index"


def test_check_flag_wiring(tmp_path, monkeypatch):
    b = _builder()
    monkeypatch.setattr(b, "OUT", _tree(tmp_path, ["2026-11-01", "2026-11-02"]))
    assert b.main(["--check", "--today", "2026-11-02"]) == 0
    assert b.main(["--check", "--today", "2026-11-03"]) == 1
    assert b.main(["--check", "--today", "2026-10-31"]) == 1


# ---- the served page script: what the 'no puzzle' message offers ----

HARNESS = """
import vm from 'node:vm';
import fs from 'node:fs';
const [, , file, href, y, m, d] = process.argv;
const els = {};
const el = (s) => (els[s] ||= { hidden: s === '#mh-error', innerHTML: '', textContent: '', addEventListener() {}, setAttribute() {}, getAttribute() { return null; } });
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(+y, +m - 1, +d, 12); }
  static now() { return new RealDate(+y, +m - 1, +d, 12).getTime(); }
}
const ctx = {
  URL, console: { warn() {}, log() {} }, Date: FixedDate, Uint8Array, Promise, encodeURIComponent, setTimeout, clearTimeout,
  location: { href },
  document: { readyState: 'complete', querySelector: el, querySelectorAll: () => [], addEventListener() {} },
  fetch: async () => ({ ok: true, json: async () => ({ days: {} }) }),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx);
await new Promise((r) => setTimeout(r, 50));
const e = els['#mh-error'];
console.log(JSON.stringify({ hidden: e.hidden, html: e.innerHTML }));
"""


def _no_puzzle_message(tmp_path, query):
    h = tmp_path / "harness.mjs"
    h.write_text(HARNESS)
    href = "https://example.invalid/map-guess" + query
    proc = subprocess.run(
        ["node", str(h), str(ROOT / "assets" / "map-hunt.js"), href, "2026", "11", "25"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert proc.returncode == 0, proc.stderr[-1500:]
    out = json.loads(proc.stdout.strip().splitlines()[-1])
    assert out["hidden"] is False and "taking the night off" in out["html"]
    return out["html"]


def test_no_puzzle_for_today_does_not_link_back_to_itself(tmp_path):
    if shutil.which("node") is None:
        raise AssertionError("node is required")
    html = _no_puzzle_message(tmp_path, "")
    assert "There is no puzzle for 2026-11-25" in html
    assert 'href="/map-guess"' not in html
    assert 'href="/play"' in html


def test_no_puzzle_for_today_via_explicit_day_does_not_link_back(tmp_path):
    html = _no_puzzle_message(tmp_path, "?day=2026-11-25")
    assert 'href="/map-guess"' not in html


def test_no_puzzle_for_another_day_offers_todays(tmp_path):
    html = _no_puzzle_message(tmp_path, "?day=2020-01-01")
    assert "There is no puzzle for 2020-01-01" in html
    assert 'href="/map-guess"' in html
