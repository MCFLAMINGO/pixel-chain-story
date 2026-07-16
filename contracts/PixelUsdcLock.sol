// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * PixelUsdcLock — foreign lock feeder surface (Ethereum).
 *
 * User (or their EOA) locks USDC here, naming a Pixel Personal Source (pix1…).
 * Relayers / Pixel nodes read Locked events → LockReceipt → Worldlight shineIn
 * → PIX credited to that pix1 address. This contract never holds Pixel seeds.
 *
 * Flow:
 *   1) approve USDC
 *   2) lock(amount, pixelRecipient, salt)
 *   3) off-chain feeder builds LockReceipt from Locked event
 *   4) Pixel illuminateIngress releases PIX from bridge escrow
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract PixelUsdcLock {
    IERC20 public immutable usdc;
    address public guardian; // can pause; cannot steal user Pixel keys

    bool public paused;
    uint256 public lockCount;

    struct LockRecord {
        address locker;
        uint256 amount; // USDC raw (6 decimals)
        string pixelRecipient; // pix1…
        bytes32 salt;
        uint64 lockedAt;
        bool released; // optional reverse path later
    }

    mapping(uint256 => LockRecord) public locks;
    mapping(bytes32 => bool) public usedSalt;

    event Locked(
        uint256 indexed lockId,
        address indexed locker,
        uint256 amount,
        string pixelRecipient,
        bytes32 salt,
        bytes32 lockDigest
    );
    event Paused(bool ok);

    constructor(address usdcToken) {
        usdc = IERC20(usdcToken);
        guardian = msg.sender;
    }

    modifier notPaused() {
        require(!paused, "paused");
        _;
    }

    function setPaused(bool ok) external {
        require(msg.sender == guardian, "guardian");
        paused = ok;
        emit Paused(ok);
    }

    /**
     * Lock USDC for a Pixel Personal Source.
     * @param amount USDC raw units (6 decimals). 5 USD = 5_000_000.
     * @param pixelRecipient pix1… self-custody address on Pixel
     * @param salt unique per lock (prevents replay of identical locks)
     */
    function lock(
        uint256 amount,
        string calldata pixelRecipient,
        bytes32 salt
    ) external notPaused returns (uint256 lockId, bytes32 lockDigest) {
        require(amount > 0, "amount");
        require(bytes(pixelRecipient).length > 4, "recipient");
        require(!usedSalt[salt], "salt used");

        usedSalt[salt] = true;
        require(usdc.transferFrom(msg.sender, address(this), amount), "transferFrom");

        lockId = ++lockCount;
        locks[lockId] = LockRecord({
            locker: msg.sender,
            amount: amount,
            pixelRecipient: pixelRecipient,
            salt: salt,
            lockedAt: uint64(block.timestamp),
            released: false
        });

        lockDigest = keccak256(
            abi.encodePacked(
                "pixel-usdc-lock-v1",
                address(this),
                lockId,
                msg.sender,
                amount,
                pixelRecipient,
                salt,
                block.chainid
            )
        );

        emit Locked(lockId, msg.sender, amount, pixelRecipient, salt, lockDigest);
    }

    function lockedBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
