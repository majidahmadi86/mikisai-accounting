import "server-only";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatCell } from "./format";
import type { ExportTable } from "./tables";
import type { Locale } from "@/lib/i18n/dictionary";

/** Brand colours for print. */
const C = { plum: "#302333", berry: "#8F315F", lavender: "#C9B8E8", ivory: "#FAF7F2", ivoryDeep: "#F2ECE4", soft: "#6B5E70", line: "#E4DDE8" };

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
let registered = false;

/** Static TTFs from public/fonts. Noto Sans Thai carries Latin glyphs too, so it doubles as the fallback body face. */
function registerFonts() {
  if (registered) return;
  Font.register({ family: "Bodoni", src: path.join(FONT_DIR, "BodoniModa-SemiBold.ttf") });
  Font.register({
    family: "Jost",
    fonts: [
      { src: path.join(FONT_DIR, "Jost-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Jost-Medium.ttf"), fontWeight: 500 },
    ],
  });
  Font.register({
    family: "NotoSansThai",
    fonts: [
      { src: path.join(FONT_DIR, "NotoSansThai-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "NotoSansThai-SemiBold.ttf"), fontWeight: 500 },
    ],
  });
  Font.register({ family: "NotoSerifThai", src: path.join(FONT_DIR, "NotoSerifThai-SemiBold.ttf") });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

const THAI = /[฀-๿]/;

function bodyFont(text: string, locale: Locale): string {
  return locale === "th" || THAI.test(text) ? "NotoSansThai" : "Jost";
}
function displayFont(text: string, locale: Locale): string {
  return locale === "th" || THAI.test(text) ? "NotoSerifThai" : "Bodoni";
}

/** The exact strings each PDF table prints, including its total row. Tests compare these with the table model. */
export function pdfRows(table: ExportTable): string[][] {
  const rows = table.rows.map((r) => r.map((v, i) => formatCell(v, table.columns[i].kind)));
  if (table.totals.length && table.rows.length) {
    const total = table.columns.map((c, i) => {
      if (i === 0) return table.totalLabel;
      if (!table.totals.includes(i)) return "";
      const sum = table.rows.reduce((a, r) => a + (typeof r[i] === "number" ? (r[i] as number) : 0), 0);
      return formatCell(Math.round(sum * 100) / 100, c.kind);
    });
    rows.push(total);
  }
  return rows;
}

export type PdfMeta = { brand: string; title: string; periodLabel: string; generatedBy: string; generatedAt: string; pageLabel: (n: number, total: number) => string; locale: Locale };

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36, backgroundColor: "#FFFFFF", color: C.plum, fontSize: 9 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: C.berry, paddingBottom: 8, marginBottom: 14 },
  lockup: { flexDirection: "row", alignItems: "center", gap: 8 },
  monogram: { width: 26, height: 26, borderRadius: 6, backgroundColor: C.plum, alignItems: "center", justifyContent: "center" },
  monogramText: { color: C.ivory, fontSize: 11, fontFamily: "Bodoni" },
  wordmark: { fontSize: 13, letterSpacing: 2.5, fontFamily: "Bodoni", color: C.plum },
  eyebrow: { fontSize: 6.5, letterSpacing: 1.6, color: C.soft, textTransform: "uppercase" },
  metaRight: { alignItems: "flex-end" },
  metaText: { fontSize: 8, color: C.soft },
  h1: { fontSize: 18, marginBottom: 2 },
  desc: { fontSize: 9, color: C.soft, marginBottom: 10 },
  table: { marginBottom: 18 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, minHeight: 16, alignItems: "center" },
  head: { backgroundColor: C.plum, borderBottomWidth: 0 },
  headText: { color: C.ivory, fontSize: 7.5, letterSpacing: 0.8, textTransform: "uppercase" },
  stripe: { backgroundColor: C.ivoryDeep },
  total: { backgroundColor: C.ivory, borderTopWidth: 1, borderTopColor: C.plum },
  totalText: { color: C.berry },
  cell: { paddingVertical: 4, paddingHorizontal: 5 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 20, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.soft, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 5 },
});

