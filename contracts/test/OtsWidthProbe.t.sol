// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";

/**
 * Gas probe for the on-chain OTS width decision (audit PIX-12).
 *
 * MSG_BITS = 32 is forgeable in ~2^32 keccaks. This measures what the honest
 * widths actually cost so the choice between "widen the Lamport verify" and
 * "verify an aggregate proof instead" is made on numbers, not vibes.
 *
 * The loop runs to completion before the leaf comparison fails, so zeroed
 * inputs still measure the real hashing + buffer cost. Calldata is charged at
 * 4 gas/zero-byte here vs 16 gas/non-zero-byte in production; the delta is
 * reported by test_calldataDelta.
 */
contract OtsWidthProbe {
    /// Current shape: hex-encoded halves joined by "|" (33KB buffer at 256 bits).
    function leafHexJoined(
        bytes32 digest,
        bytes32[] calldata revealed,
        bytes16[] calldata complements
    ) external pure returns (bytes32) {
        uint256 n = revealed.length;
        bytes memory partsJoined;
        for (uint256 i = 0; i < n; i++) {
            uint8 b = uint8(digest[i / 8]);
            uint8 bit = (b >> (7 - (i % 8))) & 1;
            bytes16 revealedHash = bytes16(keccak256(abi.encodePacked(revealed[i])));
            bytes memory pair = bit == 0
                ? abi.encodePacked(_hex16(revealedHash), _hex16(complements[i]))
                : abi.encodePacked(_hex16(complements[i]), _hex16(revealedHash));
            partsJoined = i == 0 ? pair : bytes.concat(partsJoined, bytes("|"), pair);
        }
        return keccak256(abi.encodePacked(bytes1(0x04), partsJoined));
    }

    /// Binary shape: full 32-byte halves, one preallocated buffer, no hex, no separators.
    function leafBinary(
        bytes32 digest,
        bytes32[] calldata revealed,
        bytes32[] calldata complements
    ) external pure returns (bytes32) {
        uint256 n = revealed.length;
        bytes memory buf = new bytes(1 + n * 64);
        buf[0] = 0x04;
        for (uint256 i = 0; i < n; i++) {
            uint8 b = uint8(digest[i / 8]);
            uint8 bit = (b >> (7 - (i % 8))) & 1;
            bytes32 revealedHash = keccak256(abi.encodePacked(revealed[i]));
            bytes32 lo = bit == 0 ? revealedHash : complements[i];
            bytes32 hi = bit == 0 ? complements[i] : revealedHash;
            uint256 off = 1 + 64 * i;
            assembly {
                let p := add(add(buf, 0x20), off)
                mstore(p, lo)
                mstore(add(p, 0x20), hi)
            }
        }
        return keccak256(buf);
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

contract OtsWidthProbeTest is Test {
    OtsWidthProbe internal probe;
    bytes32 internal digest = keccak256("pixel-ots-width-probe");

    function setUp() public {
        probe = new OtsWidthProbe();
    }

    function _b32(uint256 n) internal pure returns (bytes32[] memory a) {
        a = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) a[i] = bytes32(uint256(i + 1));
    }

    function _b16(uint256 n) internal pure returns (bytes16[] memory a) {
        a = new bytes16[](n);
        for (uint256 i = 0; i < n; i++) a[i] = bytes16(uint128(i + 1));
    }

    function test_gas_hexJoined_32bits() public view {
        uint256 g = gasleft();
        probe.leafHexJoined(digest, _b32(32), _b16(32));
        console.log("hex-joined  32 bits (today):", g - gasleft());
    }

    function test_gas_hexJoined_256bits() public view {
        uint256 g = gasleft();
        probe.leafHexJoined(digest, _b32(256), _b16(256));
        console.log("hex-joined 256 bits:", g - gasleft());
    }

    function test_gas_binary_256bits() public view {
        uint256 g = gasleft();
        probe.leafBinary(digest, _b32(256), _b32(256));
        console.log("binary     256 bits:", g - gasleft());
    }

    /// Zero calldata is 4 gas/byte; real proofs are non-zero at 16 gas/byte.
    function test_calldataDelta() public pure {
        uint256 bytesOnWire = 256 * 32 * 2; // revealed + complements at 256 bits
        console.log("proof calldata bytes:", bytesOnWire);
        console.log("added gas if all non-zero:", bytesOnWire * 12);
    }
}
