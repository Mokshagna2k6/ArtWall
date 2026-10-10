import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("wallet config refuses to load without a WalletConnect project id", async () => {
  vi.stubEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID", "");
  await expect(import("../wagmi")).rejects.toThrow(/NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID/);
}, 60_000); // importing rainbowkit is slow
