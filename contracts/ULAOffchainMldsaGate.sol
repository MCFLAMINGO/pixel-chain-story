// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ULAOffchainMldsaGate — lab receipt commit after off-chain ML-DSA verify.
 *
 * NOT a Dilithium verifier. Full FIPS-204 verify on EVM is deferred (gas).
 * Relayer must verify PIX-ML-DSA-65 off-chain (ula-mldsa.ts), then post commit:
 *   commit = keccak256(pk ‖ gateMessageHash32(messageHash) ‖ sig)
 *
 * This contract records a trusted relayer's assertion. It proves nothing about
 * the Pixel ledger by itself — the allowlists are the entire security boundary,
 * which is why they are owner-gated and timelocked. See docs/ULA-MLDSA.md.
 *
 * PIX-13: setTrustedPkHash and setTrustedSubmitter were plain external with no
 * owner, so any address could self-authorize in one transaction and bypass
 * every allowlist check in the contract.
 */
contract ULAOffchainMldsaGate {
    string public constant SCHEME = "PIX-ML-DSA-65-OFFCHAIN-GATE";
    bool public constant IS_FULL_MLDSA_VERIFY = false;

    address public owner;
    address public pendingOwner;
    /// Delay before an allowlist addition takes effect. Deploy non-zero in production.
    uint64 public immutable allowlistDelay;

    /// 0 = untrusted, else timestamp from which trust applies.
    mapping(bytes32 => uint64) public trustedPkHashFrom;
    mapping(address => uint64) public trustedSubmitterFrom;
    mapping(bytes32 => uint64) public commitAcceptedAt;

    event OwnerTransferStarted(address indexed from, address indexed to);
    event OwnerTransferred(address indexed from, address indexed to);
    event TrustedPk(bytes32 indexed pkHash, bool ok, uint64 effectiveFrom);
    event TrustedSubmitter(address indexed who, bool ok, uint64 effectiveFrom);
    event CommitAccepted(bytes32 indexed commit, bytes32 indexed pkHash, bytes32 messageHash);

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

    function setTrustedPkHash(bytes32 pkHash, bool ok) external onlyOwner {
        uint64 from = ok ? uint64(block.timestamp) + allowlistDelay : 0;
        trustedPkHashFrom[pkHash] = from;
        emit TrustedPk(pkHash, ok, from);
    }

    function setTrustedSubmitter(address who, bool ok) external onlyOwner {
        uint64 from = ok ? uint64(block.timestamp) + allowlistDelay : 0;
        trustedSubmitterFrom[who] = from;
        emit TrustedSubmitter(who, ok, from);
    }

    function trustedPkHash(bytes32 pkHash) public view returns (bool) {
        uint64 from = trustedPkHashFrom[pkHash];
        return from != 0 && block.timestamp >= from;
    }

    function trustedSubmitter(address who) public view returns (bool) {
        uint64 from = trustedSubmitterFrom[who];
        return from != 0 && block.timestamp >= from;
    }

    function usedCommit(bytes32 commit) external view returns (bool) {
        return commitAcceptedAt[commit] != 0;
    }

    /**
     * Accept a pre-verified ML-DSA ULA commit.
     * @param pkHash keccak256(mldsaPublicKey)
     * @param messageHash bytes32 bridge digest — must be gateMessageHash32(fullDigest)
     * @param commit keccak256(pk ‖ messageHash ‖ sig) computed off-chain
     */
    function acceptCommit(
        bytes32 pkHash,
        bytes32 messageHash,
        bytes32 commit
    ) external returns (bool) {
        require(trustedSubmitter(msg.sender), "untrusted submitter");
        require(trustedPkHash(pkHash), "untrusted pk");
        require(messageHash != bytes32(0), "empty message");
        require(commit != bytes32(0), "empty commit");
        require(commitAcceptedAt[commit] == 0, "replay");

        commitAcceptedAt[commit] = uint64(block.timestamp);
        emit CommitAccepted(commit, pkHash, messageHash);
        return true;
    }

    /// Consumers enforce their own withdrawal delay on top of acceptance.
    function isMatured(bytes32 commit, uint64 delay) external view returns (bool) {
        uint64 at = commitAcceptedAt[commit];
        return at != 0 && block.timestamp >= at + delay;
    }

    /// @dev Documents that on-chain Dilithium is not implemented here.
    function verifyMldsaOnchain(
        bytes calldata,
        bytes calldata,
        bytes calldata
    ) external pure returns (bool) {
        revert("ML_DSA_ONCHAIN_PENDING");
    }
}
