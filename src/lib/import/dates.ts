/**
 * Date reading for uploaded seller files. TikTok exports mix "18/09/2026 21:10:33",
 * ISO dates, Buddhist Era years (2569) and Thai month names; Excel sometimes hands
 * us a raw serial number. Everything ends up as YYYY-MM-DD or null.
 */

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** "๑๘/๐๙/๒๕๖๙" -> "18/09/2569". */
export function thaiDigitsToArabic(text: string): string {
  let out = "";
  for (const ch of text) {
    const i = THAI_DIGITS.indexOf(ch);
    out += i >= 0 ? String(i) : ch;
  }
  return out;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  "ม.ค": 1, "มค": 1, "มกราคม": 1, "ก.พ": 2, "กพ": 2, "กุมภาพันธ์": 2, "มี.ค": 3, "มีค": 3, "มีนาคม": 3,
  "เม.ย": 4, "เมย": 4, "เมษายน": 4, "พ.ค": 5, "พค": 5, "พฤษภาคม": 5, "มิ.ย": 6, "มิย": 6, "มิถุนายน": 6,
  "ก.ค": 7, "กค": 7, "กรกฎาคม": 7, "ส.ค": 8, "สค": 8, "สิงหาคม": 8, "ก.ย": 9, "กย": 9, "กันยายน": 9,
  "ต.ค": 10, "ตค": 10, "ตุลาคม": 10, "พ.ย": 11, "พย": 11, "พฤศจิกายน": 11, "ธ.ค": 12, "ธค": 12, "ธันวาคม": 12,
};

function monthFromName(name: string): number | null {
  const key = name.toLowerCase().replace(/\.$/, "");
  return MONTHS[key] ?? null;
}

/**
 * Buddhist years (> 2400) lose 543. Two-digit years above 50 are read as 25xx BE
 * (69 -> 2569 -> 2026); 50 and below as 20xx CE.
 */
export function normalizeYear(year: number): number {
  if (year < 100) return year > 50 ? 2500 + year - 543 : 2000 + year;
  if (year > 2400) return year - 543;
  return year;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Builds YYYY-MM-DD when the parts form a real calendar date, else null. */
function ymd(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Excel's 1900 date system: serial 1 is 1900-01-01, with the usual 1899-12-30 epoch. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 200000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Accepts the date shapes TikTok and Excel produce and returns YYYY-MM-DD, or null. */
export function normalizeDate(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  const s = thaiDigitsToArabic(String(text)).trim();
  if (!s) return null;

  // 2026-09-18 or 2569-09-18, optionally followed by a time.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]|$)/.exec(s);
  if (iso) return ymd(normalizeYear(Number(iso[1])), Number(iso[2]), Number(iso[3]));

  // 18/09/2026, 18.09.2569, 18-09-69: day first, never month first.
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s|$)/.exec(s);
  if (dmy) return ymd(normalizeYear(Number(dmy[3])), Number(dmy[2]), Number(dmy[1]));

  // 18 Sep 2026, 18 ก.ย. 2569, 18 September, 2026.
  const dMonY = /^(\d{1,2})\s*([A-Za-z.]+|[฀-๿.]+)\s*,?\s*(\d{2,4})(?:\s|$)/.exec(s);
  if (dMonY) {
    const month = monthFromName(dMonY[2]);
    return month ? ymd(normalizeYear(Number(dMonY[3])), month, Number(dMonY[1])) : null;
  }

  // Sep 18, 2026 (month name first is unambiguous, so it is allowed).
  const monDY = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{2,4})(?:\s|$)/.exec(s);
  if (monDY) {
    const month = monthFromName(monDY[1]);
    return month ? ymd(normalizeYear(Number(monDY[3])), month, Number(monDY[2])) : null;
  }

  // A bare Excel serial such as "45918".
  if (/^\d{5,6}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));

  return null;
}
