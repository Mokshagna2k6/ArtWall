// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ArtwallCOA} from "../src/ArtwallCOA.sol";

/**
 * Deploys ArtwallCOA (BC-1.09). Constructor args from env:
 *   DEPLOY_ADMIN_ADDRESS   - DEFAULT_ADMIN_ROLE holder (defaults to the deployer)
 *   NEXT_PUBLIC_MINT_SIGNER_ADDRESS - SIGNER_ROLE holder (the off-chain voucher signer)
 *
 * Run:
 *   forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL \
 *     --private-key $MINT_SIGNER_PRIVATE_KEY --broadcast -vvvv
 */
contract Deploy is Script {
    function run() external returns (address deployed) {
        uint256 deployerKey = vm.envUint("MINT_SIGNER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address admin = vm.envOr("DEPLOY_ADMIN_ADDRESS", deployer);
        address signer = vm.envOr("NEXT_PUBLIC_MINT_SIGNER_ADDRESS", deployer);

        vm.startBroadcast(deployerKey);
        ArtwallCOA coa = new ArtwallCOA(admin, signer);
        vm.stopBroadcast();

        deployed = address(coa);
        console.log("ArtwallCOA deployed at:", deployed);
        console.log("admin:", admin);
        console.log("signer:", signer);
    }
}
