# Personal AI Agent with Memory

This module implements a personal AI assistant that maintains a knowledge graph of conversations using Zep's API.

## Features

- Chat interface for interacting with the AI assistant
- Memory storage for conversation history using Zep
- Ability to track resources like kitchen inventory
- Recognizes and responds to queries about previously mentioned items

## Architecture

The Personal AI Agent consists of:

1. **Frontend Component (`PersonalAgent.js`)**: 
   - Preact-based UI component
   - Renders the chat interface
   - Handles user inputs and displays responses
   - Communicates with backend API endpoints

2. **Backend API (`zep-integration.js`)**:
   - Express.js router handling API endpoints
   - Integrates with Zep API for memory storage
   - Provides endpoints for adding, searching, and removing memories
   - Handles statuses and error conditions

3. **Memory Storage (Zep)**:
   - Provided by Zep's API service
   - Maintains a knowledge graph of conversations
   - Enables semantic search over conversation history
   - Stores metadata about conversations

## Setup Requirements

To use this feature in production, you'll need:

1. A Zep API instance running either locally or in the cloud
2. Environment variables set for:
   - `ZEP_API_URL`: URL of your Zep API instance
   - `ZEP_API_KEY`: API key for authenticating with Zep (if required)

## Usage Examples

The personal agent can track resources like kitchen inventory:

- "I have eggs, milk, and bread in my kitchen"
- "What's in my kitchen?"
- "I'm out of milk"
- "Remove bread from my kitchen"

## Future Enhancements

- User authentication and per-user data storage
- More sophisticated entity extraction for better understanding
- Integration with other data sources
- Improved conversation summarization
- Custom knowledge domains beyond kitchen inventory 