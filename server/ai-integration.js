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

// Remove the models endpoint since it's not supported
// router.get('/models', async (req, res) => { ... });

// Main AI response endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message, userId, context = [], documents = [], modelName = 'gemini-1.5-flash' } = req.body;

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

    // Allow model selection from client with fallback
    const model = genAI.getGenerativeModel({ model: modelName });

    // Prepare any document references
    const systemPrompt = documents.length > 0 ?
      `You are a helpful assistant. You have access to the following information extracted from user documents:\n\n${documents.join('\n\n')}\n\nUse this information to help answer the user's questions when relevant.` :
      'You are a helpful assistant for the PunkStrat website.';

    // Add system prompt to the beginning of history if available
    const history = context.length > 0 ? context.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    })) : [];

    // Create a chat session
    const chat = model.startChat({
      history,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    // Generate a response
    const result = await chat.sendMessage([
      ...(history.length === 0 ? [{ text: systemPrompt, role: 'model' }] : []),
      { text: message }
    ]);
    const response = result.response;
    const text = response.text();

    // Return the AI response
    res.json({
      success: true,
      response: text,
      model: modelName
    });

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

    res.json({
      success: true,
      status: {
        isConfigured,
        service: 'Google AI (Gemini 1.5 Flash)',
        ready: isConfigured
      }
    });
  } catch (error) {
    console.error('Error checking AI status:', error);
    res.status(500).json({ error: 'Failed to check AI status', details: error.message });
  }
});

module.exports = router; 