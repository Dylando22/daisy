import chalk from "chalk";
import { GoogleGenAI } from "@google/genai";
import { state } from "./state.js";
import { startThinkingSpinner, logError } from "./utils.js";
import "dotenv/config";
import os from "os";
import path from "path";
import fs from "fs";

// Token Optimization Limits for Free Tier
const MAX_HISTORY_TURNS = 15;
const MAX_TEXT_LENGTH = 40000;

function getApiKey() {
  // 1. Check environment variables
  if (process.env.DAISY_API_KEY || process.env.GEMINI_API_KEY) {
    return process.env.DAISY_API_KEY || process.env.GEMINI_API_KEY;
  }

  // 2. Check global config file
  const configPath = path.join(os.homedir(), '.daisy', 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.apiKey;
    }
  } catch (err) {
    // Ignore error, return undefined
  }
  return null;
}

export async function callApi(prompt, streaming) {
  let spinnerInterval;
  try {
    state.apiError = null;

    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("API Key not found. Please set DAISY_API_KEY or create ~/.daisy/config.json");
    }

    // 1. Build Contents Array
    const rawContents = [];

    if (Array.isArray(state.conversationBuffer)) {
      const historySlice = state.conversationBuffer
        .filter(
          (entry) =>
            typeof entry === "string" && !entry.startsWith("System [ls-r]:"),
        )
        .slice(-MAX_HISTORY_TURNS);

      for (const entry of historySlice) {
        const isModel =
          entry.startsWith("DAISY:") ||
          entry.startsWith("System: <fileUpdated") ||
          entry.startsWith("System: <fileWrote");
        const role = isModel ? "model" : "user";

        let cleanText = entry.replace(/^(DAISY:|User:|System:)\s*/i, "").trim();
        if (cleanText.length > MAX_TEXT_LENGTH) {
          cleanText =
            cleanText.substring(0, MAX_TEXT_LENGTH) +
            "\n...[TRUNCATED FOR TOKEN OPTIMIZATION]";
        }

        if (cleanText) {
          rawContents.push({ role, parts: [{ text: cleanText }] });
        }
      }
    }

    let cleanPrompt = prompt.replace(/^(User:)\s*/i, "").trim();
    if (cleanPrompt.length > MAX_TEXT_LENGTH) {
      cleanPrompt =
        cleanPrompt.substring(0, MAX_TEXT_LENGTH) + "\n...[TRUNCATED]";
    }
    rawContents.push({ role: "user", parts: [{ text: cleanPrompt }] });

    const mergedContents = [];
    for (const item of rawContents) {
      if (
        mergedContents.length > 0 &&
        mergedContents[mergedContents.length - 1].role === item.role
      ) {
        mergedContents[mergedContents.length - 1].parts[0].text +=
          "\n\n" + item.parts[0].text;
      } else {
        mergedContents.push({
          role: item.role,
          parts: [{ text: item.parts[0].text }],
        });
      }
    }

    let systemText = state.systemContext || state.AI_INSTRUCTIONS || "";
    if (state.directoryContext && state.directoryContextPending) {
      systemText += `\n\n[Directory Context]\n${state.directoryContext}`;
      state.directoryContextPending = false;
    }

    const client = new GoogleGenAI({ apiKey });
    const model = state.CURRENT_MODEL || "gemini-1.5-flash";

    if (state.debugMode) {
      console.log(
        chalk.magenta("Payload Configuration:"),
        JSON.stringify(
          { model, contents: mergedContents, systemInstruction: systemText },
          null,
          2,
        ),
      );
    }

    if (streaming) {
      process.stdout.write(chalk.cyan.bold("\n ✦ DAISY (streaming):\n"));
      let fullResponse = "";
      let requestTokens = 0;

      const responseStream = await client.models.generateContentStream({
        model: model,
        contents: mergedContents,
        config: { systemInstruction: systemText },
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullResponse += chunk.text;
          process.stdout.write(chunk.text);
        }
        if (chunk.usageMetadata?.totalTokenCount) {
          requestTokens = chunk.usageMetadata.totalTokenCount;
        }
      }

      state.TokensUsed += requestTokens;
      console.log("\n");
      return fullResponse;
    } else {
      spinnerInterval = startThinkingSpinner();
      const response = await client.models.generateContent({
        model: model,
        contents: mergedContents,
        config: { systemInstruction: systemText },
      });

      if (response.usageMetadata?.totalTokenCount) {
        state.TokensUsed += response.usageMetadata.totalTokenCount;
      }

      let content = response.text || "";
      const descMatch = content.match(/<chatDescription>([\s\S]*?)<\/chatDescription>/i);
      if (descMatch) {
        state.chatDescription = `Chat Description: ${descMatch[1].trim()}`;
        content = content.replace(/<chatDescription>[\s\S]*?<\/chatDescription>\n*/i, "").trim();
      }

      return content;
    }
  } catch (error) {
    state.apiError = error.message;
    logError("API", error.message);
    return "";
  } finally {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }
  }
}