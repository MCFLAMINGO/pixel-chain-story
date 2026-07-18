//! Keccak Lamport + Merkle — byte-identical to `ULAVerifier.sol` / `ula-evm.ts`.

use sha3::{Digest, Keccak256};

pub const MSG_BITS: usize = 32;
pub const AUTH_DEPTH: usize = 5;

#[derive(Clone, Debug)]
pub struct OtsProof {
    pub leaf_index: u32,
    pub leaf_public_key: [u8; 32],
    pub auth_path: [[u8; 32]; AUTH_DEPTH],
    pub revealed: [[u8; 32]; MSG_BITS],
    pub complements: [[u8; 16]; MSG_BITS],
}

fn keccak(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak256::new();
    hasher.update(data);
    hasher.finalize().into()
}

fn hex16(data: &[u8; 16]) -> [u8; 32] {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = [0u8; 32];
    for i in 0..16 {
        out[2 * i] = HEX[(data[i] >> 4) as usize];
        out[2 * i + 1] = HEX[(data[i] & 0x0f) as usize];
    }
    out
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
    if proof.leaf_index >= 32 {
        return false;
    }

    let digest = keccak(message.as_bytes());
    let mut parts_joined: Vec<u8> = Vec::new();

    for i in 0..MSG_BITS {
        let byte_index = i / 8;
        let b = digest[byte_index];
        let bit = (b >> (7 - (i % 8))) & 1;
        let revealed_full = keccak(&proof.revealed[i]);
        let mut revealed_hash = [0u8; 16];
        revealed_hash.copy_from_slice(&revealed_full[..16]);
        let complement = &proof.complements[i];

        let pair = if bit == 0 {
            let mut p = [0u8; 64];
            p[..32].copy_from_slice(&hex16(&revealed_hash));
            p[32..].copy_from_slice(&hex16(complement));
            p
        } else {
            let mut p = [0u8; 64];
            p[..32].copy_from_slice(&hex16(complement));
            p[32..].copy_from_slice(&hex16(&revealed_hash));
            p
        };

        if i == 0 {
            parts_joined.extend_from_slice(&pair);
        } else {
            parts_joined.push(b'|');
            parts_joined.extend_from_slice(&pair);
        }
    }

    let mut leaf_input = Vec::with_capacity(1 + parts_joined.len());
    leaf_input.push(0x04);
    leaf_input.extend_from_slice(&parts_joined);
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
