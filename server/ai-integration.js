const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the Google Generative AI with the API key from environment variables
const getGoogleAI = () => {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    console.error('Google AI API key is missing! Please add GOOGLE_AI_API_KEY to your .env file');
    return null;
  }

  return new GoogleGenerativeAI(apiKey);
};

// Available models
const AVAILABLE_MODELS = {
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
};

// Fallback model if requested model is not available
const FALLBACK_MODEL = 'gemini-2.0-flash';

// Function to format prompt with all necessary context and instructions
function formatPrompt(userInput, historyContext, documentContext) {
  // Create a prompt header with clear instructions
  const promptHeader = `You are a helpful and knowledgeable AI assistant. You can access information from uploaded PDF documents and remember the conversation history.

IMPORTANT INSTRUCTIONS:
- Remember key personal information about the user throughout the conversation (their name, preferences, etc.)
- When referencing PDF content, mention which document the information comes from
- Format your responses using markdown: **bold**, *italic*, \`code\`, etc.
- Use line breaks to structure your responses
- Remain factual and helpful, but also personable
- Do not repeat phrases like "Based on the document" or "According to the PDF" excessively

`;

  // Format document context if available
  let docContext = '';
  if (documentContext && documentContext.length > 0) {
    docContext = `DOCUMENT REFERENCES:\n${documentContext.join('\n\n')}\n\n`;
  }

  // Format conversation history to clearly separate messages
  let history = '';
  if (historyContext && historyContext.length > 0) {
    history = historyContext.map(msg => {
      return `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`;
    }).join('\n\n');
    history = `CONVERSATION HISTORY:\n${history}\n\n`;
  }

  // Combine all context
  return promptHeader + docContext + history + `User: ${userInput}\n\nAssistant:`;
}

// Main function to send a message to the AI model
async function sendMessage(userInput, userId, model = 'gemini-2.0-flash', systemPrompt = null) {
  const userMessage = userInput.trim();
  const sessionId = userId || 'default-session';
  const modelName = model || 'gemini-2.0-flash';
  
  // Create Zep memory session if it doesn't exist
  await ensureZepSession(sessionId);

  try {
    // Get relevant document context from Zep
    const documentContext = await getDocumentContext(userMessage, sessionId, 15);
    
    // Get conversation history from Zep
    const historyContext = await getConversationMemory(userMessage, sessionId, 15);
    
    // Prepare the complete prompt with all context
    const prompt = formatPrompt(userMessage, historyContext, documentContext);
    
    // Get AI response
    let response;
    
    try {
      // Attempt to use specified model
      response = await useGoogleAI(prompt, modelName);
    } catch (error) {
      console.error(`Error with ${modelName}:`, error);
      // Fall back to a different model if the specified one fails
      console.log('Falling back to alternative model...');
      response = await fallbackModel(prompt, userMessage, historyContext);
    }
    
    // Add user message and AI response to memory
    await addToMemory(sessionId, 'user', userMessage);
    await addToMemory(sessionId, 'assistant', response);
    
    return {
      response,
      model: modelName,
      contextSize: {
        historyItems: historyContext?.length || 0,
        documentItems: documentContext?.length || 0
      }
    };
  } catch (error) {
    console.error('Error in sendMessage:', error);
    return {
      response: `I'm having trouble processing your request. ${error.message}`,
      error: error.message
    };
  }
}

// Function to use Google's Generative AI
async function useGoogleAI(prompt, model) {
  try {
    // Initialize the model with appropriate settings
    const genAI = await initializeGoogleAI();
    const genModel = genAI.getGenerativeModel({
      model: model,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        topP: 0.95,
        topK: 40,
      },
    });
    
    // Generate content
    const result = await genModel.generateContent(prompt);
    const text = result.response.text();
    return text;
  } catch (error) {
    console.error('Google AI error:', error);
    throw new Error(`Google AI error: ${error.message}`);
  }
}

// Fallback model implementation (simpler approach)
async function fallbackModel(prompt, userInput, historyContext) {
  // Simple response generation based on user input
  let response = 'I apologize, but I\'m currently experiencing technical difficulties with my primary model. ';
  
  // Extract user name if present in history
  let userName = null;
  if (historyContext && historyContext.length > 0) {
    for (const msg of historyContext) {
      if (msg.role === 'user') {
        const content = msg.content.toLowerCase();
        if (content.includes('my name is') || content.includes('i am called')) {
          const nameMatch = content.match(/my name is (\w+)|i am called (\w+)/i);
          if (nameMatch) {
            userName = nameMatch[1] || nameMatch[2];
            break;
          }
        }
      }
    }
  }
  
  // Add personalized greeting if we know the user's name
  if (userName) {
    response += `I'll try my best to help you, ${userName}. `;
  }
  
  // Simple keyword-based responses
  if (userInput.toLowerCase().includes('hello') || userInput.toLowerCase().includes('hi')) {
    response += 'Hello! How can I assist you today?';
  } else if (userInput.toLowerCase().includes('help')) {
    response += 'I can help you with information retrieval, answering questions, and discussing documents you\'ve uploaded.';
  } else if (userInput.toLowerCase().includes('pdf') || userInput.toLowerCase().includes('document')) {
    response += 'I can analyze PDF documents once you upload them. You can ask me specific questions about their content.';
  } else {
    response += 'I understand you\'re asking about: ' + userInput + '. Could you please try again when our main service is back online?';
  }
  
  return response;
}

