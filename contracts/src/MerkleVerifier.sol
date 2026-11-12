// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArtwallUpgradeable} from "./ArtwallUpgradeable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title MerkleVerifier
 * @notice §19/§79 contract 5 of 5. Anchors the daily Merkle root of pending
 *         provenance commitments (§14: ~₹0.8/tx, ₹292/year) and verifies
 *         lazy-mint proofs against any anchored root.
 *
 * @dev A root is posted by an ANCHOR_ROLE holder — the anchoring cron, a
 *      narrower key than the operator gateway — and is then permanent: there
 *      is no un-post, because a commitment that can be withdrawn is not a
 *      commitment (rule 29/30). Each root records the day index it covers so
 *      a given day can only be anchored once, which keeps the off-chain job
 *      idempotent and makes a double-post a loud revert rather than a silent
 *      second root.
 *
 *      §118 rate cap: at most one root per day index, and `postRoot` is
 *      pausable, so a leaked anchor key cannot spam roots.
 *
 *      §80 — a root is a hash over off-chain commitments. The leaves are
 *      never reconstructed on-chain and no leaf content (image, KYC, buyer)
 *      ever touches this contract. Callers supply the leaf hash they claim
 *      is included; computing that hash from real data is the application's
 *      job.
 */
contract MerkleVerifier is ArtwallUpgradeable {
    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");

    struct Root {
        uint64 dayIndex;
        uint64 postedAt;
        uint32 leafCount;
        bool exists;
    }

    mapping(bytes32 => Root) private _roots;
    /// @notice Days since unix epoch => the root anchored for that day.
    mapping(uint64 => bytes32) public rootOfDay;
    uint256 public totalRoots;

    event RootPosted(bytes32 indexed root, uint64 indexed dayIndex, uint32 leafCount);

    error NotAnchor();
    error RootAlreadyPosted(bytes32 root);
    error DayAlreadyAnchored(uint64 dayIndex, bytes32 existingRoot);
    error UnknownRoot(bytes32 root);
    error ZeroRoot();

    function initialize(address admin, address anchor) external initializer {
        // The anchoring cron is this contract's only writer, so it takes
        // OPERATOR_ROLE as well as ANCHOR_ROLE; keeping both names lets the
        // admin later split anchoring from any future operator-only write.
        __ArtwallUpgradeable_init(admin, anchor);
        _grantRole(ANCHOR_ROLE, anchor);
    }

    /// @notice Anchor the Merkle root covering `dayIndex`
    ///         (block.timestamp / 1 days). Permanent and one-per-day.
    function postRoot(bytes32 root, uint64 dayIndex, uint32 leafCount) external whenNotPaused {
        if (!hasRole(ANCHOR_ROLE, msg.sender)) revert NotAnchor();
        if (root == bytes32(0)) revert ZeroRoot();
        if (_roots[root].exists) revert RootAlreadyPosted(root);
        bytes32 existing = rootOfDay[dayIndex];
        if (existing != bytes32(0)) revert DayAlreadyAnchored(dayIndex, existing);

        _roots[root] = Root({dayIndex: dayIndex, postedAt: uint64(block.timestamp), leafCount: leafCount, exists: true});
        rootOfDay[dayIndex] = root;
        totalRoots++;
        emit RootPosted(root, dayIndex, leafCount);
    }

    /// @notice Verify `leaf` is included under an anchored `root`. Reverts if
    ///         the root was never anchored — a proof against an unknown root
    ///         proves nothing, and returning false there would let a caller
    ///         confuse "not anchored" with "not included".
    function verifyProof(bytes32 root, bytes32[] calldata proof, bytes32 leaf) external view returns (bool) {
        if (!_roots[root].exists) revert UnknownRoot(root);
        return MerkleProof.verifyCalldata(proof, root, leaf);
    }

    /// @notice Convenience for the lazy-mint path: verify against whatever
    ///         root was anchored for `dayIndex`.
    function verifyForDay(uint64 dayIndex, bytes32[] calldata proof, bytes32 leaf) external view returns (bool) {
        bytes32 root = rootOfDay[dayIndex];
        if (root == bytes32(0)) revert UnknownRoot(root);
        return MerkleProof.verifyCalldata(proof, root, leaf);
    }

    function getRoot(bytes32 root) external view returns (Root memory) {
        Root memory r = _roots[root];
        if (!r.exists) revert UnknownRoot(root);
        return r;
    }

    function isAnchored(bytes32 root) external view returns (bool) {
        return _roots[root].exists;
    }

    /// @notice The day index the anchoring cron should use for "today".
    function currentDayIndex() external view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }
}
