// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ArtwallUpgradeable
 * @notice Shared §118 control surface for the Bible's five-contract
 *         architecture (ArtworkRegistry, WallRegistry, ExhibitionManager,
 *         RevenueDistributor, MerkleVerifier). Every one of them inherits
 *         this rather than repeating the same roles, pause and upgrade
 *         timelock five times.
 *
 * @dev §118 controls encoded here:
 *        - multisig-ready ownership: DEFAULT_ADMIN_ROLE is set at
 *          initialize() to whatever address is passed (a Safe in
 *          production), never to the deployer implicitly.
 *        - role separation: ADMIN (grants roles, schedules upgrades),
 *          PAUSER (incident response only), OPERATOR (the application
 *          gateway that writes records). A compromised OPERATOR key cannot
 *          pause, upgrade or grant roles; a PAUSER cannot write records.
 *        - pause: every state-writing entrypoint in the subclasses is
 *          whenNotPaused.
 *        - upgrade timelock: an implementation must be scheduled by the
 *          admin and then sit for UPGRADE_DELAY before _authorizeUpgrade
 *          will accept it. This is deliberately in-contract rather than a
 *          separate TimelockController so the delay survives even if the
 *          admin multisig is replaced.
 *
 *      Storage layout note: this base declares storage, so subclasses must
 *      never reorder or remove its variables across upgrades. New base
 *      variables go at the end of this contract, above __gap.
 */
abstract contract ArtwallUpgradeable is Initializable, UUPSUpgradeable, AccessControl, Pausable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice §118 upgrade timelock: how long a scheduled implementation
    ///         must wait before it can be activated. Constant, not
    ///         admin-tunable — an admin able to shorten its own timelock is
    ///         not a timelock.
    uint256 public constant UPGRADE_DELAY = 2 days;

    /// @dev implementation => unix time at which the upgrade becomes valid.
    mapping(address => uint256) public upgradeReadyAt;

    event UpgradeScheduled(address indexed implementation, uint256 readyAt);
    event UpgradeCancelled(address indexed implementation);

    error NotAdmin();
    error NotPauser();
    error NotOperator();
    error UpgradeNotScheduled(address implementation);
    error UpgradeTooEarly(address implementation, uint256 readyAt);

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotAdmin();
        _;
    }

    modifier onlyOperator() {
        if (!hasRole(OPERATOR_ROLE, msg.sender)) revert NotOperator();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Grants admin + pauser to `admin` and operator to `operator`.
     *      PAUSER defaults to the admin only: the admin multisig can
     *      delegate pausing to a dedicated incident-response key later,
     *      but the operator (the application gateway, a hot key) never
     *      gets it.
     */
    function __ArtwallUpgradeable_init(address admin, address operator) internal onlyInitializing {
        require(admin != address(0), "admin is zero address");
        require(operator != address(0), "operator is zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(OPERATOR_ROLE, operator);
    }

    /// @notice §118: schedule an implementation upgrade. It only becomes
    ///         executable UPGRADE_DELAY later.
    function scheduleUpgrade(address implementation) external onlyAdmin {
        require(implementation != address(0), "implementation is zero address");
        uint256 readyAt = block.timestamp + UPGRADE_DELAY;
        upgradeReadyAt[implementation] = readyAt;
        emit UpgradeScheduled(implementation, readyAt);
    }

    /// @notice §118: abandon a scheduled upgrade (e.g. a bad implementation
    ///         caught during the delay window).
    function cancelUpgrade(address implementation) external onlyAdmin {
        delete upgradeReadyAt[implementation];
        emit UpgradeCancelled(implementation);
    }

    function pause() external {
        if (!hasRole(PAUSER_ROLE, msg.sender)) revert NotPauser();
        _pause();
    }

    function unpause() external {
        if (!hasRole(PAUSER_ROLE, msg.sender)) revert NotPauser();
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyAdmin {
        uint256 readyAt = upgradeReadyAt[newImplementation];
        if (readyAt == 0) revert UpgradeNotScheduled(newImplementation);
        if (block.timestamp < readyAt) revert UpgradeTooEarly(newImplementation, readyAt);
        // Single-use: re-upgrading to the same implementation must be
        // re-scheduled and re-delayed.
        delete upgradeReadyAt[newImplementation];
    }

    /// @dev Reserved storage for future base-contract variables so adding one
    ///      never shifts a subclass's storage slots.
    uint256[48] private __gap;
}
