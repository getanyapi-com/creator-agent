import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-12 sm:items-center">
      <SignUp />
    </main>
  );
}
