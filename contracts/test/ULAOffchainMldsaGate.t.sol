// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ULAOffchainMldsaGate} from "../ULAOffchainMldsaGate.sol";

contract ULAOffchainMldsaGateTest is Test {
    ULAOffchainMldsaGate internal gate;

    bytes32 internal pkHash = keccak256("lab-mldsa-pk");
    bytes32 internal messageHash = keccak256("lab-message");
    bytes32 internal commit = keccak256("lab-commit");

    function setUp() public {
        gate = new ULAOffchainMldsaGate();
        gate.setTrustedPkHash(pkHash, true);
        gate.setTrustedSubmitter(address(this), true);
    }

    function test_notFullOnchainVerify() public view {
        assertEq(gate.IS_FULL_MLDSA_VERIFY(), false);
        assertEq(gate.SCHEME(), "PIX-ML-DSA-65-OFFCHAIN-GATE");
    }

    function test_verifyMldsaOnchainReverts() public {
        vm.expectRevert(bytes("ML_DSA_ONCHAIN_PENDING"));
        gate.verifyMldsaOnchain("", "", "");
    }

    function test_acceptCommit() public {
        assertTrue(gate.acceptCommit(pkHash, messageHash, commit));
        assertTrue(gate.usedCommit(commit));
    }

    function test_replayRejected() public {
        gate.acceptCommit(pkHash, messageHash, commit);
        vm.expectRevert(bytes("replay"));
        gate.acceptCommit(pkHash, messageHash, commit);
    }

    function test_untrustedSubmitter() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(bytes("untrusted submitter"));
        gate.acceptCommit(pkHash, messageHash, commit);
    }

    function test_untrustedPk() public {
        vm.expectRevert(bytes("untrusted pk"));
        gate.acceptCommit(keccak256("other"), messageHash, commit);
    }
}
