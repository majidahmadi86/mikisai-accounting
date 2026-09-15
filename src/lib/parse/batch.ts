/**
 * Splits a pasted report into batches so each Anthropic call sees at most
 * MAX_ORDERS_PER_BATCH orders. Order boundaries are detected from common
 * TikTok / Shopee / Facebook wording in Thai and English. When no boundary
 * markers are found the text is chunked on blank lines by size instead.
 */

export const MAX_ORDERS_PER_BATCH = 18;
export const MAX_CHARS_PER_BATCH = 9000;
export const MAX_IMAGES_PER_BATCH = 4;

const ORDER_START_PATTERNS: RegExp[] = [
  /^\s*(order\s*(id|no\.?|number|#)|order\s*:)/i,
  /^\s*(หมายเลข|เลขที่|รหัส)\s*(คำสั่งซื้อ|ออเดอร์|การสั่งซื้อ)/,
  /^\s*(คำสั่งซื้อ|ออเดอร์)\s*(ที่|#|:|เลขที่)/,
  /^\s*#?\s*\d{12,}\b/,
  /^\s*#\d{4,}\b/,
];

export function isOrderStart(line: string): boolean {
  return ORDER_START_PATTERNS.some((re) => re.test(line));
}

export function splitTextIntoBatches(
  text: string,
  opts: { maxOrders?: number; maxChars?: number } = {},
): string[] {
  const maxOrders = opts.maxOrders ?? MAX_ORDERS_PER_BATCH;
  const maxChars = opts.maxChars ?? MAX_CHARS_PER_BATCH;
  const normalised = text.replace(/\r\n?/g, "\n").trim();
  if (!normalised) return [];

  const lines = normalised.split("\n");
  const starts = lines.map((line, i) => (isOrderStart(line) ? i : -1)).filter((i) => i >= 0);

  // Group by detected order boundaries.
  if (starts.length >= 2) {
    const orders: string[] = [];
    const preamble = lines.slice(0, starts[0]).join("\n").trim();
    for (let s = 0; s < starts.length; s += 1) {
      const from = starts[s];
      const to = s + 1 < starts.length ? starts[s + 1] : lines.length;
      orders.push(lines.slice(from, to).join("\n").trim());
    }
    const batches: string[] = [];
    let current: string[] = [];
    let currentChars = 0;
    for (const order of orders) {
      if (current.length > 0 && (current.length >= maxOrders || currentChars + order.length > maxChars)) {
        batches.push(current.join("\n\n"));
        current = [];
        currentChars = 0;
      }
      current.push(order);
      currentChars += order.length + 2;
    }
    if (current.length) batches.push(current.join("\n\n"));
    if (preamble && batches.length) batches[0] = `${preamble}\n\n${batches[0]}`;
    return batches;
  }

  // Fallback: chunk by paragraphs up to maxChars.
  const paragraphs = normalised.split(/\n{2,}/);
  const batches: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (current && current.length + para.length + 2 > maxChars) {
      batches.push(current);
      current = "";
    }
    if (para.length > maxChars) {
      if (current) batches.push(current);
      current = "";
      for (let i = 0; i < para.length; i += maxChars) batches.push(para.slice(i, i + maxChars));
      continue;
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  if (current) batches.push(current);
  return batches;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
