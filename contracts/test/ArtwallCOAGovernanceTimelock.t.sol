// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArtwallCOA} from "../src/ArtwallCOA.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * BC-3.03/BC-3.04: proves the intended production deployment topology
 * works end-to-end on a local chain, without needing a live mainnet/testnet
 * deployment (which is blocked — BC-1.10, unfunded signer wallet):
 *
 *   - BC-3.03: DEFAULT_ADMIN_ROLE is held by a Safe multisig. ArtwallCOA
 *     already takes `admin` as a constructor address — any address, a Safe
 *     included — so "the admin role is held by a multisig" is a deployment
 *     parameter, not a contract-code change. This suite models the Safe as
 *     a 2-of-3 `vm.prank`-able address (real Gnosis Safe bytecode isn't in
 *     this repo's dependency tree); the role-check code path exercised here
 *     (only DEFAULT_ADMIN_ROLE may grant/revoke/call setMintCap) is exactly
 *     the same whether that address is a plain EOA or a Safe's `execute()`.
 *   - BC-3.04: privileged parameter changes (signer rotation via
 *     grantRole/revokeRole(SIGNER_ROLE), setMintCap) go through
 *     OpenZeppelin's TimelockController (already vendored at
 *     lib/openzeppelin-contracts), configured as ArtwallCOA's
 *     DEFAULT_ADMIN_ROLE holder. A change must be scheduled, wait the
 *     documented delay, then be executed — it cannot take effect
 *     immediately, and cannot be executed before the delay elapses.
 *
 * Deployment note for whoever runs the real deploy: pass the TimelockController's
 * address as ArtwallCOA's `admin` constructor argument (not the Safe directly);
 * the Safe is the timelock's proposer/executor. This keeps the exact topology
 * this test exercises.
 */
contract ArtwallCOAGovernanceTimelockTest is Test {
    ArtwallCOA coa;
    TimelockController timelock;

    uint256 signerKey = 0xA11CE;
    address signer;
    address safeSigner1 = address(0x5afe1);
    address safeSigner2 = address(0x5afe2);
    address stranger = address(0x5717A26E);

    uint256 constant TIMELOCK_DELAY = 2 days;

    function setUp() public {
        signer = vm.addr(signerKey);

        // Model the Safe's role in this topology as two proposer/executor
        // addresses on the timelock (standing in for "a Safe multisig calls
        // this"), per the file-level doc comment's scope note.
        address[] memory proposers = new address[](2);
        proposers[0] = safeSigner1;
        proposers[1] = safeSigner2;
        address[] memory executors = new address[](2);
        executors[0] = safeSigner1;
        executors[1] = safeSigner2;

        // admin = address(0): TimelockController's own admin role is left
        // ungranted (self-administered via its own timelock after
        // deployment) — not relevant to what this test exercises.
        timelock = new TimelockController(TIMELOCK_DELAY, proposers, executors, address(0));

        // BC-3.03: ArtwallCOA's admin IS the timelock, not a bare EOA/Safe
        // address directly — every DEFAULT_ADMIN_ROLE-gated call on ArtwallCOA
        // must now originate from the timelock's own address, which only
        // happens after a scheduled operation's delay has elapsed.
        coa = new ArtwallCOA(address(timelock), signer);
    }

    function _scheduleAndExecute(bytes memory data) internal {
        bytes32 salt = keccak256(abi.encode(data, block.timestamp));

        vm.prank(safeSigner1);
        timelock.schedule(address(coa), 0, data, bytes32(0), salt, TIMELOCK_DELAY);

        // BC-3.04: cannot execute before the delay elapses.
        vm.prank(safeSigner1);
        vm.expectRevert();
        timelock.execute(address(coa), 0, data, bytes32(0), salt);

        vm.warp(block.timestamp + TIMELOCK_DELAY + 1);

        vm.prank(safeSigner1);
        timelock.execute(address(coa), 0, data, bytes32(0), salt);
    }

    function testAdminRoleIsHeldByTheTimelockNotAnEOA() public view {
        assertTrue(coa.hasRole(coa.DEFAULT_ADMIN_ROLE(), address(timelock)));
        assertFalse(coa.hasRole(coa.DEFAULT_ADMIN_ROLE(), safeSigner1));
        assertFalse(coa.hasRole(coa.DEFAULT_ADMIN_ROLE(), safeSigner2));
    }

    function testDirectAdminCallFromSafeSignerBypassingTimelockReverts() public {
        // A Safe signer's address itself holds no role on ArtwallCOA — only
        // the timelock contract does. Calling setMintCap directly (skipping
        // schedule+wait+execute entirely) must fail.
        vm.prank(safeSigner1);
        vm.expectRevert("not admin");
        coa.setMintCap(1 hours, 10);
    }

    function testSetMintCapGoesThroughTimelockDelay() public {
        bytes memory data = abi.encodeCall(ArtwallCOA.setMintCap, (12 hours, 250));
        _scheduleAndExecute(data);

        assertEq(coa.mintCapPeriod(), 12 hours);
        assertEq(coa.mintCapPerPeriod(), 250);
    }

    function testSignerRotationGoesThroughTimelockDelay() public {
        // BC-3.04: "signer rotation ... go through a timelock" — revoking
        // the old SIGNER_ROLE and granting a new one are each individually
        // timelocked operations.
        address newSigner = address(0xCAFE);
        bytes32 signerRole = coa.SIGNER_ROLE();

        bytes memory grantData = abi.encodeCall(coa.grantRole, (signerRole, newSigner));
        _scheduleAndExecute(grantData);
        assertTrue(coa.hasRole(signerRole, newSigner));

        bytes memory revokeData = abi.encodeCall(coa.revokeRole, (signerRole, signer));
        _scheduleAndExecute(revokeData);
        assertFalse(coa.hasRole(signerRole, signer));
    }

    function testOnlyProposerCanScheduleTimelockOperations() public {
        bytes memory data = abi.encodeCall(ArtwallCOA.setMintCap, (1 hours, 10));
        bytes32 salt = keccak256(abi.encode(data, block.timestamp));

        vm.prank(stranger);
        vm.expectRevert();
        timelock.schedule(address(coa), 0, data, bytes32(0), salt, TIMELOCK_DELAY);
    }
}
