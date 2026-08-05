// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ULAVerifier} from "../ULAVerifier.sol";

/**
 * Gate E — frozen fixture verify, plus the audit's PIX-12 / PIX-13 acceptance
 * tests: a proof replayed with a different messageHash must revert, a reused
 * leaf must revert, and every privileged setter must revert for a non-owner.
 */
contract ULAVerifierTest is Test {
    using stdJson for string;

    ULAVerifier internal verifier;
    string internal fixture;
    address internal stranger = address(0xBEEF);

    function setUp() public {
        verifier = new ULAVerifier(0);
        fixture = vm.readFile("fixtures/ula-evm-v1.json");
    }

    function _loadAttestation() internal view returns (ULAVerifier.Attestation memory att) {
        att.sequence = uint64(fixture.readUint(".sequence"));
        att.pixelIndex = uint64(fixture.readUint(".pixelIndex"));
        att.prevHash = fixture.readBytes32(".prevHash");
        att.beacon = fixture.readBytes32(".beacon");
        att.pixelHash = fixture.readBytes32(".pixelHash");
        att.messageHash = fixture.readBytes32(".messageHash");
        att.sequencerRoot = fixture.readBytes32(".sequencerRoot");

        att.proof.leafIndex = uint32(fixture.readUint(".signature.leafIndex"));
        att.proof.leafPublicKey = fixture.readBytes32(".signature.leafPublicKey");

        bytes32[] memory path = fixture.readBytes32Array(".signature.authPath");
        require(path.length == 5, "authPath len");
        for (uint256 i = 0; i < 5; i++) {
            att.proof.authPath[i] = path[i];
        }

        bytes32[] memory revealed = fixture.readBytes32Array(".signature.revealed");
        require(revealed.length == 256, "revealed len");
        bytes32[] memory complements = fixture.readBytes32Array(".signature.complements");
        require(complements.length == 256, "complements len");
        for (uint256 i = 0; i < 256; i++) {
            att.proof.revealed[i] = revealed[i];
            att.proof.complements[i] = complements[i];
        }
    }

    function test_isNotStub() public view {
        assertFalse(verifier.IS_STUB());
        assertEq(verifier.MSG_BITS(), 256);
    }

    /// The contract must not claim to verify Pixel's native ML-DSA proofs.
    function test_labelsRelayerTrust() public view {
        assertFalse(verifier.IS_NATIVE_MLDSA_VERIFY());
        assertEq(verifier.SCHEME(), "PIX-HASH-OTS-256-KECCAK");
    }

    /// On-chain reconstruction must agree with the off-chain signer byte for byte.
    function test_polsMessageMatchesFixture() public view {
        ULAVerifier.Attestation memory att = _loadAttestation();
        assertEq(verifier.polsMessageFor(att), fixture.readString(".polsMessage"));
    }

    function test_verifyOtsFrozenFixture() public view {
        ULAVerifier.Attestation memory att = _loadAttestation();
        bool ok = verifier.verifyOts(verifier.polsMessageFor(att), att.proof, att.sequencerRoot);
        assertTrue(ok, "verifyOts failed on frozen fixture");
    }

    function test_lightProofValidWhenTrusted() public {
        ULAVerifier.Attestation memory att = _loadAttestation();
        verifier.setTrusted(att.sequencerRoot, true);
        assertTrue(verifier.lightProofValid(att));
    }

    function test_acceptFrozenFixture() public {
        ULAVerifier.Attestation memory att = _loadAttestation();
        verifier.setTrusted(att.sequencerRoot, true);
        assertTrue(verifier.accept(att));
        assertTrue(verifier.acceptedAt(verifier.messageKey(att.sequencerRoot, att.messageHash)) != 0);
    }

    /// Honest end-to-end number: verify + storage + 16KB proof ABI encoding.
    function test_gas_acceptIsolated() public {
        ULAVerifier.Attestation memory att = _loadAttestation();
        verifier.setTrusted(att.sequencerRoot, true);
        uint256 g = gasleft();
        verifier.accept(att);
        console.log("accept() gas at MSG_BITS=256:", g - gasleft());
    }

    function test_rejectUntrusted() public {
        ULAVerifier.Attestation memory att = _loadAttestation();
        vm.expectRevert(bytes("untrusted sequencer"));
        verifier.accept(att);
    }

    function test_rejectReplay() public {
        ULAVerifier.Attestation memory att = _loadAttestation();
        verifier.setTrusted(att.sequencerRoot, true);
        assertTrue(verifier.accept(att));
        vm.expectRevert(bytes("replay"));
        verifier.accept(att);
    }

    /// PIX-12: messageHash is inside the signed payload, so swapping it fails OTS.
    function test_rejectSwappedMessageHash() public {
        ULAVerifier.Attestation memory att = _loadAttestation();
        verifier.setTrusted(att.sequencerRoot, true);
        att.messageHash = keccak256("attacker-chosen-message");
        vm.expectRevert(bytes("bad ots"));
        verifier.accept(att);
    }

    /// PIX-12: a leaf may authorize at most one message.
    function test_rejectLeafReuse() public {
        ULAVerifier.Attestation memory att = _loadAttestation();
        verifier.setTrusted(att.sequencerRoot, true);
        assertTrue(verifier.accept(att));

        // Different message under the same revealed leaf.
        ULAVerifier.Attestation memory second = att;
        second.messageHash = keccak256("second-message");
        vm.expectRevert(bytes("leaf reused"));
        verifier.accept(second);
    }

    function test_rejectTamperedField() public {
        ULAVerifier.Attestation memory att = _loadAttestation();
        verifier.setTrusted(att.sequencerRoot, true);
        att.sequence = att.sequence + 1;
        vm.expectRevert(bytes("bad ots"));
        verifier.accept(att);
    }

    // ── PIX-13 access control ────────────────────────────────────────────────
    function test_setTrustedOnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(ULAVerifier.NotOwner.selector);
        verifier.setTrusted(bytes32("root"), true);
    }

    function test_transferOwnershipOnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(ULAVerifier.NotOwner.selector);
        verifier.transferOwnership(stranger);
    }

    function test_twoStepOwnershipHandover() public {
        verifier.transferOwnership(stranger);
        assertEq(verifier.owner(), address(this));
        vm.prank(stranger);
        verifier.acceptOwnership();
        assertEq(verifier.owner(), stranger);
    }

    function test_allowlistTimelockDelaysTrust() public {
        ULAVerifier delayed = new ULAVerifier(1 days);
        delayed.setTrusted(bytes32("root"), true);
        assertFalse(delayed.isTrusted(bytes32("root")));
        vm.warp(block.timestamp + 1 days);
        assertTrue(delayed.isTrusted(bytes32("root")));
    }

    function test_revocationIsImmediate() public {
        ULAVerifier delayed = new ULAVerifier(1 days);
        delayed.setTrusted(bytes32("root"), true);
        vm.warp(block.timestamp + 1 days);
        assertTrue(delayed.isTrusted(bytes32("root")));
        delayed.setTrusted(bytes32("root"), false);
        assertFalse(delayed.isTrusted(bytes32("root")));
    }
}
