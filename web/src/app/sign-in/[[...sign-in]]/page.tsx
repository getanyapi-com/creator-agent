import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-12 sm:items-center">
      <SignIn />
    </main>
  );
}
