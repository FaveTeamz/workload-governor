#![no_main]

use libfuzzer_sys::fuzz_target;
use stellar_xdr::curr::TransactionEnvelope;

// Fuzz target for XDR signature payload decoding.
//
// Feeds arbitrary bytes into the Stellar XDR decoders used by the backend and
// indexer when handling untrusted `TransactionEnvelope` payloads. Invalid input
// must return a clean `Err` and never panic, leak, or crash the process.
fuzz_target!(|data: &[u8]| {
    // Raw binary XDR decoding.
    let _ = TransactionEnvelope::from_xdr(data, Limits::none());

    // Base64-encoded XDR decoding (as received from webhooks / clients).
    if let Ok(encoded) = std::str::from_utf8(data) {
        let _ = TransactionEnvelope::from_xdr_base64(encoded, Limits::none());
    }
});
