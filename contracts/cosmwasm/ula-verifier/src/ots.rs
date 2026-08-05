//! Keccak Lamport + Merkle — byte-identical to `ULAVerifier.sol` / `ula-evm.ts`.
//!
//! PIX-12: 256 signed bits with full 32-byte commitment halves. The previous
//! 32-bit width was forgeable with a ~2^32 keccak grind, and the hex-encoded
//! `"|"`-joined leaf build was what made widening look expensive on the EVM.

use sha3::{Digest, Keccak256};

pub const MSG_BITS: usize = 256;
pub const AUTH_DEPTH: usize = 5;
pub const LEAF_COUNT: u32 = 32;

#[derive(Clone, Debug)]
pub struct OtsProof {
    pub leaf_index: u32,
    pub leaf_public_key: [u8; 32],
    pub auth_path: [[u8; 32]; AUTH_DEPTH],
    pub revealed: [[u8; 32]; MSG_BITS],
    pub complements: [[u8; 32]; MSG_BITS],
}

fn keccak(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak256::new();
    hasher.update(data);
    hasher.finalize().into()
}

fn merkle_node(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut buf = [0u8; 65];
    buf[0] = 0x01;
    buf[1..33].copy_from_slice(left);
    buf[33..65].copy_from_slice(right);
    keccak(&buf)
}

/// Verify OTS signature over UTF-8 `message` against `merkle_root`.
pub fn verify_ots(message: &str, proof: &OtsProof, merkle_root: &[u8; 32]) -> bool {
    if proof.leaf_index >= LEAF_COUNT {
        return false;
    }

    let digest = keccak(message.as_bytes());

    // leaf = keccak(0x04 ‖ for each bit: lo(32) ‖ hi(32))
    let mut leaf_input = Vec::with_capacity(1 + MSG_BITS * 64);
    leaf_input.push(0x04);

    for i in 0..MSG_BITS {
        let b = digest[i / 8];
        let bit = (b >> (7 - (i % 8))) & 1;
        let revealed_hash = keccak(&proof.revealed[i]);
        let complement = &proof.complements[i];

        if bit == 0 {
            leaf_input.extend_from_slice(&revealed_hash);
            leaf_input.extend_from_slice(complement);
        } else {
            leaf_input.extend_from_slice(complement);
            leaf_input.extend_from_slice(&revealed_hash);
        }
    }

    let leaf = keccak(&leaf_input);
    if leaf != proof.leaf_public_key {
        return false;
    }

    let mut hash = proof.leaf_public_key;
    let mut idx = proof.leaf_index as usize;
    for d in 0..AUTH_DEPTH {
        let sibling = &proof.auth_path[d];
        hash = if idx % 2 == 0 {
            merkle_node(&hash, sibling)
        } else {
            merkle_node(sibling, &hash)
        };
        idx /= 2;
    }
    &hash == merkle_root
}
