// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArtwallCOA} from "../src/ArtwallCOA.sol";

/**
 * BC-2.01: named tests for the voucher/role-check edge cases not already
 * covered by ArtwallCOA.t.sol (BC-1's suite) — wrong signer (already covered
 * there as testMintWithUnauthorizedSignerReverts), expired voucher (already
 * covered there too), wrong chainId, replayed nonce (already covered),
 * royalty cap (already covered), and role checks (MINTER/SIGNER/ADMIN).
 *
 * Pause behavior: ArtwallCOA became Pausable in BC-3.02 — see
 * ArtwallCOAGovernance.t.sol for pause/unpause and role-separation coverage
 * (PAUSER_ROLE, ANCHOR_ROLE, the per-period mint cap).
 */
contract ArtwallCOASecurityTest is Test {
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

    function _digestFor(ArtwallCOA.MintVoucher memory v, uint256 chainId, address verifyingContract)
        internal
        pure
        returns (bytes32)
    {
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
                chainId,
                verifyingContract
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
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

    // ── BC-2.01: wrong chainId in the signed domain ────────────────────────

    function testVoucherSignedForWrongChainIdReverts() public {
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("chainid-1"));
        bytes32 digest = _digestFor(v, block.chainid + 1, address(coa)); // wrong chain
        (uint8 vS, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, vS);

        vm.expectRevert("invalid voucher signature");
        coa.mintWithVoucher(v, sig);
    }

    // ── BC-2.01: role checks (SIGNER_ROLE / DEFAULT_ADMIN_ROLE) ────────────

    function testSignerRoleGrantedAtConstruction() public view {
        assertTrue(coa.hasRole(coa.SIGNER_ROLE(), signer));
        assertFalse(coa.hasRole(coa.SIGNER_ROLE(), stranger));
    }

    function testAdminRoleGrantedAtConstruction() public view {
        assertTrue(coa.hasRole(coa.DEFAULT_ADMIN_ROLE(), admin));
        assertFalse(coa.hasRole(coa.DEFAULT_ADMIN_ROLE(), stranger));
    }

    function testAdminCanGrantSignerRole() public {
        // coa.SIGNER_ROLE() is itself an external call; evaluating it as an
        // argument expression would consume vm.prank's single pranked call
        // before grantRole ever runs. Read it into a local first.
        bytes32 signerRole = coa.SIGNER_ROLE();
        vm.prank(admin);
        coa.grantRole(signerRole, stranger);
        assertTrue(coa.hasRole(signerRole, stranger));
    }

    function testNonAdminCannotGrantSignerRole() public {
        bytes32 signerRole = coa.SIGNER_ROLE();
        vm.prank(stranger);
        vm.expectRevert();
        coa.grantRole(signerRole, stranger);
    }

    function testAdminCanRevokeSignerRole() public {
        bytes32 signerRole = coa.SIGNER_ROLE();
        vm.prank(admin);
        coa.revokeRole(signerRole, signer);
        assertFalse(coa.hasRole(signerRole, signer));

        // A voucher from the now-revoked signer must no longer mint.
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("revoked-signer"));
        bytes32 digest = _digestFor(v, block.chainid, address(coa));
        (uint8 vS, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, vS);

        vm.expectRevert("invalid voucher signature");
        coa.mintWithVoucher(v, sig);
    }

    // There is no MINTER_ROLE in ArtwallCOA — minting authorization comes
    // entirely from the voucher signature (any address can call
    // mintWithVoucher, as already covered by testMintCalledByAnyoneWithValidVoucherSucceeds
    // in ArtwallCOA.t.sol). This test documents that absence explicitly so a
    // future reader does not assume a role gate exists on the call itself.
    function testNoMinterRoleGateOnMintCall() public {
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("no-minter-role"));
        bytes32 digest = _digestFor(v, block.chainid, address(coa));
        (uint8 vS, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, vS);

        vm.prank(stranger); // not granted any role at all
        uint256 tokenId = coa.mintWithVoucher(v, sig);
        assertEq(coa.ownerOf(tokenId), artist);
    }

    // ── BC-2.02: fuzz test on mint parameters ──────────────────────────────

    function testFuzz_MintWithVoucher(
        address to,
        uint96 royaltyFeeBps,
        uint256 deadlineOffset
    ) public {
        vm.assume(to != address(0));
        // Foundry's own cheatcode VM (address(vm)) and console.log precompile
        // addresses must not be fuzzed as a mint recipient: _safeMint's
        // onERC721Received probe against them produces confusing
        // "unknown cheatcode"-style failures that are a test-harness
        // artifact, not a real contract bug.
        vm.assume(to != address(vm));
        vm.assume(to != 0x000000000000000000636F6e736F6c652e6c6f67); // console.log
        vm.assume(deadlineOffset > 0 && deadlineOffset < 365 days);
        royaltyFeeBps = uint96(bound(royaltyFeeBps, 0, coa.MAX_ROYALTY_BPS()));

        ArtwallCOA.MintVoucher memory v = ArtwallCOA.MintVoucher({
            to: to,
            uri: "ipfs://bafy-fuzz",
            royaltyReceiver: to,
            royaltyFeeBps: royaltyFeeBps,
            nonce: keccak256(abi.encode(to, royaltyFeeBps, deadlineOffset)),
            deadline: block.timestamp + deadlineOffset
        });
        bytes32 digest = _digestFor(v, block.chainid, address(coa));
        (uint8 vS, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, vS);

        uint256 tokenId = coa.mintWithVoucher(v, sig);
        assertEq(coa.ownerOf(tokenId), to);

        (address receiver, uint256 royaltyAmount) = coa.royaltyInfo(tokenId, 10_000);
        if (royaltyFeeBps > 0) assertEq(receiver, to);
        assertLe(royaltyAmount, (10_000 * uint256(coa.MAX_ROYALTY_BPS())) / 10_000);
    }

    function testFuzz_RoyaltyAboveCapAlwaysReverts(uint96 royaltyFeeBps) public {
        royaltyFeeBps = uint96(bound(royaltyFeeBps, coa.MAX_ROYALTY_BPS() + 1, type(uint96).max));

        ArtwallCOA.MintVoucher memory v = ArtwallCOA.MintVoucher({
            to: artist,
            uri: "ipfs://bafy-fuzz-cap",
            royaltyReceiver: artist,
            royaltyFeeBps: royaltyFeeBps,
            nonce: keccak256(abi.encode("cap", royaltyFeeBps)),
            deadline: block.timestamp + 1800
        });
        bytes32 digest = _digestFor(v, block.chainid, address(coa));
        (uint8 vS, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, vS);

        vm.expectRevert("royalty exceeds cap");
        coa.mintWithVoucher(v, sig);
    }
}
