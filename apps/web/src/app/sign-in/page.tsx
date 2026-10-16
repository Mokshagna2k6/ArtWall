import { AuthPage } from "@/components/auth/auth-page";

export default async function SignInPage(props: PageProps<"/sign-in">) {
  // `next` is an alias for `callbackUrl`: the marketplace's auth gates link
  // to /sign-in?next=<path> (CHANGES-PLAN.md §1). Both go through
  // AuthPage's safeCallback, which rejects anything that is not a local path.
  const { callbackUrl, next } = await props.searchParams;
  const returnTo = [callbackUrl, next].find((v) => typeof v === "string");

  return (
    <AuthPage
      mode="sign-in"
      callbackUrl={returnTo}
      googleEnabled={Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      )}
    />
  );
}
