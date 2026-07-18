// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ULAVerifier — REAL keccak-OTS verify for Universal Light Attestations (EVM twin).
 *
 * Pixel-native proofs use SHA-512 OTS / ML-DSA off-chain (`bridge.ts`).
 * This contract verifies PIX-HASH-OTS-128-KECCAK — same Lamport+Merkle shape,
 * keccak256 for EVM. IS_STUB is false.
 */
contract ULAVerifier {
    uint256 public constant MSG_BITS = 32;
    uint256 public constant AUTH_DEPTH = 5; // 32 leaves

    bool public constant IS_STUB = false;

    struct OtsProof {
        uint32 leafIndex;
        bytes32 leafPublicKey;
        bytes32[AUTH_DEPTH] authPath;
        bytes32[MSG_BITS] revealed;
        bytes16[MSG_BITS] complements;
    }

    struct Attestation {
        uint64 sequence;
        uint64 pixelIndex;
        bytes32 prevHash;
        bytes32 beacon;
        bytes32 pixelHash;
        bytes32 messageHash;
        bytes32 sequencerRoot;
        string polsMessage;
        OtsProof proof;
    }

    mapping(bytes32 => bool) public trustedRoot;
    mapping(bytes32 => bool) public usedMessage;

    event Trusted(bytes32 indexed root, bool ok);
    event Accepted(bytes32 indexed messageHash, uint64 pixelIndex);

    function setTrusted(bytes32 sequencerRoot, bool ok) external {
        trustedRoot[sequencerRoot] = ok;
        emit Trusted(sequencerRoot, ok);
    }

    function accept(Attestation calldata att) external returns (bool) {
        require(!IS_STUB, "stub"); // documents intent; constant false
        require(trustedRoot[att.sequencerRoot], "untrusted sequencer");
        require(!usedMessage[att.messageHash], "replay");
        require(att.pixelHash != bytes32(0), "pixel");
        require(bytes(att.polsMessage).length > 0, "empty msg");
        require(verifyOts(att.polsMessage, att.proof, att.sequencerRoot), "bad ots");

        usedMessage[att.messageHash] = true;
        emit Accepted(att.messageHash, att.pixelIndex);
        return true;
    }

    function lightProofValid(Attestation calldata att) external view returns (bool) {
        if (!trustedRoot[att.sequencerRoot]) return false;
        return verifyOts(att.polsMessage, att.proof, att.sequencerRoot);
    }

    function verifyOts(
        string memory message,
        OtsProof calldata proof,
        bytes32 merkleRoot
    ) public pure returns (bool) {
        if (proof.leafIndex >= 32) return false;

        bytes32 digest = keccak256(bytes(message));
        bytes memory partsJoined;
        for (uint256 i = 0; i < MSG_BITS; i++) {
            uint256 byteIndex = i / 8;
            uint8 b = uint8(digest[byteIndex]);
            uint8 bit = (b >> (7 - (i % 8))) & 1;
            bytes16 revealedHash = bytes16(keccak256(abi.encodePacked(proof.revealed[i])));
            bytes16 complement = proof.complements[i];

            bytes memory pair = bit == 0
                ? abi.encodePacked(_hex16(revealedHash), _hex16(complement))
                : abi.encodePacked(_hex16(complement), _hex16(revealedHash));

            partsJoined = i == 0 ? pair : bytes.concat(partsJoined, bytes("|"), pair);
        }

        bytes32 leaf = keccak256(abi.encodePacked(bytes1(0x04), partsJoined));
        if (leaf != proof.leafPublicKey) return false;

        bytes32 hash = proof.leafPublicKey;
        uint256 idx = proof.leafIndex;
        for (uint256 d = 0; d < AUTH_DEPTH; d++) {
            bytes32 sibling = proof.authPath[d];
            hash = idx % 2 == 0 ? _merkleNode(hash, sibling) : _merkleNode(sibling, hash);
            idx /= 2;
        }
        return hash == merkleRoot;
    }

    function _merkleNode(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes1(0x01), left, right));
    }

    function _hex16(bytes16 data) internal pure returns (bytes memory) {
        bytes16 HEX = "0123456789abcdef";
        bytes memory out = new bytes(32);
        for (uint256 i = 0; i < 16; i++) {
            uint8 b = uint8(data[i]);
            out[2 * i] = HEX[b >> 4];
            out[2 * i + 1] = HEX[b & 0x0f];
        }
        return out;
    }
}
