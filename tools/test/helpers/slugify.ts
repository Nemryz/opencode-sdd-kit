export function slugify(text: string, maxLen: number = 80): { slug: string; truncated: boolean } {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/^\d+-/, "")
  if (!raw) return { slug: "unnamed", truncated: false }
  const truncated = raw.length > maxLen
  return { slug: raw.slice(0, maxLen), truncated }
}
