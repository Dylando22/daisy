#!/usr/bin/env node
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

marked.setOptions({ renderer: new TerminalRenderer() });

import { state } from './state.js';
import { printBanner, printStatusInfo, autoSaveLog, logError } from './utils.js';
import { getInteractiveInput, getMultilineInput, rl } from './input.js';
import { commands, handleUpdate, handleWrite, handleRead, handleIndexDir } from './commands.js';
import { pushToBuffer } from './buffer.js';
import { callApi } from './api.js';
state.CURRENT_MODEL = 'gemini-3.1-flash-lite';

try {
  const contextPath = path.join(__dirname, 'context.md');
  state.systemContext = fs.readFileSync(contextPath, 'utf8') + (state.AI_INSTRUCTIONS || '');
} catch (err) {
  state.systemContext = state.AI_INSTRUCTIONS || '';
}

state.conversationBuffer = [state.systemContext + '\n\n'];

// Core Chat Loop Modified for Native API Integration
async function startChat() {
  console.clear();
  printBanner();

  if (process.argv.includes('--auto') || process.argv.includes('-a')) {
    await commands['/auto']();
  }

  while (true) {
    printStatusInfo();
    console.log(chalk.gray(` 📂 Location: ${process.cwd()}\n`));
    
    let promptLabel = chalk.green.bold(' ❯ You: ');
    let placeholder = 'Message or /help';

    if (state.updateContinue) {
      promptLabel = chalk.hex('#E5C07B').bold(` ↻ Modify ${path.basename(state.lastFilePath || 'file')} ❯ `);
      placeholder = 'Type changes...';
    } else if (state.autoMode) {
      promptLabel = chalk.blue.bold(' ⚙ Auto ❯ ');
      placeholder = 'Auto-pilot active...';
    }

    let userInput = await getInteractiveInput(promptLabel, placeholder, state.commandHistory, state.ALL_COMMANDS);
    if (!userInput) continue;
    
    if (state.commandHistory[state.commandHistory.length - 1] !== userInput) state.commandHistory.push(userInput);

    const cmdParts = userInput.trim().split(/\s+/);
    let cmdKey = cmdParts[0].toLowerCase();
    const cmdArgs = cmdParts.slice(1);

    const autoBypassCommands = ['read', 'write', 'update', 'index-dir'];
    if (!cmdKey.startsWith('/') && state.ALL_COMMANDS.includes('/' + cmdKey)) {
      if (!(state.autoMode && autoBypassCommands.includes(cmdKey))) {
        cmdKey = '/' + cmdKey;
      }
    }

    if (cmdKey.startsWith('/')) {
      if (cmdKey !== '/auto') state.updateContinue = false;
    }

    const startTime = performance.now();
    let commandExecuted = false;

    if (cmdKey === '/paste') {
      const content = await getMultilineInput();
      if (content) {
        pushToBuffer(`User [Paste]: ${content}`);
        let currentRes = await callApi(content, false);
        pushToBuffer(`DAISY: ${currentRes}`);
        console.log(chalk.cyan.bold('\n ✦ DAISY:'), marked.parse(currentRes));
      }
      commandExecuted = true;
    } else if (commands[cmdKey]) {
      await commands[cmdKey](cmdArgs);
      commandExecuted = true;
    } else if (cmdKey === '/update' || state.updateContinue) {
      await handleUpdate(userInput, cmdArgs[0]);
      commandExecuted = true;
    } else if (cmdKey === '/write') {
      await handleWrite(cmdArgs.length ? cmdArgs.join(' ') : null);
      commandExecuted = true;
    } else if (cmdKey === '/read') {
      await handleRead(cmdArgs[0], cmdArgs.slice(1).join(' '));
      commandExecuted = true;
    }

    if (commandExecuted) {
      const duration = ((performance.now() - startTime) / 1000).toFixed(3);
      console.log(chalk.gray(` ⏱ Command executed in ${duration}s`));
    } else {
      const autoInstruction = state.autoMode ? '\n[System: Ensure generated command prompts are highly descriptive and optimally detailed for the AI to execute.]' : '';
      pushToBuffer(`User: ${userInput}${autoInstruction}`);
      
      let currentRes = await callApi(`${userInput}${autoInstruction}`, false);

      while (currentRes) {
        // ... [truncated for brevity, maintaining existing auto-logic]
        let executedAuto = false;
        let cancelledAuto = false;
        if (state.autoMode) {
          try {
            const xmlMatch = currentRes.match(/<commands>([\s\S]*?)<\/commands>/i);
            if (xmlMatch) {
              const commandTags = xmlMatch[1].match(/<command>([\s\S]*?)<\/command>/gi);
              if (commandTags && commandTags.length > 0) {
                const parsedCmds = commandTags.map(tag => {
                  try {
                    const jsonMatch = tag.match(/<command>([\s\S]*?)<\/command>/i);
                    if (jsonMatch && jsonMatch[1]) {
                      const cmdObj = JSON.parse(jsonMatch[1].trim());
                      const cmd = cmdObj.command || '';
                      const loc = cmdObj.location || '';
                      const prompt = cmdObj.prompt || '';
                      let args = [];
                      if (cmd === '/write') args = [prompt];
                      else if (cmd === '/index-dir') args = [loc];
                      else args = [loc, prompt];
                      return { cmd, args, loc, prompt, raw: tag.trim() };
                    }
                  } catch (e) {}
                  return { cmd: null };
                }).filter(c => c && c.cmd);

                if (parsedCmds.length > 0) {
                  console.log(chalk.hex('#E5C07B')('\n ╭─ Auto-mode detected commands:'));
                  parsedCmds.forEach(c => {
                    let desc = c.cmd;
                    if (c.loc) desc += ` ${c.loc}`;
                    if (c.prompt) desc += chalk.dim(` - "${c.prompt}"`);
                    console.log(` │ ${chalk.cyan('➜')} ${desc}`);
                  });
                  console.log(' ╰' + '─'.repeat((state.width || 80) - 3));
                  
                  let shouldExecute = false;

                  if (state.trustMode && state.autoCommandCount >= 10) {
                    const confirm = await rl.question(chalk.hex('#E5C07B').bold('\n ❯ 10 commands have run automatically. Execute next commands? (y/n): '));
                    if (confirm.toLowerCase() === 'y') {
                      shouldExecute = true;
                      state.autoCommandCount = 0;
                    } else {
                      state.autoCommandCount = 0;
                    }
                  } else if (state.trustMode) {
                    shouldExecute = true;
                  } else {
                    const confirm = await rl.question(chalk.hex('#E5C07B').bold('\n ❯ Execute all commands? (y/n): '));
                    if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
                      shouldExecute = true;
                    }
                  }

                  if (shouldExecute) {
                    executedAuto = true;
                    if (state.trustMode) {
                      state.autoCommandCount += parsedCmds.length;
                    }
                    pushToBuffer(`DAISY (Auto-Plan): ${currentRes}`);

                    const isExplicitRead = /\bread\b/i.test(userInput);
                    const historyLengthBefore = state.conversationBuffer.length;

                    for (const c of parsedCmds) {
                      const { cmd, args } = c;
                      if (cmd !== '/read' || isExplicitRead) {
                        console.log(chalk.hex('#E5C07B')(`\n ⚙ [Auto-executing]: ${cmd} with ${args.filter(Boolean).join(', ')}`));
                      }
                      const cmdStart = performance.now();
                      if (cmd === '/index-dir') await handleIndexDir(args[0]);
                      else if (cmd === '/read') await handleRead(args[0], args[1], !isExplicitRead);
                      else if (cmd === '/write') await handleWrite(args[0]);
                      else if (cmd === '/update') await handleUpdate('', args[0], args[1]);
                      const cmdDuration = ((performance.now() - cmdStart) / 1000).toFixed(3);
                      console.log(chalk.gray(" ⏱ Command executed in " + cmdDuration + "s"));
                    }
                    console.log(chalk.blue('\n ℹ Auto-commands complete. Re-evaluating...'));
                    const reevalPrompt = 'Original Goal: ' + userInput + '\n\nNew Execution Results:\n' + (state.conversationBuffer.slice(historyLengthBefore).join('\n') || 'System: Auto-commands complete. Please re-evaluate.');
                    currentRes = await callApi(reevalPrompt, false);
                    continue; 
                  } else {
                    cancelledAuto = true;
                    pushToBuffer(`System: User cancelled the auto-execution of commands.`);
                    console.log(chalk.hex('#E5C07B')('\n ✖ Auto-execution cancelled.'));
                  }
                }
              }
            }
          } catch (e) { }
        }

        if (!executedAuto) {
          if (!cancelledAuto) {
            pushToBuffer(`DAISY: ${currentRes}`);
            console.log(chalk.cyan.bold('\n ✦ DAISY:'), marked.parse(currentRes));
          }
        }
        break; 
      }
    }
    if (state.conversationBuffer.length > 50) {
        state.conversationBuffer = [
            state.conversationBuffer[0], 
            ...state.conversationBuffer.slice(-25)
        ];
    }
    await autoSaveLog();
  }
}

startChat().catch(console.error);