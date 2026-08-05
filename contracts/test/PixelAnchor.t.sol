// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PixelAnchor} from "../PixelAnchor.sol";

/**
 * Anchoring must be append-only and permissioned, and the digest must be
 * byte-identical to `anchorDigest()` in src/lib/pixel/anchor.ts — otherwise the
 * record stops being portable across venues, which is the whole design.
 */
contract PixelAnchorTest is Test {
    PixelAnchor internal anchorContract;
    address internal stranger = address(0xBEEF);

    uint64 internal constant NETWORK_ID = 20553;
    uint64 internal constant PIXEL_INDEX = 7;

    bytes internal tipHash =
        hex"11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";
    bytes internal spatialRoot =
        hex"22222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222";

    function setUp() public {
        anchorContract = new PixelAnchor(0);
        anchorContract.setAnchorer(address(this), true);
    }

    function test_anchorStoresDigestAndTime() public {
        bytes32 digest = anchorContract.anchor(NETWORK_ID, PIXEL_INDEX, tipHash, spatialRoot);
        PixelAnchor.Anchor memory a = anchorContract.anchorAt(NETWORK_ID, PIXEL_INDEX);
        assertEq(a.digest, digest);
        assertEq(a.anchorer, address(this));
        assertTrue(a.anchoredAt != 0);
        assertEq(anchorContract.highestAnchored(NETWORK_ID), PIXEL_INDEX);
    }

    /// The point of the whole contract: history cannot be revised behind an anchor.
    function test_appendOnly() public {
        anchorContract.anchor(NETWORK_ID, PIXEL_INDEX, tipHash, spatialRoot);
        vm.expectRevert(PixelAnchor.AlreadyAnchored.selector);
        anchorContract.anchor(NETWORK_ID, PIXEL_INDEX, spatialRoot, tipHash);
    }

    function test_matchesDetectsRewrite() public {
        anchorContract.anchor(NETWORK_ID, PIXEL_INDEX, tipHash, spatialRoot);
        assertTrue(anchorContract.matches(NETWORK_ID, PIXEL_INDEX, tipHash, spatialRoot));
        // A rewritten history produces a different digest at the same height.
        assertFalse(anchorContract.matches(NETWORK_ID, PIXEL_INDEX, spatialRoot, tipHash));
    }

    function test_rejectsWrongDigestLength() public {
        vm.expectRevert(PixelAnchor.BadDigestLength.selector);
        anchorContract.anchor(NETWORK_ID, PIXEL_INDEX, hex"1234", spatialRoot);
    }

    function test_onlyAnchorerMayWrite() public {
        vm.prank(stranger);
        vm.expectRevert(PixelAnchor.NotAnchorer.selector);
        anchorContract.anchor(NETWORK_ID, PIXEL_INDEX, tipHash, spatialRoot);
    }

    function test_setAnchorerOnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(PixelAnchor.NotOwner.selector);
        anchorContract.setAnchorer(stranger, true);
    }

    function test_anchorerTimelockAndImmediateRevoke() public {
        PixelAnchor delayed = new PixelAnchor(1 days);
        delayed.setAnchorer(address(this), true);
        assertFalse(delayed.isAnchorer(address(this)));
        vm.warp(block.timestamp + 1 days);
        assertTrue(delayed.isAnchorer(address(this)));
        delayed.setAnchorer(address(this), false);
        assertFalse(delayed.isAnchorer(address(this)));
    }

    function test_twoStepOwnership() public {
        anchorContract.transferOwnership(stranger);
        assertEq(anchorContract.owner(), address(this));
        vm.prank(stranger);
        anchorContract.acceptOwnership();
        assertEq(anchorContract.owner(), stranger);
    }

    /**
     * Cross-language digest vector. The same bytes are asserted in
     * scripts/anchor-selftest.ts; if either side drifts, anchors stop being
     * portable between venues.
     */
    function test_digestMatchesTypeScriptVector() public view {
        bytes32 digest = anchorContract.anchorDigest(NETWORK_ID, PIXEL_INDEX, tipHash, spatialRoot);
        assertEq(digest, keccak256(abi.encodePacked(NETWORK_ID, PIXEL_INDEX, tipHash, spatialRoot)));
        // Frozen vector — see anchor-selftest.ts
        assertEq(
            digest,
            0xab4c2f7b0547413533d28212006174831988c6ee9ec9481b4efe475cbb33a384,
            "anchor digest drifted from the TypeScript implementation"
        );
    }
}
