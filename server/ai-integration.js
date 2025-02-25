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

// Generate a summary of document content
async function generateSummary(documentContent, documentName) {
  try {
    const genAI = getGoogleAI();
    if (!genAI) {
      return { summary: 'Automatic summary unavailable: AI service not configured' };
    }
    
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash', // Use the fastest model for summaries 
      generationConfig: {
        temperature: 0.2, // Lower temperature for more factual summaries
        maxOutputTokens: 2048, // Allow for detailed summaries
        topP: 0.95,
        topK: 40,
      }
    });
    
    // Create a prompt for summarizing the document
    const prompt = `Please provide a detailed summary of the following document: "${documentName}".
    
Focus on extracting the most important information, key points, and main topics covered in the document.
Format your summary as bullet points of the main themes followed by a short paragraph overview.
Be comprehensive but concise.

DOCUMENT CONTENT:
${documentContent}

DETAILED SUMMARY:`;
    
    const result = await model.generateContent(prompt);
    const summary = result.response.text();
    
    return { 
      success: true, 
      summary: summary,
      model: 'gemini-2.0-flash'
    };
  } catch (error) {
    console.error('Error generating document summary:', error);
    return { 
      success: false, 
      summary: `Failed to automatically summarize document: ${error.message}`,
      error: error.message
    };
  }
}

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

// Use Google AI to generate a response (not a React hook)
async function generateAIResponse(prompt, model) {
  try {
    // Initialize the model with appropriate settings
    const genAI = getGoogleAI();
    if (!genAI) {
      throw new Error('AI service not configured');
    }
    
    const genModel = genAI.getGenerativeModel({
      model: model,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096, // Increased token limit for more complete responses
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

// Simplified sendMessage function without reliance on Zep-specific functions
async function sendMessage(userInput, userId, model = 'gemini-2.0-flash', systemPrompt = null) {
  const userMessage = userInput.trim();
  const sessionId = userId || 'default-session';
  const modelName = model || 'gemini-2.0-flash';

  try {
    // Prepare the prompt with basic instructions
    const basicPrompt = `${systemPrompt || 'You are a helpful AI assistant.'}\n\nUser: ${userInput}\n\nAssistant:`;
    
    // Get AI response
    let response;
    
    try {
      // Attempt to use specified model
      response = await generateAIResponse(basicPrompt, modelName);
    } catch (error) {
      console.error(`Error with ${modelName}:`, error);
      // Fall back to a different model if the specified one fails
      console.log('Falling back to alternative model...');
      response = await fallbackModel(basicPrompt, userMessage, []);
    }
    
    return {
      response,
      model: modelName
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
          maxOutputTokens: 4096,  // Increased to 4096 for complete answers
          topP: 0.95,
          topK: 40,
        }
      });
      
      // Check if this is a document analysis request
      const isDocumentAnalysis = documents && documents.length > 0 && 
        (message.toLowerCase().includes('analyze') || 
         message.toLowerCase().includes('summarize') || 
         message.toLowerCase().includes('tell me about') ||
         message.toLowerCase().includes('what is in') ||
         message.toLowerCase().includes('what does') ||
         message.toLowerCase().includes('content of'));
      
      // Prepare comprehensive context from documents
      let documentContext = '';
      if (documents && documents.length > 0) {
        // Format document content for better readability and reference
        const formattedDocs = documents.map((doc, index) => {
          // Parse out the document name from the content if it exists
          const docNameMatch = doc.match(/\[(.*?)\]:/);
          const docName = docNameMatch ? docNameMatch[1] : `Document ${index + 1}`;
          // Remove the [docname]: prefix if it exists
          const content = docNameMatch ? doc.replace(docNameMatch[0], '') : doc;
          return `DOCUMENT: ${docName}\nCONTENT: ${content}\n`;
        });
        
        // Limit document context to avoid exceeding token limits but ensure complete information
        documentContext = `\n\nRELEVANT DOCUMENT INFORMATION:\n${formattedDocs.join('\n')}\n`;
      }
      
      // Format conversation history in a simple text format with clear role distinctions
      const historyText = context.length > 0 
        ? context.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.parts[0].text}`).join('\n\n') 
        : '';
        
      // Enhanced system prompt for document analysis
      let enhancedSystemPrompt = systemPrompt;
      
      if (isDocumentAnalysis) {
        enhancedSystemPrompt += `

DOCUMENT ANALYSIS INSTRUCTIONS:
1. You are analyzing documents for the user. This is VERY IMPORTANT to them.
2. You MUST provide a COMPLETE analysis without stopping mid-analysis.
3. When summarizing documents, you MUST finish the entire summary.
4. Include specific key information from the documents.
5. Do NOT say "I'll analyze this" or "Let me look at this" - just start the analysis directly.
6. Always reference document names when discussing their content.
7. Use clear section headings and bullet points to organize your analysis.`;
      }
      
      // Combine all context into a single prompt with enhanced instructions
      const fullPrompt = `${enhancedSystemPrompt}

IMPORTANT: 
1. Remember key personal information about the user throughout the conversation, such as their name, preferences, or any personal details they share.
2. You can use markdown formatting in your responses:
   - Use **bold** for emphasis
   - Use *italics* for subtle emphasis
   - Use \`code\` for technical terms
   - Use line breaks to structure your response
3. You have full creative capabilities - you can write stories, fables, poems, jokes, or any other creative content the user requests.
4. Be helpful, creative, and thorough in your responses.
5. When analyzing documents, ALWAYS provide complete responses without stopping mid-analysis. If you start to summarize a document, complete the summary.
6. Include specific information from documents when answering questions about them, don't just acknowledge you've seen them.

${documentContext}

${historyText.length > 0 ? 'Previous conversation:\n' + historyText + '\n\n' : ''}
User: ${message}
Assistant:`;

      // For document analysis, increase the timeout
      const timeout = isDocumentAnalysis ? 120000 : 60000; // 2 minutes for doc analysis, 1 minute otherwise
      
      // Generate content with the combined prompt and a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const result = await model.generateContentStream(fullPrompt);
        clearTimeout(timeoutId);
        
        // Process the streaming response
        let fullResponse = '';
        for await (const chunk of result.stream) {
          fullResponse += chunk.text();
        }
        
        // Return the AI response
        res.json({
          success: true,
          response: fullResponse,
          model: selectedModel,
          contextSize: {
            historyItems: context.length,
            documentItems: documents.length,
            usedDocuments: documentContext ? Math.min(documents.length, 15) : 0
          }
        });
      } catch (streamError) {
        clearTimeout(timeoutId);
        
        if (streamError.name === 'AbortError') {
          console.error('Request timed out after', timeout/1000, 'seconds');
          throw new Error(`Request timed out after ${timeout/1000} seconds. Try a shorter document or a more specific question.`);
        }
        throw streamError;
      }
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

module.exports = {
  router,
  generateSummary, // Export for use in Zep integration
  sendMessage
};