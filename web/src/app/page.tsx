import { connection } from "next/server";
import { Suspense } from "react";
import { questionAllowance } from "@/auth/questionQuota";
import { AllowanceProvider } from "@/auth/QuestionsLeft";
import { viewerId } from "@/auth/session";
import { walletState } from "@/auth/tier";
import { WalletProvider } from "@/auth/WalletState";
import { getFeed } from "@/data/fixtures";
import { liveFeed, yourQuestions } from "@/server/liveRun";
import { HomePage } from "@/home/HomePage";

export default async function HomeRoute() {
  await connection();
  const userId = await viewerId();
  const wallet = await walletState(userId);
  return (
    <WalletProvider state={wallet}>
      <AllowanceProvider allowance={userId === null || wallet.connected ? null : await questionAllowance(userId)}>
        <Suspense fallback={null}>
          <HomePage feed={[...(await liveFeed()), ...getFeed()]} yours={userId === null ? null : await yourQuestions(userId)} />
        </Suspense>
      </AllowanceProvider>
    </WalletProvider>
  );
}
