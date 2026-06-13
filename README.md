# Daisy: AI Terminal Assistant

## Overview

Daisy is a terminal-based AI assistant that integrates with Google's Gemini API to provide an interactive, context-aware command-line interface. It supports file system operations, project indexing, and autonomous task execution.

## Prerequisites

- Node.js >= 18.0.0

## Configuration

To run the assistant, you must create a `.env` file in the root directory of the project. Add your API key to this file:

```bash
GEMINI_API_KEY=your_actual_api_key_here
```

## Installation

1. Clone the repository.
2. Run `npm install` to install dependencies (chalk, marked, @google/genai).
3. Ensure you have a valid API key for Google's Generative AI.

## Environment Variables

- The project uses an hardcoded API key in `api.js` (Note: Ensure this is updated to use an environment variable like `GEMINI_API_KEY` for security).

## Usage

- Start the assistant: `node daisy.js`
- Enable auto-mode: `node daisy.js --auto`

## Available Commands

- **/auto**: Initialize autonomous mode
- **/auto-update**: Toggle skip confirmation previews for file updates
- **/cd**: Change current working directory
- **/clean-logs**: Delete all log and backup files
- **/clear**: Clear conversation and start a new log
- **/debug**: Toggle debug mode
- **/exit**: Exit application
- **/find**: Recursively search for files
- **/help**: Displays helper message
- **/index-dir**: Crawl and summarize directory files
- **/instructions**: Change system context
- **/ls**: List files in directory
- **/ls-r**: Recursive file list + context update
- **/models**: Switch AI models
- **/read**: Analyze a file
- **/resume**: Load chat history from logs
- **/revert**: Undo all changes to files updated in this session
- **/trust**: Toggle trust mode for auto commands
- **/update**: Modify a file
- **/write**: Generate a new file

## Core Modules

- `daisy.js`: Entry point and main chat loop.
- `api.js`: Handles Google Gemini API communication and payload construction.
- `buffer.js`: Manages the active conversation context.
- `commands.js`: Implementation of CLI commands like read, write, and index.
- `input.js`: Handles terminal interactive input and multiline support.
- `state.js`: Global configuration and state management.
