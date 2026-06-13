import { state } from './state.js';
import chalk from 'chalk';

export function pushToBuffer(entry) {
  state.conversationBuffer.push(entry);
  if (state.debugMode) {
    console.log(chalk.magenta('\n ╭─ [D] Buffer Updated. Current Buffer:'));
    console.log(chalk.magenta(` │  ${state.conversationBuffer.length} items present.`));
    console.log(chalk.magenta(' ╰' + '─'.repeat(state.width - 3)));
  }
}

export function getConversationString() {
  return state.conversationBuffer.join('\n');
}