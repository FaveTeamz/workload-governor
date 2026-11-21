use soroban_sdk::{panic_with_error, Env, Symbol, SymbolStr, TryFromVal};

use crate::errors::ContractError;

pub(crate) fn validate_org_id(env: &Env, org_id: &Symbol) {
    let symbol = match SymbolStr::try_from_val(env, org_id) {
        Ok(symbol) => symbol,
        Err(_) => panic_with_error!(env, ContractError::InvalidOrgId),
    };
    let bytes = symbol.as_ref();
    let len = bytes.len();

    if len < 1 || len > 32 {
        panic_with_error!(env, ContractError::InvalidOrgId);
    }

    if bytes.iter().any(|byte| {
        !matches!(byte, b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_' | b'-')
    }) {
        panic_with_error!(env, ContractError::InvalidOrgId);
    }
}
