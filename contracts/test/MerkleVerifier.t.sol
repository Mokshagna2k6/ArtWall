// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MerkleVerifier} from "../src/MerkleVerifier.sol";

contract MerkleVerifierTest is Test {
    MerkleVerifier mv;

    address admin = address(0xAD41);
    address anchor = address(0xA11C40);
    address stranger = address(0x5717A26E);

    // A fixed 4-leaf tree built with OZ's sorted-pair hashing, the same
    // convention MerkleProof.verify uses.
    bytes32 leafA = keccak256(abi.encode("commitment-a"));
    bytes32 leafB = keccak256(abi.encode("commitment-b"));
    bytes32 leafC = keccak256(abi.encode("commitment-c"));
    bytes32 leafD = keccak256(abi.encode("commitment-d"));

    function setUp() public {
        mv = MerkleVerifier(
            address(
                new ERC1967Proxy(
                    address(new MerkleVerifier()), abi.encodeCall(MerkleVerifier.initialize, (admin, anchor))
                )
            )
        );
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    function _root() internal view returns (bytes32) {
        return _hashPair(_hashPair(leafA, leafB), _hashPair(leafC, leafD));
    }

    /// Proof for leafA: sibling leafB, then the right subtree hash.
    function _proofForA() internal view returns (bytes32[] memory p) {
        p = new bytes32[](2);
        p[0] = leafB;
        p[1] = _hashPair(leafC, leafD);
    }

    function _post() internal returns (bytes32 root, uint64 day) {
        root = _root();
        day = mv.currentDayIndex();
        vm.prank(anchor);
        mv.postRoot(root, day, 4);
    }

    function test_postRootStoresMetadata() public {
        (bytes32 root, uint64 day) = _post();
        MerkleVerifier.Root memory r = mv.getRoot(root);
        assertEq(r.dayIndex, day);
        assertEq(r.leafCount, 4);
        assertTrue(r.exists);
        assertEq(mv.rootOfDay(day), root);
        assertEq(mv.totalRoots(), 1);
    }

    function test_verifyValidProof() public {
        (bytes32 root,) = _post();
        assertTrue(mv.verifyProof(root, _proofForA(), leafA));
    }

    function test_verifyRejectsLeafNotInTree() public {
        (bytes32 root,) = _post();
        assertFalse(mv.verifyProof(root, _proofForA(), keccak256(abi.encode("forged"))));
    }

    function test_verifyRejectsTamperedProof() public {
        (bytes32 root,) = _post();
        bytes32[] memory p = _proofForA();
        p[0] = keccak256("wrong-sibling");
        assertFalse(mv.verifyProof(root, p, leafA));
    }

    function test_verifyRejectsTruncatedProof() public {
        (bytes32 root,) = _post();
        bytes32[] memory p = new bytes32[](1);
        p[0] = leafB;
        assertFalse(mv.verifyProof(root, p, leafA));
    }

    /// An unanchored root must revert, not quietly return false — otherwise a
    /// caller cannot tell "never anchored" from "not included".
    function test_verifyRevertsOnUnanchoredRoot() public {
        bytes32 fake = keccak256("never-posted");
        vm.expectRevert(abi.encodeWithSelector(MerkleVerifier.UnknownRoot.selector, fake));
        mv.verifyProof(fake, _proofForA(), leafA);
    }

    function test_verifyForDay() public {
        (, uint64 day) = _post();
        assertTrue(mv.verifyForDay(day, _proofForA(), leafA));

        vm.expectRevert(abi.encodeWithSelector(MerkleVerifier.UnknownRoot.selector, bytes32(0)));
        mv.verifyForDay(day + 1, _proofForA(), leafA);
    }

    function test_onlyAnchorCanPost() public {
        vm.prank(stranger);
        vm.expectRevert(MerkleVerifier.NotAnchor.selector);
        mv.postRoot(_root(), 1, 1);
    }

    function test_rootIsPermanentAndSinglePost() public {
        (bytes32 root, uint64 day) = _post();
        vm.prank(anchor);
        vm.expectRevert(abi.encodeWithSelector(MerkleVerifier.RootAlreadyPosted.selector, root));
        mv.postRoot(root, day + 1, 4);
    }

    /// §118 rate cap: one root per day, so a leaked anchor key cannot spam.
    function test_oneRootPerDay() public {
        (bytes32 root, uint64 day) = _post();
        bytes32 other = keccak256("another-root");
        vm.prank(anchor);
        vm.expectRevert(abi.encodeWithSelector(MerkleVerifier.DayAlreadyAnchored.selector, day, root));
        mv.postRoot(other, day, 1);

        // Next day is fine.
        vm.warp(block.timestamp + 1 days);
        vm.prank(anchor);
        mv.postRoot(other, mv.currentDayIndex(), 1);
        assertEq(mv.totalRoots(), 2);
    }

    function test_rejectsZeroRoot() public {
        vm.prank(anchor);
        vm.expectRevert(MerkleVerifier.ZeroRoot.selector);
        mv.postRoot(bytes32(0), 1, 1);
    }

    function test_pauseBlocksPosting() public {
        vm.prank(admin);
        mv.pause();
        vm.prank(anchor);
        vm.expectRevert();
        mv.postRoot(_root(), 1, 1);
    }

    /// Verification stays available while paused — reads must not be blocked
    /// by an incident pause.
    function test_verifyWorksWhilePaused() public {
        (bytes32 root,) = _post();
        vm.prank(admin);
        mv.pause();
        assertTrue(mv.verifyProof(root, _proofForA(), leafA));
    }
}
