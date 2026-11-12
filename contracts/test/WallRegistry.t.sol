// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {WallRegistry} from "../src/WallRegistry.sol";
import {ArtwallUpgradeable} from "../src/ArtwallUpgradeable.sol";

contract WallRegistryTest is Test {
    WallRegistry reg;

    address admin = address(0xAD41);
    address operator = address(0x0A7E);
    address venueHost = address(0x9E0E);
    address stranger = address(0x5717A26E);

    bytes32 constant VENUE = keccak256("venue-uuid-1");

    function setUp() public {
        WallRegistry impl = new WallRegistry();
        reg = WallRegistry(
            address(new ERC1967Proxy(address(impl), abi.encodeCall(WallRegistry.initialize, (admin, operator))))
        );
    }

    function _register(uint256 slotId) internal {
        vm.prank(operator);
        reg.registerSlot(slotId, VENUE, venueHost, 1200, 900, 1500);
    }

    function test_registerStoresSlotIdentity() public {
        _register(1);
        WallRegistry.Slot memory s = reg.getSlot(1);
        assertEq(s.venueId, VENUE);
        assertEq(s.ownerWallet, venueHost);
        assertEq(s.widthMm, 1200);
        assertEq(s.heightMm, 900);
        assertEq(s.revenueShareBps, 1500);
        assertEq(s.exhibitionCount, 0);
        assertTrue(s.active);
        assertEq(reg.totalSlots(), 1);
    }

    function test_rejectsDuplicateSlot() public {
        _register(1);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(WallRegistry.SlotAlreadyExists.selector, uint256(1)));
        reg.registerSlot(1, VENUE, venueHost, 100, 100, 0);
    }

    function test_rejectsShareAboveCap() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(WallRegistry.ShareAboveCap.selector, uint16(5001)));
        reg.registerSlot(1, VENUE, venueHost, 100, 100, 5001);
    }

    function test_rejectsZeroDimensions() public {
        vm.prank(operator);
        vm.expectRevert("dimensions must be nonzero");
        reg.registerSlot(1, VENUE, venueHost, 0, 900, 0);
    }

    function test_onlyOperatorCanRegister() public {
        vm.prank(stranger);
        vm.expectRevert(ArtwallUpgradeable.NotOperator.selector);
        reg.registerSlot(1, VENUE, venueHost, 100, 100, 0);
    }

    function test_ownerAndShareChangesAreAdminOnly() public {
        _register(1);
        vm.prank(operator);
        vm.expectRevert(ArtwallUpgradeable.NotAdmin.selector);
        reg.setSlotOwner(1, stranger);

        vm.startPrank(admin);
        reg.setSlotOwner(1, stranger);
        reg.setRevenueShare(1, 2000);
        vm.stopPrank();

        WallRegistry.Slot memory s = reg.getSlot(1);
        assertEq(s.ownerWallet, stranger);
        assertEq(s.revenueShareBps, 2000);
    }

    function test_counterIncrementsAndDeactivationIsNotDeletion() public {
        _register(1);
        vm.startPrank(operator);
        reg.recordExhibition(1);
        reg.recordExhibition(1);
        reg.setSlotActive(1, false);
        vm.stopPrank();

        assertEq(reg.getSlot(1).exhibitionCount, 2, "counter lost");
        assertFalse(reg.isActive(1));
        // Record survives deactivation (rule 30).
        assertEq(reg.getSlot(1).venueId, VENUE);
    }

    function test_unknownSlotReverts() public {
        vm.expectRevert(abi.encodeWithSelector(WallRegistry.UnknownSlot.selector, uint256(7)));
        reg.getSlot(7);
        assertFalse(reg.isActive(7));
    }

    function test_pauseBlocksWrites() public {
        vm.prank(admin);
        reg.pause();
        vm.prank(operator);
        vm.expectRevert();
        reg.registerSlot(1, VENUE, venueHost, 100, 100, 0);
    }
}
