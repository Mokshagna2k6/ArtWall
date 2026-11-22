import { expect, test } from "vitest";

import { serializeJsonLd } from "./json-ld";

test("a </script> in a value cannot close the JSON-LD script tag", () => {
  const title = "</script><script>alert(1)</script>";
  const out = serializeJsonLd({ name: title });
  expect(out).not.toContain("<");
  expect(JSON.parse(out).name).toBe(title);
});
