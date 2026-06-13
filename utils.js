import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { state } from "./state.js";

const width = process.stdout.columns || 80;

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const THINKING_MESSAGES = [
  "Architecting",
  "Conceptualizing",
  "Deconstructing",
  "Strategizing",
  "Synthesizing",
  "Contemplating",
  "Mapping logic",
  "Abstracting",
  "Deliberating",
  "Visualizing",
  "Processing",
  "Ruminating",
  "Ideating",
  "Systemizing",
  "Cognitating",
  "Implementing",
  "Constructing",
  "Scripting",
  "Developing",
  "Drafting",
  "Assembling",
  "Composing",
  "Formatting",
  "Initializing",
  "Deploying",
  "Integrating",
  "Refactoring",
  "Modifying",
  "Streamlining",
  "Encoding",
  "Troubleshooting",
  "Investigating",
  "Validating",
  "Auditing",
  "Scrutinizing",
  "Optimizing",
  "Triaging",
  "Fine-tuning",
  "Diagnosing",
  "Parsing",
  "Patching",
  "Simulating",
  "Isolating",
  "Verifying",
  "Iterating",
  "Compiling thoughts",
  "Calculating",
  "Formatting logic",
  "Resolving dependencies",
];

export const logError = (type, message) => {
  console.error(chalk.red(`[${type}] ${message}`));
};

export function startThinkingSpinner() {
  let frameIndex = 0;
  let messageIndex = Math.floor(Math.random() * THINKING_MESSAGES.length);
  let messageTimer = 0;

  return setInterval(() => {
    if (state.isSpinnerPaused) return;

    messageTimer += 100;
    if (messageTimer >= 8000) {
      messageIndex = Math.floor(Math.random() * THINKING_MESSAGES.length);
      messageTimer = 0;
    }
    const spinner = chalk.cyan(
      SPINNER_FRAMES[frameIndex++ % SPINNER_FRAMES.length],
    );
    process.stdout.cursorTo(0);
    process.stdout.clearLine(0);
    process.stdout.write(
      ` ${spinner} ${chalk.italic.cyan(THINKING_MESSAGES[messageIndex])}...`,
    );
  }, 100);
}

export function printBanner() {
  console.log(chalk.cyan.bold("╭" + "─".repeat(width - 2) + "╮"));
  console.log(
    chalk.cyan.bold("│") +
      chalk.bold.white(
        " 🌼 D.A.I.S.Y v3.0.0 "
          .padStart(Math.floor(width / 2) + 11)
          .padEnd(width - 2),
      ) +
      chalk.cyan.bold("│"),
  );
  console.log(
    chalk.cyan.bold("│") +
      chalk.dim(
        " Dylans Artificial Intelligence System "
          .padStart(Math.floor(width / 2) + 20)
          .padEnd(width - 2),
      ) +
      chalk.cyan.bold("│"),
  );
  console.log(chalk.cyan.bold("├" + "─".repeat(width - 2) + "┤"));
  console.log(
    chalk.cyan.bold("│") +
      chalk.dim(
        " Type /help for commands | /auto for autonomous mode "
          .padStart(Math.floor(width / 2) + 26)
          .padEnd(width - 2),
      ) +
      chalk.cyan.bold("│"),
  );
  console.log(chalk.cyan.bold("╰" + "─".repeat(width - 2) + "╯"));
}

export function printStatusInfo() {
  const modelPill = chalk.cyan.bold(` 🤖 ${state.CURRENT_MODEL} `);
  const tokenPill = chalk.white.bold(
    ` 🪙 TOKENS: ${state.TokensUsed.toLocaleString()} `,
  );
  const descTag = chalk.dim(
    ` 📝 ${(state.chatDescription || "").replace("Chat Description: ", "")} `,
  );

  console.log(`\n ${modelPill} ${tokenPill} ${descTag}`);
  console.log(chalk.dim("─".repeat(width)));
}

export async function autoSaveLog() {
  const logDir = path.join(os.homedir(), ".genai", "logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `${state.sessionStartTime}.log`);

  const payload = {
    state: {
      autoMode: state.autoMode,
      CURRENT_MODEL: state.CURRENT_MODEL,
      MAX_HISTORY_CHARS: state.MAX_HISTORY_CHARS,
      trustMode: state.trustMode,
      debugMode: state.debugMode,
      apiSession: state.apiSession,
    },
    conversationBuffer: state.conversationBuffer,
  };
  const fileContent = `${state.chatDescription}\n${JSON.stringify(payload, null, 2)}`;
  fs.writeFileSync(logPath, fileContent, "utf8");
}

export function renderDiff(original, proposed) {
  const origLines = original.split("\n");
  const propLines = proposed.split("\n");

  const dp = Array(origLines.length + 1)
    .fill(null)
    .map(() => Array(propLines.length + 1).fill(0));
  for (let i = 1; i <= origLines.length; i++) {
    for (let j = 1; j <= propLines.length; j++) {
      if (origLines[i - 1] === propLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const diff = [];
  let i = origLines.length;
  let j = propLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === propLines[j - 1]) {
      diff.unshift({ type: "common", text: origLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: "add", text: propLines[j - 1] });
      j--;
    } else {
      diff.unshift({ type: "delete", text: origLines[i - 1] });
      i--;
    }
  }

  const contextWindow = 3;
  let skipped = false;
  const output = [];

  for (let k = 0; k < diff.length; k++) {
    let isNearChange = false;
    for (
      let r = Math.max(0, k - contextWindow);
      r <= Math.min(diff.length - 1, k + contextWindow);
      r++
    ) {
      if (diff[r].type === "add" || diff[r].type === "delete") {
        isNearChange = true;
        break;
      }
    }

    if (isNearChange) {
      if (skipped) {
        output.push(chalk.dim("..."));
        skipped = false;
      }
      if (diff[k].type === "add") {
        output.push(chalk.green(`+ ${diff[k].text}`));
      } else if (diff[k].type === "delete") {
        output.push(chalk.red(`- ${diff[k].text}`));
      } else {
        output.push(chalk.gray(`  ${diff[k].text}`));
      }
    } else {
      skipped = true;
    }
  }
  if (skipped) {
    output.push(chalk.dim("..."));
  }

  console.log("\n" + output.join("\n"));
}
