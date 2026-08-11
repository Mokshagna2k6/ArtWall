import { AuthPage } from "@/components/auth/auth-page";

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const { callbackUrl } = await props.searchParams;
  const returnTo = typeof callbackUrl === "string" ? callbackUrl : undefined;

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
