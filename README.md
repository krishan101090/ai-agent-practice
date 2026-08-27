# AI Agent Practice — 120 min simulation

Read `PROBLEM_BRIEF.md` first — treat it exactly like the real assessment.

## How to start

```bash
npm install
npm run chat
```

You'll see:

```text
Order Support Agent (practice). Type a request, or 'exit' to quit.

>
```

Type a natural-language request, then press Enter. Type `exit` to quit.

### Example prompts

```text
Refund order ORD-1001
Refund order ORD-9999
Refund $500 on ORD-1002
Refund the order from March
What's the status of ORD-1003?
Refund order ORD-1004
```

Requires Node.js 18+ (or any recent LTS with `npm`).

## What's provided (don't rebuild)
- `data/orders.json` — sample data
- `src/llmClient.ts` — LLM client wrapper (offline mock here; in the real test
  this will be a working configured client)
- `src/run.ts` — CLI runner

## What you build
- `src/tools.ts` — tool schemas + `lookupOrder`, `daysSince`, `issueRefund`,
  and a `callTool` dispatcher
- `src/agent.ts` — the multi-turn loop + system prompt

## How to practice this like the real thing
1. Set a 120-min timer.
2. Spend the first 10-15 min just planning — write your tool list and loop
   diagram as comments before touching real logic.
3. Use your AI assistant of choice (Claude Code, Copilot, etc.) the way you
   would in the real test: give it scoped instructions ("implement
   `issueRefund` enforcing these 5 rules"), read the diff, don't accept
   blindly.
4. After each function it writes, close your eyes and explain it out loud —
   if you can't, that's a flag to slow down and actually read it.
5. Once `agent.ts` and `tools.ts` are filled in, run `npm run chat` and test
   the prompts above (and the ones at the bottom of the brief).

## Self-grading checklist (same 4 assessment areas)
- [ ] I sketched the tool list + loop shape before coding
- [ ] I gave the AI focused, scoped prompts — not "build the whole thing"
- [ ] I can explain every line, including AI-generated ones
- [ ] Bad order ID → handled without fabrication
- [ ] Refund > order total → rejected
- [ ] Refund on non-delivered order → rejected
- [ ] Order > 30 days old → agent asks for confirmation, doesn't assume
- [ ] Every successful refund is logged before being reported as done
