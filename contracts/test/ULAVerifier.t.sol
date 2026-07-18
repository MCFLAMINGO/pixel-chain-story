// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ULAVerifier} from "../ULAVerifier.sol";

/**
 * Gate E — frozen fixture verify. ULAVerifier is NOT a stub.
 */
contract ULAVerifierTest is Test {
    using stdJson for string;

    ULAVerifier internal verifier;
    string internal fixture;

    function setUp() public {
        verifier = new ULAVerifier();
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
        att.polsMessage = fixture.readString(".polsMessage");

        att.proof.leafIndex = uint32(fixture.readUint(".signature.leafIndex"));
        att.proof.leafPublicKey = fixture.readBytes32(".signature.leafPublicKey");

        bytes32[] memory path = fixture.readBytes32Array(".signature.authPath");
        require(path.length == 5, "authPath len");
        for (uint256 i = 0; i < 5; i++) {
            att.proof.authPath[i] = path[i];
        }

        bytes32[] memory revealed = fixture.readBytes32Array(".signature.revealed");
        require(revealed.length == 32, "revealed len");
        for (uint256 i = 0; i < 32; i++) {
            att.proof.revealed[i] = revealed[i];
        }

        string[] memory complements = fixture.readStringArray(".signature.complements");
        require(complements.length == 32, "complements len");
        for (uint256 i = 0; i < 32; i++) {
            att.proof.complements[i] = bytes16(_hexToBytes32(complements[i]));
        }
    }

    /// @dev Parse 32 or 64 hex chars (no 0x) into bytes32 (left-aligned for short).
    function _hexToBytes32(string memory s) internal pure returns (bytes32 out) {
        bytes memory b = bytes(s);
        require(b.length == 32 || b.length == 64, "hex len");
        uint256 nibbleCount = b.length;
        uint256 value;
        for (uint256 i = 0; i < nibbleCount; i++) {
            uint8 c = uint8(b[i]);
            uint8 n;
            if (c >= 48 && c <= 57) n = c - 48;
            else if (c >= 97 && c <= 102) n = c - 87;
            else if (c >= 65 && c <= 70) n = c - 55;
            else revert("bad hex");
            value = (value << 4) | n;
        }
        if (nibbleCount == 32) {
            // 16 bytes → left-align into bytes32
            out = bytes32(value << 128);
        } else {
            out = bytes32(value);
        }
    }

    function test_isNotStub() public view {
        assertFalse(verifier.IS_STUB());
    }

    function test_verifyOtsFrozenFixture() public view {
        ULAVerifier.Attestation memory att = _loadAttestation();
        bool ok = verifier.verifyOts(att.polsMessage, att.proof, att.sequencerRoot);
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
        assertTrue(verifier.usedMessage(att.messageHash));
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

    function test_rejectTamperedMessage() public {
        ULAVerifier.Attestation memory att = _loadAttestation();
        verifier.setTrusted(att.sequencerRoot, true);
        att.polsMessage = string.concat(att.polsMessage, "|tamper");
        vm.expectRevert(bytes("bad ots"));
        verifier.accept(att);
    }
}
