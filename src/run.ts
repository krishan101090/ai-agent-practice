/**
 * PROVIDED — working CLI runner. You don't need to modify this.
 * Run with: npm run chat
 */
import * as readline from "readline";
import { runAgent } from "./agent";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("Order Support Agent (practice). Type a request, or 'exit' to quit.\n");

function prompt() {
  rl.question("> ", async (input) => {
    if (input.trim().toLowerCase() === "exit") {
      rl.close();
      return;
    }
    try {
      const reply = await runAgent(input);
      console.log("\n" + reply + "\n");
    } catch (err: any) {
      console.error("\n[Error] " + err.message + "\n");
    }
    prompt();
  });
}

prompt();
