// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ULAVerifier — keccak-OTS verify for Universal Light Attestations (EVM twin).
 *
 * WHAT THIS IS: a verifier for PIX-HASH-OTS-256-KECCAK, the EVM twin of Pixel's
 * hash-OTS family (Lamport halves under a 32-leaf Merkle window, keccak256 in
 * place of SHA-512). Same shape as leanXMSS: a Merkle root over one-time keys
 * is the signer's persistent public key.
 *
 * WHAT THIS IS NOT: verification of Pixel's native PIX-ML-DSA-65 proofs. A
 * relayer re-projects the native attestation onto this twin and signs it with
 * an EVM-side key. Accepting here therefore trusts that relayer to project
 * honestly. That is a trust assumption, not cryptographic verification of the
 * Pixel ledger, and no signature width changes it. See docs/BRIDGE-STATUS.md.
 *
 * Audit fixes (docs/audit/EXTERNAL-AUDIT-GATE-I.json):
 *  - PIX-12: MSG_BITS 32 -> 256 (a 2^32 keccak grind forged the old width),
 *    full 32-byte commitment halves, the signed message is rebuilt on-chain so
 *    messageHash is authenticated rather than merely logged, and consumed
 *    leaves are tracked so a leaf cannot be reused.
 *  - PIX-13: privileged setters were plain external with no owner. Ownership is
 *    now required, allowlist additions are timelocked, revocation is immediate.
 */
