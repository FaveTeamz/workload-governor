#!/usr/bin/env python3
"""
generate-corpus.py — Regenerate fuzz corpus seed inputs for WorkloadGovernor.

Usage:
    python3 scripts/generate-corpus.py [--corpus-dir fuzz/corpus]

This script writes deterministic binary seed files to each fuzz target's
corpus directory. Run it after a fresh clone or whenever you want to reset
the corpus to the canonical set of hand-crafted seeds.

Existing files with the same name are overwritten; unrecognised files are
left untouched.

Seed format (matches fuzz target input parsers in fuzz/fuzz_targets/):

  fuzz_apply / fuzz_assign:
    bytes [0..4)  — issue_id as little-endian u32
    bytes [4..)   — org_id characters (each byte mapped to lowercase ascii
                    by the target via `(b % 26) + b'a'`, so raw bytes are fine)
    byte  [5]     — (fuzz_assign only) bit 0 controls whether apply_for_issue
                    is called before assign_issue

  fuzz_batch_apply:
    pairs of bytes interpreted as little-endian u16 issue IDs;
    issue_id == 0 is filtered out by the target.
"""

import argparse
import os
import struct
import sys

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def pack_apply(issue_id: int, org: bytes) -> bytes:
    """Pack an (issue_id, org) seed for fuzz_apply / fuzz_assign targets."""
    return struct.pack("<I", issue_id & 0xFFFFFFFF) + org


def pack_apply_with_flag(issue_id: int, org: bytes, apply_flag: int) -> bytes:
    """Pack a seed for fuzz_assign ensuring byte[5] carries the apply flag bit."""
    data = bytearray(pack_apply(issue_id, org))
    if len(data) > 5:
        data[5] = (data[5] & 0xFE) | (apply_flag & 1)
    else:
        data += bytearray([apply_flag & 1])
    return bytes(data)


def pack_batch(issue_ids: list[int]) -> bytes:
    """Pack a list of u16 issue IDs for fuzz_batch_apply."""
    return b"".join(struct.pack("<H", x & 0xFFFF) for x in issue_ids)


