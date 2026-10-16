import { AuthPage } from "@/components/auth/auth-page";

export default async function SignUpPage(props: PageProps<"/sign-up">) {
  // `next` is an alias for `callbackUrl` — see the note in sign-in/page.tsx.
  const { callbackUrl, next } = await props.searchParams;
  const returnTo = [callbackUrl, next].find((v) => typeof v === "string");

  return (
    <AuthPage
      mode="sign-up"
      callbackUrl={returnTo}
      googleEnabled={Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      )}
    />
  );
}
