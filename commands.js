import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { marked } from 'marked';
import { fileURLToPath } from 'url';
import { state } from './state.js';
import { callApi } from './api.js';
import { pushToBuffer, getConversationString } from './buffer.js';
import { customQuestion, rl } from './input.js';
import { logError, renderDiff, printBanner } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Token Optimization for Read Command
const MAX_READ_CONTENT_LENGTH = 15000;

export async function handleRead(f = null, ins = null, silent = false) {
  const filePathInput = f || await customQuestion('File(s):', 'app.js');
  const instruction = ins || await customQuestion('Instruction:', 'extract direct lines');
  
  if (filePathInput && instruction) {
    try {
      const files = state.autoMode ? filePathInput.split(',').map(s => s.trim()) : [filePathInput.trim()];
      let aggregatedContent = '';
      let readFiles = [];
      
      for (const file of files) {
        try {
          let fileContent = fs.readFileSync(path.resolve(file), 'utf8');
          // Optimization: Truncate massive files
          if (fileContent.length > MAX_READ_CONTENT_LENGTH) {
              fileContent = fileContent.substring(0, MAX_READ_CONTENT_LENGTH) + '\n...[CONTENT TRUNCATED]';
          }
          aggregatedContent += `File: ${file}\n\nContent:\n${fileContent}\n\n`;
          readFiles.push(file);
        } catch (err) {
          logError('Read', `Failed to read ${file}: ${err.message}`);
        }
      }
      
      if (!aggregatedContent) return;
      
      let prompt = `${state.autoModePreface}${aggregatedContent}Instruction: ${instruction}`;
      if (state.autoMode || silent) {
        prompt += `\n\nCRITICAL: Return only direct, exact lines extracted from the file(s). Do not provide a summary or any conversational text.`;
      }
      
      const res = await callApi(prompt, false);
      const xmlTags = readFiles.map(file => `<fileRead fileName='${file}' />`).join('\n');
      pushToBuffer(`${xmlTags}\nDAISY Analysis: ${res}`);
      
      if (!silent) {
        console.log(chalk.cyan.bold('\n ╭─ Result:'));
        console.log(marked.parse(res));
      }
    } catch (e) { logError('Read', e.message); }
  }
}

