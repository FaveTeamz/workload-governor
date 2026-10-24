//! Fuzz target: XDR signature payload decoding — issue #1063
//!
//! Feeds arbitrary byte buffers into the Stellar XDR decoder and verifies
//! that no unexpected panic or memory safety violation occurs when processing
//! malformed or randomly-generated XDR envelopes.
//!
//! This target directly exercises the same `stellar-xdr` decoding stack used
//! by the backend `verifyTransactionXdr` helper (src/xdrVerifier.ts), which
//! calls `xdr.TransactionEnvelope.fromXDR(signedXdr, 'base64')`.
//!
//! ## What is exercised
//!
//! * `TransactionEnvelope::from_xdr` — decodes raw bytes as binary XDR;
//!   must return `Err` for invalid input, never panic.
//! * `TransactionEnvelope::from_xdr_base64` — decodes a base64-encoded XDR
//!   string; the raw fuzz bytes are treated as a string directly (exercises
//!   the error path) and also as valid base64 after a round-trip (exercises
//!   the success path).
//! * Round-trip consistency: when decoding succeeds the envelope must
//!   re-encode to a non-empty byte sequence (structural integrity).
//! * Signature payload extraction: iterates every `DecoratedSignature` on a
//!   successfully decoded `TransactionV1Envelope` and asserts the hint and
//!   signature byte arrays satisfy length invariants.
//!
//! ## Invariants
//!
//! 1. `from_xdr` / `from_xdr_base64` must never panic regardless of input.
//! 2. When decoding succeeds the result must round-trip without panicking and
//!    produce a non-empty byte sequence.
//! 3. Every `DecoratedSignature` hint must be exactly 4 bytes.
//! 4. Every `DecoratedSignature` signature body must be non-empty.
//!
//! ## Input layout
//!
//! ```text
//! raw bytes ──► from_xdr(bytes)                  (binary XDR path)
//! raw bytes ──► from_xdr_base64(as UTF-8 str)    (base64 error path)
//! round-trip ─► to_xdr_base64 ──► from_xdr_base64 (base64 success path)
//! ```

#![no_main]

use libfuzzer_sys::fuzz_target;
use stellar_xdr::curr::{
    Limits, ReadXdr, TransactionEnvelope, TransactionV1Envelope, WriteXdr,
};

/// Assert `DecoratedSignature` invariants on a successfully decoded V1 envelope.
fn check_signatures(envelope: &TransactionEnvelope) {
    if let TransactionEnvelope::Tx(TransactionV1Envelope { signatures, .. }) = envelope {
        for sig in signatures.iter() {
            // Invariant 3: hint is a fixed-size [u8; 4] array; len is always 4.
            assert_eq!(
                sig.hint.0.len(),
                4,
                "signature hint must be exactly 4 bytes, got {}",
                sig.hint.0.len()
            );
            // Invariant 4: signature body must be non-empty.
            assert!(
                !sig.signature.0.is_empty(),
                "signature body must not be empty"
            );
        }
    }
}

fuzz_target!(|data: &[u8]| {
    // ── Path 1: raw binary XDR ───────────────────────────────────────────
    // Invariant 1: must not panic — Err is expected for random bytes.
    let result_raw = TransactionEnvelope::from_xdr(data, Limits::none());

    if let Ok(ref envelope) = result_raw {
        // Invariant 2: round-trip must not panic and must produce bytes.
        let re_encoded = envelope
            .to_xdr(Limits::none())
            .expect("re-encoding a successfully decoded envelope must not fail");
        assert!(!re_encoded.is_empty(), "re-encoded XDR must not be empty");

        // Invariants 3 & 4: inspect signatures on V1 envelopes.
        check_signatures(envelope);

        // ── Path 2: base64 round-trip ────────────────────────────────────
        // Encode the successfully decoded (and therefore valid) envelope back
        // to base64 XDR, then decode it again via from_xdr_base64.  This
        // exercises the base64 decode + XDR parse path used by the TypeScript
        // `verifyTransactionXdr` helper with a structurally valid input.
        let b64 = envelope
            .to_xdr_base64(Limits::none())
            .expect("to_xdr_base64 must not fail on a valid envelope");

        match TransactionEnvelope::from_xdr_base64(&b64, Limits::none()) {
            Ok(ref env2) => {
                // Invariant 2: second round-trip.
                let re2 = env2
                    .to_xdr(Limits::none())
                    .expect("second round-trip re-encode must not fail");
                assert!(
                    !re2.is_empty(),
                    "second round-trip re-encoded XDR must not be empty"
                );
                // Invariants 3 & 4 again.
                check_signatures(env2);
            }
            Err(e) => {
                // An envelope that was just produced by to_xdr_base64 must
                // parse back without error — a failure here is a serialisation
                // bug in stellar-xdr.
                panic!(
                    "from_xdr_base64 failed on a round-tripped envelope: {e:?}"
                );
            }
        }
    }

    // ── Path 3: raw bytes as base64 string ───────────────────────────────
    // Treat the raw fuzz bytes as a UTF-8 string and pass them directly to
    // `from_xdr_base64`.  For most random inputs this returns Err; the goal
    // is to exercise the error-handling code path without panicking.
    if let Ok(s) = std::str::from_utf8(data) {
        // Invariant 1: must not panic — Err is acceptable.
        let _ = TransactionEnvelope::from_xdr_base64(s, Limits::none());
    }
});
