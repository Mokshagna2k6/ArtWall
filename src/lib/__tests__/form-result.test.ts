import { describe, expect, it } from "vitest";
import { z } from "zod";

import { formFail, formInvalid } from "@/lib/form-result";

describe("formInvalid (FE-2.01)", () => {
  it("keys every zod issue by its field and keeps the first as the summary", () => {
    const schema = z.object({
      title: z.string().min(1, "Title needed."),
      year: z.coerce.number().int().min(1000, "Year too early."),
    });
    const parsed = schema.safeParse({ title: "", year: "12" });
    expect(parsed.success).toBe(false);
    const result = formInvalid(parsed.error!);
    expect(result).toEqual({
      ok: false,
      message: "Title needed.",
      fieldErrors: { title: ["Title needed."], year: ["Year too early."] },
    });
  });

  it("formFail can pin a business-rule message to one field", () => {
    expect(formFail("Taken.", "handle").fieldErrors).toEqual({ handle: ["Taken."] });
    expect(formFail("Nope.").fieldErrors).toBeUndefined();
  });
});
