import { AuthPage } from "@/components/auth/auth-page";

export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const { callbackUrl } = await props.searchParams;
  const returnTo = typeof callbackUrl === "string" ? callbackUrl : undefined;

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
