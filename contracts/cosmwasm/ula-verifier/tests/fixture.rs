//! Proof CosmWasm twin verifies the same frozen fixture as Foundry / TS.

use serde::Deserialize;
use ula_verifier::{verify_ots, OtsProof, AUTH_DEPTH, MSG_BITS};

#[derive(Deserialize)]
struct Fixture {
    #[serde(rename = "sequencerRoot")]
    sequencer_root: String,
    #[serde(rename = "polsMessage")]
    pols_message: String,
    signature: Sig,
}

#[derive(Deserialize)]
struct Sig {
    #[serde(rename = "leafIndex")]
    leaf_index: u32,
    #[serde(rename = "leafPublicKey")]
    leaf_public_key: String,
    #[serde(rename = "authPath")]
    auth_path: Vec<String>,
    revealed: Vec<String>,
    complements: Vec<String>,
}

fn parse32(hex: &str) -> [u8; 32] {
    let clean = hex.trim_start_matches("0x");
    let bytes = hex::decode(clean).expect("hex");
    assert_eq!(bytes.len(), 32);
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    out
}

fn parse16(hex: &str) -> [u8; 16] {
    let clean = hex.trim_start_matches("0x");
    let bytes = hex::decode(clean).expect("hex");
    assert_eq!(bytes.len(), 16, "complement must be 16 bytes");
    let mut out = [0u8; 16];
    out.copy_from_slice(&bytes);
    out
}

#[test]
fn frozen_fixture_verifies() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../fixtures/ula-evm-v1.json");
    let raw = std::fs::read_to_string(path).expect("fixture");
    let f: Fixture = serde_json::from_str(&raw).expect("json");

    assert_eq!(f.signature.auth_path.len(), AUTH_DEPTH);
    assert_eq!(f.signature.revealed.len(), MSG_BITS);
    assert_eq!(f.signature.complements.len(), MSG_BITS);

    let mut auth_path = [[0u8; 32]; AUTH_DEPTH];
    for (i, h) in f.signature.auth_path.iter().enumerate() {
        auth_path[i] = parse32(h);
    }
    let mut revealed = [[0u8; 32]; MSG_BITS];
    for (i, h) in f.signature.revealed.iter().enumerate() {
        revealed[i] = parse32(h);
    }
    let mut complements = [[0u8; 16]; MSG_BITS];
    for (i, h) in f.signature.complements.iter().enumerate() {
        complements[i] = parse16(h);
    }

    let proof = OtsProof {
        leaf_index: f.signature.leaf_index,
        leaf_public_key: parse32(&f.signature.leaf_public_key),
        auth_path,
        revealed,
        complements,
    };
    let root = parse32(&f.sequencer_root);
    assert!(
        verify_ots(&f.pols_message, &proof, &root),
        "CosmWasm twin must verify frozen ula-evm-v1 fixture"
    );
}
