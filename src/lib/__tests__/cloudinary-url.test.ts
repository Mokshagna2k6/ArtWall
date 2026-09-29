import { expect, test } from "vitest";

import { cloudinaryLoader } from "@/lib/cloudinary-url";

test("each srcset width is a Cloudinary derivative, not the original (PERF-2.10)", () => {
  const src = "https://res.cloudinary.com/demo/image/upload/v1712/artwall/abc.jpg";
  expect(cloudinaryLoader({ src, width: 384 })).toBe(
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_384/v1712/artwall/abc.jpg"
  );
  // Not a Cloudinary upload URL: left alone rather than mangled.
  expect(cloudinaryLoader({ src: "/logo.png", width: 64 })).toBe("/logo.png");
});
