/**
 * PROVIDED — wraps a call to an Anthropic-style /v1/messages endpoint with tool support.
 *
 * In the real assessment this hits a live API. Here it is an offline mock that
 * drives the practice test prompts via the same tool_use / tool_result protocol
 * your agent loop must handle.
 */

export type ToolSchema = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type Message = {
  role: "user" | "assistant" | "tool";
  content: any;
};

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

let toolCounter = 0;

function nextToolId(): string {
  toolCounter += 1;
  return `toolu_mock_${toolCounter}`;
}

function toolUse(
  name: string,
  input: Record<string, unknown>
): ContentBlock {
  return { type: "tool_use", id: nextToolId(), name, input };
}

function text(t: string): ContentBlock {
  return { type: "text", text: t };
}

function flattenText(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === "text")
    .map((b) => b.text)
    .join(" ");
}

function getOriginalUserText(messages: Message[]): string {
  for (const m of messages) {
    if (m.role === "user" && typeof m.content === "string") {
      return m.content;
    }
  }
  return "";
}

function parseToolResult(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function latestToolResults(messages: Message[]): { name: string; result: any }[] {
  // Walk backwards: find the latest user message of tool_result blocks,
  // paired with the preceding assistant tool_use names.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    const results = m.content.filter((b: any) => b?.type === "tool_result");
    if (results.length === 0) continue;

    const prev = messages[i - 1];
    const uses =
      prev?.role === "assistant" && Array.isArray(prev.content)
        ? prev.content.filter((b: any) => b?.type === "tool_use")
        : [];

    return results.map((r: any) => {
      const match = uses.find((u: any) => u.id === r.tool_use_id);
      return {
        name: match?.name ?? "unknown",
        result: parseToolResult(r.content),
      };
    });
  }
  return [];
}

function extractOrderId(text: string): string | null {
  const m = text.match(/\bORD-\d+\b/i);
  return m ? m[0].toUpperCase() : null;
}

function extractAmount(text: string): number | null {
  const m = text.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]);
  const m2 = text.match(/\b(\d+(?:\.\d+)?)\s*dollars?\b/i);
  if (m2) return Number(m2[1]);
  return null;
}

function wantsRefund(text: string): boolean {
  return /\brefund\b/i.test(text);
}

