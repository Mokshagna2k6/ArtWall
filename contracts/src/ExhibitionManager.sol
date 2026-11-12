// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArtwallUpgradeable} from "./ArtwallUpgradeable.sol";

interface IWallRegistry {
    function isActive(uint256 slotId) external view returns (bool);
    function recordExhibition(uint256 slotId) external returns (uint32);
}

interface IArtworkRegistry {
    function exists(uint256 tokenId) external view returns (bool);
}

/**
 * @title ExhibitionManager
 * @notice §19/§79 contract 3 of 5. Exhibition records: which artwork hangs on
 *         which wall slot, from when to when, and in what status.
 *
 * @dev §119 + rule 41 — THE APPLICATION IS THE POLICY GATE, NOT THE CHAIN.
 *      The Bible requires an exhibition to be rejected unless the artwork is
 *      both physically bound (NFC) and blockchain-approved. This contract
 *      enforces that requirement but does NOT compute it: eligibility is a
 *      single attested bit written by an ATTESTOR_ROLE holder — the
 *      application gateway, which ran the real policy evaluation off-chain
 *      against the nine-layer anti-fraud stack, the binding record, KYC and
 *      everything else the chain must never see (§80).
 *
 *      So: `scheduleExhibition` reverts when `eligibleUntil[tokenId]` is
 *      absent or stale. That is a hard on-chain rejection, driven entirely by
 *      an off-chain decision. The attestation carries an expiry so a stale
 *      approval cannot be reused indefinitely after the artwork is unbound
 *      or delisted; the gateway can also revoke it outright.
 *
 *      Records are append-only in spirit: an exhibition's slot, artwork and
 *      start are never rewritten. Only `status` and `endAt` advance, and only
 *      forward (Scheduled -> Active -> Ended|Cancelled).
 */
