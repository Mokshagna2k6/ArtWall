import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getApiUser(): Promise<{ id: string; email: string; name: string } | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    return { id: session.user.id, email: session.user.email, name: session.user.name };
  } catch {
    return null;
  }
}
