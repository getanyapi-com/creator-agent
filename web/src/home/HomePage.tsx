"use client";

import { LEAD } from "@/auth/tierCopy";
import { useWallet } from "@/auth/WalletState";
import { useHref } from "@/dev/useHref";
import type { FeedItem, OwnFeedItem } from "@/data/types";
import { AskBox } from "@/home/AskBox";
import { Header } from "@/components/Header";
import { QuestionTile } from "@/home/QuestionTile";

/** A titled grid of question cards. */
function Questions({ id, title, count, items, href }: { id: string; title: string; count: string | null; items: FeedItem[]; href: (path: string) => string }) {
  return (
    <section className="mt-16 sm:mt-20" aria-labelledby={id}>
      <h2 id={id} className="text-h3 font-semibold">
        {title}
        {count !== null && <span className="ml-2 text-small font-normal text-fg-muted">{count}</span>}
      </h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="flex">
            <QuestionTile item={item} href={href(`/t/${item.id}`)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The front page: the ask box, the signed-in account's own questions when it has any (`yours`, null for a visitor),
 * then a wall of recent public questions, each fronted by the videos it found.
 */
export function HomePage({ feed, yours }: { feed: FeedItem[]; yours: { items: OwnFeedItem[]; total: number } | null }) {
  const href = useHref();
  const { tier } = useWallet();
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <section className="mx-auto max-w-2xl pt-12 sm:pt-20">
          <h1 className="text-display font-semibold text-balance">Find TikTok creators by the videos that prove it.</h1>
          <p className="mt-3 text-lead text-fg-muted">{LEAD[tier]}</p>
          <AskBox />
        </section>
        {yours !== null && yours.items.length > 0 && (
          <Questions
            id="yours-title"
            title="Your questions"
            count={yours.total > yours.items.length ? `${yours.items.length} newest of ${yours.total}` : null}
            items={yours.items}
            href={href}
          />
        )}
        <Questions id="wall-title" title="Recent public questions" count={null} items={feed} href={href} />
      </main>
    </>
  );
}