contract ULAVerifier {
    uint256 public constant MSG_BITS = 256;
    uint256 public constant AUTH_DEPTH = 5; // 32 leaves
    uint256 public constant LEAF_COUNT = 32;

    string public constant SCHEME = "PIX-HASH-OTS-256-KECCAK";
    bool public constant IS_STUB = false;

    /// Honest label: acceptance trusts the projecting relayer.
    bool public constant IS_NATIVE_MLDSA_VERIFY = false;

    struct OtsProof {
        uint32 leafIndex;
        bytes32 leafPublicKey;
        bytes32[AUTH_DEPTH] authPath;
        bytes32[MSG_BITS] revealed;
        bytes32[MSG_BITS] complements;
    }

    struct Attestation {
        uint64 sequence;
        uint64 pixelIndex;
        bytes32 prevHash;
        bytes32 beacon;
        bytes32 pixelHash;
        bytes32 messageHash;
        bytes32 sequencerRoot;
        OtsProof proof;
    }

    address public owner;
    address public pendingOwner;
    /// Delay before an allowlist addition takes effect. Deploy non-zero in production.
    uint64 public immutable allowlistDelay;

    /// 0 = untrusted, else the timestamp from which the root is trusted.
    mapping(bytes32 => uint64) public trustedFrom;
    /// keccak256(sequencerRoot, messageHash) => acceptance time.
    mapping(bytes32 => uint64) public acceptedAt;
    /// keccak256(sequencerRoot, leafPublicKey) => consumed.
    mapping(bytes32 => bool) public usedLeaf;

    event OwnerTransferStarted(address indexed from, address indexed to);
    event OwnerTransferred(address indexed from, address indexed to);
    event Trusted(bytes32 indexed root, bool ok, uint64 effectiveFrom);
    event Accepted(bytes32 indexed messageHash, uint64 pixelIndex, bytes32 indexed sequencerRoot);

    error NotOwner();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint64 allowlistDelay_) {
        owner = msg.sender;
        allowlistDelay = allowlistDelay_;
        emit OwnerTransferred(address(0), msg.sender);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        pendingOwner = next;
        emit OwnerTransferStarted(msg.sender, next);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        address prev = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnerTransferred(prev, owner);
    }

    /// Add (timelocked) or revoke (immediate) a trusted sequencer root.
    function setTrusted(bytes32 sequencerRoot, bool ok) external onlyOwner {
        uint64 effectiveFrom = 0;
        if (ok) {
            effectiveFrom = uint64(block.timestamp) + allowlistDelay;
        }
        trustedFrom[sequencerRoot] = effectiveFrom;
        emit Trusted(sequencerRoot, ok, effectiveFrom);
    }

    function isTrusted(bytes32 sequencerRoot) public view returns (bool) {
        uint64 from = trustedFrom[sequencerRoot];
        return from != 0 && block.timestamp >= from;
    }

    /// @dev Retained for integrators that read the old boolean map.
    function trustedRoot(bytes32 sequencerRoot) external view returns (bool) {
        return isTrusted(sequencerRoot);
    }

    function messageKey(bytes32 sequencerRoot, bytes32 messageHash) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(sequencerRoot, messageHash));
    }

    function leafKey(bytes32 sequencerRoot, bytes32 leafPublicKey) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(sequencerRoot, leafPublicKey));
    }

    function usedMessage(bytes32 messageHash) external view returns (bool) {
        // Kept for integrators; prefer acceptedAt[messageKey(root, hash)].
        return acceptedAt[messageKey(bytes32(0), messageHash)] != 0;
    }

    /**
     * Canonical signed message, rebuilt from the attestation's own fields.
     *
     * Taking `polsMessage` as a free string let a genuine proof be replayed with
     * any messageHash, because the hash was stored but never signed (PIX-12).
     */
    function polsMessageFor(Attestation calldata att) public pure returns (string memory) {
        return
            string.concat(
                "ula-evm|",
                _dec(att.sequence),
                "|",
                _hex64(att.prevHash),
                "|",
                _hex64(att.beacon),
                "|",
                _hex64(att.sequencerRoot),
                "|",
                _hex64(att.messageHash)
            );
    }

    function accept(Attestation calldata att) external returns (bool) {
        require(!IS_STUB, "stub");
        require(isTrusted(att.sequencerRoot), "untrusted sequencer");
        require(att.pixelHash != bytes32(0), "pixel");
        require(att.messageHash != bytes32(0), "message");

        bytes32 mKey = messageKey(att.sequencerRoot, att.messageHash);
        require(acceptedAt[mKey] == 0, "replay");

        bytes32 lKey = leafKey(att.sequencerRoot, att.proof.leafPublicKey);
        require(!usedLeaf[lKey], "leaf reused");

        require(verifyOts(polsMessageFor(att), att.proof, att.sequencerRoot), "bad ots");

        acceptedAt[mKey] = uint64(block.timestamp);
        usedLeaf[lKey] = true;
        emit Accepted(att.messageHash, att.pixelIndex, att.sequencerRoot);
        return true;
    }

    /// Consumers enforce their own withdrawal delay on top of acceptance.
    function isMatured(
        bytes32 sequencerRoot,
        bytes32 messageHash,
        uint64 delay
    ) external view returns (bool) {
        uint64 at = acceptedAt[messageKey(sequencerRoot, messageHash)];
        return at != 0 && block.timestamp >= at + delay;
    }

    function lightProofValid(Attestation calldata att) external view returns (bool) {
        if (!isTrusted(att.sequencerRoot)) return false;
        return verifyOts(polsMessageFor(att), att.proof, att.sequencerRoot);
    }

    /**
     * Lamport-over-Merkle verify.
     *
     * The leaf commitment is a single preallocated binary buffer. The previous
     * hex-encoded, "|"-joined build was O(n^2) and cost 21M gas at 256 bits,
     * which is why the width had been cut to 32; binary is ~430k.
     */
    function verifyOts(
        string memory message,
        OtsProof calldata proof,
        bytes32 merkleRoot
    ) public pure returns (bool) {
        if (proof.leafIndex >= LEAF_COUNT) return false;

        bytes32 digest = keccak256(bytes(message));
        bytes memory buf = new bytes(1 + MSG_BITS * 64);
        buf[0] = 0x04;

        for (uint256 i = 0; i < MSG_BITS; i++) {
            uint8 b = uint8(digest[i / 8]);
            uint8 bit = (b >> (7 - (i % 8))) & 1;
            bytes32 revealedHash = keccak256(abi.encodePacked(proof.revealed[i]));
            bytes32 lo = bit == 0 ? revealedHash : proof.complements[i];
            bytes32 hi = bit == 0 ? proof.complements[i] : revealedHash;
            uint256 off = 1 + 64 * i;
            assembly {
                let p := add(add(buf, 0x20), off)
                mstore(p, lo)
                mstore(add(p, 0x20), hi)
            }
        }

        if (keccak256(buf) != proof.leafPublicKey) return false;

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

    function _hex64(bytes32 data) internal pure returns (string memory) {
        bytes16 HEX = "0123456789abcdef";
        bytes memory out = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(data[i]);
            out[2 * i] = HEX[b >> 4];
            out[2 * i + 1] = HEX[b & 0x0f];
        }
        return string(out);
    }

    function _dec(uint64 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint64 v = value;
        uint256 digits;
        while (v != 0) {
            digits++;
            v /= 10;
        }
        bytes memory out = new bytes(digits);
        v = value;
        while (v != 0) {
            digits--;
            out[digits] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(out);
    }
}
