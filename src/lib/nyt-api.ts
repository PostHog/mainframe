/**
 * NYT Archive API client — server-only.
 *
 * Fetches real New York Times headlines from MM/DD of `today − 40 years`,
 * using https://developer.nytimes.com/docs/archive-product/1/overview.
 * The archive doesn't change (it's history), so we cache each month's
 * response for the lifetime of the server process.
 */

import "server-only";
import { mainframeNow } from "./screen";

export type NewsItem = {
  headline: string;
  byline: string;
  section: string;
  abstract: string;
  leadParagraph: string;
  url: string;
  pubDate: string; // ISO
  wordCount: number;
};

export class NYTApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type NYTArticle = {
  abstract?: string;
  web_url?: string;
  snippet?: string;
  lead_paragraph?: string;
  source?: string;
  headline?: { main?: string; kicker?: string; print_headline?: string };
  pub_date?: string;
  section_name?: string;
  byline?: { original?: string };
  type_of_material?: string;
  word_count?: number;
  uri?: string;
};

type NYTResponse = {
  status?: string;
  response?: { docs?: NYTArticle[] };
  fault?: { faultstring?: string };
};

// Module-level cache: "1986-05" -> [NYTArticle, ...].
// Safe to share across requests/users — the archive is public, deterministic data.
const monthlyCache = new Map<string, NYTArticle[]>();
const inFlight = new Map<string, Promise<NYTArticle[]>>();

const SECTION_PRIORITY: Record<string, number> = {
  "Front Page": 0,
  "World": 1,
  "U.S.": 2,
  "Washington": 3,
  "Politics": 3,
  "New York": 4,
  "Business": 5,
  "Business Day": 5,
  "Technology": 6,
  "Science": 7,
  "Opinion": 8,
  "Editorial": 8,
  "Op-Ed": 8,
  "Magazine": 9,
  "Arts": 10,
  "Books": 11,
  "Movies": 11,
  "Theater": 11,
  "Sports": 12,
  "Style": 13,
  "Dining": 14,
  "Travel": 15,
  "Obituaries": 16,
};

function priority(section: string | undefined): number {
  return SECTION_PRIORITY[section ?? ""] ?? 50;
}

async function fetchMonth(year: number, month: number): Promise<NYTArticle[]> {
  const apiKey = process.env.NYT_API_KEY;
  if (!apiKey) throw new NYTApiError(500, "NYT_API_KEY NOT CONFIGURED");

  const key = `${year}-${String(month).padStart(2, "0")}`;
  const cached = monthlyCache.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const url = `https://api.nytimes.com/svc/archive/v1/${year}/${month}.json?api-key=${encodeURIComponent(apiKey)}`;
  const promise = (async () => {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 401 || res.status === 403) {
      throw new NYTApiError(res.status, "NYT API KEY REJECTED");
    }
    if (res.status === 429) {
      throw new NYTApiError(429, "NYT RATE LIMIT — TRY AGAIN IN A MINUTE");
    }
    if (!res.ok) {
      throw new NYTApiError(res.status, `NYT API ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as NYTResponse;
    if (json.fault) throw new NYTApiError(500, json.fault.faultstring ?? "NYT FAULT");
    const docs = json.response?.docs ?? [];
    monthlyCache.set(key, docs);
    return docs;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

function normalise(d: NYTArticle): NewsItem {
  return {
    headline:
      d.headline?.print_headline?.trim() ||
      d.headline?.main?.trim() ||
      "(UNTITLED)",
    byline: (d.byline?.original ?? "").replace(/^By\s+/i, "").trim(),
    section: (d.section_name ?? "GENERAL").trim(),
    abstract: (d.abstract ?? d.snippet ?? "").trim(),
    leadParagraph: (d.lead_paragraph ?? "").trim(),
    url: d.web_url ?? "",
    pubDate: d.pub_date ?? "",
    wordCount: d.word_count ?? 0,
  };
}

export async function getHeadlinesForMainframeDate(): Promise<{ items: NewsItem[]; date: Date }> {
  const d = mainframeNow();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const dayIso = `${year}-${String(month).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const docs = await fetchMonth(year, month);
  const today = docs.filter((doc) => doc.pub_date?.slice(0, 10) === dayIso);

  // Sort: by section priority, then by word count desc (longer = more substantial).
  today.sort((a, b) => {
    const pa = priority(a.section_name);
    const pb = priority(b.section_name);
    if (pa !== pb) return pa - pb;
    return (b.word_count ?? 0) - (a.word_count ?? 0);
  });

  return { items: today.map(normalise), date: d };
}
