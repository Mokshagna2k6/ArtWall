// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/ArtworkRegistry.sol";

contract ArtworkRegistryTest {
    ArtworkRegistry public registry;
    address constant SIGNER = address(0xAA);
    address constant ARTIST = address(0xBB);

    function setUp() public {
        registry = new ArtworkRegistry(SIGNER, "https://artwall.in/api/token/");
    }

    // ── Root commitment ───────────────────────────────────────────────────

    function testCommitRoot() public {
        bytes32 root = keccak256("root1");
        _asSigner();
        registry.commitRoot(root);
        assert(registry.committedRoots(root));
    }

    function testCommitRootNotSigner() public {
        bytes32 root = keccak256("root1");
        try registry.commitRoot(root) {
            revert("Should have reverted");
        } catch {}
    }

    function testCommitRootDuplicate() public {
        bytes32 root = keccak256("root1");
        _asSigner();
        registry.commitRoot(root);
        try registry.commitRoot(root) {
            revert("Should have reverted");
        } catch {}
    }

    // ── Minting ───────────────────────────────────────────────────────────

    function testMintSingleLeaf() public {
        bytes32 leaf = keccak256("artwork1");
        bytes32 root = leaf; // single-leaf tree: root == leaf
        bytes32[] memory proof = new bytes32[](0);

        _asSigner();
        registry.commitRoot(root);

        registry.mint(ARTIST, 1, leaf, proof, root, ARTIST, 500);

        assert(registry.ownerOf(1) == ARTIST);
        assert(registry.balanceOf(ARTIST) == 1);
        assert(registry.totalSupply() == 1);
    }

    function testMintRoyalty() public {
        bytes32 leaf = keccak256("art2");
        bytes32 root = leaf;
        bytes32[] memory proof = new bytes32[](0);

        _asSigner();
        registry.commitRoot(root);
        registry.mint(ARTIST, 2, leaf, proof, root, ARTIST, 750);

        (address receiver, uint256 amount) = registry.royaltyInfo(2, 10000);
        assert(receiver == ARTIST);
        assert(amount == 750); // 750 bps of 10000 = 750
    }

    function testMintDoubleFails() public {
        bytes32 leaf = keccak256("art3");
        bytes32 root = leaf;
        bytes32[] memory proof = new bytes32[](0);

        _asSigner();
        registry.commitRoot(root);
        registry.mint(ARTIST, 3, leaf, proof, root, ARTIST, 500);

        try registry.mint(ARTIST, 3, leaf, proof, root, ARTIST, 500) {
            revert("Should have reverted");
        } catch {}
    }

    // ── ERC-165 ───────────────────────────────────────────────────────────

    function testSupportsInterface() public view {
        assert(registry.supportsInterface(0x80ac58cd)); // ERC-721
        assert(registry.supportsInterface(0x2a55205a)); // ERC-2981
        assert(registry.supportsInterface(0x01ffc9a7)); // ERC-165
        assert(!registry.supportsInterface(0xdeadbeef));
    }

    // ── Transfer ──────────────────────────────────────────────────────────

    function testTransfer() public {
        bytes32 leaf = keccak256("art4");
        bytes32 root = leaf;
        bytes32[] memory proof = new bytes32[](0);

        _asSigner();
        registry.commitRoot(root);
        registry.mint(address(this), 4, leaf, proof, root, ARTIST, 500);

        registry.transferFrom(address(this), ARTIST, 4);
        assert(registry.ownerOf(4) == ARTIST);
        assert(registry.balanceOf(address(this)) == 0);
        assert(registry.balanceOf(ARTIST) == 1);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    // ponytail: Foundry test runner calls functions with msg.sender = test contract.
    // For signer-only functions, we use a prank-like approach via constructor trick.
    // In real Foundry this would be vm.prank(SIGNER), but we keep it dependency-free.
    // The setUp creates the registry with SIGNER but the test contract itself calls commitRoot.
    // So we re-deploy with address(this) as signer for tests that need signer access.
    function _asSigner() internal {
        registry = new ArtworkRegistry(address(this), "https://artwall.in/api/token/");
    }
}
