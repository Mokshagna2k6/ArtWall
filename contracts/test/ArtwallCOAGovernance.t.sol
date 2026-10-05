// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArtwallCOA} from "../src/ArtwallCOA.sol";

/**
 * BC-3.01/3.02/3.05: role separation (PAUSER_ROLE, ANCHOR_ROLE split from
 * SIGNER_ROLE), Pausable, and the per-period mint cap backstop.
 */
contract ArtwallCOAGovernanceTest is Test {
    ArtwallCOA coa;

    uint256 signerKey = 0xA11CE;
    address signer;
    address admin = address(0xAD41);
    address artist = address(0xBEEF);
    address stranger = address(0x5717A26E);

    bytes32 constant MINT_VOUCHER_TYPEHASH = keccak256(
        "MintVoucher(address to,string uri,address royaltyReceiver,uint96 royaltyFeeBps,bytes32 nonce,uint256 deadline)"
    );

    function setUp() public {
        signer = vm.addr(signerKey);
        coa = new ArtwallCOA(admin, signer);
    }

    function _sign(ArtwallCOA.MintVoucher memory v, uint256 key) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                MINT_VOUCHER_TYPEHASH,
                v.to,
                keccak256(bytes(v.uri)),
                v.royaltyReceiver,
                v.royaltyFeeBps,
                v.nonce,
                v.deadline
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("ArtwallCOA")),
                keccak256(bytes("1")),
                block.chainid,
                address(coa)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 vS, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, vS);
    }

    function _voucher(address to, bytes32 nonce) internal view returns (ArtwallCOA.MintVoucher memory) {
        return ArtwallCOA.MintVoucher({
            to: to,
            uri: "ipfs://bafy-example",
            royaltyReceiver: artist,
            royaltyFeeBps: 500,
            nonce: nonce,
            deadline: block.timestamp + 1800
        });
    }

    // ── BC-3.01: role separation ────────────────────────────────────────────

    function testNoSingleEOAHoldsEveryRoleAtDeployment() public view {
        // admin holds DEFAULT_ADMIN_ROLE + PAUSER_ROLE + ANCHOR_ROLE, but NOT
        // SIGNER_ROLE; signer holds SIGNER_ROLE + ANCHOR_ROLE, but NOT
        // DEFAULT_ADMIN_ROLE or PAUSER_ROLE. Neither single EOA holds all four.
        assertTrue(coa.hasRole(coa.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(coa.hasRole(coa.PAUSER_ROLE(), admin));
        assertTrue(coa.hasRole(coa.ANCHOR_ROLE(), admin));
        assertFalse(coa.hasRole(coa.SIGNER_ROLE(), admin));

        assertTrue(coa.hasRole(coa.SIGNER_ROLE(), signer));
        assertTrue(coa.hasRole(coa.ANCHOR_ROLE(), signer));
        assertFalse(coa.hasRole(coa.DEFAULT_ADMIN_ROLE(), signer));
        assertFalse(coa.hasRole(coa.PAUSER_ROLE(), signer));
    }

    function testSignerAloneCannotPause() public {
        vm.prank(signer);
        vm.expectRevert("not pauser");
        coa.pause();
    }

    function testSignerAloneCannotSetMintCap() public {
        vm.prank(signer);
        vm.expectRevert("not admin");
        coa.setMintCap(1 hours, 10);
    }

    // ── BC-3.02: Pausable ────────────────────────────────────────────────────

    function testPauserCanPause() public {
        vm.prank(admin);
        coa.pause();
        assertTrue(coa.paused());
    }

    function testNonPauserCannotPause() public {
        vm.prank(stranger);
        vm.expectRevert("not pauser");
        coa.pause();
    }

    function testMintRevertsWhilePaused() public {
        vm.prank(admin);
        coa.pause();

        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("paused-1"));
        bytes memory sig = _sign(v, signerKey);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        coa.mintWithVoucher(v, sig);
    }

    function testCommitRootRevertsWhilePaused() public {
        vm.prank(admin);
        coa.pause();

        vm.prank(signer);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        coa.commitRoot(keccak256("paused-root"));
    }

    function testUnpauseRestoresMinting() public {
        vm.prank(admin);
        coa.pause();
        vm.prank(admin);
        coa.unpause();
        assertFalse(coa.paused());

        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("unpaused-1"));
        bytes memory sig = _sign(v, signerKey);
        uint256 tokenId = coa.mintWithVoucher(v, sig);
        assertEq(coa.ownerOf(tokenId), artist);
    }

    function testNonPauserCannotUnpause() public {
        vm.prank(admin);
        coa.pause();

        vm.prank(stranger);
        vm.expectRevert("not pauser");
        coa.unpause();
    }

    // ── BC-3.05: per-period mint cap ────────────────────────────────────────

    function testMintCapEnforcedWithinPeriod() public {
        vm.prank(admin);
        coa.setMintCap(1 days, 2);

        ArtwallCOA.MintVoucher memory v1 = _voucher(artist, keccak256("cap-1"));
        coa.mintWithVoucher(v1, _sign(v1, signerKey));

        ArtwallCOA.MintVoucher memory v2 = _voucher(artist, keccak256("cap-2"));
        coa.mintWithVoucher(v2, _sign(v2, signerKey));

        ArtwallCOA.MintVoucher memory v3 = _voucher(artist, keccak256("cap-3"));
        vm.expectRevert("mint cap exceeded for period");
        coa.mintWithVoucher(v3, _sign(v3, signerKey));
    }

    function testMintCapResetsAfterPeriodElapses() public {
        vm.prank(admin);
        coa.setMintCap(1 hours, 1);

        ArtwallCOA.MintVoucher memory v1 = _voucher(artist, keccak256("cap-reset-1"));
        coa.mintWithVoucher(v1, _sign(v1, signerKey));

        ArtwallCOA.MintVoucher memory v2 = _voucher(artist, keccak256("cap-reset-2"));
        vm.expectRevert("mint cap exceeded for period");
        coa.mintWithVoucher(v2, _sign(v2, signerKey));

        vm.warp(block.timestamp + 1 hours + 1);

        ArtwallCOA.MintVoucher memory v3 = _voucher(artist, keccak256("cap-reset-3"));
        uint256 tokenId = coa.mintWithVoucher(v3, _sign(v3, signerKey));
        assertEq(coa.ownerOf(tokenId), artist);
    }

    function testOnlyAdminCanRaiseMintCap() public {
        vm.prank(admin);
        coa.setMintCap(1 days, 1000);
        assertEq(coa.mintCapPerPeriod(), 1000);

        vm.prank(stranger);
        vm.expectRevert("not admin");
        coa.setMintCap(1 days, 999999);
    }

    function testDefaultMintCapIsGenerousEnoughForExistingTests() public view {
        // The default cap (500/day) must not break any pre-existing test
        // suite that mints a handful of vouchers per test run.
        assertGe(coa.mintCapPerPeriod(), 100);
    }
}
