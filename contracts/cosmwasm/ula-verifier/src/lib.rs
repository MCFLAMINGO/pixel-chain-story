//! CosmWasm / second-chain twin of `ULAVerifier.sol`.
//!
//! Same algorithm: PIX-HASH-OTS-256-KECCAK (MSG_BITS=256, AUTH_DEPTH=5).
//! Pixel-native ULAs stay on SHA-512 / ML-DSA off-chain.

mod ots;
#[cfg(feature = "cosmwasm")]
mod contract;

pub use ots::{verify_ots, OtsProof, MSG_BITS, AUTH_DEPTH};

#[cfg(feature = "cosmwasm")]
pub use contract::{execute, instantiate, query, ExecuteMsg, InstantiateMsg, QueryMsg};