export async function handleWrite(task = null) {
  const instructions = task || await customQuestion('Instructions:', 'create logic');
  if (instructions) {
    const fileStartTag = '<' + 'file filename="';
    const fileEndTag = '<' + '/file>';
    
    const prompt = `${state.autoModePreface}Task: ${instructions}\n\n` +
                   `Determine necessary file(s). For each file wrap content in ${fileStartTag}name.ext">\n...\n${fileEndTag}\n` +
                   `Provide a summary in <summary> tags.`;
    
    const res = await callApi(prompt, false);
    
    if (state.debugMode) {
      console.log(chalk.magenta(`\n ╭─ [DEBUG] RAW AI RESPONSE (WRITE):\n${res}\n ╰─`));
    }

    const summaryMatch = res.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/s);
    if (summaryMatch?.[1]) console.log(chalk.cyan(`\n ℹ Summary: ${summaryMatch[1].trim()}\n`));

    const fileRegex = new RegExp('<' + 'file\\s+filename=[\'"]([^\'"]+)[\'"]\\s*>([\\s\\S]*?)<' + '\\/file>', 'g');
    let match, count = 0;
    const summaryText = summaryMatch?.[1] ? summaryMatch[1].trim().replace(/'/g, '`') : 'No summary provided.';
    
    while ((match = fileRegex.exec(res)) !== null) {
      const fileName = match[1].trim();
      const code = match[2].trim().replace(/^```(?:\w+)?\n/, '').replace(/\n```$/, '');
      const fullPath = path.resolve(process.cwd(), fileName);
      
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, code, 'utf8');
      
      pushToBuffer(`System: <fileWrote path='./${fileName}' summary='${summaryText}' />`);
      console.log(chalk.green(` ✔ "${fileName}" created successfully.`));
      
      if (state.debugMode) {
        console.log(chalk.magenta(`\n ╭─ [DEBUG] CONTENTS OF ${fileName}:\n${code}\n ╰─`));
      }
      
      count++;
    }

    if (count === 0) {
      logError('Write', 'No tagged file blocks found in AI response.');
    }
  }
}

export async function handleUpdate(userInput, forcePath = null, forceChanges = null) {
  let filePath = forcePath || (state.updateContinue ? state.lastFilePath : await customQuestion('File Path:', './src/app.js'));
  if (!filePath) { state.updateContinue = false; return; }
  state.lastFilePath = filePath;

  const change = forceChanges || ((state.updateContinue && !userInput.startsWith('/')) ? userInput : await customQuestion('Changes:', 'fix bug'));
  if (!change) { state.updateContinue = false; return; }

  state.updateContinue = false;
  try {
    const fileContent = fs.readFileSync(path.resolve(filePath), 'utf8');
    
    const fileStartTag = '<' + 'file filename="' + filePath + '">';
    const fileEndTag = '<' + '/file>';

    const prompt = `${state.autoModePreface}Update ${filePath}\n\nTask: ${change}\n\nContent:\n${fileContent}\n\n` +
      `Provide:\n1. Summary in <summary> tags\n2. Code in ${fileStartTag}...${fileEndTag} tags.`;

    pushToBuffer(`User [Update]: ${change} for ${filePath}`);
    const response = await callApi(prompt, false);
    pushToBuffer(`DAISY: ${response}`);

    if (state.debugMode) {
      console.log(chalk.magenta(`\n ╭─ [DEBUG] RAW AI RESPONSE (UPDATE):\n${response}\n ╰─`));
    }
    
    const codeMatchRegex = new RegExp('<' + 'file\\s+filename=[\'"]?(?:[^\'"]*)[\'"]?\\s*>([\\s\\S]*?)<' + '\\/file>', 'is');
    const codeMatch = response.match(codeMatchRegex);
    const summaryMatch = response.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/s);
    
    if (codeMatch?.[1]) {
      let code = codeMatch[1].trim();

      const lines = code.split('\n');
      if (lines.length > 0) {
        const firstLine = lines[0].trim();
        if (firstLine.startsWith(':') || firstLine === filePath || firstLine === path.basename(filePath)) {
          code = lines.slice(1).join('\n').trim();
        }
      }

      code = code.replace(/^```(?:\w+)?\n/, '').replace(/\n```$/, '');

      if (!state.autoMode && !state.autoUpdateBypass) {
        console.log(chalk.hex('#E5C07B').bold(`\n ⚙ [DAISY Update Preview]: ${filePath}`));
        renderDiff(fileContent, code);
        const apply = await rl.question(chalk.hex('#E5C07B').bold('\n ❯ Apply these changes? (y/n): '));
        if (apply.toLowerCase() !== 'y' && apply.toLowerCase() !== 'yes') {
          console.log(chalk.red.bold('\n ✖ Update cancelled: Changes discarded.'));
          state.updateContinue = false;
          return;
        }
      }

      const backupDir = path.join(os.homedir(), '.genai', 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const safeName = path.basename(filePath);
      const bakPath = path.join(backupDir, `${safeName}.${Date.now()}.bak`);
      
      fs.writeFileSync(bakPath, fileContent, 'utf8');

      fs.writeFileSync(path.resolve(filePath), code, 'utf8');
      console.log(chalk.green.bold(`\n ✔ Successfully updated ${filePath}!`));

      const summaryText = summaryMatch?.[1] ? summaryMatch[1].trim().replace(/'/g, '`') : 'No summary provided.';
      if (summaryMatch?.[1]) console.log(chalk.cyan(` ℹ Summary: ${summaryMatch[1].trim()}\n`));

      state.conversationBuffer[state.conversationBuffer.length - 1] = `System: <fileUpdated path='${filePath}' summary='${summaryText}' />`;

      if(!state.autoMode){
        const repeat = await rl.question(chalk.hex('#E5C07B').bold(' ↻ Continue editing this file? (y/n): '));
        state.updateContinue = repeat.toLowerCase() === 'y';
      }
    } else {
      logError('Update', 'Code tags missing in response.');
    }
  } catch (e) { logError('Update', e.message); }
}