function wantsStatus(text: string): boolean {
  return /\bstatus\b/i.test(text) || /\bwhat(?:'s| is)\b/i.test(text);
}

function userConfirmedOverride(messages: Message[]): boolean {
  const latestUser = [...messages].reverse().find(
    (m) => m.role === "user" && typeof m.content === "string"
  );
  if (!latestUser || typeof latestUser.content !== "string") return false;
  return /\b(yes|confirm|override|approved|go ahead|proceed)\b/i.test(
    latestUser.content
  );
}

/**
 * Offline mock of an Anthropic-style tool-using model.
 * Signature matches what agent.ts should call in the real assessment.
 */
export async function callModel(
  messages: Message[],
  _tools: ToolSchema[],
  _system?: string
): Promise<{ content: any[]; stop_reason: string }> {
  const userText = getOriginalUserText(messages);
  const orderId = extractOrderId(userText);
  const amountHint = extractAmount(userText);
  const toolResults = latestToolResults(messages);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const alreadyLookedUp =
    toolResults.some((t) => t.name === "lookup_order") ||
    (lastAssistant &&
      Array.isArray(lastAssistant.content) &&
      lastAssistant.content.some((b: any) => b?.name === "lookup_order"));

  // No order ID in the request (e.g. "Refund the order from March")
  if (!orderId && wantsRefund(userText) && toolResults.length === 0) {
    return {
      stop_reason: "end_turn",
      content: [
        text(
          "I need a specific order ID to look that up — I can't guess which March order you mean. Please provide the order ID (e.g. ORD-1004)."
        ),
      ],
    };
  }

  if (!orderId && toolResults.length === 0) {
    return {
      stop_reason: "end_turn",
      content: [
        text(
          "Please provide an order ID (e.g. ORD-1001) so I can look it up."
        ),
      ],
    };
  }

  // Step 1: always look up the order first
  if (orderId && !alreadyLookedUp && toolResults.length === 0) {
    return {
      stop_reason: "tool_use",
      content: [toolUse("lookup_order", { order_id: orderId })],
    };
  }

  const lookup = toolResults.find((t) => t.name === "lookup_order");
  if (lookup) {
    const order = lookup.result;
    const notFound =
      !order ||
      order.found === false ||
      (typeof order === "object" && !order.id);

    if (notFound) {
      return {
        stop_reason: "end_turn",
        content: [
          text(
            `I couldn't find an order with ID ${orderId}. Please double-check the ID — I won't invent order details.`
          ),
        ],
      };
    }

    // Status / info request
    if (wantsStatus(userText) && !wantsRefund(userText)) {
      return {
        stop_reason: "end_turn",
        content: [
          text(
            `Order ${order.id}: status is "${order.status}", customer ${order.customer}, total $${order.total}, date ${order.date}, items: ${order.items.join(", ")}.`
          ),
        ],
      };
    }

    if (wantsRefund(userText)) {
      // Check age before attempting refund
      const ageCheck = toolResults.find((t) => t.name === "days_since");
      if (!ageCheck) {
        return {
          stop_reason: "tool_use",
          content: [toolUse("days_since", { date: order.date })],
        };
      }

      const days = Number(ageCheck.result?.days);
      const refundAttempt = toolResults.find((t) => t.name === "issue_refund");

      if (!refundAttempt) {
        if (days > 30 && !userConfirmedOverride(messages)) {
          return {
            stop_reason: "end_turn",
            content: [
              text(
                `Order ${order.id} is ${days} days old (over the 30-day window). I can't refund it without a manager override. Do you want me to proceed with manager_override confirmed?`
              ),
            ],
          };
        }

        const amount = amountHint ?? order.total;
        return {
          stop_reason: "tool_use",
          content: [
            toolUse("issue_refund", {
              order_id: order.id,
              amount,
              reason: "Customer support refund request",
              manager_override: days > 30 && userConfirmedOverride(messages),
            }),
          ],
        };
      }

      const r = refundAttempt.result;
      if (r?.success) {
        return {
          stop_reason: "end_turn",
          content: [text(r.message)],
        };
      }
      return {
        stop_reason: "end_turn",
        content: [text(r?.message ?? "Refund could not be completed.")],
      };
    }

    return {
      stop_reason: "end_turn",
      content: [
        text(
          `Found order ${order.id}: status "${order.status}", total $${order.total}, date ${order.date}.`
        ),
      ],
    };
  }

  // After days_since only (lookup was earlier in the chain — re-derive from history)
  const daysOnly = toolResults.find((t) => t.name === "days_since");
  const refundOnly = toolResults.find((t) => t.name === "issue_refund");

  if (daysOnly && !refundOnly && orderId && wantsRefund(userText)) {
    // Re-lookup context from conversation history
    let order: any = null;
    for (const m of messages) {
      if (m.role !== "user" || !Array.isArray(m.content)) continue;
      for (const b of m.content) {
        if (b?.type !== "tool_result") continue;
        const parsed = parseToolResult(b.content);
        if (parsed && parsed.id === orderId) order = parsed;
      }
    }

    const days = Number(daysOnly.result?.days);
    if (days > 30 && !userConfirmedOverride(messages)) {
      return {
        stop_reason: "end_turn",
        content: [
          text(
            `Order ${orderId} is ${days} days old (over the 30-day window). I can't refund it without a manager override. Do you want me to proceed with manager_override confirmed?`
          ),
        ],
      };
    }

    const amount = amountHint ?? order?.total;
    if (amount == null) {
      return {
        stop_reason: "end_turn",
        content: [text("I need the refund amount (or a prior successful order lookup).")],
      };
    }

    return {
      stop_reason: "tool_use",
      content: [
        toolUse("issue_refund", {
          order_id: orderId,
          amount,
          reason: "Customer support refund request",
          manager_override: days > 30 && userConfirmedOverride(messages),
        }),
      ],
    };
  }

  if (refundOnly) {
    const r = refundOnly.result;
    return {
      stop_reason: "end_turn",
      content: [text(r?.message ?? "Done.")],
    };
  }

  return {
    stop_reason: "end_turn",
    content: [text("I'm not sure how to help with that request.")],
  };
}
