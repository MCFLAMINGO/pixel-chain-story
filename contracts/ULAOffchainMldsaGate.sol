// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ULAOffchainMldsaGate — lab receipt commit after off-chain ML-DSA verify.
 *
 * NOT a Dilithium verifier. Full FIPS-204 verify on EVM is deferred (gas).
 * Relayer must verify PIX-ML-DSA-65 off-chain (ula-mldsa.ts), then post commit:
 *   commit = keccak256(pk ‖ messageHash ‖ sig)
 *
 * Trusted submitters only. See docs/ULA-MLDSA.md.
 */
contract ULAOffchainMldsaGate {
    string public constant SCHEME = "PIX-ML-DSA-65-OFFCHAIN-GATE";
    bool public constant IS_FULL_MLDSA_VERIFY = false;

    mapping(bytes32 => bool) public trustedPkHash;
    mapping(address => bool) public trustedSubmitter;
    mapping(bytes32 => bool) public usedCommit;

    event TrustedPk(bytes32 indexed pkHash, bool ok);
    event TrustedSubmitter(address indexed who, bool ok);
    event CommitAccepted(bytes32 indexed commit, bytes32 indexed pkHash, bytes32 messageHash);

    function setTrustedPkHash(bytes32 pkHash, bool ok) external {
        trustedPkHash[pkHash] = ok;
        emit TrustedPk(pkHash, ok);
    }

    function setTrustedSubmitter(address who, bool ok) external {
        trustedSubmitter[who] = ok;
        emit TrustedSubmitter(who, ok);
    }

    /**
     * Accept a pre-verified ML-DSA ULA commit.
     * @param pkHash keccak256(mldsaPublicKey)
     * @param messageHash bridge message hash (32 bytes)
     * @param commit keccak256(pk ‖ messageHash ‖ sig) computed off-chain
     */
    function acceptCommit(bytes32 pkHash, bytes32 messageHash, bytes32 commit) external returns (bool) {
        require(trustedSubmitter[msg.sender], "untrusted submitter");
        require(trustedPkHash[pkHash], "untrusted pk");
        require(messageHash != bytes32(0), "empty message");
        require(commit != bytes32(0), "empty commit");
        require(!usedCommit[commit], "replay");

        usedCommit[commit] = true;
        emit CommitAccepted(commit, pkHash, messageHash);
        return true;
    }

    /// @dev Documents that on-chain Dilithium is not implemented here.
    function verifyMldsaOnchain(bytes calldata, bytes calldata, bytes calldata) external pure returns (bool) {
        revert("ML_DSA_ONCHAIN_PENDING");
    }
}
