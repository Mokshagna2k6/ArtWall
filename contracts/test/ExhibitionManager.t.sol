// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ExhibitionManager} from "../src/ExhibitionManager.sol";
import {ArtworkRegistry} from "../src/ArtworkRegistry.sol";
import {WallRegistry} from "../src/WallRegistry.sol";
import {ArtwallUpgradeable} from "../src/ArtwallUpgradeable.sol";

contract ExhibitionManagerTest is Test {
    ExhibitionManager mgr;
    ArtworkRegistry artworks;
    WallRegistry walls;

    address admin = address(0xAD41);
    address gateway = address(0x0A7E); // operator + attestor
    address artist = address(0xBEEF);
    address venueHost = address(0x9E0E);
    address stranger = address(0x5717A26E);

    bytes32 constant VENUE = keccak256("venue-uuid-1");
    uint256 constant TOKEN = 1;
    uint256 constant SLOT = 1;

    function setUp() public {
        artworks = ArtworkRegistry(
            address(
                new ERC1967Proxy(
                    address(new ArtworkRegistry()), abi.encodeCall(ArtworkRegistry.initialize, (admin, gateway))
                )
            )
        );
        walls = WallRegistry(
            address(
                new ERC1967Proxy(address(new WallRegistry()), abi.encodeCall(WallRegistry.initialize, (admin, gateway)))
            )
        );
        mgr = ExhibitionManager(
            address(
                new ERC1967Proxy(
                    address(new ExhibitionManager()),
                    abi.encodeCall(ExhibitionManager.initialize, (admin, gateway, address(walls), address(artworks)))
                )
            )
        );
        // ExhibitionManager must be able to bump the wall's counter.
        vm.prank(admin);
        walls.grantRole(walls.OPERATOR_ROLE(), address(mgr));

        vm.startPrank(gateway);
        artworks.registerArtwork(TOKEN, artist, keccak256("meta"), keccak256("tag"), artist, 500);
        walls.registerSlot(SLOT, VENUE, venueHost, 1200, 900, 1500);
        vm.stopPrank();
    }

    function _attest() internal {
        vm.prank(gateway);
        mgr.attestEligibility(TOKEN, uint64(block.timestamp + 30 days));
    }

    function _schedule(uint256 exhibitionId) internal {
        vm.prank(gateway);
        mgr.scheduleExhibition(
            exhibitionId, SLOT, TOKEN, uint64(block.timestamp), uint64(block.timestamp + 7 days)
        );
    }

    /// §119 + rule 41: the chain rejects, but only because the application
    /// said so. No attestation => no exhibition.
    function test_scheduleRejectsUnattestedArtwork() public {
        vm.prank(gateway);
        vm.expectRevert(abi.encodeWithSelector(ExhibitionManager.ArtworkNotEligible.selector, TOKEN));
        mgr.scheduleExhibition(1, SLOT, TOKEN, uint64(block.timestamp), uint64(block.timestamp + 1 days));
    }

    function test_scheduleSucceedsOnceAttested() public {
        _attest();
        _schedule(1);
        ExhibitionManager.Exhibition memory e = mgr.getExhibition(1);
        assertEq(e.slotId, SLOT);
        assertEq(e.artworkTokenId, TOKEN);
        assertEq(uint8(e.status), uint8(ExhibitionManager.Status.Scheduled));
        assertEq(mgr.totalExhibitions(), 1);
        assertEq(walls.getSlot(SLOT).exhibitionCount, 1, "wall counter not bumped");
    }

    function test_attestationExpires() public {
        vm.prank(gateway);
        mgr.attestEligibility(TOKEN, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        assertFalse(mgr.isEligible(TOKEN));
        vm.prank(gateway);
        vm.expectRevert(abi.encodeWithSelector(ExhibitionManager.ArtworkNotEligible.selector, TOKEN));
        mgr.scheduleExhibition(1, SLOT, TOKEN, uint64(block.timestamp), uint64(block.timestamp + 1 days));
    }

    function test_revokedAttestationBlocksActivation() public {
        _attest();
        _schedule(1);
        vm.prank(gateway);
        mgr.revokeEligibility(TOKEN);
        vm.prank(gateway);
        vm.expectRevert(abi.encodeWithSelector(ExhibitionManager.ArtworkNotEligible.selector, TOKEN));
        mgr.activate(1);
    }

    function test_onlyAttestorCanAttest() public {
        vm.prank(stranger);
        vm.expectRevert(ExhibitionManager.NotAttestor.selector);
        mgr.attestEligibility(TOKEN, uint64(block.timestamp + 1 days));
    }

    function test_cannotAttestUnknownArtwork() public {
        vm.prank(gateway);
        vm.expectRevert(abi.encodeWithSelector(ExhibitionManager.UnknownArtwork.selector, uint256(42)));
        mgr.attestEligibility(42, uint64(block.timestamp + 1 days));
    }

    function test_slotCannotHoldTwoExhibitionsAtOnce() public {
        _attest();
        _schedule(1);
        vm.prank(gateway);
        vm.expectRevert(abi.encodeWithSelector(ExhibitionManager.SlotNotAvailable.selector, SLOT));
        mgr.scheduleExhibition(2, SLOT, TOKEN, uint64(block.timestamp), uint64(block.timestamp + 1 days));
    }

    function test_inactiveSlotRejected() public {
        _attest();
        vm.prank(gateway);
        walls.setSlotActive(SLOT, false);
        vm.prank(gateway);
        vm.expectRevert(abi.encodeWithSelector(ExhibitionManager.SlotNotAvailable.selector, SLOT));
        mgr.scheduleExhibition(1, SLOT, TOKEN, uint64(block.timestamp), uint64(block.timestamp + 1 days));
    }

    function test_badWindowRejected() public {
        _attest();
        uint64 t = uint64(block.timestamp + 100);
        vm.prank(gateway);
        vm.expectRevert(abi.encodeWithSelector(ExhibitionManager.BadWindow.selector, t, t));
        mgr.scheduleExhibition(1, SLOT, TOKEN, t, t);
    }

    function test_lifecycleAndSlotRelease() public {
        _attest();
        _schedule(1);
        vm.startPrank(gateway);
        mgr.activate(1);
        assertEq(uint8(mgr.getExhibition(1).status), uint8(ExhibitionManager.Status.Active));
        mgr.end(1);
        vm.stopPrank();

        assertEq(uint8(mgr.getExhibition(1).status), uint8(ExhibitionManager.Status.Ended));
        assertEq(mgr.activeExhibitionOfSlot(SLOT), 0, "slot not released");

        // Slot is reusable; the old record still resolves (rule 30).
        _schedule(2);
        assertEq(mgr.getExhibition(1).artworkTokenId, TOKEN);
        assertEq(walls.getSlot(SLOT).exhibitionCount, 2);
    }

    function test_cannotEndTwice() public {
        _attest();
        _schedule(1);
        vm.startPrank(gateway);
        mgr.end(1);
        vm.expectRevert(
            abi.encodeWithSelector(
                ExhibitionManager.IllegalTransition.selector,
                ExhibitionManager.Status.Ended,
                ExhibitionManager.Status.Ended
            )
        );
        mgr.end(1);
        vm.stopPrank();
    }

    function test_cancelReleasesSlotAndKeepsRecord() public {
        _attest();
        _schedule(1);
        vm.prank(gateway);
        mgr.cancel(1);
        assertEq(uint8(mgr.getExhibition(1).status), uint8(ExhibitionManager.Status.Cancelled));
        assertEq(mgr.activeExhibitionOfSlot(SLOT), 0);
    }

    function test_duplicateExhibitionIdRejected() public {
        _attest();
        _schedule(1);
        vm.prank(gateway);
        mgr.end(1);
        vm.prank(gateway);
        vm.expectRevert(abi.encodeWithSelector(ExhibitionManager.ExhibitionAlreadyExists.selector, uint256(1)));
        mgr.scheduleExhibition(1, SLOT, TOKEN, uint64(block.timestamp), uint64(block.timestamp + 1 days));
    }

    function test_onlyOperatorCanSchedule() public {
        _attest();
        vm.prank(stranger);
        vm.expectRevert(ArtwallUpgradeable.NotOperator.selector);
        mgr.scheduleExhibition(1, SLOT, TOKEN, uint64(block.timestamp), uint64(block.timestamp + 1 days));
    }
}
