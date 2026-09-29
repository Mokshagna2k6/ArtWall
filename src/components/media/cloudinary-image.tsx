"use client";

import Image, { type ImageProps } from "next/image";

import { cloudinaryLoader } from "@/lib/cloudinary-url";

/** next/image for Cloudinary URLs (PERF-2.10). A client component because a loader is a function. */
export function CloudinaryImage(props: ImageProps) {
  return <Image loader={cloudinaryLoader} {...props} />;
}
