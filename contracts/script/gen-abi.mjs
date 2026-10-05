// Regenerates src/lib/blockchain/abi.ts from the compiled Foundry artifact
// (BC-1.02: abi.ts must match the real contract exactly, never hand-written).
// Run: node contracts/script/gen-abi.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(__dirname, "..", "out", "ArtwallCOA.sol", "ArtwallCOA.json");
const outPath = join(__dirname, "..", "..", "src", "lib", "blockchain", "abi.ts");

const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const abi = artifact.abi;

const header = `// AUTO-GENERATED from contracts/out/ArtwallCOA.sol/ArtwallCOA.json by
// contracts/script/gen-abi.mjs (BC-1.02). Do not hand-edit — run
// \`forge build && node contracts/script/gen-abi.mjs\` after changing the
// contract instead.
export const artwallCoaAbi = ${JSON.stringify(abi, null, 2)} as const;

export const MINT_VOUCHER_DOMAIN = { name: "ArtwallCOA", version: "1" } as const;
export const MINT_VOUCHER_TYPES = {
  MintVoucher: [
    { name: "to", type: "address" },
    { name: "uri", type: "string" },
    { name: "royaltyReceiver", type: "address" },
    { name: "royaltyFeeBps", type: "uint96" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
`;

writeFileSync(outPath, header);
console.log(`Wrote ${outPath} (${abi.length} ABI entries)`);
