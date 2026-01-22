import crypto from "crypto";
import { env } from "../config/env.js";

export type ExternalSnippet = {
  id: string;
  url: string;
  title: string;
  text: string;
};

export function isTrusted(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const allowed = env.TRUSTED_DOMAINS.split(",").map(s => s.trim()).filter(Boolean);
    return allowed.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

async function fetchWikipediaSummary(topic: string): Promise<ExternalSnippet | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
  if (!isTrusted(url)) return null;

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;

  const j: any = await res.json();
  const text = String(j.extract ?? "").trim();
  if (!text) return null;

  const title = String(j.title ?? topic);
  const id = crypto.createHash("sha1").update(url).digest("hex");

  return { id, url, title, text };
}

export async function autoEnrich(missingInfo: string[]): Promise<ExternalSnippet[]> {
  const targets = missingInfo.slice(0, env.AUTO_ENRICH_MAX_SNIPPETS);

  const out: ExternalSnippet[] = [];
  for (const m of targets) {
    const snip = await fetchWikipediaSummary(m);
    if (snip) out.push(snip);
  }
  return out;
}