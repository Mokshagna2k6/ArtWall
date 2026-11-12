// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ArtworkRegistry} from "../src/ArtworkRegistry.sol";
import {ArtwallUpgradeable} from "../src/ArtwallUpgradeable.sol";

/// A trivial v2 used only to prove an upgrade lands and storage survives.
contract ArtworkRegistryV2 is ArtworkRegistry {
    function version() external pure returns (string memory) {
        return "v2";
    }
}

/// §118 controls are implemented once in ArtwallUpgradeable, so they are
/// tested once here through one representative subclass.
contract ArtwallUpgradeableTest is Test {
    ArtworkRegistry reg;

    address admin = address(0xAD41);
    address operator = address(0x0A7E);
    address pauser = address(0x9A05E);
    address stranger = address(0x5717A26E);

    function setUp() public {
        reg = ArtworkRegistry(
            address(
                new ERC1967Proxy(
                    address(new ArtworkRegistry()), abi.encodeCall(ArtworkRegistry.initialize, (admin, operator))
                )
            )
        );
    }

    function test_implementationCannotBeInitializedDirectly() public {
        ArtworkRegistry impl = new ArtworkRegistry();
        vm.expectRevert();
        impl.initialize(admin, operator);
    }

    function test_proxyCannotBeReinitialized() public {
        vm.expectRevert();
        reg.initialize(stranger, stranger);
    }

    function test_roleSeparationAtInit() public view {
        assertTrue(reg.hasRole(reg.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(reg.hasRole(reg.PAUSER_ROLE(), admin));
        assertTrue(reg.hasRole(reg.OPERATOR_ROLE(), operator));
        // The hot operator key must never be able to pause or upgrade.
        assertFalse(reg.hasRole(reg.PAUSER_ROLE(), operator));
        assertFalse(reg.hasRole(reg.DEFAULT_ADMIN_ROLE(), operator));
    }

    function test_pauserCanBeDelegatedSeparately() public {
        vm.prank(admin);
        reg.grantRole(reg.PAUSER_ROLE(), pauser);
        vm.prank(pauser);
        reg.pause();
        assertTrue(reg.paused());
        vm.prank(pauser);
        reg.unpause();
        assertFalse(reg.paused());
    }

    function test_nonPauserCannotPause() public {
        vm.prank(operator);
        vm.expectRevert(ArtwallUpgradeable.NotPauser.selector);
        reg.pause();
    }

    function test_upgradeRequiresSchedule() public {
        address v2 = address(new ArtworkRegistryV2());
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ArtwallUpgradeable.UpgradeNotScheduled.selector, v2));
        reg.upgradeToAndCall(v2, "");
    }

    function test_upgradeRespectsTimelock() public {
        address v2 = address(new ArtworkRegistryV2());
        vm.prank(admin);
        reg.scheduleUpgrade(v2);
        uint256 readyAt = reg.upgradeReadyAt(v2);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ArtwallUpgradeable.UpgradeTooEarly.selector, v2, readyAt));
        reg.upgradeToAndCall(v2, "");

        vm.warp(readyAt);
        vm.prank(admin);
        reg.upgradeToAndCall(v2, "");
        assertEq(ArtworkRegistryV2(address(reg)).version(), "v2");
    }

    function test_upgradePreservesStorage() public {
        vm.prank(operator);
        reg.registerArtwork(1, stranger, keccak256("meta"), keccak256("tag"), stranger, 300);

        address v2 = address(new ArtworkRegistryV2());
        vm.startPrank(admin);
        reg.scheduleUpgrade(v2);
        vm.warp(block.timestamp + reg.UPGRADE_DELAY());
        reg.upgradeToAndCall(v2, "");
        vm.stopPrank();

        assertEq(reg.ownerOf(1), stranger);
        assertEq(reg.totalRegistered(), 1);
    }

    function test_scheduleIsAdminOnly() public {
        address v2 = address(new ArtworkRegistryV2());
        vm.prank(operator);
        vm.expectRevert(ArtwallUpgradeable.NotAdmin.selector);
        reg.scheduleUpgrade(v2);
    }

    function test_nonAdminCannotUpgradeEvenWhenScheduled() public {
        address v2 = address(new ArtworkRegistryV2());
        vm.prank(admin);
        reg.scheduleUpgrade(v2);
        vm.warp(block.timestamp + reg.UPGRADE_DELAY());
        vm.prank(stranger);
        vm.expectRevert(ArtwallUpgradeable.NotAdmin.selector);
        reg.upgradeToAndCall(v2, "");
    }

    function test_cancelUpgrade() public {
        address v2 = address(new ArtworkRegistryV2());
        vm.startPrank(admin);
        reg.scheduleUpgrade(v2);
        reg.cancelUpgrade(v2);
        vm.warp(block.timestamp + reg.UPGRADE_DELAY());
        vm.expectRevert(abi.encodeWithSelector(ArtwallUpgradeable.UpgradeNotScheduled.selector, v2));
        reg.upgradeToAndCall(v2, "");
        vm.stopPrank();
    }

    /// A schedule is consumed by its upgrade: re-upgrading to the same
    /// implementation must wait out the delay again.
    function test_scheduleIsSingleUse() public {
        address v2 = address(new ArtworkRegistryV2());
        vm.startPrank(admin);
        reg.scheduleUpgrade(v2);
        vm.warp(block.timestamp + reg.UPGRADE_DELAY());
        reg.upgradeToAndCall(v2, "");
        assertEq(reg.upgradeReadyAt(v2), 0);
        vm.expectRevert(abi.encodeWithSelector(ArtwallUpgradeable.UpgradeNotScheduled.selector, v2));
        reg.upgradeToAndCall(v2, "");
        vm.stopPrank();
    }
}
