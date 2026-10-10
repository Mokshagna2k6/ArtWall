/** Host we fetch/render user-influenced image URLs from. */
export const CLOUDINARY_HOST = "res.cloudinary.com";

/** True only for https URLs whose whole hostname is in `hosts` (no userinfo, no subdomain tricks). */
export function isAllowedHttpsUrl(url: string | null | undefined, hosts: readonly string[]): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password && hosts.includes(u.hostname);
  } catch {
    return false;
  }
}

export const isCloudinaryUrl = (url: string | null | undefined) =>
  isAllowedHttpsUrl(url, [CLOUDINARY_HOST]);
