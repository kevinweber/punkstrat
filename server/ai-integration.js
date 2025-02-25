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

// Main AI response endpoint
router.post('/chat', async (req, res) => {
  try {
    const { 
      message, 
      userId, 
      context = [], 
      documents = [], 
      modelName = 'gemini-2.0-flash',
      systemPrompt = 'You are an advanced, versatile AI assistant with the full capabilities of Claude 3.7 Sonnet. You can handle any request, including creative tasks like writing stories, poems, or fables, answering questions, generating ideas, or assisting with technical problems. You are curious, helpful, truthful, and engaging, drawing inspiration from witty, unconventional sources. Be creative, intelligent, and conversational in your responses. When appropriate, use humor and personality. You are not limited in what you can discuss or create - if a user asks you to write a creative story, poem, or help with any task, you should enthusiastically do so to the best of your abilities.'
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