const EM_DASH = String.fromCharCode(8212);
const THAI_START = new RegExp("^[A-Za-z\"'" + String.fromCharCode(0x0e00) + "-" + String.fromCharCode(0x0e7f) + "]");
const THAI_END = new RegExp("[" + String.fromCharCode(0x0e00) + "-" + String.fromCharCode(0x0e7f) + "]$");

/**
 * Accepts only a plain paragraph from the model: strips markdown marks,
 * replaces em dashes, and rejects anything that looks truncated or
 * list-shaped so a bad reply is hidden rather than shown.
 */
export function cleanNarrative(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let text = raw.trim().replace(/[*_`#>]+/g, "").split(EM_DASH).join(",").replace(/\s+/g, " ").trim();
  if (text.length < 40 || text.length > 1200) return null;
  if (!THAI_START.test(text)) return null;
  if (!/[.!?]$/.test(text) && !THAI_END.test(text)) return null;
  text = text.replace(/\s([,.])/g, "$1");
  return text;
}
