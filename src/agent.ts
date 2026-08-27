/**
 * Multi-turn orchestration loop: model → tool call → tool result → model → …
 */

import { callModel, Message } from "./llmClient";
import { callTool, toolSchemas } from "./tools";

const SYSTEM_PROMPT = `
You are an order support agent for an e-commerce company. You help staff look up
orders, check refund eligibility, and issue refunds using the provided tools.

Rules:
- ALWAYS call lookup_order before discussing or refunding a specific order.
- NEVER invent or fabricate order IDs, statuses, totals, dates, or other details.
  If a lookup returns nothing, say the order was not found.
- Refunds are only allowed for delivered orders, cannot exceed the order total,
  and orders older than 30 days require an explicit manager override from the user.
- If an order is older than 30 days, ASK the user to confirm a manager override.
  Never assume override is granted. Only pass manager_override: true after they confirm.
- Prefer calling days_since when you need to reason about order age.
- When the user asks to refund without specifying an amount, refund the full order total.
- When the user does not give an order ID (e.g. "the order from March"), ask them
  for the order ID rather than guessing.
- Be concise and factual in your final replies.
`.trim();

const MAX_TURNS = 8;

export async function runAgent(userMessage: string): Promise<string> {
  const messages: Message[] = [{ role: "user", content: userMessage }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await callModel(messages, toolSchemas, SYSTEM_PROMPT);
    const blocks = Array.isArray(response.content) ? response.content : [];
    const toolUses = blocks.filter((b: any) => b?.type === "tool_use");

    if (toolUses.length === 0 || response.stop_reason === "end_turn") {
      return extractText(blocks) || "No response from model.";
    }

    messages.push({ role: "assistant", content: blocks });

    const toolResults = toolUses.map((tu: any) => {
      let result: unknown;
      try {
        result = callTool(tu.name, tu.input ?? {});
      } catch (err: any) {
        result = { error: err?.message ?? String(err) };
      }
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      };
    });

    messages.push({ role: "user", content: toolResults });
  }

  return "Agent could not complete the request within the turn limit.";
}

function extractText(blocks: any[]): string {
  return blocks
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