export async function handleRevert(args = []) {
  const backupDir = path.join(os.homedir(), '.genai', 'backups');
  if (!fs.existsSync(backupDir)) {
    console.log(chalk.hex('#E5C07B')('\n ℹ No backup directory found.'));
    return;
  }

  const targetFile = args[0] || await customQuestion('File to revert:', 'index.js');
  if (!targetFile) return;

  const safeName = path.basename(targetFile);
  const allBackups = fs.readdirSync(backupDir).filter(f => f.startsWith(safeName + '.')).sort().reverse();

  if (allBackups.length === 0) {
    console.log(chalk.hex('#E5C07B')(`\n ℹ No backups found for ${targetFile}.`));
    return;
  }

  console.log(chalk.cyan.bold(`\n ╭─ Available backups for ${targetFile}:`));
  allBackups.forEach((b, i) => {
    const tsMatch = b.match(/\.(\d+)\.bak$/);
    const ts = tsMatch ? new Date(parseInt(tsMatch[1])).toLocaleString() : b;
    console.log(` │ ${chalk.cyan(i + 1 + '.')} ${ts}`);
  });
  console.log(' ╰' + '─'.repeat(30));

  const choice = await customQuestion('Select backup number to revert to:', '1');
  const selected = allBackups[parseInt(choice) - 1];

  if (selected) {
    try {
      const originalContent = fs.readFileSync(path.join(backupDir, selected), 'utf8');
      fs.writeFileSync(path.resolve(targetFile), originalContent, 'utf8');
      pushToBuffer(`System: Reverted changes for ${targetFile}`);
      console.log(chalk.green.bold(`\n ✔ Successfully reverted ${targetFile}`));
    } catch (e) {
      logError('Revert', `Failed to revert ${targetFile}: ${e.message}`);
    }
  } else {
    console.log(chalk.red(' ✖ Invalid selection.'));
  }
}

export async function handleIndexDir(p = null) {
  let inputPath = p;
  if (Array.isArray(p)) {
    inputPath = p.length > 0 ? p.join(' ') : null;
  }
  const dirPath = inputPath || await customQuestion('Path to Index:', './src');
  if (!dirPath) return;
  try {
    const resolved = path.resolve(dirPath);
    const skip = ['.zip', '.png', '.jpg', '.pdf', '.exe', '.node', '.git'];
    const allItems = fs.readdirSync(resolved);
    
    const files = allItems.filter(f => 
      fs.statSync(path.join(resolved, f)).isFile() && !f.startsWith('.') && !skip.includes(path.extname(f))
    );

    const subDirs = allItems.filter(f => 
      fs.statSync(path.join(resolved, f)).isDirectory() && !f.startsWith('.') && (!state.SKIP_DIRS || !state.SKIP_DIRS.includes(f))
    );
    
    console.log(chalk.cyan.bold(`\n ╭─ Indexing ${files.length} files...`));
    if (subDirs.length > 0) {
      console.log(chalk.cyan(` │ Found ${subDirs.length} sub-directories (skipping contents).`));
    }

    const summaries = [];
    for (let i = 0; i < files.length; i++) {
      process.stdout.write(chalk.hex('#E5C07B')(` │ [${i + 1}/${files.length}] ${files[i]}...`));
      
      let content = '';
      try {
        content = fs.readFileSync(path.join(resolved, files[i]), 'utf8');
        if (content.length > MAX_READ_CONTENT_LENGTH) {
            content = content.substring(0, MAX_READ_CONTENT_LENGTH) + '\n...[CONTENT TRUNCATED]';
        }
      } catch (err) {
        content = '[Unreadable file content]';
      }

      const autoPreface = state.autoModePreface || '';
      const summary = await callApi(`${autoPreface}Summarize file purpose in 1 sentence: ${files[i]}\n\n${content}`, false);
      
      summaries.push(`- ${files[i]}: ${summary.trim()}`);
      
      process.stdout.cursorTo(0);
      process.stdout.clearLine(0);
      console.log(chalk.green(` │ ✔ ${files[i]} indexed.`));
    }
    
    const terminalWidth = process.stdout.columns || 80;
    console.log(chalk.cyan.bold(' ╰' + '─'.repeat(terminalWidth - 3)));
    
    let bufferMessage = `System [index-dir]: Directory indexed.\n`;
    if (subDirs.length > 0) {
      bufferMessage += `Sub-directories (not indexed): ${subDirs.join(', ')}\n\n`;
    }
    bufferMessage += `Files:\n${summaries.join('\n')}`;

    pushToBuffer(bufferMessage);
    console.log(chalk.green.bold('\n ✔ Indexing complete!'));
  } catch (e) { logError('Index', e.message); }
}