def write_seed(path: str, data: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    print(f"  wrote {path} ({len(data)} bytes)")


# ---------------------------------------------------------------------------
# Seed definitions
# ---------------------------------------------------------------------------

# Each entry: (filename, seed_bytes, description)
SEEDS_APPLY = [
    # Original seeds
    ("seed_1",  pack_apply(1, b"org"),   "issue_id=1, org='org' — minimum valid"),
    ("seed_42", pack_apply(42, b"acme"), "issue_id=42, org='acme'"),
    # New edge-case seeds
    ("seed_issue_id_zero",      pack_apply(0, b"org"),
     "issue_id=0 — zero boundary; target allows but contract may reject"),
    ("seed_issue_id_max",       pack_apply(0xFFFFFFFF, b"org"),
     "issue_id=u32::MAX — maximum boundary"),
    ("seed_issue_id_one",       pack_apply(1, b"org"),
     "issue_id=1 — minimum non-zero"),
    ("seed_single_char_org",    pack_apply(42, b"a"),
     "org of 1 character — minimum Symbol length"),
    ("seed_long_org",           pack_apply(100, b"abcdefghijklmnopqrstuvwxyzabcdef"),
     "org of 32 characters — maximum Soroban Symbol length"),
    ("seed_all_same_char_org",  pack_apply(256, b"zzzzzzzzzzzzzzzz"),
     "org of 16 identical chars — repetition stress"),
    ("seed_issue_id_cap_minus1", pack_apply(14, b"captest"),
     "issue_id=14 — just below the global application cap of 15"),
    ("seed_issue_id_large_mid", pack_apply(65536, b"midrange"),
     "issue_id=65536 — mid-range u32"),
    ("seed_two_char_org",       pack_apply(999, b"ab"),
     "org of 2 characters"),
    ("seed_issue_id_ff",        pack_apply(255, b"boundary"),
     "issue_id=255 — byte boundary"),
]

SEEDS_ASSIGN = [
    # Original seeds
    ("seed_with_apply",  pack_apply_with_flag(1,  b"org", 1),
     "issue_id=1, with prior apply_for_issue"),
    ("seed_no_apply",    pack_apply_with_flag(1,  b"org", 0),
     "issue_id=1, no prior apply → ApplicationNotFound path"),
    # New edge-case seeds
    ("seed_assign_max_issue_with_apply",
     pack_apply_with_flag(0xFFFFFFFF, b"orgXX", 1),
     "issue_id=u32::MAX with pre-apply — counter arithmetic extreme"),
    ("seed_assign_zero_issue_no_apply",
     pack_apply_with_flag(0, b"orgXX", 0),
     "issue_id=0 no pre-apply — zero boundary without application"),
    ("seed_assign_long_org_with_apply",
     pack_apply_with_flag(512, b"abcdefghijklmnopqrstuvwxyzabcdef", 1),
     "32-char org with pre-apply — max Symbol length"),
    ("seed_assign_long_org_no_apply",
     pack_apply_with_flag(512, b"abcdefghijklmnopqrstuvwxyzabcdee", 0),
     "32-char org no pre-apply — ApplicationNotFound at max Symbol length"),
    ("seed_assign_issue_255_with_apply",
     pack_apply_with_flag(255, b"bytebd", 1),
     "issue_id=255 byte boundary with pre-apply"),
    ("seed_assign_issue_65536_with_apply",
     pack_apply_with_flag(65536, b"midorg", 1),
     "issue_id=65536 mid-range u32 with pre-apply"),
    ("seed_assign_single_char_org_apply",
     pack_apply_with_flag(77, b"aXXXXX", 1),
     "single-char org with pre-apply — minimal Symbol"),
    ("seed_assign_then_complete",
     pack_apply_with_flag(1, b"complt", 1),
     "exercises apply → assign → complete_assignment path"),
    ("seed_assign_then_revoke",
     pack_apply_with_flag(2, b"revoke", 1),
     "exercises apply → assign → revoke_assignment path"),
    ("seed_assign_max_minus1_with_apply",
     pack_apply_with_flag(0xFFFFFFFE, b"zzorgX", 1),
     "issue_id=u32::MAX-1 with pre-apply"),
]

SEEDS_BATCH = [
    # Original seeds
    ("seed_3issues", pack_batch([1, 2, 3]),
     "3 distinct issues — basic batch path"),
    ("seed_cap",     pack_batch(list(range(1, 17))),
     "16 issues — hits global cap of 15, 16th rejected"),
    # New edge-case seeds
    ("seed_exactly_15_unique", pack_batch(list(range(1, 16))),
     "exactly 15 unique issues — fills cap exactly"),
    ("seed_16_unique",         pack_batch(list(range(1, 17))),
     "16 unique issues — cap enforced, count must never exceed 15"),
    ("seed_all_zero",          pack_batch([0] * 10),
     "all issue_id=0 — filtered by target; count stays 0"),
    ("seed_all_same",          pack_batch([42] * 15),
     "same issue_id repeated — duplicate detection across all 15 slots"),
    ("seed_max_u16",           pack_batch([0xFFFF] * 5),
     "issue_id=65535 (max u16) repeated — boundary for u16 parsing"),
    ("seed_alternating",       pack_batch([1, 65535, 2, 65534, 3, 65533, 4, 65532]),
     "alternating small/large issue IDs — interleaved boundary values"),
    ("seed_single_issue",      pack_batch([100]),
     "single application — minimal batch"),
    ("seed_one_valid_one_zero", pack_batch([50, 0]),
     "one valid issue, one zero — zero filtering path"),
    ("seed_cap_minus1",        pack_batch(list(range(1, 15))),
     "14 unique issues — one below the cap of 15"),
    ("seed_sequential_large",  pack_batch(list(range(1000, 1016))),
     "16 sequential IDs starting at 1000 — large-value batch"),
]


def pack_withdraw(issue_id: int, org: bytes, apply_flag: int = 0,
                  double_flag: int = 0) -> bytes:
    """Pack a seed for fuzz_withdraw.

    byte[5] carries control bits:
      bit 0 — apply_flag:    if 1, call apply_for_issue before withdraw
      bit 1 — double_flag:   if 1, attempt a second (double) withdraw
    """
    data = bytearray(pack_apply(issue_id, org))
    ctrl = (apply_flag & 1) | ((double_flag & 1) << 1)
    if len(data) > 5:
        data[5] = (data[5] & 0xFC) | ctrl
    else:
        data += bytearray([ctrl])
    return bytes(data)


def pack_revoke(issue_id: int, org: bytes, cycle_flag: int = 0,
                revoke_before_assign: int = 0) -> bytes:
    """Pack a seed for fuzz_revoke.

    byte[5] carries control bits:
      bit 0 — cycle_flag:            if 1, perform full apply→assign→revoke cycle
      bit 1 — revoke_before_assign:  if 1, apply only then attempt revoke
    """
    data = bytearray(pack_apply(issue_id, org))
    ctrl = (cycle_flag & 1) | ((revoke_before_assign & 1) << 1)
    if len(data) > 5:
        data[5] = (data[5] & 0xFC) | ctrl
    else:
        data += bytearray([ctrl])
    return bytes(data)


# ---------------------------------------------------------------------------
# fuzz_withdraw seed definitions
# ---------------------------------------------------------------------------
# byte[5] bit 0 = apply_flag, bit 1 = double_withdraw_flag

SEEDS_WITHDRAW = [
    ("seed_apply_then_withdraw",
     pack_withdraw(1, b"org", apply_flag=1),
     "issue_id=1, org='org' — apply then withdraw (counter must return to 0)"),
    ("seed_withdraw_no_apply",
     pack_withdraw(1, b"org", apply_flag=0),
     "issue_id=1, no prior apply — ApplicationNotFound path"),
    ("seed_double_withdraw",
     pack_withdraw(1, b"org", apply_flag=1, double_flag=1),
     "issue_id=1 — apply → withdraw → withdraw (second must fail gracefully)"),
    ("seed_max_u32_withdraw",
     pack_withdraw(0xFFFFFFFF, b"org", apply_flag=1),
     "issue_id=u32::MAX — counter arithmetic at maximum boundary"),
    ("seed_zero_issue_withdraw",
     pack_withdraw(0, b"org", apply_flag=1),
     "issue_id=0 — zero boundary"),
    ("seed_empty_org_withdraw",
     pack_withdraw(1, b"", apply_flag=1),
     "empty org bytes — target falls back to 'org' default"),
    ("seed_long_org_withdraw",
     pack_withdraw(42, b"abcdefghijklmnopqrstuvwxyzabcdef", apply_flag=1),
     "32-char org — maximum Soroban Symbol length"),
]

# ---------------------------------------------------------------------------
# fuzz_revoke seed definitions
# ---------------------------------------------------------------------------
# byte[5] bit 0 = cycle_flag, bit 1 = revoke_before_assign_flag

SEEDS_REVOKE = [
    ("seed_full_cycle_revoke",
     pack_revoke(1, b"org", cycle_flag=1, revoke_before_assign=0),
     "issue_id=1 — full apply→assign→revoke cycle (org count must return to 0)"),
    ("seed_revoke_before_assign",
     pack_revoke(1, b"org", cycle_flag=0, revoke_before_assign=1),
     "issue_id=1 — apply only, then revoke without assign (AssignmentNotFound)"),
    ("seed_revoke_no_state",
     pack_revoke(1, b"org", cycle_flag=0, revoke_before_assign=0),
     "issue_id=1 — bare revoke with no prior state — must not trap"),
    ("seed_revoke_max_u32",
     pack_revoke(0xFFFFFFFF, b"org", cycle_flag=1),
     "issue_id=u32::MAX — counter arithmetic at maximum boundary"),
    ("seed_revoke_zero_issue",
     pack_revoke(0, b"org", cycle_flag=1),
     "issue_id=0 — zero boundary full cycle"),
    ("seed_revoke_long_org",
     pack_revoke(99, b"abcdefghijklmnopqrstuvwxyzabcdef", cycle_flag=1),
     "32-char org — maximum Soroban Symbol length"),
    ("seed_revoke_before_assign_max_u32",
     pack_revoke(0xFFFFFFFF, b"org", cycle_flag=0, revoke_before_assign=1),
     "issue_id=u32::MAX — revoke-before-assign at boundary"),
]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--corpus-dir", default="fuzz/corpus",
                        help="Root corpus directory (default: fuzz/corpus)")
    args = parser.parse_args()

    root = args.corpus_dir

    targets = [
        ("fuzz_apply",       SEEDS_APPLY),
        ("fuzz_assign",      SEEDS_ASSIGN),
        ("fuzz_batch_apply", SEEDS_BATCH),
        ("fuzz_withdraw",    SEEDS_WITHDRAW),
        ("fuzz_revoke",      SEEDS_REVOKE),
    ]

    total = 0
    for target_name, seeds in targets:
        print(f"\n[{target_name}]")
        for filename, data, description in seeds:
            path = os.path.join(root, target_name, filename)
            write_seed(path, data)
            total += 1

    print(f"\n{total} seed files written to {root}/")
    print("Run fuzz targets with:")
    for target_name, _ in targets:
        print(f"  cargo +nightly fuzz run {target_name} {root}/{target_name}"
              " -- -max_total_time=600")


if __name__ == "__main__":
    main()
