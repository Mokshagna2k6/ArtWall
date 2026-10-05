import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import {
  createWalletClient,
  createPublicClient,
  http,
  defineChain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeProfile, makeUser, purgeTestData, q } from "@/test/fixtures";

/**
 * BC-2.10: integration coverage for the mint-voucher, confirm, IPFS upload
 * and certificates routes against a REAL local anvil chain — not a mocked
 * verifyMintTx. This is the one piece of BC-2.10's four routes that the
 * existing nft-routes.db.test.ts cannot cover (it mocks chain.ts entirely),
 * so here only Pinata is faked; every chain read/write
 * (publicClientFor/verifyMintTx/the mint-voucher's eventual on-chain
 * submission) talks to a real anvil instance over its RPC.
 *
 * Skips itself (rather than failing CI) when neither `anvil`/`forge` is on
 * PATH nor installed at the default foundryup location — this suite needs
 * an external binary the sandboxed CI image may not always carry, same
 * spirit as the dpdp.db.test's Cloudinary skip in vitest.db.config.ts.
 */

function foundryBin(name: "anvil" | "forge"): string | null {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const onPath = spawnSync(exe, ["--version"], { stdio: "ignore" });
  if (!onPath.error) return exe;
  const fallback = join(homedir(), ".foundry", "bin", exe);
  if (existsSync(fallback)) return fallback;
  return null;
}

const anvilBin = foundryBin("anvil");
const forgeBin = foundryBin("forge");
const haveFoundry = Boolean(anvilBin && forgeBin);

const ANVIL_PORT = 8646; // distinct from foundryup/other local anvil defaults
const ANVIL_RPC = `http://127.0.0.1:${ANVIL_PORT}`;
// anvil's well-known default dev account #0 — funded with 10000 ETH at genesis.
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
// Account #1 — used as the platform voucher signer, matching
// MINT_SIGNER_PRIVATE_KEY so SIGNER_ROLE is granted to it at deploy time.
const SIGNER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;

const anvilChain = defineChain({
  // Matches NEXT_PUBLIC_DEFAULT_CHAIN_ID below (84532) rather than anvil's
  // own default 31337 — the EIP-712 domain separator both the mint-voucher
  // route and the deployed contract compute includes the REAL chain id
  // (block.chainid on-chain, DEFAULT_CHAIN_ID off-chain), so they must
  // agree for the voucher signature to validate.
  id: 84532,
  name: "anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
});

const env = {
  MINT_SIGNER_PRIVATE_KEY: SIGNER_KEY,
  NEXT_PUBLIC_DEFAULT_CHAIN_ID: "84532", // DEFAULT_CHAIN_ID is read once at chain.ts module load
  BASE_SEPOLIA_RPC_URL: ANVIL_RPC, // chainId 84532's RPC is pointed at anvil instead of real Base Sepolia
  MINT_REQUIRED_CONFIRMATIONS: "1", // anvil mines instantly; 1 confirmation is enough to exercise verifyMintTx for real
  CRON_SECRET: "test-cron-secret",
};
Object.assign(process.env, env);

let anvilProc: ChildProcessWithoutNullStreams | null = null;
let contractAddress: Hex | null = null;