contract ExhibitionManager is ArtwallUpgradeable {
    /// @dev The gateway that attests off-chain policy outcomes. Separate from
    ///      OPERATOR_ROLE so the key that says "this artwork passed policy"
    ///      can be rotated independently of the key that writes records.
    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");

    enum Status {
        None,
        Scheduled,
        Active,
        Ended,
        Cancelled
    }

    struct Exhibition {
        uint256 slotId;
        uint256 artworkTokenId;
        uint64 startAt;
        uint64 endAt;
        Status status;
    }

    IWallRegistry public wallRegistry;
    IArtworkRegistry public artworkRegistry;

    mapping(uint256 => Exhibition) private _exhibitions;
    /// @notice §119 attestation: artwork token id => unix time the
    ///         application's "physically bound AND blockchain approved"
    ///         verdict stops being honoured. 0 means never attested/revoked.
    mapping(uint256 => uint64) public eligibleUntil;
    /// @notice Slot => currently scheduled-or-active exhibition id (0 = free).
    mapping(uint256 => uint256) public activeExhibitionOfSlot;
    uint256 public totalExhibitions;

    event EligibilityAttested(uint256 indexed artworkTokenId, uint64 eligibleUntil);
    event EligibilityRevoked(uint256 indexed artworkTokenId);
    event ExhibitionScheduled(
        uint256 indexed exhibitionId, uint256 indexed slotId, uint256 indexed artworkTokenId, uint64 startAt, uint64 endAt
    );
    event ExhibitionStatusChanged(uint256 indexed exhibitionId, Status status);

    error NotAttestor();
    error ExhibitionAlreadyExists(uint256 exhibitionId);
    error UnknownExhibition(uint256 exhibitionId);
    error ArtworkNotEligible(uint256 artworkTokenId);
    error UnknownArtwork(uint256 artworkTokenId);
    error SlotNotAvailable(uint256 slotId);
    error BadWindow(uint64 startAt, uint64 endAt);
    error IllegalTransition(Status from, Status to);

    function initialize(address admin, address operator, address wallRegistry_, address artworkRegistry_)
        external
        initializer
    {
        __ArtwallUpgradeable_init(admin, operator);
        require(wallRegistry_ != address(0) && artworkRegistry_ != address(0), "registry is zero address");
        wallRegistry = IWallRegistry(wallRegistry_);
        artworkRegistry = IArtworkRegistry(artworkRegistry_);
        // The gateway both attests and writes by default; the admin multisig
        // can split these onto two keys without a redeploy.
        _grantRole(ATTESTOR_ROLE, operator);
    }

    /**
     * @notice §119: record the application's verdict that `artworkTokenId` is
     *         both physically bound and blockchain-approved, valid until
     *         `until`. The chain does not and cannot re-derive this.
     */
    function attestEligibility(uint256 artworkTokenId, uint64 until) external whenNotPaused {
        if (!hasRole(ATTESTOR_ROLE, msg.sender)) revert NotAttestor();
        if (!artworkRegistry.exists(artworkTokenId)) revert UnknownArtwork(artworkTokenId);
        require(until > block.timestamp, "attestation already expired");
        eligibleUntil[artworkTokenId] = until;
        emit EligibilityAttested(artworkTokenId, until);
    }

    /// @notice Withdraw an attestation early (artwork unbound, flagged,
    ///         delisted). Does not touch exhibitions already scheduled —
    ///         those are ended via `cancel`, so the record survives.
    function revokeEligibility(uint256 artworkTokenId) external whenNotPaused {
        if (!hasRole(ATTESTOR_ROLE, msg.sender)) revert NotAttestor();
        delete eligibleUntil[artworkTokenId];
        emit EligibilityRevoked(artworkTokenId);
    }

    function isEligible(uint256 artworkTokenId) public view returns (bool) {
        return eligibleUntil[artworkTokenId] > block.timestamp;
    }

    /**
     * @notice Create an exhibition record. Rejects when the artwork has no
     *         live eligibility attestation (§119 + rule 41), when the wall
     *         slot is inactive or already occupied, or when the window is
     *         nonsensical.
     */
    function scheduleExhibition(
        uint256 exhibitionId,
        uint256 slotId,
        uint256 artworkTokenId,
        uint64 startAt,
        uint64 endAt
    ) external whenNotPaused onlyOperator {
        if (_exhibitions[exhibitionId].status != Status.None) revert ExhibitionAlreadyExists(exhibitionId);
        if (!isEligible(artworkTokenId)) revert ArtworkNotEligible(artworkTokenId);
        if (!wallRegistry.isActive(slotId)) revert SlotNotAvailable(slotId);
        if (activeExhibitionOfSlot[slotId] != 0) revert SlotNotAvailable(slotId);
        if (endAt <= startAt) revert BadWindow(startAt, endAt);

        _exhibitions[exhibitionId] = Exhibition({
            slotId: slotId,
            artworkTokenId: artworkTokenId,
            startAt: startAt,
            endAt: endAt,
            status: Status.Scheduled
        });
        activeExhibitionOfSlot[slotId] = exhibitionId;
        totalExhibitions++;

        emit ExhibitionScheduled(exhibitionId, slotId, artworkTokenId, startAt, endAt);
        emit ExhibitionStatusChanged(exhibitionId, Status.Scheduled);
        wallRegistry.recordExhibition(slotId);
    }

    /// @notice Scheduled -> Active. Re-checks eligibility: an artwork whose
    ///         attestation lapsed between scheduling and hanging must not go
    ///         up.
    function activate(uint256 exhibitionId) external whenNotPaused onlyOperator {
        Exhibition storage e = _requireExhibition(exhibitionId);
        if (e.status != Status.Scheduled) revert IllegalTransition(e.status, Status.Active);
        if (!isEligible(e.artworkTokenId)) revert ArtworkNotEligible(e.artworkTokenId);
        e.status = Status.Active;
        emit ExhibitionStatusChanged(exhibitionId, Status.Active);
    }

    /// @notice Scheduled|Active -> Ended. Frees the slot; the record stays.
    function end(uint256 exhibitionId) external whenNotPaused onlyOperator {
        Exhibition storage e = _requireExhibition(exhibitionId);
        if (e.status != Status.Scheduled && e.status != Status.Active) {
            revert IllegalTransition(e.status, Status.Ended);
        }
        e.status = Status.Ended;
        e.endAt = uint64(block.timestamp);
        delete activeExhibitionOfSlot[e.slotId];
        emit ExhibitionStatusChanged(exhibitionId, Status.Ended);
    }

    /// @notice Scheduled|Active -> Cancelled. Frees the slot; the record stays.
    function cancel(uint256 exhibitionId) external whenNotPaused onlyOperator {
        Exhibition storage e = _requireExhibition(exhibitionId);
        if (e.status != Status.Scheduled && e.status != Status.Active) {
            revert IllegalTransition(e.status, Status.Cancelled);
        }
        e.status = Status.Cancelled;
        delete activeExhibitionOfSlot[e.slotId];
        emit ExhibitionStatusChanged(exhibitionId, Status.Cancelled);
    }

    function getExhibition(uint256 exhibitionId) external view returns (Exhibition memory) {
        return _requireExhibition(exhibitionId);
    }

    function _requireExhibition(uint256 exhibitionId) private view returns (Exhibition storage e) {
        e = _exhibitions[exhibitionId];
        if (e.status == Status.None) revert UnknownExhibition(exhibitionId);
    }
}
