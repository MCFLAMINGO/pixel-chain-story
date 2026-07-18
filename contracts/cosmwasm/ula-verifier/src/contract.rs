//! CosmWasm entry surface — thin twin of `ULAVerifier.sol` accept / lightProofValid.
//! Enable with `--features cosmwasm` (pinned cosmwasm-std 1.5 for Rust 1.75+).

use cosmwasm_std::{
    entry_point, to_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdError, StdResult,
};
use serde::{Deserialize, Serialize};

use crate::ots::{verify_ots, OtsProof, AUTH_DEPTH, MSG_BITS};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct InstantiateMsg {}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    SetTrusted { sequencer_root: String, ok: bool },
    Accept(AttestationMsg),
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AttestationMsg {
    pub sequence: u64,
    pub pixel_index: u64,
    pub prev_hash: String,
    pub beacon: String,
    pub pixel_hash: String,
    pub message_hash: String,
    pub sequencer_root: String,
    pub pols_message: String,
    pub proof: OtsProofMsg,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct OtsProofMsg {
    pub leaf_index: u32,
    pub leaf_public_key: String,
    pub auth_path: Vec<String>,
    pub revealed: Vec<String>,
    pub complements: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    LightProofValid { attestation: AttestationMsg },
    IsStub {},
}

fn parse32(hex: &str) -> Option<[u8; 32]> {
    let clean = hex.trim_start_matches("0x");
    let bytes = hex::decode(clean).ok()?;
    if bytes.len() != 32 {
        return None;
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Some(out)
}

fn parse16(hex: &str) -> Option<[u8; 16]> {
    let clean = hex.trim_start_matches("0x");
    let bytes = hex::decode(clean).ok()?;
    if bytes.len() != 16 {
        return None;
    }
    let mut out = [0u8; 16];
    out.copy_from_slice(&bytes);
    Some(out)
}

fn to_proof(msg: &OtsProofMsg) -> Option<OtsProof> {
    if msg.auth_path.len() != AUTH_DEPTH
        || msg.revealed.len() != MSG_BITS
        || msg.complements.len() != MSG_BITS
    {
        return None;
    }
    let mut auth_path = [[0u8; 32]; AUTH_DEPTH];
    for (i, h) in msg.auth_path.iter().enumerate() {
        auth_path[i] = parse32(h)?;
    }
    let mut revealed = [[0u8; 32]; MSG_BITS];
    for (i, h) in msg.revealed.iter().enumerate() {
        revealed[i] = parse32(h)?;
    }
    let mut complements = [[0u8; 16]; MSG_BITS];
    for (i, h) in msg.complements.iter().enumerate() {
        complements[i] = parse16(h)?;
    }
    Some(OtsProof {
        leaf_index: msg.leaf_index,
        leaf_public_key: parse32(&msg.leaf_public_key)?,
        auth_path,
        revealed,
        complements,
    })
}

#[entry_point]
pub fn instantiate(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _msg: InstantiateMsg,
) -> StdResult<Response> {
    Ok(Response::new().add_attribute("method", "instantiate"))
}

#[entry_point]
pub fn execute(deps: DepsMut, _env: Env, _info: MessageInfo, msg: ExecuteMsg) -> StdResult<Response> {
    match msg {
        ExecuteMsg::SetTrusted { sequencer_root, ok } => {
            let key = format!("trusted:{}", sequencer_root.trim_start_matches("0x"));
            deps.storage.set(key.as_bytes(), &[u8::from(ok)]);
            Ok(Response::new().add_attribute("trusted", ok.to_string()))
        }
        ExecuteMsg::Accept(att) => {
            let root_hex = att.sequencer_root.trim_start_matches("0x");
            let trusted = deps
                .storage
                .get(format!("trusted:{root_hex}").as_bytes())
                .map(|v| v.first() == Some(&1))
                .unwrap_or(false);
            if !trusted {
                return Err(StdError::generic_err("untrusted sequencer"));
            }
            let used_key = format!("used:{}", att.message_hash.trim_start_matches("0x"));
            if deps.storage.get(used_key.as_bytes()).is_some() {
                return Err(StdError::generic_err("replay"));
            }
            let proof =
                to_proof(&att.proof).ok_or_else(|| StdError::generic_err("bad proof encoding"))?;
            let root = parse32(&att.sequencer_root).ok_or_else(|| StdError::generic_err("bad root"))?;
            if !verify_ots(&att.pols_message, &proof, &root) {
                return Err(StdError::generic_err("bad ots"));
            }
            deps.storage.set(used_key.as_bytes(), &[1]);
            Ok(Response::new()
                .add_attribute("accepted", att.message_hash)
                .add_attribute("pixel_index", att.pixel_index.to_string()))
        }
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::IsStub {} => to_binary(&false),
        QueryMsg::LightProofValid { attestation } => {
            let root_hex = attestation.sequencer_root.trim_start_matches("0x");
            let trusted = deps
                .storage
                .get(format!("trusted:{root_hex}").as_bytes())
                .map(|v| v.first() == Some(&1))
                .unwrap_or(false);
            if !trusted {
                return to_binary(&false);
            }
            let Some(proof) = to_proof(&attestation.proof) else {
                return to_binary(&false);
            };
            let Some(root) = parse32(&attestation.sequencer_root) else {
                return to_binary(&false);
            };
            to_binary(&verify_ots(&attestation.pols_message, &proof, &root))
        }
    }
}