async function waitForAnvil(): Promise<void> {
  const client = createPublicClient({ chain: anvilChain, transport: http(ANVIL_RPC) });
  for (let i = 0; i < 50; i++) {
    try {
      await client.getBlockNumber();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("anvil did not become ready in time");
}

function deployContract(): Hex {
  const admin = privateKeyToAccount(DEPLOYER_KEY).address;
  const signer = privateKeyToAccount(SIGNER_KEY).address;
  // forge create compiles (if needed) and deploys in one step — the same
  // tool contracts/script/Deploy.s.sol itself wraps, just invoked directly
  // against anvil instead of broadcasting to Base Sepolia.
  const res = spawnSync(
    forgeBin!,
    [
      "create",
      "src/ArtwallCOA.sol:ArtwallCOA",
      "--rpc-url",
      ANVIL_RPC,
      "--private-key",
      DEPLOYER_KEY,
      "--broadcast",
      "--json",
      "--constructor-args",
      admin,
      signer,
    ],
    { cwd: join(process.cwd(), "contracts"), encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(`forge create failed: ${res.stdout}\n${res.stderr}`);
  }
  const parsed = JSON.parse(res.stdout.trim());
  return parsed.deployedTo as Hex;
}

beforeAll(async () => {
  if (!haveFoundry) return;
  anvilProc = spawn(anvilBin!, ["--port", String(ANVIL_PORT), "--chain-id", "84532", "--silent"]);
  await waitForAnvil();
  contractAddress = deployContract();
  process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS = contractAddress;
}, 60_000);

afterAll(async () => {
  anvilProc?.kill();
  await purgeTestData();
});

beforeEach(() => {
  actAs(null);
});

const WALLET_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex; // anvil default account #2
const wallet = privateKeyToAccount(WALLET_KEY);

const post = (body: unknown = {}) =>
  new NextRequest("http://localhost/api", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe.runIf(haveFoundry)("NFT routes against a real local anvil chain (BC-2.10)", () => {
  it("mint-voucher -> real on-chain mintWithVoucher -> confirm sees a genuinely confirmed tx", async () => {
    const pinnedMetadata = { lastMetadata: null as Record<string, unknown> | null };
    const { vi } = await import("vitest");
    vi.doMock("@/lib/blockchain/pinata", () => ({
      pinata: {
        upload: {
          public: {
            json: vi.fn(async (metadata: Record<string, unknown>) => {
              pinnedMetadata.lastMetadata = metadata;
              return { cid: "bafytestmetadata-anvil" };
            }),
          },
        },
      },
    }));
    const { POST: createCert } = await import("@/app/api/blockchain/certificates/route");
    const { POST: voucher } = await import("@/app/api/blockchain/certificates/[id]/mint-voucher/route");
    const { POST: confirm } = await import("@/app/api/blockchain/certificates/[id]/confirm/route");
    const { artwallCoaAbi } = await import("@/lib/blockchain/abi");

    const artist = await makeUser();
    await makeProfile(artist.id, { wallet: wallet.address });
    const art = await makeArtwork(artist.id);
    actAs(artist);

    const createRes = await createCert(
      post({ artworkId: art, imageCid: "bafyimage-anvil", creatorName: "Anvil Artist" }),
    );
    expect(createRes.status).toBe(200);
    const { id } = await createRes.json();

    // mint-voucher route signs a real EIP-712 voucher against the deployed
    // anvil contract's own address/chainId — the exact domain mintWithVoucher
    // on-chain will check.
    const voucherRes = await voucher(post(), params(id));
    expect(voucherRes.status).toBe(200);
    const { voucher: v, signature } = await voucherRes.json();

    // Submit the signed voucher as a REAL transaction to the anvil chain —
    // this is the step the client wallet performs in production; here a
    // plain viem wallet client plays that role so the whole chain (sign ->
    // broadcast -> mine -> read back via verifyMintTx) runs for real.
    const walletClient = createWalletClient({
      account: wallet,
      chain: anvilChain,
      transport: http(ANVIL_RPC),
    });
    const txHash = await walletClient.writeContract({
      address: contractAddress!,
      abi: artwallCoaAbi,
      functionName: "mintWithVoucher",
      args: [
        {
          to: v.to,
          uri: v.uri,
          royaltyReceiver: v.royaltyReceiver,
          royaltyFeeBps: v.royaltyFeeBps,
          nonce: v.nonce,
          deadline: BigInt(v.deadline),
        },
        signature,
      ],
    });

    const publicClient = createPublicClient({ chain: anvilChain, transport: http(ANVIL_RPC) });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    expect(receipt.status).toBe("success");
    // One more block so verifyMintTx's confirmations >= MINT_REQUIRED_CONFIRMATIONS(1) holds.
    await walletClient.sendTransaction({ to: wallet.address, value: 0n });

    await q(`update coa_certificates set status = 'minting', "txHash" = $2, "mintRequestedAt" = now() where id = $1`, [
      id,
      txHash,
    ]);

    // confirm route calls the real (unmocked) verifyMintTx -> publicClientFor(84532)
    // -> anvil over BASE_SEPOLIA_RPC_URL, reads the real receipt + real
    // CertificateMinted log, and only then marks the certificate minted.
    const confirmRes = await confirm(post({}), params(id));
    const confirmBody = await confirmRes.json();
    expect(confirmBody.status).toBe("minted");
    expect(confirmBody.tokenId).toBeDefined();

    const [row] = await q<{ status: string; tokenId: string; contractAddr: string }>(
      `select status, "tokenId", "contractAddr" from coa_certificates where id = $1`,
      [id],
    );
    expect(row.status).toBe("minted");
    expect(row.contractAddr.toLowerCase()).toBe(contractAddress!.toLowerCase());

    // BC-2.12: verifyTokenOnChain against the same real chain confirms the
    // token genuinely exists and owns the right tokenURI.
    const { verifyTokenOnChain } = await import("@/lib/blockchain/chain");
    const onChain = await verifyTokenOnChain(row.tokenId, 84532, contractAddress!, v.uri);
    expect(onChain.verified).toBe(true);
    if (onChain.verified) {
      expect(onChain.owner.toLowerCase()).toBe(wallet.address.toLowerCase());
      expect(onChain.tokenUriMatches).toBe(true);
    }

    vi.doUnmock("@/lib/blockchain/pinata");
  }, 30_000);

  it("verifyTokenOnChain reports unverified for a token id that was never minted", async () => {
    const { verifyTokenOnChain } = await import("@/lib/blockchain/chain");
    const verdict = await verifyTokenOnChain("999999", 84532, contractAddress!, "ipfs://nope");
    expect(verdict.verified).toBe(false);
  });
});
