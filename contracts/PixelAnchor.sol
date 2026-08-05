// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * PixelAnchor — append-only tamper-evidence for the Pixel tip.
 *
 * WHAT THIS PROVES: that a given (networkId, pixelIndex, tipHash, spatialRoot)
 * was published at a specific foreign-chain timestamp, and was never changed
 * afterwards. History cannot be silently rewritten behind an anchor.
 *
 * WHAT THIS DOES NOT PROVE: that the anchored root is *correct*. An anchorer
 * can publish a root for an invalid chain. Detection requires at least one
 * independent archive of Pixel history to compare against, and ideally the
 * same record anchored to more than one venue (see `src/lib/pixel/anchor.ts`).
 *
 * No custody. Nothing to release. Nothing to drain. This contract holds a
 * digest and a timestamp, which is the whole point: interop that cannot lose
 * anyone's money.
 */
contract PixelAnchor {
    /** SHA-512 hex digests from Pixel are 64 bytes — they do not fit bytes32. */
    uint256 public constant PIXEL_DIGEST_BYTES = 64;

    struct Anchor {
        bytes32 digest;
        uint64 anchoredAt;
        address anchorer;
    }

    address public owner;
    address public pendingOwner;
    /// Delay before an anchorer may write. Deploy non-zero in production.
    uint64 public immutable anchorerDelay;

    /// 0 = not an anchorer, else the timestamp from which writes are allowed.
    mapping(address => uint64) public anchorerFrom;
    /// (networkId, pixelIndex) => anchor. Written once, never overwritten.
    mapping(bytes32 => Anchor) public anchors;
    /// networkId => highest anchored pixel index.
    mapping(uint64 => uint64) public highestAnchored;

    event OwnerTransferStarted(address indexed from, address indexed to);
    event OwnerTransferred(address indexed from, address indexed to);
    event AnchorerSet(address indexed who, bool ok, uint64 effectiveFrom);
    event Anchored(
        uint64 indexed networkId,
        uint64 indexed pixelIndex,
        bytes32 indexed digest,
        bytes tipHash,
        bytes spatialRoot,
        address anchorer
    );

    error NotOwner();
    error NotAnchorer();
    error ZeroAddress();
    error BadDigestLength();
    error AlreadyAnchored();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint64 anchorerDelay_) {
        owner = msg.sender;
        anchorerDelay = anchorerDelay_;
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

    /// Grant (timelocked) or revoke (immediate) the right to anchor.
    function setAnchorer(address who, bool ok) external onlyOwner {
        uint64 from = ok ? uint64(block.timestamp) + anchorerDelay : 0;
        anchorerFrom[who] = from;
        emit AnchorerSet(who, ok, from);
    }

    function isAnchorer(address who) public view returns (bool) {
        uint64 from = anchorerFrom[who];
        return from != 0 && block.timestamp >= from;
    }

    function anchorKey(uint64 networkId, uint64 pixelIndex) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(networkId, pixelIndex));
    }

    /**
     * Portable anchor digest.
     *
     * Byte-identical to `anchorDigest()` in src/lib/pixel/anchor.ts, so the same
     * record can be published to an EVM chain, a Bitcoin OP_RETURN, IPFS or a
     * signed tag without changing what is being committed to.
     *
     * Layout: networkId(8) ‖ pixelIndex(8) ‖ tipHash(64) ‖ spatialRoot(64).
     * Both digests are length-checked, so the packed encoding is unambiguous.
     */
    function anchorDigest(
        uint64 networkId,
        uint64 pixelIndex,
        bytes calldata tipHash,
        bytes calldata spatialRoot
    ) public pure returns (bytes32) {
        if (tipHash.length != PIXEL_DIGEST_BYTES || spatialRoot.length != PIXEL_DIGEST_BYTES) {
            revert BadDigestLength();
        }
        return keccak256(abi.encodePacked(networkId, pixelIndex, tipHash, spatialRoot));
    }

    /**
     * Publish one anchor. Append-only: a height can be written exactly once,
     * so an anchorer cannot revise the past even if its key is later stolen.
     */
    function anchor(
        uint64 networkId,
        uint64 pixelIndex,
        bytes calldata tipHash,
        bytes calldata spatialRoot
    ) external returns (bytes32) {
        if (!isAnchorer(msg.sender)) revert NotAnchorer();

        bytes32 key = anchorKey(networkId, pixelIndex);
        if (anchors[key].anchoredAt != 0) revert AlreadyAnchored();

        bytes32 digest = anchorDigest(networkId, pixelIndex, tipHash, spatialRoot);
        anchors[key] = Anchor({
            digest: digest,
            anchoredAt: uint64(block.timestamp),
            anchorer: msg.sender
        });
        if (pixelIndex > highestAnchored[networkId]) {
            highestAnchored[networkId] = pixelIndex;
        }

        emit Anchored(networkId, pixelIndex, digest, tipHash, spatialRoot, msg.sender);
        return digest;
    }

    function anchorAt(uint64 networkId, uint64 pixelIndex) external view returns (Anchor memory) {
        return anchors[anchorKey(networkId, pixelIndex)];
    }

    /// True when this exact record is what was published at that height.
    function matches(
        uint64 networkId,
        uint64 pixelIndex,
        bytes calldata tipHash,
        bytes calldata spatialRoot
    ) external view returns (bool) {
        Anchor memory a = anchors[anchorKey(networkId, pixelIndex)];
        if (a.anchoredAt == 0) return false;
        return a.digest == anchorDigest(networkId, pixelIndex, tipHash, spatialRoot);
    }
}
