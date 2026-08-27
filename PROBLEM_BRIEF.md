# Practice Brief: Order Support Agent (120 min simulation)

## Scenario
You work for an e-commerce company. Build the backend of an AI agent that helps
support staff look up orders, check refund eligibility, and issue refunds —
via natural language, using tool calls.

You are given (do not rebuild these):
- `data/orders.json` — sample order data
- `src/llmClient.ts` — a configured LLM client wrapper (`callModel`)
- `src/run.ts` — a working CLI runner (`npm run chat`)

You must build:
- `src/tools.ts` — tool schemas + implementations
- `src/agent.ts` — the multi-turn orchestration loop (model → tool call → tool
  result → model → ... → final answer)
- Business rules enforcement (see below)

## Business rules (must be enforced in CODE, not just prompted)
1. Refunds can only be issued for orders with status `delivered`.
2. Refunds cannot exceed the original order total.
3. Orders older than 30 days (from `today` in orders.json) are NOT refund-eligible
   without a `manager_override: true` flag — the agent must ask for confirmation,
   never assume it.
4. The agent must never invent an order ID. If a lookup returns nothing, it must
   say so, not fabricate order details.
5. Every refund action must be logged (id, amount, reason, timestamp) before
   being reported back to the user as complete.

## Assessment areas (same as real test)
1. **Plan first** — sketch tool list + loop shape before coding.
2. **Drive the AI, don't be driven** — give scoped prompts, review diffs, fix
   mistakes rather than accept them.
3. **Own your code** — be able to explain any line, including AI-written ones.
4. **Safety & correctness** — handle malformed input, hallucinated tool args,
   ambiguous requests, and the business rules above.

## Suggested 120-min pacing
- 0–15 min: Read data, sketch tool schemas + loop diagram (on paper/comments)
- 15–70 min: Build `tools.ts` + `agent.ts` core loop
- 70–95 min: Wire business rules + edge cases
- 95–115 min: Test messy inputs (bad order ID, huge refund, old order, no override)
- 115–120 min: Explain your solution out loud to yourself — any surprises?

## Test prompts to try once built
- "Refund order ORD-1001"
- "Refund order ORD-9999" (doesn't exist)
- "Refund $500 on ORD-1002" (exceeds order total)
- "Refund the order from March" (older than 30 days, no override)
- "What's the status of ORD-1003?"
