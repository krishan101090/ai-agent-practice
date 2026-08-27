/**
 * Tool schemas + implementations for the order support agent.
 * The model will call these by name with JSON args — validate everything,
 * never trust args blindly.
 */

import ordersData from "../data/orders.json";
import type { ToolSchema } from "./llmClient";

type Order = {
  id: string;
  customer: string;
  status: string;
  total: number;
  date: string;
  items: string[];
};

const orders: Order[] = ordersData.orders;
const TODAY = ordersData.today;

// --- In-memory refund log. In a real system this would be a DB write. ---
export const refundLog: {
  orderId: string;
  amount: number;
  reason: string;
  timestamp: string;
}[] = [];

export const toolSchemas: ToolSchema[] = [
  {
    name: "lookup_order",
    description:
      "Look up an order by ID. Returns the order details, or null if no order exists with that ID. Never invent an order.",
    input_schema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The order ID to look up (e.g. ORD-1001)",
        },
      },
      required: ["order_id"],
    },
  },
  {
    name: "days_since",
    description:
      "How many whole days have passed between an order date and the reference 'today' date used by the system.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Order date in YYYY-MM-DD format",
        },
        today: {
          type: "string",
          description: "Optional reference date YYYY-MM-DD (defaults to system today)",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "issue_refund",
    description:
      "Issue a refund for an order. Enforces business rules in code. For orders older than 30 days, set manager_override to true only after the user explicitly confirms a manager override — never assume it.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID to refund" },
        amount: { type: "number", description: "Refund amount in dollars" },
        reason: { type: "string", description: "Reason for the refund" },
        manager_override: {
          type: "boolean",
          description:
            "Required true only when the order is older than 30 days AND the user has confirmed manager override",
        },
      },
      required: ["order_id", "amount", "reason"],
    },
  },
];

export function lookupOrder(orderId: string): Order | null {
  if (typeof orderId !== "string" || !orderId.trim()) {
    return null;
  }
  const found = orders.find((o) => o.id === orderId.trim());
  return found ?? null;
}

export function daysSince(dateStr: string, today: string = TODAY): number {
  const start = parseDateUTC(dateStr);
  const end = parseDateUTC(today);
  if (!start || !end) {
    throw new Error(`Invalid date(s): date=${dateStr}, today=${today}`);
  }
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
}

export function issueRefund(
  orderId: string,
  amount: number,
  reason: string,
  managerOverride: boolean = false
): { success: boolean; message: string } {
  if (typeof orderId !== "string" || !orderId.trim()) {
    return { success: false, message: "Invalid order ID." };
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { success: false, message: "Refund amount must be a positive number." };
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return { success: false, message: "A refund reason is required." };
  }

  const order = lookupOrder(orderId);
  if (!order) {
    return {
      success: false,
      message: `No order found with ID ${orderId.trim()}. Cannot issue a refund.`,
    };
  }

  if (order.status !== "delivered") {
    return {
      success: false,
      message: `Refund rejected: order ${order.id} has status "${order.status}". Only delivered orders can be refunded.`,
    };
  }

  if (amount > order.total) {
    return {
      success: false,
      message: `Refund rejected: $${amount} exceeds order total of $${order.total}.`,
    };
  }

  const age = daysSince(order.date);
  if (age > 30 && !managerOverride) {
    return {
      success: false,
      message: `Order ${order.id} is ${age} days old (older than 30 days) and is not refund-eligible without a manager override. Ask the user to confirm manager_override before retrying.`,
    };
  }

  const timestamp = new Date().toISOString();
  refundLog.push({
    orderId: order.id,
    amount,
    reason: reason.trim(),
    timestamp,
  });

  return {
    success: true,
    message: `Refund of $${amount} issued for order ${order.id}. Logged at ${timestamp}. Reason: ${reason.trim()}`,
  };
}

export function callTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "lookup_order": {
      const orderId = String(args.order_id ?? "");
      const order = lookupOrder(orderId);
      return order ?? { found: false, message: `No order found with ID ${orderId}` };
    }
    case "days_since": {
      const date = String(args.date ?? "");
      const today =
        typeof args.today === "string" && args.today ? args.today : undefined;
      return { days: daysSince(date, today) };
    }
    case "issue_refund": {
      return issueRefund(
        String(args.order_id ?? ""),
        Number(args.amount),
        String(args.reason ?? ""),
        Boolean(args.manager_override)
      );
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function parseDateUTC(dateStr: string): Date | null {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}