export async function handleFind() {
  const searchTerm = await customQuestion('Search filename (partial match):', 'app.js');
  if (!searchTerm) return;

  const results = [];
  const searchRecursive = (dir) => {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (!file.startsWith('.') && (!state.SKIP_DIRS || !state.SKIP_DIRS.includes(file))) {
          searchRecursive(fullPath);
        }
      } else if (file.toLowerCase().includes(searchTerm.toLowerCase())) {
        results.push(fullPath);
      }
    });
  };

  try {
    searchRecursive(process.cwd());
    if (results.length === 0) {
      console.log(chalk.hex('#E5C07B')(`\n ℹ No matches found for "${searchTerm}".`));
      return;
    }

    console.log(chalk.cyan.bold(`\n ╭─ Found ${results.length} matches:`));
    results.forEach((res, i) => console.log(` │ ${chalk.cyan(i + 1 + '.')} ${path.relative(process.cwd(), res)}`));
    console.log(' ╰' + '─'.repeat(30));

    const choice = await rl.question(chalk.green.bold('\n ❯ Select file number: '));
    const selectedFile = results[parseInt(choice) - 1];

    if (selectedFile) {
      const action = await rl.question(chalk.hex('#E5C07B').bold(` ❯ Selected ${path.basename(selectedFile)}. Action (cd/read/update): `));
      const relPath = path.relative(process.cwd(), selectedFile);

      if (action.toLowerCase() === 'cd') {
        const dir = path.dirname(selectedFile);
        process.chdir(dir);
        console.log(chalk.green(`\n ✔ Moved to: ${process.cwd()}`));
        await handleLsR();
      } else if (action.toLowerCase() === 'read') {
        await handleRead(relPath);
      } else if (action.toLowerCase() === 'update') {
        await handleUpdate('', relPath);
      } else {
        console.log(chalk.hex('#E5C07B')(' ✖ Action cancelled.'));
      }
    }
  } catch (e) {
    logError('Find', e.message);
  }
}

