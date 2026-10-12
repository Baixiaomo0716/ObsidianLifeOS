import type { FileSystem } from "../ports/file-system";
import { JsonCodec, MarkdownCodec } from "./codecs";

type Kind = "note" | "ledger";
const caches = new WeakMap<FileSystem, Map<string, { raw: string; kind: Kind; id: unknown }>>();
function remember(fs: FileSystem, path: string, raw: string, kind: Kind, id: unknown): void {
  let cache = caches.get(fs);
  if (!cache) { cache = new Map(); caches.set(fs, cache); }
  if (cache.size >= 20000 && !cache.has(path)) cache.delete(cache.keys().next().value!);
  cache.set(path, { raw, kind, id });
}
// Only successful complete codec decoding primes the cache. Every identity scan
// still reads fresh authoritative text; metadata and vault events are not trusted.
export function decodeAndRemember(fs: FileSystem, path: string, raw: string, kind: Kind) {
  const decoded = (kind === "ledger" ? new JsonCodec() : new MarkdownCodec()).decode(raw);
  remember(fs, path, raw, kind, decoded.attributes.biaoshi);
  return decoded;
}
export function freshIdentity(fs: FileSystem, path: string, raw: string, kind: Kind): unknown {
  const cached = caches.get(fs)?.get(path);
  if (cached?.raw === raw && cached.kind === kind) return cached.id;
  return decodeAndRemember(fs, path, raw, kind).attributes.biaoshi;
}
