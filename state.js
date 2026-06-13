export const state = {
    isSpinnerPaused: false,
    isPromptingExit: false,
    apiSession: null,
    CURRENT_MODEL: 'gemini-3.1-pro-preview',
    updateContinue: false,
    autoMode: false,
    trustMode: false,
    autoCommandCount: 0,
    lastFilePath: '',
    debugMode: false,
    commandHistory: [],
    autoModePreface: "",
    TokensUsed: 0,
    sessionStartTime: Date.now().toString(),
    chatDescription: 'Chat Description: X X X X X',
    systemContext: '',
    directoryContext: '',
    conversationBuffer: [],
    autoUpdateBypass: false,
    ALL_COMMANDS: [
        '/auto', '/auto-update', '/cd', '/clean-logs', '/clear', '/debug', 
        '/exit', '/find', '/help', '/index-dir', '/instructions', 
        '/ls', '/ls-r', '/models', '/paste', 
        '/read', '/remove-ai-ext', '/resume', '/revert', '/trust', '/update', '/write'
    ],
    AI_INSTRUCTIONS: "\n\nCRITICAL INSTRUCTION: Always output a 5-word description of the current chat at the very beginning of your responses wrapped in <chatDescription>...</chatDescription> tags.",
    SKIP_DIRS: ['node_modules', 'chromTemp', '.git'],
    directoryContextPending: false
};

// Initialize buffer with system context
state.conversationBuffer.push(state.systemContext + '\n\n');