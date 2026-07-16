// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ULAVerifier — interface sketch for Universal Light Attestations.
 *
 * Pixel Ledger does not run the EVM. Ethereum (or any chain) only verifies
 * a light proof package. This contract is intentionally minimal:
 * production must replace `lightProofValid` with a real hash-OTS / ML-DSA
 * verifier and bind pixelHash correctly.
 *
 * Coders: treat this as the interoperability surface, not finished crypto.
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

    event Trusted(address indexed sequencer, bool ok);
    event Accepted(bytes32 indexed messageHash, uint64 pixelIndex);

    function setTrusted(address sequencer, bool ok) external {
        // In production: governance / Pixel light-root update
        trustedSequencer[sequencer] = ok;
        emit Trusted(sequencer, ok);
    }

    function accept(Attestation calldata att) external returns (bool) {
        require(trustedSequencer[att.proof.sequencer], "untrusted sequencer");
        require(!usedMessage[att.messageHash], "replay");
        require(att.proof.prevHash == att.prevHash, "prevHash");
        require(lightProofValid(att), "bad light proof");

        usedMessage[att.messageHash] = true;
        emit Accepted(att.messageHash, att.pixelIndex);
        return true;
    }

    /// @dev STUB — replace with real verification. Returns true only in tests
    /// when signature length > 0 (proves wiring, not security).
    function lightProofValid(Attestation calldata att) public pure returns (bool) {
        return att.proof.signature.length > 0 && att.pixelHash != bytes32(0);
    }
}
