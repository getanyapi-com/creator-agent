import type { Check } from "../src/finish/checks.ts";

const q = (kind: Check["kind"], value: number | string): Check => ({ kind, value, from: "question" });

/** One written question, the limits it states as written by hand, and the words that state each. */
export interface Phrasing {
  text: string;
  checks: { check: Check; quote: string }[];
  wanted: number | null;
}

const c = (kind: Check["kind"], value: number | string, quote: string) => ({ check: q(kind, value), quote });

/**
 * Round 5: questions written to cover the ways people state follower, view, recency and country limits
 * ("this week", "in the last N days", "past year", "UK-based", "American", "in Germany", ranges), and
 * phrasings that state none ("around 5k", "recently", "small", "Spanish-learning"), each with the
 * checks a careful reader writes from it. "German fitness creators" is written by hand as Germany, but
 * the code reads a country adjective only right before a word for people ("Italian food creators" and
 * "Spanish learning creators" name a topic), so it stays a miss rather than a rule that invents limits.
 */
export const PHRASINGS: Phrasing[] = [
  { text: "Find UK-based fitness creators under 20k followers.", checks: [c("proof_region", "GB", "UK-based"), c("followers_at_most", 20_000, "under 20k followers")], wanted: null },
  { text: "Who are American creators posting about budgeting apps this week?", checks: [c("proof_region", "US", "American creators"), c("proof_posted_within_days", 7, "this week")], wanted: null },
  { text: "Find creators in Germany talking about language apps with over 50,000 views in the last 14 days.", checks: [c("proof_region", "DE", "in Germany"), c("proof_views_at_least", 50_000, "over 50,000 views"), c("proof_posted_within_days", 14, "in the last 14 days")], wanted: null },
  { text: "Creators with between 5K and 20K followers who review skincare.", checks: [c("followers_at_least", 5_000, "between 5K and 20K followers"), c("followers_at_most", 20_000, "between 5K and 20K followers")], wanted: null },
  { text: "Find 15 creators with 10k-50k followers posting about meal prep this month.", checks: [c("followers_at_least", 10_000, "10k-50k followers"), c("followers_at_most", 50_000, "10k-50k followers"), c("proof_posted_within_days", 30, "this month")], wanted: 15 },
  { text: "Show me cooking creators who posted in the last 3 months with at least 1M views.", checks: [c("proof_posted_within_days", 90, "in the last 3 months"), c("proof_views_at_least", 1_000_000, "at least 1M views")], wanted: null },
  { text: "Any Canadian creators under 5,000 followers doing book reviews?", checks: [c("proof_region", "CA", "Canadian creators"), c("followers_at_most", 5_000, "under 5,000 followers")], wanted: null },
  { text: "Find gaming creators from Brazil with fewer than 30k followers.", checks: [c("proof_region", "BR", "from Brazil"), c("followers_at_most", 30_000, "fewer than 30k followers")], wanted: null },
  { text: "Which creators in the past year made videos about Notion with over half a million views?", checks: [c("proof_posted_within_days", 365, "in the past year"), c("proof_views_at_least", 500_000, "over half a million views")], wanted: null },
  { text: "Find micro creators with 1,000 to 10,000 followers in Australia who post about surfing.", checks: [c("followers_at_least", 1_000, "1,000 to 10,000 followers"), c("followers_at_most", 10_000, "1,000 to 10,000 followers"), c("proof_region", "AU", "in Australia")], wanted: null },
  { text: "Creators posting about running shoes in the last 2 weeks, 100k+ views.", checks: [c("proof_posted_within_days", 14, "in the last 2 weeks"), c("proof_views_at_least", 100_000, "100k+ views")], wanted: null },
  { text: "Find French creators talking about AI tools with at least 2,000 followers.", checks: [c("proof_region", "FR", "French creators"), c("followers_at_least", 2_000, "at least 2,000 followers")], wanted: null },
  { text: "Find study creators with 50K or fewer followers from the US.", checks: [c("followers_at_most", 50_000, "50K or fewer followers"), c("proof_region", "US", "from the US")], wanted: null },
  { text: "Who posted about Labubu in the past 7 days and got more than 200,000 views?", checks: [c("proof_posted_within_days", 7, "in the past 7 days"), c("proof_views_at_least", 200_000, "more than 200,000 views")], wanted: null },
  { text: "I want creators with 20,000 followers or more who make pet content in Japan.", checks: [c("followers_at_least", 20_000, "20,000 followers or more"), c("proof_region", "JP", "in Japan")], wanted: null },
  { text: "Find small creators talking about Duolingo recently.", checks: [], wanted: null },
  { text: "Find creators with around 5k followers in Spain.", checks: [c("proof_region", "ES", "in Spain")], wanted: null },
  { text: "Find British creators posting gardening videos this week.", checks: [c("proof_region", "GB", "British creators"), c("proof_posted_within_days", 7, "this week")], wanted: null },
  { text: "Find creators with no more than 8,000 followers who posted about crochet in the last 60 days.", checks: [c("followers_at_most", 8_000, "no more than 8,000 followers"), c("proof_posted_within_days", 60, "in the last 60 days")], wanted: null },
  { text: "Indian creators reviewing phones with over a million views in the last month.", checks: [c("proof_region", "IN", "Indian creators"), c("proof_views_at_least", 1_000_000, "over a million views"), c("proof_posted_within_days", 30, "in the last month")], wanted: null },
  { text: "Find Mexican creators who talk about crypto, between 10,000 and 100,000 followers.", checks: [c("proof_region", "MX", "Mexican creators"), c("followers_at_least", 10_000, "between 10,000 and 100,000 followers"), c("followers_at_most", 100_000, "between 10,000 and 100,000 followers")], wanted: null },
  { text: "Find creators based in the Philippines with under 15K followers posting this month.", checks: [c("proof_region", "PH", "based in the Philippines"), c("followers_at_most", 15_000, "under 15K followers"), c("proof_posted_within_days", 30, "this month")], wanted: null },
  { text: "Creators who got 1M+ views on a skincare video in the past 30 days.", checks: [c("proof_views_at_least", 1_000_000, "1M+ views"), c("proof_posted_within_days", 30, "in the past 30 days")], wanted: null },
  { text: "Find 5 creators in South Korea under 100k followers posting about K-beauty.", checks: [c("proof_region", "KR", "in South Korea"), c("followers_at_most", 100_000, "under 100k followers")], wanted: 5 },
  { text: "Find creators with 2k–20k followers who make Excel tutorials.", checks: [c("followers_at_least", 2_000, "2k–20k followers"), c("followers_at_most", 20_000, "2k–20k followers")], wanted: null },
  { text: "Find Irish creators posting about hiking in the last six weeks.", checks: [c("proof_region", "IE", "Irish creators"), c("proof_posted_within_days", 42, "in the last six weeks")], wanted: null },
  { text: "Show creators over 500k followers who posted about Claude in the last 24 hours.", checks: [c("followers_at_least", 500_000, "over 500k followers"), c("proof_posted_within_days", 1, "in the last 24 hours")], wanted: null },
  { text: "Find big creators talking about Pingo AI.", checks: [], wanted: null },
  { text: "Find creators with roughly 10k followers posting about chess this week.", checks: [c("proof_posted_within_days", 7, "this week")], wanted: null },
  { text: "Find creators in Italy under 50k followers whose video got at least 250k views.", checks: [c("proof_region", "IT", "in Italy"), c("followers_at_most", 50_000, "under 50k followers"), c("proof_views_at_least", 250_000, "at least 250k views")], wanted: null },
  { text: "Find Spanish-learning creators with under 10k followers.", checks: [c("followers_at_most", 10_000, "under 10k followers")], wanted: null },
  { text: "Find creators in the U.S. who posted about protein bars within the last 10 days and have 1,000+ followers.", checks: [c("proof_region", "US", "in the U.S."), c("proof_posted_within_days", 10, "within the last 10 days"), c("followers_at_least", 1_000, "1,000+ followers")], wanted: null },
  { text: "Find German fitness creators who posted this week.", checks: [c("proof_region", "DE", "German fitness creators"), c("proof_posted_within_days", 7, "this week")], wanted: null },
];