export async function handleLsR() {
  const results = [];
  const crawl = (dir) => {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (!file.startsWith('.') && (!state.SKIP_DIRS || !state.SKIP_DIRS.includes(file))) {
          crawl(fullPath);
        }
      } else {
        results.push(path.relative(process.cwd(), fullPath));
      }
    });
  };

  try {
    console.log(chalk.cyan.bold(`\n ╭─ Recursive File List (${process.cwd()})`));
    crawl(process.cwd());
    
    if (results.length === 0) {
      console.log(chalk.hex('#E5C07B')(' │ No files found.'));
      console.log(chalk.cyan.bold(' ╰' + '─'.repeat(state.width - 3)));
      return;
    }

    if(!state.autoMode){
      results.forEach(f => console.log(chalk.dim(` │  ${f}`)));
    }
    console.log(chalk.cyan.bold(' ╰' + '─'.repeat(state.width - 3)));
    
    state.conversationBuffer = state.conversationBuffer.filter(entry => !entry.startsWith('System [ls-r]: AI context updated with directory mapping.'));

    const contextUpdate = `Current Directory Structure:\n${results.join('\n')}`;
    pushToBuffer(`System [ls-r]: AI context updated with directory mapping.\n${contextUpdate}`);
    
    // Update directoryContext and toggle pending flag
    state.directoryContext = contextUpdate;
    state.directoryContextPending = true;
    
    console.log(chalk.green.bold(`\n ✔ Context updated with ${results.length} file paths.`));
  } catch (e) {
    logError('ls-r', e.message);
  }
}

