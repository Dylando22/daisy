import readline from 'node:readline/promises';
import chalk from 'chalk';
import { state } from './state.js';

export const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let exitCancelCallback = null;

const promptExit = (onCancel) => {
  if (onCancel) exitCancelCallback = onCancel;
  
  if (state.isPromptingExit) return;
  state.isPromptingExit = true;
  state.isSpinnerPaused = true;
  
  process.stdout.write('\n' + chalk.hex('#E5C07B').bold(' ⚠ Are you sure you want to exit? (y/n): '));
  
  const wasRaw = process.stdin.isRaw;
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();

  const onExitData = (data) => {
    const key = data.toString().toLowerCase();
    if (key === 'y') {
      process.stdout.write('\n');
      console.log(chalk.hex('#E5C07B')(' ✦ Exiting safely. Goodbye!'));
      process.exit(0);
    } else if (key === 'n' || key === '\r' || key === '\n' || key === '\u0003') {
      process.stdin.removeListener('data', onExitData);
      if (process.stdin.isTTY) process.stdin.setRawMode(!!wasRaw);
      state.isPromptingExit = false;
      state.isSpinnerPaused = false;
      
      process.stdout.cursorTo(0);
      process.stdout.clearLine(0);
      process.stdout.moveCursor(0, -1);
      process.stdout.cursorTo(0);
      process.stdout.clearScreenDown();
      
      if (exitCancelCallback) {
        exitCancelCallback();
        exitCancelCallback = null;
      }
      rl.resume();
    }
  };
  
  process.stdin.on('data', onExitData);
};

rl.on('SIGINT', () => promptExit());

export async function getInteractiveInput(promptText, placeholder = '', history = [], completions = []) {
  return new Promise((resolve) => {
    let input = '';
    let historyPos = history.length;
    const wasRaw = process.stdin.isRaw;
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    let lastRows = 1;

    const render = () => {
      const columns = process.stdout.columns || 80;
      const visiblePrompt = promptText.replace(/\x1B\[[0-9;]*[mGJK]/g, '');
      
      for (let i = 0; i < lastRows - 1; i++) {
        process.stdout.moveCursor(0, -1);
      }
      process.stdout.cursorTo(0);
      process.stdout.clearScreenDown();

      process.stdout.write(promptText);
      if (input.length === 0) {
        process.stdout.write(chalk.dim(placeholder));
        process.stdout.moveCursor(-placeholder.length, 0);
        lastRows = 1;
      } else {
        process.stdout.write(input);
        const totalTextLength = visiblePrompt.length + input.length;
        lastRows = Math.ceil(totalTextLength / columns) || 1;
        
        if (totalTextLength > 0 && totalTextLength % columns === 0) {
          process.stdout.write(' ');
          process.stdout.moveCursor(-1, 0);
        }
      }
    };

    render();

    const onData = (data) => {
      const str = data.toString();

      if (str.startsWith('\u001b')) {
        if (str === '\u001b[A' && historyPos > 0) {
          input = history[--historyPos];
        } else if (str === '\u001b[B') {
          if (historyPos < history.length - 1) input = history[++historyPos];
          else if (historyPos === history.length - 1) { historyPos++; input = ''; }
        }
        render();
        return;
      }

      if (str === '\t' && completions.length > 0) {
        const matches = completions.filter(c => c.startsWith(input));
        if (matches.length > 0) {
          input = matches[0];
        }
        render();
        return;
      }

      for (const char of str) {
        if (char === '\r' || char === '\n') {
          if (process.stdin.isTTY) process.stdin.setRawMode(!!wasRaw);
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          
          let finalInput = input.trim();
          
          if (state.autoMode) {
             const lowerInput = finalInput.toLowerCase();
             if (lowerInput.startsWith('/read') || lowerInput.startsWith('/write') || lowerInput.startsWith('/update') ||
                 lowerInput.startsWith('read') || lowerInput.startsWith('write') || lowerInput.startsWith('update')) {
                 if (finalInput.startsWith('/')) {
                     finalInput = finalInput.slice(1);
                 }
             }
          }

          return resolve(finalInput);
        }
        if (char === '\u0003') {
          process.stdin.removeListener('data', onData);
          promptExit(() => {
            process.stdin.on('data', onData);
            render();
          });
          return;
        }
        if (char === '\u007f' || char === '\b') input = input.slice(0, -1);
        else if (char.charCodeAt(0) >= 32) input += char;
      }
      render();
    };
    process.stdin.on('data', onData);
  });
}

export async function getMultilineInput() {
  console.log(chalk.hex('#E5C07B')('\n ╭─ Multiline Mode Active'));
  console.log(chalk.dim(' │ Paste content. Type "END" on a new line to finish.\n'));

  return new Promise((resolve) => {
    const lines = [];
    const onLine = (line) => {
      if (line.trim().toUpperCase() === 'END') {
        rl.off('line', onLine);
        resolve(lines.join('\n'));
      } else lines.push(line);
    };
    rl.on('line', onLine);
  });
}

export async function customQuestion(question, placeholder = '') {
  return await getInteractiveInput(chalk.green.bold(` ❯ ${question}`) + ' ', placeholder, state.commandHistory, state.ALL_COMMANDS);
}

export function closeInput() {
    rl.close();
}