// Main AI response endpoint
router.post('/chat', async (req, res) => {
  try {
    const { 
      message, 
      userId, 
      context = [], 
      documents = [], 
      modelName = 'gemini-2.0-flash',
      systemPrompt = 'You are an advanced, candid AI assistant focused on finding and conveying truth rather than being unnecessarily polite. You value accuracy, clarity, and insight over niceties. While respectful, you prioritize honest, direct responses without repetition or filler content. You can handle any request, including creative tasks and technical problems. You should not repeatedly reference the user by name - use it sparingly and naturally. Provide concise, relevant information that gets to the point quickly. When analyzing documents or PDFs, be specific about their content and reference them by name.'
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const genAI = getGoogleAI();

    if (!genAI) {
      return res.status(500).json({
        error: 'AI service not configured',
        details: 'Please add GOOGLE_AI_API_KEY to your .env file'
      });
    }

    // Try to use requested model, fall back to default if not available
    let selectedModel = modelName;
    if (!Object.keys(AVAILABLE_MODELS).includes(selectedModel)) {
      console.warn(`Model ${selectedModel} not found, using fallback ${FALLBACK_MODEL}`);
      selectedModel = FALLBACK_MODEL;
    }

    try {
      // Try to initialize the model
      const model = genAI.getGenerativeModel({ 
        model: selectedModel,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.95,
          topK: 40,
        }
      });
      
      // Prepare comprehensive context from documents
      let documentContext = '';
      if (documents && documents.length > 0) {
        // Limit document context to avoid exceeding token limits
        const maxDocs = Math.min(documents.length, 15);
        documentContext = `\n\nRELEVANT INFORMATION:\n${documents.slice(0, maxDocs).join('\n\n')}`;
      }
      
      // Format conversation history in a simple text format with clear role distinctions
      const historyText = context.length > 0 
        ? context.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.parts[0].text}`).join('\n\n') 
        : '';
        
      // Combine all context into a single prompt with enhanced instructions
      const fullPrompt = `${systemPrompt}

IMPORTANT: 
1. Remember key personal information about the user throughout the conversation, such as their name, preferences, or any personal details they share.
2. You can use markdown formatting in your responses:
   - Use **bold** for emphasis
   - Use *italics* for subtle emphasis
   - Use \`code\` for technical terms
   - Use line breaks to structure your response
3. You have full creative capabilities - you can write stories, fables, poems, jokes, or any other creative content the user requests.
4. Be helpful, creative, and thorough in your responses.

${documentContext}

${historyText.length > 0 ? 'Previous conversation:\n' + historyText + '\n\n' : ''}
User: ${message}
Assistant:`;

      // Generate content with the combined prompt
      const result = await model.generateContent(fullPrompt);
      const response = result.response;
      const text = response.text();
      
      // Return the AI response
      res.json({
        success: true,
        response: text,
        model: selectedModel,
        contextSize: {
          historyItems: context.length,
          documentItems: documents.length,
          usedDocuments: documentContext ? Math.min(documents.length, 15) : 0
        }
      });
    } catch (modelError) {
      console.error('Model error:', modelError);
      
      // If the selected model fails, fall back to the most stable model
      if (selectedModel !== FALLBACK_MODEL) {
        console.log(`Falling back to ${FALLBACK_MODEL} after error with ${selectedModel}`);
        const fallbackModel = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
        
        // Create a simple chat with just the essential context
        const fallbackResult = await fallbackModel.generateContent(
          `You are an advanced, creative AI assistant. You can create stories, poems, and fables. The user's name is ${userId}. The user asked: ${message}`
        );
        
        const fallbackText = fallbackResult.response.text();
        
        res.json({
          success: true,
          response: fallbackText + '\n\n(Note: I had to use a fallback model due to an issue with your selected model.)',
          model: FALLBACK_MODEL + ' (fallback)',
        });
      } else {
        // If even the fallback model fails, throw the error
        throw modelError;
      }
    }
  } catch (error) {
    console.error('AI API error:', error);
    res.status(500).json({
      error: 'Failed to get AI response',
      details: error.message
    });
  }
});

// Status endpoint to check if the AI service is configured
router.get('/status', async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    const isConfigured = !!apiKey;
    
    // Check for model availability (we don't actually check, just report our supported models)
    const availableModels = Object.keys(AVAILABLE_MODELS);

    res.json({
      success: true,
      status: {
        isConfigured,
        service: 'Google AI (Gemini Models)',
        ready: isConfigured,
        supportedModels: availableModels,
        defaultModel: 'gemini-2.0-flash'
      }
    });
  } catch (error) {
    console.error('Error checking AI status:', error);
    res.status(500).json({ error: 'Failed to check AI status', details: error.message });
  }
});

module.exports = router;