export const commands = {
  '/exit': (args = []) => {
    console.log(chalk.hex('#E5C07B')('\n ✦ Exiting safely. Goodbye!'));
    process.exit();
  },
  '/clean-logs': async (args = []) => {
    const answer = await rl.question(chalk.hex('#E5C07B').bold('\n ⚠ Are you sure you want to delete all logs and backups? (y/n): '));
    if (answer.toLowerCase() === 'y') {
      let deletedCount = 0;
      const dirs = [
        path.join(os.homedir(), '.genai', 'logs'),
        path.join(os.homedir(), '.genai', 'backups')
      ];
      dirs.forEach(dir => {
        if (fs.existsSync(dir)) {
          fs.readdirSync(dir).forEach(file => {
            try {
              fs.rmSync(path.join(dir, file), { recursive: true, force: true });
              deletedCount++;
            } catch (e) {
              logError('Clean', `Failed to delete ${file}`);
            }
          });
        }
      });
      console.log(chalk.green(`\n ✔ Cleaned up ${deletedCount} items.`));
    } else {
      console.log(chalk.hex('#E5C07B')('\n ✖ Operation cancelled.'));
    }
  },
  '/clear': (args = []) => {
    state.sessionStartTime = Date.now().toString();
    state.chatDescription = 'Chat Description: X X X X X';
    state.conversationBuffer = [state.systemContext + '\n\n'];
    state.apiSession = null;
    console.clear();
    printBanner();
    console.log(chalk.hex('#E5C07B')(' ℹ History cleared. Started a new log.'));
  },
  '/debug': (args = []) => {
    state.debugMode = !state.debugMode;
    console.log(chalk.hex('#E5C07B')(`\n ℹ Debug mode ${state.debugMode ? 'enabled' : 'disabled'}.`));
    if (state.debugMode) {
      console.log(chalk.magenta('\n ╭─ [D] Context Buffer Contents:'));
      console.log(chalk.dim(getConversationString()));
      console.log(chalk.magenta(' ╰' + '─'.repeat(state.width - 3)));
    }
  },
  '/help': (args = []) => {
    console.log(chalk.green.bold('\n ╭─ Available Commands'));
    const desc = {
      '/auto': 'Initialize autonomous mode',
      '/auto-update': 'Toggle skip confirmation previews for file updates',
      '/cd': 'Change current working directory',
      '/clean-logs': 'Delete all log and backup files',
      '/clear': 'Clear conversation and start a new log',
      '/debug': 'Toggle debug mode',
      '/exit': 'Exit application',
      '/find': 'Recursively search for files',
      '/help': 'Displays helper message',
      '/index-dir': 'Crawl and summarize directory files',
      '/instructions': 'Change system context',
      '/ls': 'List files in directory',
      '/ls-r': 'Recursive file list + context update',
      '/models': 'Switch AI models',
      '/read': 'Analyze a file',
      '/resume': 'Load chat history from logs',
      '/revert': 'Undo all changes to files updated in this session',
      '/trust': 'Toggle trust mode for auto commands',
      '/update': 'Modify a file',
      '/write': 'Generate a new file'
    };
    
    state.ALL_COMMANDS.forEach(c => {
      console.log(` │ ${chalk.cyan(c.padEnd(15))} ─ ${chalk.dim(desc[c] || '')}`);
    });
    console.log(chalk.green.bold(' ╰' + '─'.repeat((state.width || 80) - 3) + '\n'));
  },
  '/cd': async (args = []) => {
    if (args.length > 0) {
      const targetPath = args.join(' ');
      try {
        process.chdir(path.resolve(process.cwd(), targetPath));
        console.log(chalk.green(`\n ✔ Directory finalized: ${process.cwd()}`));
        await handleLsR();
      } catch (e) {
        logError('CD', `Failed to change directory: ${e.message}`);
      }
      return;
    }

    let changingDir = true;
    let currentPath = process.cwd();

    while (changingDir) {
      try {
        const files = fs.readdirSync(currentPath);
        const dirs = { 0: '..' };
        
        console.log(chalk.cyan.bold(`\n ╭─ Browsing: ${currentPath}`));
        console.log(` │ 0.  📁 ..`);

        let dirIndex = 1;
        files.forEach(f => {
          const fullPath = path.join(currentPath, f);
          try {
            if (fs.statSync(fullPath).isDirectory()) {
              console.log(` │ ${dirIndex}.  📁 ${f}`);
              dirs[dirIndex] = f;
              dirIndex++;
            }
          } catch (e) { /* Skip restricted */ }
        });
        console.log(' ╰' + '─'.repeat(30));

        const answer = await rl.question(chalk.green.bold('\n ❯ Select number or folder name (Enter to finish): '));

        if (!answer.trim()) {
          process.chdir(currentPath);
          console.log(chalk.green(`\n ✔ Directory finalized: ${process.cwd()}`));
          changingDir = false;
          await handleLsR();
        } else {
          const inputStr = answer.trim();
          const selection = parseInt(inputStr);
          const dirValues = Object.values(dirs);

          if (!isNaN(selection) && dirs[selection] !== undefined) {
            currentPath = path.resolve(currentPath, dirs[selection]);
          } else if (dirValues.includes(inputStr)) {
            currentPath = path.resolve(currentPath, inputStr);
          } else {
            console.log(chalk.red(' ✖ Invalid selection.'));
          }
        }
      } catch (e) { 
        logError('CD', e.message); 
        changingDir = false;
      }
    }
  },
  '/ls': async (args = []) => {
    try {
      const resolved = path.resolve(process.cwd());
      const files = fs.readdirSync(resolved);
      console.log(chalk.cyan.bold(`\n ╭─ Files in ${process.cwd()}:`));
      files.forEach(f => {
        const isDir = fs.statSync(path.join(resolved, f)).isDirectory();
        console.log(` │  ${isDir ? '📁' : '📄'} ${f}`);
      });
      console.log(' ╰' + '─'.repeat(30));
    } catch (e) { logError('List', e.message); }
  },
  '/ls-r': handleLsR,
  '/instructions': async (args = []) => {
    const dir = path.join(__dirname, 'instructions');
    if (!fs.existsSync(dir)) return logError('Config', 'Instructions folder not found.');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
    if (!files.length) return console.log(chalk.hex('#E5C07B')('\n ℹ No files found.'));
    
    console.log(chalk.cyan.bold('\n ╭─ Instructions Contexts:'));
    files.forEach((f, i) => console.log(` │ ${chalk.cyan(i + 1 + '.')} ${f}`));
    console.log(' ╰' + '─'.repeat(30));

    const choice = await rl.question(chalk.green.bold('\n ❯ Select (Enter to cancel): '));
    const idx = parseInt(choice) - 1;
    if (files[idx]) {
      const selectedContext = fs.readFileSync(path.join(dir, files[idx]), 'utf8');
      if (state.autoMode) {
        const autoPath = path.join(__dirname, 'instructions', 'auto-ai.md');
        state.systemContext = fs.readFileSync(autoPath, 'utf8') + state.AI_INSTRUCTIONS + '\n\n' + selectedContext;
        state.conversationBuffer[0] = state.systemContext + '\n\n';
      } else {
        state.systemContext = selectedContext + state.AI_INSTRUCTIONS;
        state.conversationBuffer[0] = state.systemContext + '\n\n';
      }
      state.apiSession = null;
      console.log(chalk.green(`\n ✔ Context updated to: ${files[idx]}`));
    }
  },
  '/index-dir': handleIndexDir,
  '/find': handleFind,
  '/models': async (args = []) => {
    try {
      const models = [
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', category: 'Text-out models', rpm: '10', tpm: '250K', rpd: '20' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', category: 'Text-out models', rpm: '5', tpm: '250K', rpd: '20' },
        { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', category: 'Text-out models', rpm: '15', tpm: '16.250K', rpd: '500' },
        { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', category: 'Text-out models', rpm: '5', tpm: '250K', rpd: '20' },
        { id: 'gemma-4-26b-a4b-it', name: 'Gemma 4 26B', category: 'Other models', rpm: '15', tpm: 'Unlimited', rpd: '1.5K' },
        { id: 'gemma-4-31b-it', name: 'Gemma 4 31B', category: 'Other models', rpm: '15', tpm: 'Unlimited', rpd: '1.5K' }
      ];
      
      console.log(chalk.green.bold(`\n ╭─ Models (Current: ${state.CURRENT_MODEL})`));
      models.forEach((m, i) => {
        console.log(` │ ${chalk.cyan(i + 1 + '.')} ${chalk.bold(m.name)} - ${chalk.dim(m.category)}`);
        console.log(chalk.dim(` │    Req. Per Minute: ${m.rpm} | Token Per Minute: ${m.tpm} | Req. Per Day: ${m.rpd}`));
      });
      console.log(' ╰' + '─'.repeat(50));

      const choice = await rl.question(chalk.green.bold('\n ❯ Select number: '));
      if (models[parseInt(choice) - 1]) {
        state.CURRENT_MODEL = models[parseInt(choice) - 1].id;
        console.log(chalk.green(`\n ✔ Switched to ${state.CURRENT_MODEL}`));
      }
    } catch (e) { logError('Models', e.message); }
  },
  '/auto': async (args = []) => {
    if(!state.autoMode){
      const autoPath = path.join(__dirname, 'instructions', 'auto-ai.md');
      try {
        if (fs.existsSync(autoPath)) {
          state.systemContext = fs.readFileSync(autoPath, 'utf8') + state.AI_INSTRUCTIONS;
          
          const dir = path.join(__dirname, 'instructions');
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(f => (f.endsWith('.md') || f.endsWith('.txt')) && f !== 'auto-ai.md');
            if (files.length > 0) {
              console.log(chalk.cyan.bold('\n ╭─ Additional Auto Context (Optional):'));
              files.forEach((f, i) => console.log(` │ ${chalk.cyan(i + 1 + '.')} ${f}`));
              console.log(' ╰' + '─'.repeat(30));
              const choice = await rl.question(chalk.green.bold('\n ❯ Select additional context (Enter to skip): '));
              const idx = parseInt(choice) - 1;
              if (files[idx]) {
                const extraContext = fs.readFileSync(path.join(dir, files[idx]), 'utf8');
                state.systemContext += '\n\n' + extraContext;
                console.log(chalk.green(`\n ✔ Added context: ${files[idx]}`));
              }
            }
          }

          state.conversationBuffer[0] = state.systemContext + '\n\n';
          state.autoModePreface = "***AUTO TASK***\n";
          state.autoMode = true;
          state.apiSession = null;
          console.log(chalk.bgHex('#E5C07B').black.bold('\n ⚙ AUTO-MODE INITIALIZED ') + chalk.hex('#E5C07B')(' Type \'/auto\' again to exit.\n\n'));
          await handleLsR();
        } else {
          logError('Auto', 'auto-ai.md not found in instructions folder.');
        }
      } catch (e) { logError('Auto', e.message); }

    }
    else {
      state.autoMode = false;
      state.autoCommandCount = 0;
      state.autoModePreface = "";
      state.apiSession = null;
      console.log(chalk.magenta.bold('\n 🛑 AUTO-MODE DISABLED ') + chalk.magenta(' Returning to manual control.\n\n'));
    }
  },
  '/auto-update': (args = []) => {
    state.autoUpdateBypass = !state.autoUpdateBypass;
    console.log(chalk.hex('#E5C07B')(`\n ✔ Auto-update skip-preview: ${state.autoUpdateBypass ? 'enabled (previews skipped)' : 'disabled (previews active)'}`));
  },
  '/resume': async (args = []) => {
    const logDir = path.join(os.homedir(), '.genai', 'logs');
    if (!fs.existsSync(logDir)) {
      return console.log(chalk.hex('#E5C07B')(' ℹ No logs found.'));
    }
    const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log') || f.endsWith('.json'));
    if (files.length === 0) {
      return console.log(chalk.hex('#E5C07B')(' ℹ No logs found.'));
    }

    console.log(chalk.cyan.bold('\n ╭─ Available Logs:'));
    const logOptions = [];
    files.forEach((file, idx) => {
      const content = fs.readFileSync(path.join(logDir, file), 'utf8');
      const lines = content.split('\n');
      let desc = 'Legacy Log';
      if (lines[0].startsWith('Chat Description')) {
        desc = lines[0];
      }
      logOptions.push({ file, desc });
      console.log(` │ ${chalk.cyan(idx + 1 + ':')} ${chalk.dim(desc)}`);
    });
    console.log(' ╰' + '─'.repeat(30));

    const choice = await customQuestion('Select log number to resume:', '1');
    const selected = logOptions[parseInt(choice) - 1];
    if (selected) {
       try {
        const content = fs.readFileSync(path.join(logDir, selected.file), 'utf8');
        const lines = content.split('\n');
        
        let jsonString = '';
        if (lines[0].startsWith('Chat Description')) {
          state.chatDescription = lines[0];
          jsonString = lines.slice(1).join('\n');
        } else {
          state.chatDescription = 'Chat Description: Legacy Log';
          jsonString = content;
        }

        const parsed = JSON.parse(jsonString);
        
        // Check if we're dealing with the new structure mapping payload state + buffer
        if (parsed && parsed.state && parsed.conversationBuffer) {
          state.conversationBuffer = parsed.conversationBuffer;
          state.autoMode = parsed.state.autoMode || false;
          state.CURRENT_MODEL = parsed.state.CURRENT_MODEL || 'gemini-1.5-flash';
          state.trustMode = parsed.state.trustMode || false;
          state.debugMode = parsed.state.debugMode || false;
          state.autoModePreface = state.autoMode ? "***AUTO TASK***\n" : "";
          state.apiSession = parsed.state.apiSession || null;
        } else {
          // Fallback legacy structure loading
          state.conversationBuffer = parsed;
          state.apiSession = null;
        }

        state.sessionStartTime = selected.file.replace(/\.(log|json)$/, '');
        console.log(chalk.green(`\n ✔ Context loaded successfully.`));
      } catch (e) {
        logError('Resume', 'Failed to parse log file.');
      }
    } else {
      console.log(chalk.red(' ✖ Invalid selection.'));
    }
  },
  '/revert': handleRevert,
  '/trust': (args = []) => {
    state.trustMode = !state.trustMode;
    if (state.trustMode) state.autoCommandCount = 0;
    console.log(chalk.hex('#E5C07B')(`\n ℹ Trust mode ${state.trustMode ? 'enabled' : 'disabled'}.`));
  }
};