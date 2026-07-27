use std::path::Path;

fn main() {
    // Enable the `wasm_available` cfg when the release WASM has been built.
    // This lets upgrade tests that use include_bytes! compile only when the
    // artifact exists (local dev + CI after `cargo build --target wasm32v1-none`).
    // cargo-mutants works in a scratch directory without the WASM, so the flag
    // will be absent and the upgrade tests are skipped — keeping the baseline green.
    let wasm_path = Path::new("target/wasm32v1-none/release/workload_governor.wasm");
    if wasm_path.exists() {
        println!("cargo:rustc-cfg=wasm_available");
    }
    println!("cargo:rerun-if-changed=target/wasm32v1-none/release/workload_governor.wasm");
}
