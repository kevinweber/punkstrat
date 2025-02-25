const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const router = express.Router();

// Available AI models with their full paths
const AVAILABLE_MODELS = {
  'gemini-1.5-flash': 'models/gemini-1.5-flash',
  'gemini-1.5-pro': 'models/gemini-1.5-pro',
  'gemini-2.0-flash': 'models/gemini-2.0-flash'
};

// Default model if requested model is not available
const DEFAULT_MODEL = 'gemini-2.0-flash';

// Configure the Google AI client once
const genAI = (() => {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ GOOGLE_AI_API_KEY is not set in environment variables');
    return null;
  }
  console.log(`✅ Google AI API key loaded (length: ${apiKey.length})`);
  return new GoogleGenerativeAI(apiKey);
})();

/**
 * Get AI service status
 * @returns {Object} Status object with configuration details
 */
const getStatus = () => {
  const isConfigured = !!genAI;
  const supportedModels = Object.keys(AVAILABLE_MODELS);
  
  console.log(`AI Service Status: ${isConfigured ? 'Ready' : 'Not Configured'}`);
  console.log(`Available models: ${supportedModels.join(', ')}`);
  
  return {
    isConfigured,
    serviceName: 'Google Gemini',
    isReady: isConfigured,
    supportedModels,
    defaultModel: DEFAULT_MODEL
  };
};

// AI status endpoint
router.get('/api/ai/status', (req, res) => {
  const status = getStatus();
  return res.json({ success: true, status });
});

// Chat with AI endpoint
router.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, context = [], systemPrompt = '', model = DEFAULT_MODEL } = req.body;
    
    // Validate required inputs
    if (!genAI) {
      return res.status(500).json({
        success: false,
        error: 'AI API not configured - Add your GOOGLE_AI_API_KEY to .env'
      });
    }
    
    if (!message?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }
    
    // Select the model or use default
    const modelName = AVAILABLE_MODELS[model] || AVAILABLE_MODELS[DEFAULT_MODEL];
    const aiModel = genAI.getGenerativeModel({ model: modelName });
    
    // Create chat history from context
    const history = context
      .filter(item => item.role !== 'system')
      .map(item => ({
        role: item.role === 'user' ? 'user' : 'model',
        parts: [{ text: item.content }]
      }));
    
    // Create the system prompt
    const promptText = systemPrompt || 'You are a helpful AI assistant for the PunkStrat website.';
    
    // Create the chat session
    const chat = aiModel.startChat({
      history,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 4096,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      ],
      systemInstruction: { text: promptText }
    });
    
    // Send the message and get response
    const result = await chat.sendMessage(message);
    const response = result.response;
    
    return res.json({
      success: true,
      response: response.text(),
      model: model
    });
    
  } catch (error) {
    console.error('AI Chat Error:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while processing your request'
    });
  }
});

// Export the router and status function
module.exports = {
  router,
  getStatus,
  DEFAULT_MODEL,
  AVAILABLE_MODELS
};