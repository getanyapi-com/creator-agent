import { describe, expect, it } from "vitest";
import { contactsIn } from "../bench/score/contactDetector.ts";
import { MemoryContactStore } from "../src/contactStore.ts";
import { containsContact, foldDigits, stripContacts } from "../src/contacts.ts";
import { toCreatorRow, toVideoRow } from "../src/ingest.ts";
import { cleanUserText } from "../src/modelText.ts";
import { kept, searchRow } from "./fakes.ts";

const HIDDEN = [
  "collabs: jane.doe@example.com",
  "📧 jane_doe @ gmail . com",
  "biz → jane [at] studio [dot] co",
  "jane(at)studio(dot)com for brand deals",
  "email me: jane at gmail dot com",
  "jane at gmail",
  "jane＠gmail．com",
  "ja​ne@gm​ail.com",
  "mailto:jane@example.org",
  "call +1 (555) 123-4567",
  "text 555.123.4567",
  "whatsapp: +44 7700 900123",
  "telegram - @janedeals",
  "wa.me/447700900123",
  // round 2 (A3)
  "jane [at] studio.com",
  "jane (at) studio dot com",
  "jane&#64;studio.com",
  "jane&#x40;studio&#46;com",
  "j⁠a⁠n⁠e⁠@⁠studio⁠.⁠com",
  "call 5551234567",
  "ring 555 123 4567 now",
  "+44 20 7946 0958",
  "0044 20 7946 0958",
  "DM me on Instagram @janestudio",
  "ig: janestudio",
  "snap: janestudio",
  "telegram @janestudio",
  "whatsapp 07700 900123",
  "@janestudio on insta for collabs",
  "my site janestudio.com",
  "shop at https://janestudio.co/shop",
  "www.janestudio.net",
  "link: linktr.ee/janestudio",
  // found by the bench detector in round 0 of tuning
  "check it out for free: janestudio dot com :)",
  "Tickets in the Instagram bio @janestudio #theatre",
  // found by the bench detector in round 3 (q09): an email written with a link after the @
  "let's talk. 📩 janewhalen@https://janestudio.com | janestudio.com #HR",
  "📧 janewhalen@http://www.janestudio.co/contact 🌐",
  // found by the round 4 review: a network named without a colon or @, a verb before it, other networks,
  // a spaced domain, typographic dashes, letter-spaced emails and digits of another script
  "Instagram janestudio",
  "IG 📸 janestudio",
  "DM janestudio on Instagram",
  "OnlyFans: @janestudio",
  "Portfolio: janestudio . com",
  "Call 202–555–0187",
  "Business: j a n e @ e x a m p l e . c o m",
  "WhatsApp +٤٤ ٧٧٠٠ ٩٠٠١٢٣",
  // found by the third review (round 4, F2): a space before the @, a quoted local part, other separators
  "booking: jane @example.com",
  '"jane"@example.com for collabs',
  "“jane”@example.com",
  "call 555·010·0199",
  "call 555•010•0199",
  "call 555‐010‐0199",
];

describe("stripContacts", () => {
  it.each(["Find creators on Instagram", "Instagram reels tips for TikTok creators", "YouTube Shorts vs TikTok", "I love it . Me too", "Find 10 NYU creators with around 1,500 followers."])(
    "leaves ordinary words about networks alone in %j",
    (text) => {
      expect(stripContacts(text, "user").clean).toBe(text);
    },
  );

  it("decodes any numeric entity without throwing, one outside Unicode as the replacement character", () => {
    expect(() => stripContacts("creators mentioning &#x110000; and &#99999999999;")).not.toThrow();
    expect(stripContacts("a &#x110000; b").clean).toBe("a \uFFFD b");
  });

  it("reads digits of every script as digits", () => {
    expect(foldDigits("٣٤٠٠ and ४२ and ３")).toBe("3400 and 42 and 3");
  });

  it.each(HIDDEN)("removes the contact in %j", (text) => {
    const { clean, contacts } = stripContacts(text);
    expect(contacts.length).toBeGreaterThan(0);
    expect(containsContact(clean)).toBe(false);
    expect(contactsIn(clean)).toEqual([]);
    expect(clean).not.toMatch(/jane|555|7700|7946/i);
  });

  it("keeps handle mentions, hashtags, view counts, dates and collab notation", () => {
    const text = "follow @studyfetch.kendall and @astnstudies #studytok 1,200,000 views on 2026-11-20, me x @friend. Me too. Co-op · Pottery · Mugs";
    expect(stripContacts(text)).toEqual({ clean: text, contacts: [] });
  });

  it("classifies what it found", () => {
    const { contacts } = stripContacts("jane@example.com or +1 555 123 4567");
    expect(contacts.map((c) => c.kind).sort()).toEqual(["email", "phone"]);
  });

  it("removes every link from TikTok text, but keeps a TikTok link in text from the user or a model", () => {
    const link = "https://www.tiktok.com/@studyfetch.kendall/video/7687877955111947551";
    expect(stripContacts(`watch ${link}`).clean).toBe("watch [removed]");
    expect(cleanUserText(`Why did this do well? ${link} mail me jane@example.net`).value).toBe(`Why did this do well? ${link} mail me [removed]`);
  });
});

describe("ingest", () => {
  it("records contacts from bios, links, captions and hashtags in the contact store, never in evidence", () => {
    const contacts = new MemoryContactStore();
    const row = toVideoRow({ ...searchRow("1", "ann", 10, "ig: annstudies | annstudies.com"), hashtags: ["study", "ann@example.com"] }, null, contacts);
    const creator = kept(toCreatorRow({ handle: "ann", followers: 0, bio: "biz: ann (at) studio dot com", externalUrl: "https://linktr.ee/ann" }, "ann", contacts, []));
    expect(JSON.stringify({ row, creator })).not.toMatch(/annstudies|studio|example|linktr/);
    expect(row?.hashtags).toEqual(["study"]);
    expect(creator.hasPublicEmail).toBe(true);
    expect(creator.followers).toBeNull();
    expect(contacts.count()).toBe(5);
  });
});

describe("bench contact detector", () => {
  it("is stricter than the cleaner: it flags what the cleaner lets through", () => {
    const slipped = ["write to jane (at) her studio", "jane at proton mail"].filter((t) => !containsContact(t));
    expect(slipped.length).toBeGreaterThan(0);
    for (const t of slipped) expect(contactsIn(t).length).toBeGreaterThan(0);
  });

  it("does not read a package spec at the end of a sentence as an email", () => {
    expect(contactsIn("run npx ponytail@ponytail. I measured it")).toEqual([]);
    expect(contactsIn("mail jane@studio . com")).not.toEqual([]);
  });

  it("flags the third review's forms the cleaner now removes, and leaves a spaced handle mention alone", () => {
    for (const t of ["jane @example.com", '"jane"@example.com', "555·010·0199"]) expect(contactsIn(t).length).toBeGreaterThan(0);
    expect(contactsIn("Compare @studyfetch.kendall and @study.with.karen")).toEqual([]);
  });

  it("leaves the code's own links, ids, dates and endpoint names alone", () => {
    const code = "https://www.tiktok.com/@ann/video/7687877955111947551 7687877955111947551 2026-11-20T15:40:51.451Z budget: tiktok.profile costs $0.0004 glm-5.3-flash qwen3.8-omni-flash";
    expect(contactsIn(code)).toEqual([]);
  });
});
