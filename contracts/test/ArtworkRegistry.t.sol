// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ArtworkRegistry} from "../src/ArtworkRegistry.sol";
import {ArtwallUpgradeable} from "../src/ArtwallUpgradeable.sol";

contract ArtworkRegistryTest is Test {
    ArtworkRegistry reg;

    address admin = address(0xAD41);
    address operator = address(0x0A7E); // the application gateway
    address artist = address(0xBEEF);
    address buyer = address(0xB0B);
    address stranger = address(0x5717A26E);

    bytes32 constant META = keccak256("metadata-v1");
    bytes32 constant TAG = keccak256("nfc-uid-1");

    function setUp() public {
        ArtworkRegistry impl = new ArtworkRegistry();
        bytes memory data = abi.encodeCall(ArtworkRegistry.initialize, (admin, operator));
        reg = ArtworkRegistry(address(new ERC1967Proxy(address(impl), data)));
    }

    function _register(uint256 id) internal {
        vm.prank(operator);
        reg.registerArtwork(id, artist, META, TAG, artist, 500);
    }

    function test_registerStoresIdentityAndHistory() public {
        _register(1);
        ArtworkRegistry.Artwork memory a = reg.getArtwork(1);
        assertEq(a.owner, artist);
        assertEq(a.metadataHash, META);
        assertEq(a.nfcTagUidHash, TAG);
        assertEq(a.royaltyBps, 500);
        assertEq(reg.totalRegistered(), 1);
        assertEq(reg.artworkByNfcTagHash(TAG), 1);
        assertEq(reg.ownershipHistory(1).length, 1);
    }

    function test_registerRejectsDuplicateId() public {
        _register(1);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ArtworkRegistry.ArtworkAlreadyExists.selector, uint256(1)));
        reg.registerArtwork(1, buyer, META, bytes32(0), artist, 0);
    }

    function test_registerRejectsReusedTagHash() public {
        _register(1);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ArtworkRegistry.TagAlreadyBound.selector, TAG));
        reg.registerArtwork(2, buyer, META, TAG, artist, 0);
    }

    function test_registerRejectsRoyaltyAboveCap() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(ArtworkRegistry.RoyaltyAboveCap.selector, uint96(1001)));
        reg.registerArtwork(1, artist, META, bytes32(0), artist, 1001);
    }

    function test_onlyOperatorCanRegister() public {
        vm.prank(stranger);
        vm.expectRevert(ArtwallUpgradeable.NotOperator.selector);
        reg.registerArtwork(1, artist, META, TAG, artist, 500);
    }

    /// Rule 30: ownership history is append-only and never rewritten.
    function test_ownershipHistoryIsImmutableAppendOnly() public {
        _register(1);
        vm.prank(operator);
        reg.transferOwnership(1, buyer);
        vm.prank(operator);
        reg.transferOwnership(1, stranger);

        ArtworkRegistry.OwnershipRecord[] memory h = reg.ownershipHistory(1);
        assertEq(h.length, 3);
        assertEq(h[0].owner, artist, "first owner rewritten");
        assertEq(h[1].owner, buyer);
        assertEq(h[2].owner, stranger);
        assertEq(reg.ownerOf(1), stranger);
    }

    function test_nfcTagCannotBeRebound() public {
        vm.prank(operator);
        reg.registerArtwork(1, artist, META, bytes32(0), artist, 0);
        vm.prank(operator);
        reg.bindNfcTag(1, TAG);
        assertEq(reg.getArtwork(1).nfcTagUidHash, TAG);

        vm.prank(operator);
        vm.expectRevert("tag already set");
        reg.bindNfcTag(1, keccak256("nfc-uid-2"));
    }

    function test_royaltyInfoFollowsErc2981() public {
        _register(1);
        (address receiver, uint256 amount) = reg.royaltyInfo(1, 1 ether);
        assertEq(receiver, artist);
        assertEq(amount, 0.05 ether);
    }

    function test_setRoyaltyIsAdminOnly() public {
        _register(1);
        vm.prank(operator);
        vm.expectRevert(ArtwallUpgradeable.NotAdmin.selector);
        reg.setRoyalty(1, buyer, 100);

        vm.prank(admin);
        reg.setRoyalty(1, buyer, 100);
        (address receiver,) = reg.royaltyInfo(1, 1 ether);
        assertEq(receiver, buyer);
    }

    function test_pauseBlocksWrites() public {
        vm.prank(admin);
        reg.pause();
        vm.prank(operator);
        vm.expectRevert();
        reg.registerArtwork(1, artist, META, TAG, artist, 500);
    }

    function test_unknownArtworkReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ArtworkRegistry.UnknownArtwork.selector, uint256(99)));
        reg.getArtwork(99);
    }
}
