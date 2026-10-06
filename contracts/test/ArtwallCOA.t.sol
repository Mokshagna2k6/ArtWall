// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArtwallCOA} from "../src/ArtwallCOA.sol";

contract ArtwallCOATest is Test {
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

    // ── BC-1.03: mint requires authorization ───────────────────────────────

    function testMintWithValidVoucherSucceeds() public {
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n1"));
        bytes memory sig = _sign(v, signerKey);

        uint256 tokenId = coa.mintWithVoucher(v, sig);

        assertEq(coa.ownerOf(tokenId), artist);
        assertEq(coa.tokenURI(tokenId), "ipfs://bafy-example");
        assertEq(coa.totalMinted(), 1);
    }

    function testMintWithUnauthorizedSignerReverts() public {
        uint256 badKey = 0xBAD;
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n2"));
        bytes memory sig = _sign(v, badKey);

        vm.expectRevert("invalid voucher signature");
        coa.mintWithVoucher(v, sig);
    }

    function testMintCalledByAnyoneWithValidVoucherSucceeds() public {
        // mint authorization comes from the voucher signature, not msg.sender
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n3"));
        bytes memory sig = _sign(v, signerKey);

        vm.prank(stranger);
        uint256 tokenId = coa.mintWithVoucher(v, sig);
        assertEq(coa.ownerOf(tokenId), artist);
    }

    function testExpiredVoucherReverts() public {
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n4"));
        v.deadline = block.timestamp == 0 ? 0 : block.timestamp - 1;
        bytes memory sig = _sign(v, signerKey);

        vm.expectRevert("voucher expired");
        coa.mintWithVoucher(v, sig);
    }

    // ── BC-1.04: voucher binds recipient/royalty/uri/nonce/chain ───────────

    function testTamperedRecipientInvalidatesSignature() public {
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n5"));
        bytes memory sig = _sign(v, signerKey);

        v.to = stranger; // front-runner tries to redirect the mint
        vm.expectRevert("invalid voucher signature");
        coa.mintWithVoucher(v, sig);
    }

    function testTamperedRoyaltyInvalidatesSignature() public {
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n6"));
        bytes memory sig = _sign(v, signerKey);

        v.royaltyFeeBps = 50;
        vm.expectRevert("invalid voucher signature");
        coa.mintWithVoucher(v, sig);
    }

    function testVoucherBoundToThisContractDomain() public {
        // A voucher signed for a different verifying contract must not verify here.
        ArtwallCOA other = new ArtwallCOA(admin, signer);
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n7"));

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
                address(other) // signed for the OTHER contract
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 vS, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, vS);

        vm.expectRevert("invalid voucher signature");
        coa.mintWithVoucher(v, sig); // tried against `coa`, signed for `other`
    }

    // ── BC-1.05: nonce replay protection ────────────────────────────────────

    function testReusedNonceReverts() public {
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n8"));
        bytes memory sig = _sign(v, signerKey);
        coa.mintWithVoucher(v, sig);

        ArtwallCOA.MintVoucher memory v2 = _voucher(stranger, keccak256("n8")); // same nonce, different recipient
        bytes memory sig2 = _sign(v2, signerKey);
        vm.expectRevert("nonce already used");
        coa.mintWithVoucher(v2, sig2);
    }

    // ── BC-1.06: ERC-721 + ERC-2981 compliance ─────────────────────────────

    function testSupportsInterface() public view {
        assertTrue(coa.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(coa.supportsInterface(0x2a55205a)); // ERC-2981
        assertTrue(coa.supportsInterface(0x01ffc9a7)); // ERC-165
        assertFalse(coa.supportsInterface(0xdeadbeef));
    }

    function testSafeTransferFromAndApprove() public {
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n9"));
        bytes memory sig = _sign(v, signerKey);
        uint256 tokenId = coa.mintWithVoucher(v, sig);

        vm.prank(artist);
        coa.approve(stranger, tokenId);
        assertEq(coa.getApproved(tokenId), stranger);

        vm.prank(stranger);
        coa.safeTransferFrom(artist, stranger, tokenId);
        assertEq(coa.ownerOf(tokenId), stranger);
    }

    function testRoyaltyInfo() public {
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n10"));
        bytes memory sig = _sign(v, signerKey);
        uint256 tokenId = coa.mintWithVoucher(v, sig);

        (address receiver, uint256 amount) = coa.royaltyInfo(tokenId, 10_000);
        assertEq(receiver, artist);
        assertEq(amount, 500); // 500 bps of 10000
    }

    function testRoyaltyAboveCapReverts() public {
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n11"));
        v.royaltyFeeBps = 1001; // > MAX_ROYALTY_BPS (1000)
        bytes memory sig = _sign(v, signerKey);

        vm.expectRevert("royalty exceeds cap");
        coa.mintWithVoucher(v, sig);
    }

    // ── BC-1.07: zero-address / burn guards ─────────────────────────────────

    function testMintToZeroAddressReverts() public {
        ArtwallCOA.MintVoucher memory v = _voucher(address(0), keccak256("n12"));
        bytes memory sig = _sign(v, signerKey);

        vm.expectRevert("mint to zero address");
        coa.mintWithVoucher(v, sig);
    }

    function testTransferToZeroAddressReverts() public {
        ArtwallCOA.MintVoucher memory v = _voucher(artist, keccak256("n13"));
        bytes memory sig = _sign(v, signerKey);
        uint256 tokenId = coa.mintWithVoucher(v, sig);

        // OpenZeppelin's ERC721 itself rejects a transfer to the zero address
        // (it would be indistinguishable from a burn) before our explicit
        // burning-disabled guard in _update is reached.
        vm.prank(artist);
        vm.expectRevert(abi.encodeWithSignature("ERC721InvalidReceiver(address)", address(0)));
        coa.transferFrom(artist, address(0), tokenId);
    }

    // ── commitRoot (signer-gated provenance anchoring) ─────────────────────

    // BC-3.01: commitRoot is gated by ANCHOR_ROLE (split out from
    // SIGNER_ROLE as its own role), granted to BOTH admin and signer at
    // construction — signer keeps working unchanged (gateway.ts's
    // submitRootOnChain signs with the same key today), while the admin
    // multisig can later delegate ANCHOR_ROLE to a narrower dedicated key.
    function testCommitRootBySignerSucceeds() public {
        bytes32 root = keccak256("root1");
        vm.prank(signer);
        coa.commitRoot(root);
        assertTrue(coa.committedRoots(root));
    }

    function testCommitRootByNonAnchorReverts() public {
        bytes32 root = keccak256("root2");
        vm.prank(stranger);
        vm.expectRevert("not anchor");
        coa.commitRoot(root);
    }

    function testCommitRootByAdminSucceeds() public {
        bytes32 root = keccak256("root-admin");
        vm.prank(admin);
        coa.commitRoot(root);
        assertTrue(coa.committedRoots(root));
    }

    function testCommitRootDuplicateReverts() public {
        bytes32 root = keccak256("root3");
        vm.prank(signer);
        coa.commitRoot(root);

        vm.prank(signer);
        vm.expectRevert("root already committed");
        coa.commitRoot(root);
    }

    function testNoBurnFunctionExposed() public {
        // ArtwallCOA exposes no `burn` selector at all.
        (bool found,) = address(coa).call(abi.encodeWithSignature("burn(uint256)", 1));
        // call succeeds only if the fallback silently handles it; ERC721 has
        // no receive/fallback so any such call must fail.
        assertFalse(found);
    }
}
