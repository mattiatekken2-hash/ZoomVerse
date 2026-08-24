/**
 * Display names that are not a real Telegram identity.
 * "Dev" is the old browser-dev fallback and must not appear on public rank.
 */
export function persistableFirstName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  if (!n || /^dev$/i.test(n) || /^player$/i.test(n)) return null;
  return n;
}
