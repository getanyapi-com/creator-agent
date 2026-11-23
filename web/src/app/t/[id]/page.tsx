import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { viewerId } from "@/auth/session";
import { walletState } from "@/auth/tier";
import { WalletProvider } from "@/auth/WalletState";
import { getThread } from "@/data/fixtures";
import { PRODUCT_NAME } from "@/lib/brand";
import { askedBy, readRun } from "@/server/liveRun";
import { LiveThreadPage } from "@/thread/LiveThreadPage";
import { ThreadPage } from "@/thread/ThreadPage";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const question = getThread(id)?.question ?? (await readRun(id, await viewerId()))?.display?.question;
  return { title: question === undefined ? PRODUCT_NAME : `${question} - ${PRODUCT_NAME}` };
}

/**
 * Every thread page is rendered on request, recorded answers too: the image is built without the Clerk
 * publishable key, which the server reads when it renders, so a page built ahead would have none.
 */
export default async function ThreadRoute({ params }: Props) {
  await connection();
  const { id } = await params;
  const viewer = await viewerId();
  const recorded = getThread(id);
  if (recorded !== null) {
    return (
      <WalletProvider state={await walletState(viewer)}>
        <Suspense fallback={null}>
          <ThreadPage thread={recorded} />
        </Suspense>
      </WalletProvider>
    );
  }
  // Someone else's wallet question reads as null here, so it gets the same not-found page as an unknown id.
  const live = await readRun(id, viewer);
  if (live === null) notFound();
  return (
    <WalletProvider state={await walletState(viewer)}>
      <Suspense fallback={null}>
        <LiveThreadPage initial={live} isAsker={await askedBy(id, viewer)} />
      </Suspense>
    </WalletProvider>
  );
}
