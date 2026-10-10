import { expect, test, vi } from "vitest";

vi.mock("@/lib/db/index", () => ({
  db: {
    select: () => {
      throw new Error("connection refused");
    },
  },
}));

test("sitemap fails loudly when the DB query fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const { default: sitemap } = await import("../sitemap");
  await expect(sitemap()).rejects.toThrow("connection refused");
  expect(log).toHaveBeenCalled();
});
