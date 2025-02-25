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

// Main AI response endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message, userId, context = [] } = req.body;
    
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
    
    // Get the generative model (Gemini)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    
    // Create a chat session
    const chat = model.startChat({
      history: context.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      })),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });
    
    // Generate a response
    const result = await chat.sendMessage(message);
    const response = result.response;
    const text = response.text();
    
    // Return the AI response
    res.json({ 
      success: true, 
      response: text,
      model: 'gemini-1.5-pro'
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
        service: 'Google AI (Gemini 1.5 Pro)',
        ready: isConfigured
      }
    });
  } catch (error) {
    console.error('Error checking AI status:', error);
    res.status(500).json({ error: 'Failed to check AI status', details: error.message });
  }
});

module.exports = router; 