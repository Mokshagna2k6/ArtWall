// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArtwallCOA} from "../src/ArtwallCOA.sol";

/**
 * BC-2.02: handler-driven invariant suite. The handler is the only contract
 * targeted by the fuzzer; it always mints through a validly-signed voucher
 * (the platform signer's key is available to the test harness, not to an
 * attacker) so the invariants below hold under any sequence of such mints:
 *   - a token id is never minted twice (each mint assigns a fresh, unused id)
 *   - royalty is never above MAX_ROYALTY_BPS, for any minted token
 */
contract ArtwallCOAHandler is Test {
    ArtwallCOA public coa;
    uint256 internal signerKey;

    uint256[] public mintedTokenIds;
    mapping(uint256 => bool) public seenTokenId;
    uint256 internal nonceCounter;

    constructor(ArtwallCOA _coa, uint256 _signerKey) {
        coa = _coa;
        signerKey = _signerKey;
    }

    function _sign(ArtwallCOA.MintVoucher memory v) internal view returns (bytes memory) {
        bytes32 typehash = keccak256(
            "MintVoucher(address to,string uri,address royaltyReceiver,uint96 royaltyFeeBps,bytes32 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(
            abi.encode(typehash, v.to, keccak256(bytes(v.uri)), v.royaltyReceiver, v.royaltyFeeBps, v.nonce, v.deadline)
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
        (uint8 vS, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, vS);
    }

    /// @dev Fuzzed handler entrypoint: always a validly-signed voucher with a
    ///      fresh nonce, fuzzing only `to` and `royaltyFeeBps` (bounded to the
    ///      valid range so this models legitimate platform-signed mints —
    ///      invalid-signature paths are exercised by the regular tests, not
    ///      the invariant handler).
    function mint(address to, uint96 royaltyFeeBps) external {
        if (to == address(0)) to = address(0xBEEF);
        royaltyFeeBps = uint96(bound(royaltyFeeBps, 0, coa.MAX_ROYALTY_BPS()));

        ArtwallCOA.MintVoucher memory v = ArtwallCOA.MintVoucher({
            to: to,
            uri: "ipfs://bafy-invariant",
            royaltyReceiver: to,
            royaltyFeeBps: royaltyFeeBps,
            nonce: keccak256(abi.encode("invariant", nonceCounter++)),
            deadline: block.timestamp + 1800
        });
        bytes memory sig = _sign(v);
        uint256 tokenId = coa.mintWithVoucher(v, sig);

        // Handler-side bookkeeping for the "never minted twice" invariant.
        require(!seenTokenId[tokenId], "handler saw duplicate token id");
        seenTokenId[tokenId] = true;
        mintedTokenIds.push(tokenId);
    }

    function mintedCount() external view returns (uint256) {
        return mintedTokenIds.length;
    }

    function mintedTokenIdAt(uint256 i) external view returns (uint256) {
        return mintedTokenIds[i];
    }
}

contract ArtwallCOAInvariantTest is Test {
    ArtwallCOA coa;
    ArtwallCOAHandler handler;

    uint256 signerKey = 0xA11CE;
    address signer;
    address admin = address(0xAD41);

    function setUp() public {
        signer = vm.addr(signerKey);
        coa = new ArtwallCOA(admin, signer);
        handler = new ArtwallCOAHandler(coa, signerKey);
        targetContract(address(handler));

        // BC-3.05: this invariant run issues far more mints per run (up to
        // invariant.depth = 25, invariant.runs = 64, i.e. up to 1600 calls)
        // than the per-period mint cap's production default (500/day) allows
        // within one unmoved block.timestamp — raise the cap here so this
        // suite keeps exercising mint-sequence invariants, not the cap itself
        // (the cap's own enforcement is covered by ArtwallCOAGovernance.t.sol).
        vm.prank(admin);
        coa.setMintCap(1 days, 10_000);
    }

    /// @dev "A token id cannot be minted twice": every id the handler's mints
    ///      produced is unique and currently owned (ownerOf does not revert),
    ///      checked by replaying the handler's own mint log against the
    ///      contract's actual owner records after each fuzz sequence.
    function invariant_TokenIdsNeverMintedTwice() public view {
        uint256 count = handler.mintedCount();
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = handler.mintedTokenIdAt(i);
            for (uint256 j = i + 1; j < count; j++) {
                assertNotEq(tokenId, handler.mintedTokenIdAt(j), "duplicate token id minted");
            }
            // Owned by someone — mintWithVoucher's _safeMint would have
            // reverted on a real double-mint of the same _nextTokenId value.
            assertTrue(coa.ownerOf(tokenId) != address(0));
        }
    }

    /// @dev "Royalty is never above the cap": for every minted token, the
    ///      ERC-2981 royalty amount at any sale price is bounded by
    ///      MAX_ROYALTY_BPS of that price.
    function invariant_RoyaltyNeverAboveCap() public view {
        uint256 count = handler.mintedCount();
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = handler.mintedTokenIdAt(i);
            (, uint256 royaltyAmount) = coa.royaltyInfo(tokenId, 10_000);
            assertLe(royaltyAmount, coa.MAX_ROYALTY_BPS());
        }
    }

    /// @dev totalMinted must always equal the number of successful handler
    ///      mints — a direct cross-check that no mint silently double-counted
    ///      or dropped a token id.
    function invariant_TotalMintedMatchesHandlerCount() public view {
        assertEq(coa.totalMinted(), handler.mintedCount());
    }
}
