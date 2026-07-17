// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ULAVerifier — STUB interface for Universal Light Attestations.
 *
 * Pixel Ledger does not run the EVM. Ethereum (or any chain) only verifies
 * a light proof package. This contract intentionally does NOT verify
 * hash-OTS / ML-DSA signatures yet.
 *
 * Coders: treat this as the interoperability surface sketch.
 * Security: `lightProofValid` is a wiring stub — any non-empty signature
 * passes. Do not deploy for real value until replaced.
 */
contract ULAVerifier {
    struct LightProof {
        uint64 sequence;
        address sequencer; // for EVM demos; Pixel uses pix1… strings off-chain
        bytes32 beacon;
        bytes32 prevHash;
        bytes signature; // opaque until scheme wired
    }

    struct Attestation {
        uint64 pixelIndex;
        bytes32 pixelHash;
        bytes32 prevHash;
        bytes32 merkleRoot;
        bytes32 messageHash;
        LightProof proof;
    }

    mapping(address => bool) public trustedSequencer;
    mapping(bytes32 => bool) public usedMessage;

    /// @notice Always true in this stub build — documents that verification is unfinished.
    bool public constant IS_STUB = true;

    event Trusted(address indexed sequencer, bool ok);
    event Accepted(bytes32 indexed messageHash, uint64 pixelIndex);
    event StubAccept(bytes32 indexed messageHash, uint64 pixelIndex);

    function setTrusted(address sequencer, bool ok) external {
        // In production: governance / Pixel light-root update
        trustedSequencer[sequencer] = ok;
        emit Trusted(sequencer, ok);
    }

    function accept(Attestation calldata att) external returns (bool) {
        require(IS_STUB, "ULAVerifier: production verifier not wired");
        require(trustedSequencer[att.proof.sequencer], "untrusted sequencer");
        require(!usedMessage[att.messageHash], "replay");
        require(att.proof.prevHash == att.prevHash, "prevHash");
        require(stubLightProofWired(att), "bad light proof stub");

        usedMessage[att.messageHash] = true;
        emit StubAccept(att.messageHash, att.pixelIndex);
        emit Accepted(att.messageHash, att.pixelIndex);
        return true;
    }

    /// @dev STUB — proves calldata wiring only. Not cryptographic verification.
    function stubLightProofWired(Attestation calldata att) public pure returns (bool) {
        return att.proof.signature.length > 0 && att.pixelHash != bytes32(0);
    }

    /// @dev Former name kept as an explicit always-false trap so callers cannot
    /// pretend this is a real verifier.
    function lightProofValid(Attestation calldata) public pure returns (bool) {
        return false;
    }
}
