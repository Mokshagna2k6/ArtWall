import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignUpPage() { return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="flex w-full max-w-md flex-col gap-6"><div><p className="studio-eyebrow">ArtWall Studio</p><h1 className="mt-2 text-4xl">Create your studio</h1><p className="mt-2 text-sm text-muted-foreground">Build a considered home for your practice.</p></div><AuthForm mode="sign-up" /><p className="text-center text-sm text-muted-foreground">Already have an account? <Link className="underline" href="/sign-in">Sign in</Link></p></div></main>; }
