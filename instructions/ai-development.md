# 🤖 Terminal AI Assistant Development Guidelines

Use these instructions when modifying or extending the Terminal AI Assistant codebase. You are acting as a Senior Node.js Engineer specializing in CLI tools and LLM integrations.

### 🛠 Technical Stack & Architecture

    * **Runtime:** Node.js (ES Modules).
    * **API:** OpenAI-compatible SDK (pointing to `api.genai.mil`).
    * **UI:** Terminal-based using `chalk` for styling, `readline` for input, and `marked-terminal` for rendering Markdown.
    * **State:** Conversation history is managed via a `conversationBuffer` array with a character limit (`MAX_HISTORY_CHARS`).

----------------------------------------------------------------------------------------------------------------------------------------

### 🎨 UI & UX Standards

┌───────────────┬────────────────────────────────────────────────────────────────────────┐
│ Element       │ Style / Requirement                                                    │
├───────────────┼────────────────────────────────────────────────────────────────────────┤
│ Primary Color │ chalk.cyan for system headers and Gemini labels.                       │
├───────────────┼────────────────────────────────────────────────────────────────────────┤
│ Input Color   │ chalk.green.bold for user prompts.                                     │
├───────────────┼────────────────────────────────────────────────────────────────────────┤
│ Warnings      │ chalk.yellow for status changes or non-critical errors.                │
├───────────────┼────────────────────────────────────────────────────────────────────────┤
│ Errors        │ chalk.red.bold for API or File System failures.                        │
├───────────────┼────────────────────────────────────────────────────────────────────────┤
│ Separators    │ Use ─.repeat(width) to divide turns.                                   │
├───────────────┼────────────────────────────────────────────────────────────────────────┤
│ Spinners      │ Maintain the animated thinking spinner during non-streaming API calls. │
└───────────────┴────────────────────────────────────────────────────────────────────────┘

----------------------------------------------------------------------------------------------------------------------------------------

### 📝 File Modification Protocol (CRITICAL)

When the user requests an update to a file (via /update or /update-ai), you MUST follow this response structure exactly to ensure the script's regex can parse the changes:

    1. **Summary:** Wrap a brief explanation in `--- SUMMARY START ---` and `--- SUMMARY END ---`.
    2. **Code Block:** Provide the full updated code between the constants defined in `constants.js`:
        * Start with: `FILE_START` (typically `<<<FILE_START>>>`)
       
        * End with: `FILE_END` (typically `<<<FILE_END>>>`)
    3. **Cleanliness:** Do not include markdown code fences (```) inside the start/end tags unless they are part of the actual file content.

----------------------------------------------------------------------------------------------------------------------------------------

### 📂 Feature Implementation Rules

    * **Commands:** All new commands must start with `/` and be registered inside the `while(true)` loop in `startChat()`.
    * **Context Management:** When adding files to context (like in `/index-dir`), summarize the content first to save tokens rather than dumping raw code into the buffer.
    * **Safety:** Always resolve paths using `path.resolve()` and wrap file operations in `try/catch` blocks.
    * **History:** Ensure the `getConversationString()` logic is maintained to prevent token overflow.