function widths(table: ExportTable): number[] {
  const n = table.columns.length;
  const textCols = table.columns.filter((c) => c.kind === "text").length;
  const textShare = textCols ? Math.min(0.5, 0.22 * textCols) : 0;
  const rest = (1 - textShare) / Math.max(1, n - textCols);
  return table.columns.map((c) => (c.kind === "text" ? textShare / Math.max(1, textCols) : rest));
}

function TableBlock({ table, locale }: { table: ExportTable; locale: Locale }) {
  const w = widths(table);
  const rows = pdfRows(table);
  const hasTotal = table.totals.length > 0 && table.rows.length > 0;
  return (
    <View style={s.table} wrap>
      <Text style={[s.h1, { fontFamily: displayFont(table.title, locale) }]}>{table.title}</Text>
      {table.description ? <Text style={[s.desc, { fontFamily: bodyFont(table.description, locale) }]}>{table.description}</Text> : null}
      <View style={[s.row, s.head]} fixed>
        {table.columns.map((c, i) => (
          <Text key={c.key} style={[s.cell, s.headText, { width: `${w[i] * 100}%`, textAlign: c.kind === "text" || c.kind === "date" ? "left" : "right", fontFamily: bodyFont(c.label, locale), fontWeight: 500 }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <View style={s.row}>
          <Text style={[s.cell, { color: C.soft, fontFamily: bodyFont("", locale) }]}>·</Text>
        </View>
      ) : null}
      {rows.map((r, ri) => {
        const isTotal = hasTotal && ri === rows.length - 1;
        return (
          <View key={ri} style={[s.row, ri % 2 === 1 && !isTotal ? s.stripe : {}, isTotal ? s.total : {}]} wrap={false}>
            {r.map((v, ci) => (
              <Text
                key={ci}
                style={[
                  s.cell,
                  { width: `${w[ci] * 100}%`, textAlign: table.columns[ci].kind === "text" || table.columns[ci].kind === "date" ? "left" : "right", fontFamily: bodyFont(v, locale) },
                  isTotal ? { ...s.totalText, fontWeight: 500 } : {},
                ]}
              >
                {v}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function ReportDocument({ tables, meta }: { tables: ExportTable[]; meta: PdfMeta }) {
  registerFonts();
  const body = bodyFont(meta.title, meta.locale);
  return (
    <Document title={`${meta.brand} · ${meta.title}`} author={meta.generatedBy} creator="MikiSai Accounting">
      <Page size="A4" style={[s.page, { fontFamily: body }]}>
        <View style={s.header} fixed>
          <View style={s.lockup}>
            <View style={s.monogram}>
              <Text style={s.monogramText}>MS</Text>
            </View>
            <View>
              <Text style={s.wordmark}>MIKISAI</Text>
              <Text style={s.eyebrow}>Accounting</Text>
            </View>
          </View>
          <View style={s.metaRight}>
            <Text style={[s.metaText, { fontFamily: bodyFont(meta.title, meta.locale), color: C.plum, fontWeight: 500 }]}>{meta.title}</Text>
            <Text style={[s.metaText, { fontFamily: bodyFont(meta.periodLabel, meta.locale) }]}>{meta.periodLabel}</Text>
            <Text style={[s.metaText, { fontFamily: bodyFont(meta.generatedBy, meta.locale) }]}>
              {meta.generatedBy} · {meta.generatedAt}
            </Text>
          </View>
        </View>
        {tables.map((t, i) => (
          <TableBlock key={`${t.id}-${i}`} table={t} locale={meta.locale} />
        ))}
        <View style={s.footer} fixed>
          <Text style={{ fontFamily: body }}>
            {meta.brand} · {meta.periodLabel}
          </Text>
          <Text style={{ fontFamily: body }} render={({ pageNumber, totalPages }) => meta.pageLabel(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(tables: ExportTable[], meta: PdfMeta): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReportDocument tables={tables} meta={meta} />);
}
