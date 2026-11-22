import { describe, expect, it } from "vitest";

import { classifyCartRow, type CartRow } from "@/features/orders/cart-rules";
import { addressSchema, normalisePhone } from "@/features/orders/address";

const ok: NonNullable<CartRow["artwork"]> = { sellerId: "seller", status: "available", isPublic: true, sellerPublished: true, pricePaise: 500_000 };
const row = (patch: Partial<NonNullable<CartRow["artwork"]>> | null): CartRow => ({
  artworkId: "art_1",
  artwork: patch === null ? null : { ...ok, ...patch },
});

describe("cart staleness (classifyCartRow)", () => {
  it("a normal available work is buyable", () => {
    expect(classifyCartRow(row({}), "buyer")).toBeNull();
  });

  it("flags each way a work can go stale", () => {
    expect(classifyCartRow(row(null), "buyer")).toBe("missing");
    expect(classifyCartRow(row({ status: "sold" }), "buyer")).toBe("sold");
    expect(classifyCartRow(row({ status: "reserved" }), "buyer")).toBe("reserved");
    expect(classifyCartRow(row({ status: "archived" }), "buyer")).toBe("unavailable");
    expect(classifyCartRow(row({ isPublic: false }), "buyer")).toBe("unpublished");
    expect(classifyCartRow(row({ sellerPublished: false }), "buyer")).toBe("seller_unpublished");
    expect(classifyCartRow(row({ pricePaise: null }), "buyer")).toBe("unpriced");
    expect(classifyCartRow(row({ pricePaise: 0 }), "buyer")).toBe("unpriced");
  });

  it("you cannot buy your own work", () => {
    expect(classifyCartRow(row({ sellerId: "me" }), "me")).toBe("own_work");
  });

  it("sold wins over other problems (the most useful message first)", () => {
    expect(classifyCartRow(row({ status: "sold", isPublic: false }), "buyer")).toBe("sold");
  });
});

describe("shipping address", () => {
  const good = { name: "Asha Rao", phone: "+91 98765 43210", line1: "12 MG Road", city: "Jaipur", state: "Rajasthan", pincode: "302001" };

  it("accepts a valid Indian address", () => {
    expect(addressSchema.safeParse({ ...good, phone: "9876543210" }).success).toBe(true);
  });

  it("rejects a bad PIN code and a bad mobile number", () => {
    expect(addressSchema.safeParse({ ...good, phone: "9876543210", pincode: "12345" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...good, phone: "12345" }).success).toBe(false);
  });

  it("normalises phone numbers to the last ten digits", () => {
    expect(normalisePhone("+91 98765-43210")).toBe("9876543210");
  });
});
