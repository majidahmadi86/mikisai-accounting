/**
 * A Finance statement in the exact shape of the Seller Center Income export
 * (.xlsx): sheets "Order details", "Withdrawal records", "Reports" and "Fee
 * explanation"; Gregorian yyyy/mm/dd dates; every number a string. It holds
 * one order from before the business began, a plain 399 order, an overweight
 * parcel, the old 20 kg bundle, a row whose item details are "/", a refund,
 * an early-settlement disbursement and recovery, three Earnings rows, the two
 * "/" mirror rows and one Withdrawal.
 */
import ExcelJS from "exceljs";

export const SKU_1 = "1734376099134211076";
export const SKU_2 = "1734376099134276612";
export const SKU_3 = "1734376099134342148";

export const IDS = { pre: "579900000000000001", plain: "579900000000000101", heavy: "579900000000000102", bundle: "579900000000000103", noDetails: "579900000000000104", refund: "579900000000000105", disbursement: "7400000000000000001", recovery: "7400000000000000002", withdrawal: "8800000000000000001" } as const;

export const ORDER_HEADERS = [
  "Order/Adjustment ID", "Transaction type", "Order created time", "Order settled time", "Currency", "Total settlement amount", "Total Revenue", "Subtotal before discounts", "Seller discounts", "Refund subtotal before seller discounts", "Total Fees", "Transaction fee", "TikTok Shop commission fee", "Seller shipping fee", "Actual shipping fee", "Platform shipping fee discount", "Commerce growth fee", "Adjustment amount", "Related order ID", "Customer payment", "Customer refund", "Platform discount", "Estimated package weight", "Chargeable package weight", "Details of items sold",
];

type OrderRow = { id: string; type: string; created: string; settled: string; settlement: string; revenue: string; refund?: string; fees?: [string, string, string, string, string]; adjustment?: string; related?: string; weight?: string; details: string };

const order = (r: OrderRow): string[] => {
  const [total, transaction, commission, shipping, growth] = r.fees ?? ["0", "0", "0", "0", "0"];
  return [r.id, r.type, r.created, r.settled, "THB", r.settlement, r.revenue, r.revenue, "0", r.refund ?? "0", total, transaction, commission, shipping, shipping, "0", growth, r.adjustment ?? "0", r.related ?? "/", r.revenue, r.refund ?? "0", "0", r.weight ?? "/", r.weight ?? "/", r.details];
};

export const ORDER_ROWS: string[][] = [
  order({ id: IDS.pre, type: "Order", created: "2026/09/10", settled: "2026/09/17", settlement: "310.00", revenue: "399.00", fees: ["-89.00", "-12.57", "-19.95", "-45.00", "-11.48"], weight: "10000", details: `${SKU_1} * 1;` }),
  order({ id: IDS.plain, type: "Order", created: "2026/09/15", settled: "2026/09/18", settlement: "308.46", revenue: "399.00", fees: ["-90.54", "-12.57", "-19.95", "-45.00", "-13.02"], weight: "10000", details: `${SKU_1} * 1;` }),
  order({ id: IDS.heavy, type: "Order", created: "2026/09/16", settled: "2026/09/18", settlement: "272.46", revenue: "399.00", fees: ["-126.54", "-12.57", "-19.95", "-81.00", "-13.02"], weight: "12500", details: `${SKU_1} * 1;` }),
  order({ id: IDS.bundle, type: "Order", created: "2026/09/16", settled: "2026/09/19", settlement: "640.00", revenue: "798.00", fees: ["-158.00", "-25.14", "-39.90", "-67.00", "-25.96"], weight: "20000", details: `${SKU_2} * 1;` }),
  order({ id: IDS.noDetails, type: "Order", created: "2026/09/17", settled: "2026/09/19", settlement: "960.00", revenue: "1197.00", fees: ["-237.00", "-37.71", "-59.85", "-100.00", "-39.44"], weight: "30000", details: "/" }),
  order({ id: IDS.refund, type: "Order", created: "2026/09/16", settled: "2026/09/19", settlement: "-45.00", revenue: "0", refund: "-399.00", fees: ["-45.00", "0", "0", "-45.00", "0"], details: `${SKU_1} * 1;` }),
  order({ id: IDS.disbursement, type: "Early Settlement disbursement", created: "/", settled: "2026/09/16", settlement: "500.00", revenue: "0", adjustment: "500.00", details: "/" }),
  order({ id: IDS.recovery, type: "Early Settlement recovery", created: "/", settled: "2026/09/19", settlement: "-200.00", revenue: "0", adjustment: "-200.00", details: "/" }),
];

export const WALLET_HEADERS = ["Transaction type", "Reference ID", "Request time", "Amount", "Status", "Success time", "Bank account"];
export const WALLET_ROWS: string[][] = [
  ["/", IDS.disbursement, "2026/09/16 09:00:00", "500.00", "Success", "2026/09/16 09:00:00", "/"],
  ["Earnings", "6600000000000000017", "2026/09/17 23:59:00", "310.00", "Success", "2026/09/17 23:59:00", "/"],
  ["Earnings", "6600000000000000018", "2026/09/18 08:00:00", "580.92", "Success", "2026/09/18 08:00:00", "/"],
  ["Withdrawal", IDS.withdrawal, "2026/09/18 10:15:00", "-1390.92", "Success", "2026/09/18 16:40:00", "KASIKORNBANK ****1234"],
  ["Earnings", "6600000000000000019", "2026/09/19 23:59:00", "1355.00", "Success", "2026/09/19 23:59:00", "/"],
  ["/", IDS.recovery, "2026/09/19 09:00:00", "-200.00", "Success", "2026/09/19 09:00:00", "/"],
];

export const REPORT_ROWS: string[][] = [["Income statement"], ["Time period", "2026/09/10 - 2026/09/20"], ["Total settlement amount", "2745.92"]];

export const STATEMENT_GRIDS: Record<string, string[][]> = {
  "Order details": [ORDER_HEADERS, ...ORDER_ROWS],
  "Withdrawal records": [WALLET_HEADERS, ...WALLET_ROWS],
  Reports: REPORT_ROWS,
  "Fee explanation": [["Fee", "Explanation"], ["Transaction fee", "Charged on every order."]],
};

/** The same statement as the .xlsx bytes TikTok would send. */
export async function statementXlsx(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const [name, grid] of Object.entries(STATEMENT_GRIDS)) {
    const ws = wb.addWorksheet(name);
    for (const cells of grid) ws.addRow(cells);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
