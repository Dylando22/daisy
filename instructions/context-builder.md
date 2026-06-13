## Task: Context Aggregation

| Phase | Description |
|---|---|
| **Identify** | Locate relevant source files, interfaces, and configuration files based on the user's specific query or task. |
| **Extract** | Pull the relevant snippets or full file contents, ensuring no critical logic is omitted. |
| **Structure** | Organize the information using the project's standard markdown hierarchy, prioritizing dependency graphs and interface definitions. |

## Output Expectations

- **Formatting**: Use Markdown headers (`##`, `###`) to separate sections clearly.
- **Code Blocks**: Always wrap file contents in appropriate syntax-highlighted code blocks (e.g., ` ```typescript `).
- **Conciseness**: Exclude boilerplate or irrelevant files (e.g., node_modules, build artifacts) unless explicitly requested.
- **Reference**: Maintain a "Source Map" table at the top of the output listing all files included in the context.
- **Standard**: When generating new instruction sets, mirror the structure of `instructions/default.md` (Role, Task/Purpose, Output Expectations).