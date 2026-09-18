/**
 * TikTok Shop Open API response shapes (Partner Center, API version 202309),
 * as far as the sync reads them. Amounts arrive as strings; the mapper parses
 * them. Fields are optional on purpose: TikTok shapes drift between regions
 * and releases, and the recorded fixtures in tests/fixtures/tiktok are the
 * contract the mapper is tested against.
 */
export type TikTokOrderStatus = "UNPAID" | "ON_HOLD" | "AWAITING_SHIPMENT" | "AWAITING_COLLECTION" | "PARTIALLY_SHIPPING" | "IN_TRANSIT" | "DELIVERED" | "COMPLETED" | "CANCELLED";

export type TikTokLineItem = {
  id: string;
  sku_id?: string;
  sku_name?: string;
  product_id?: string;
  product_name?: string;
  seller_sku?: string;
  sale_price?: string;
  original_price?: string;
  seller_discount?: string;
  platform_discount?: string;
  display_status?: string;
  currency?: string;
};

export type TikTokOrder = {
  id: string;
  status: TikTokOrderStatus | string;
  create_time: number;
  update_time: number;
  paid_time?: number;
  delivery_time?: number;
  cancel_reason?: string;
  cancellation_initiator?: string;
  buyer_email?: string;
  user_id?: string;
  recipient_address?: { name?: string };
  payment?: { currency?: string; sub_total?: string; shipping_fee?: string; total_amount?: string; seller_discount?: string; platform_discount?: string; tax?: string };
  line_items?: TikTokLineItem[];
};

export type TikTokReturn = {
  return_id: string;
  order_id: string;
  return_type: "REFUND" | "RETURN_AND_REFUND" | "REPLACEMENT" | string;
  return_status: string;
  refund_amount?: { currency?: string; refund_total?: string; refund_subtotal?: string; refund_shipping_fee?: string };
  return_line_items?: { sku_id?: string; order_line_item_id?: string }[];
  create_time?: number;
  update_time?: number;
};

export type TikTokStatement = {
  id: string;
  statement_time: number;
  settlement_amount?: string;
  currency?: string;
  payment_status?: "PAID" | "PROCESSING" | "FAILED" | string;
  payment_id?: string;
  revenue_amount?: string;
  fee_amount?: string;
  adjustment_amount?: string;
  net_sales_amount?: string;
};

export type TikTokStatementTransaction = {
  id: string;
  order_id?: string;
  type: "ORDER" | "ADJUSTMENT" | string;
  statement_time?: number;
  settlement_amount?: string;
  revenue_amount?: string;
  fee_amount?: string;
  currency?: string;
};

export type TikTokPayment = {
  id: string;
  create_time?: number;
  paid_time?: number;
  status: "PAID" | "PROCESSING" | "FAILED" | string;
  amount?: { value?: string; currency?: string };
  settlement_amount?: { value?: string; currency?: string };
  bank_account?: string;
};

export type TikTokEnvelope<T> = { code: number; message: string; request_id?: string; data?: T };
