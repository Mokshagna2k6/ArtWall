// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {RevenueDistributor} from "../src/RevenueDistributor.sol";
import {ArtwallUpgradeable} from "../src/ArtwallUpgradeable.sol";

/// A recipient that refuses ETH — stands in for a contract wallet whose
/// receive() reverts, the realistic way one leg of a split can fail.
contract RejectingRecipient {
    receive() external payable {
        revert("nope");
    }
}

/// A recipient that tries to re-enter distribute() while being paid.
contract ReenteringRecipient {
    RevenueDistributor private immutable dist;
    RevenueDistributor.Split private split;
    bool private tried;

    constructor(RevenueDistributor d) {
        dist = d;
    }

    function arm(RevenueDistributor.Split calldata s) external {
        split = s;
    }

    receive() external payable {
        if (tried) return;
        tried = true;
        dist.distribute{value: 0.1 ether}(keccak256("reentrant"), 1, split);
    }
}

contract RevenueDistributorTest is Test {
    RevenueDistributor dist;

    address admin = address(0xAD41);
    address operator = address(0x0A7E);
    address platform = address(0xF1A7);
    address artist = address(0xBEEF);
    address wallOwner = address(0x9A11);
    address curator = address(0xC08A);
    address originalArtist = address(0x0814);
    address stranger = address(0x5717A26E);

    bytes32 constant SALE = keccak256("sale-1");

    function setUp() public {
        dist = RevenueDistributor(
            payable(
                address(
                    new ERC1967Proxy(
                        address(new RevenueDistributor()),
                        abi.encodeCall(RevenueDistributor.initialize, (admin, operator, 100 ether))
                    )
                )
            )
        );
        vm.deal(operator, 1000 ether);
    }

    function _split() internal view returns (RevenueDistributor.Split memory) {
        return RevenueDistributor.Split({
            platform: platform,
            artist: artist,
            wallOwner: wallOwner,
            curator: curator,
            originalArtist: originalArtist,
            platformBps: 2000,
            artistBps: 5000,
            wallOwnerBps: 1500,
            curatorBps: 1000,
            originalArtistBps: 500
        });
    }

    function test_distributePaysEveryPartyAndLeavesNoDust() public {
        vm.prank(operator);
        dist.distribute{value: 10 ether}(SALE, 1, _split());

        assertEq(artist.balance, 5 ether);
        assertEq(wallOwner.balance, 1.5 ether);
        assertEq(curator.balance, 1 ether);
        assertEq(originalArtist.balance, 0.5 ether);
        assertEq(platform.balance, 2 ether);
        assertEq(address(dist).balance, 0, "wei stranded in contract");
        assertEq(dist.totalDistributed(), 10 ether);
    }

    /// Dust from integer division must land on the platform leg, never be
    /// left behind.
    function testFuzz_allWeiAccountedFor(uint96 amount) public {
        amount = uint96(bound(uint256(amount), 1, 100 ether));
        vm.prank(operator);
        dist.distribute{value: amount}(SALE, 1, _split());
        uint256 paid =
            artist.balance + wallOwner.balance + curator.balance + originalArtist.balance + platform.balance;
        assertEq(paid, amount);
        assertEq(address(dist).balance, 0);
    }

    /// THE atomicity property: one failing leg pays nobody.
    function test_atomicity_oneFailingLegPaysNobody() public {
        RejectingRecipient bad = new RejectingRecipient();
        RevenueDistributor.Split memory s = _split();
        s.curator = address(bad);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RevenueDistributor.PayoutFailed.selector, address(bad), 1 ether));
        dist.distribute{value: 10 ether}(SALE, 1, s);

        assertEq(artist.balance, 0, "artist paid despite failed leg");
        assertEq(wallOwner.balance, 0, "wall owner paid despite failed leg");
        assertEq(originalArtist.balance, 0);
        assertEq(platform.balance, 0);
        assertEq(address(bad).balance, 0);
        assertEq(address(dist).balance, 0, "funds stuck in contract");
        assertEq(dist.totalDistributed(), 0, "accounting advanced on a reverted sale");

        // And the sale was not recorded, so it can be retried after the
        // address is fixed.
        vm.expectRevert(abi.encodeWithSelector(RevenueDistributor.UnknownSale.selector, SALE));
        dist.getDistribution(SALE);
    }

    /// The platform leg is the last one paid — it failing must also unwind
    /// the four already-successful transfers.
    function test_atomicity_failingPlatformLegUnwindsEarlierPayouts() public {
        RejectingRecipient bad = new RejectingRecipient();
        RevenueDistributor.Split memory s = _split();
        s.platform = address(bad);

        vm.prank(operator);
        vm.expectRevert();
        dist.distribute{value: 10 ether}(SALE, 1, s);

        assertEq(artist.balance, 0);
        assertEq(wallOwner.balance, 0);
        assertEq(curator.balance, 0);
        assertEq(originalArtist.balance, 0);
    }

    function test_rejectsBpsNotSummingTo10000() public {
        RevenueDistributor.Split memory s = _split();
        s.curatorBps = 999;
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RevenueDistributor.BpsMustSumTo10000.selector, uint256(9999)));
        dist.distribute{value: 1 ether}(SALE, 1, s);
    }

    function test_rejectsNonzeroShareToZeroAddress() public {
        RevenueDistributor.Split memory s = _split();
        s.curator = address(0);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(RevenueDistributor.PayoutFailed.selector, address(0), 0.1 ether));
        dist.distribute{value: 1 ether}(SALE, 1, s);
    }

    /// A sale with no curator is legitimate: 0 bps, zero address, no revert.
    function test_zeroBpsPartyMayHaveZeroAddress() public {
        RevenueDistributor.Split memory s = _split();
        s.curator = address(0);
        s.curatorBps = 0;
        s.platformBps = 3000;
        vm.prank(operator);
        dist.distribute{value: 10 ether}(SALE, 1, s);
        assertEq(platform.balance, 3 ether);
        assertEq(address(dist).balance, 0);
    }

    function test_saleIdIsSingleUse() public {
        vm.startPrank(operator);
        dist.distribute{value: 1 ether}(SALE, 1, _split());
        vm.expectRevert(abi.encodeWithSelector(RevenueDistributor.SaleAlreadyDistributed.selector, SALE));
        dist.distribute{value: 1 ether}(SALE, 1, _split());
        vm.stopPrank();
    }

    /// Rule 29: price history is append-only.
    function test_priceHistoryIsImmutable() public {
        vm.startPrank(operator);
        dist.distribute{value: 1 ether}(keccak256("s1"), 1, _split());
        dist.distribute{value: 3 ether}(keccak256("s2"), 1, _split());
        vm.stopPrank();

        uint256[] memory h = dist.priceHistory(1);
        assertEq(h.length, 2);
        assertEq(h[0], 1 ether, "first price rewritten");
        assertEq(h[1], 3 ether);
    }

    /// §118 amount cap.
    function test_amountCapEnforced() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(RevenueDistributor.AmountAboveCap.selector, 101 ether, 100 ether)
        );
        dist.distribute{value: 101 ether}(SALE, 1, _split());

        vm.prank(admin);
        dist.setMaxSaleValue(200 ether);
        vm.prank(operator);
        dist.distribute{value: 101 ether}(SALE, 1, _split());
    }

    function test_setMaxSaleValueIsAdminOnly() public {
        vm.prank(operator);
        vm.expectRevert(ArtwallUpgradeable.NotAdmin.selector);
        dist.setMaxSaleValue(1);
    }

    function test_onlyOperatorCanDistribute() public {
        vm.deal(stranger, 10 ether);
        vm.prank(stranger);
        vm.expectRevert(ArtwallUpgradeable.NotOperator.selector);
        dist.distribute{value: 1 ether}(SALE, 1, _split());
    }

    function test_rejectsZeroValue() public {
        vm.prank(operator);
        vm.expectRevert(RevenueDistributor.ZeroAmount.selector);
        dist.distribute{value: 0}(SALE, 1, _split());
    }

    function test_pauseBlocksDistribution() public {
        vm.prank(admin);
        dist.pause();
        vm.prank(operator);
        vm.expectRevert();
        dist.distribute{value: 1 ether}(SALE, 1, _split());
    }

    function test_reentrancyIsBlocked() public {
        ReenteringRecipient attacker = new ReenteringRecipient(dist);
        RevenueDistributor.Split memory s = _split();
        s.curator = address(attacker);
        attacker.arm(s);
        // Even if the attacker held OPERATOR_ROLE, the guard stops it — and
        // without the role it fails earlier. Either way the outer sale must
        // revert rather than pay twice.
        vm.prank(admin);
        dist.grantRole(dist.OPERATOR_ROLE(), address(attacker));

        vm.prank(operator);
        vm.expectRevert();
        dist.distribute{value: 10 ether}(SALE, 1, s);
        assertEq(artist.balance, 0);
        assertEq(address(dist).balance, 0);
    }
}
