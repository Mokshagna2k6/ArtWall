import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignInPage() { return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="flex w-full max-w-md flex-col gap-6"><div><p className="studio-eyebrow">ArtWall Studio</p><h1 className="mt-2 text-4xl">Welcome back</h1><p className="mt-2 text-sm text-muted-foreground">Sign in to your artist workspace.</p></div><AuthForm mode="sign-in" /><p className="text-center text-sm text-muted-foreground">New to Studio? <Link className="underline" href="/sign-up">Create an account</Link></p></div></main>; }
