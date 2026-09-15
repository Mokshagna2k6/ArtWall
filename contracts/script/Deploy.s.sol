// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/ArtworkRegistry.sol";

// ponytail: minimal deploy script for Foundry. Run with:
//   forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
// Real Foundry Script base class needs forge-std; this is a plain contract
// that can be used with `forge create` instead:
//   forge create src/ArtworkRegistry.sol:ArtworkRegistry --constructor-args $SIGNER_ADDRESS "https://artwall.in/api/token/"

contract Deploy {
    function run() external {
        // When using forge-std Script:
        //   vm.startBroadcast();
        //   new ArtworkRegistry(msg.sender, "https://artwall.in/api/token/");
        //   vm.stopBroadcast();
    }
}
