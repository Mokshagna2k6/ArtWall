// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArtwallUpgradeable} from "./ArtwallUpgradeable.sol";

/**
 * @title WallRegistry
 * @notice §19/§79 contract 2 of 5. On-chain wall slot identity: slot id,
 *         venue id, owner wallet, physical dimensions, the revenue share the
 *         wall owner is owed, and exhibition counters.
 *
 * @dev §80 — venue identity is a bytes32 commitment (hash of the off-chain
 *      venue uuid), not an address or a name: the chain needs to tell slots
 *      of different venues apart, it does not need to know the venue's
 *      street address, licence or any other private business data.
 *      Dimensions are in millimetres, the unit the physical-wall feature
 *      already uses, so no conversion layer is needed.
 */
contract WallRegistry is ArtwallUpgradeable {
    struct Slot {
        bytes32 venueId;
        address ownerWallet;
        uint32 widthMm;
        uint32 heightMm;
        uint16 revenueShareBps;
        uint32 exhibitionCount;
        bool active;
        bool exists;
    }

    /// @dev Backstop on how much of a sale a single wall owner can be
    ///      configured to take. The real, tunable split lives off-chain in
    ///      commission_policies; this just bounds a misconfiguration.
    uint16 public constant MAX_REVENUE_SHARE_BPS = 5000; // 50%

    mapping(uint256 => Slot) private _slots;
    uint256 public totalSlots;

    event SlotRegistered(uint256 indexed slotId, bytes32 indexed venueId, address indexed ownerWallet);
    event SlotOwnerUpdated(uint256 indexed slotId, address indexed from, address indexed to);
    event SlotRevenueShareUpdated(uint256 indexed slotId, uint16 revenueShareBps);
    event SlotActiveUpdated(uint256 indexed slotId, bool active);
    event ExhibitionCounted(uint256 indexed slotId, uint32 total);

    error SlotAlreadyExists(uint256 slotId);
    error UnknownSlot(uint256 slotId);
    error ShareAboveCap(uint16 bps);
    error ZeroAddress();

    function initialize(address admin, address operator) external initializer {
        __ArtwallUpgradeable_init(admin, operator);
    }

    function registerSlot(
        uint256 slotId,
        bytes32 venueId,
        address ownerWallet,
        uint32 widthMm,
        uint32 heightMm,
        uint16 revenueShareBps
    ) external whenNotPaused onlyOperator {
        if (_slots[slotId].exists) revert SlotAlreadyExists(slotId);
        if (ownerWallet == address(0)) revert ZeroAddress();
        if (revenueShareBps > MAX_REVENUE_SHARE_BPS) revert ShareAboveCap(revenueShareBps);
        require(venueId != bytes32(0), "venueId is zero");
        require(widthMm > 0 && heightMm > 0, "dimensions must be nonzero");

        _slots[slotId] = Slot({
            venueId: venueId,
            ownerWallet: ownerWallet,
            widthMm: widthMm,
            heightMm: heightMm,
            revenueShareBps: revenueShareBps,
            exhibitionCount: 0,
            active: true,
            exists: true
        });
        totalSlots++;
        emit SlotRegistered(slotId, venueId, ownerWallet);
    }

    /// @notice Wall ownership can change (a venue sells, a host leaves).
    ///         Admin-only: this changes who gets paid.
    function setSlotOwner(uint256 slotId, address ownerWallet) external whenNotPaused onlyAdmin {
        Slot storage s = _requireSlot(slotId);
        if (ownerWallet == address(0)) revert ZeroAddress();
        address from = s.ownerWallet;
        s.ownerWallet = ownerWallet;
        emit SlotOwnerUpdated(slotId, from, ownerWallet);
    }

    function setRevenueShare(uint256 slotId, uint16 revenueShareBps) external whenNotPaused onlyAdmin {
        Slot storage s = _requireSlot(slotId);
        if (revenueShareBps > MAX_REVENUE_SHARE_BPS) revert ShareAboveCap(revenueShareBps);
        s.revenueShareBps = revenueShareBps;
        emit SlotRevenueShareUpdated(slotId, revenueShareBps);
    }

    /// @notice Deactivate rather than delete — a retired slot's exhibition
    ///         records must keep resolving (rule 30).
    function setSlotActive(uint256 slotId, bool active) external whenNotPaused onlyOperator {
        Slot storage s = _requireSlot(slotId);
        s.active = active;
        emit SlotActiveUpdated(slotId, active);
    }

    /// @notice Bump the slot's lifetime exhibition counter. Called by
    ///         ExhibitionManager, which holds OPERATOR_ROLE here.
    function recordExhibition(uint256 slotId) external whenNotPaused onlyOperator returns (uint32) {
        Slot storage s = _requireSlot(slotId);
        s.exhibitionCount += 1;
        emit ExhibitionCounted(slotId, s.exhibitionCount);
        return s.exhibitionCount;
    }

    function getSlot(uint256 slotId) external view returns (Slot memory) {
        return _requireSlot(slotId);
    }

    function isActive(uint256 slotId) external view returns (bool) {
        Slot storage s = _slots[slotId];
        return s.exists && s.active;
    }

    function _requireSlot(uint256 slotId) private view returns (Slot storage s) {
        s = _slots[slotId];
        if (!s.exists) revert UnknownSlot(slotId);
    }
}
