const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// Initialize the Google Generative AI with the API key from environment variables
const getGoogleAI = () => {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    console.error('Google AI API key is missing! Please add GOOGLE_AI_API_KEY to your .env file');
    return null;
  }

  return new GoogleGenerativeAI(apiKey);
};

// Available models with increased context windows
const AVAILABLE_MODELS = {
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
  'gemini-1.5-pro': 'Gemini 1.5 Pro'
  // 'gemini-2.0-flash': 'Gemini 2.0 Flash',
};

// Fallback model if requested model is not available
const FALLBACK_MODEL = 'gemini-1.5-pro';

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
        maxOutputTokens: 12288, // Significantly increased token limit for comprehensive summaries
        topP: 0.95,
        topK: 40,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    });
    
    // Create a prompt for summarizing the document
    const prompt = `Please provide a detailed summary of the following document: "${documentName}".
    
Focus on extracting the most important information, key points, and main topics covered in the document.
Format your summary as bullet points of the main themes followed by a short paragraph overview.
Be comprehensive but concise.

DOCUMENT CONTENT:
${documentContent}

DETAILED SUMMARY:`;
    
    // Use streaming for more reliable handling of large responses
    const result = await model.generateContentStream(prompt);
    
    // Process the streaming response
    let fullSummary = '';
    for await (const chunk of result.stream) {
      fullSummary += chunk.text();
    }
    
    return { 
      success: true, 
      summary: fullSummary,
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

// Main AI chat endpoint
router.post('/api/ai/chat', async (req, res) => {
  const { message, userId, context = [], documents = [], systemPrompt, model = 'gemini-1.5-pro', streaming = false } = req.body;
  
  if (!message) {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }
  
  // Set up streaming response headers if streaming is requested
  if (streaming) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Flush the headers to establish SSE with client
    
    // Send the starting event
    res.write(`data: ${JSON.stringify({ event: 'start' })}\n\n`);
  }
  
  // Process the request
  try {
    const genAI = getGoogleAI();
    const modelInstance = genAI.getGenerativeModel({
      model: model,
      generationConfig: {
        maxOutputTokens: 12288,
        temperature: 0.8,
        topP: 0.95,
        topK: 40,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });
    
    const hasDocuments = documents && documents.length > 0;
    const isDocumentAnalysis = 
      message.toLowerCase().includes('analyze') || 
      message.toLowerCase().includes('summarize') || 
      message.toLowerCase().includes('tell me about') ||
      (hasDocuments && (
        message.toLowerCase().includes('what is in') ||
        message.toLowerCase().includes('what does') ||
        message.toLowerCase().includes('content of')
      ));
    
    // Create the prompt
    const chatHistory = context.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    })).filter(msg => msg.parts[0].text.trim() !== '');
    
    // Include any retrieved document content
    let promptText = message;
    if (hasDocuments) {
      promptText = `${message}\n\nRelevant document sections:\n${documents.join('\n\n')}`;
    }
    
    // Add document analysis instructions if needed
    let systemInstructions = systemPrompt || 'You are a helpful AI assistant';
    if (isDocumentAnalysis) {
      systemInstructions += '\n\nYou are analyzing documents. This is critical for the user. Provide COMPLETE, thorough analysis. Include key information from the documents and organize your response with clear headings and bullet points. NEVER truncate your analysis or stop mid-response.';
    }
    
    // Create the prompt
    const prompt = {
      contents: [
        { role: 'user', parts: [{ text: systemInstructions }] },
        ...chatHistory,
        { role: 'user', parts: [{ text: promptText }] }
      ]
    };
    
    // Process with streaming or non-streaming based on request
    let response;
    if (streaming) {
      try {
        // Get the response stream
        const result = await modelInstance.generateContentStream(prompt);
        
        // Buffer to accumulate the full response
        let fullResponse = '';
        
        // Process each chunk
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          fullResponse += chunkText;
          
          // Send this chunk to the client
          res.write(`data: ${JSON.stringify({ event: 'chunk', chunk: chunkText })}\n\n`);
        }
        
        // Send the complete response
        res.write(`data: ${JSON.stringify({ event: 'complete', response: fullResponse })}\n\n`);
        res.end();
        return;
      } catch (streamError) {
        console.error('Error in streaming response:', streamError);
        
        // Send error to the client
        res.write(`data: ${JSON.stringify({ event: 'error', error: streamError.message || 'Error generating streaming response' })}\n\n`);
        res.end();
        return;
      }
    } else {
      // Non-streaming response
      try {
        const result = await modelInstance.generateContent(prompt);
        response = result.response.text();
      } catch (error) {
        console.error('Error generating content with Google AI:', error);
        throw error;
      }
    }
    
    // For non-streaming, return the response as JSON
    return res.json({ success: true, response });
  } catch (error) {
    console.error('Error in AI chat endpoint:', error);
    
    // Handle streaming vs. non-streaming errors differently
    if (streaming) {
      res.write(`data: ${JSON.stringify({ event: 'error', error: error.message || 'An unexpected error occurred' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ 
        success: false, 
        error: error.message || 'An unexpected error occurred' 
      });
    }
  }
});

// Status endpoint to check if the AI service is configured
router.get('/status', async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    const isConfigured = !!apiKey;
    
    // Create an array of model names from our object
    const availableModels = Object.keys(AVAILABLE_MODELS);
    
    console.log('AI Status check - API Key configured:', isConfigured);
    console.log('Available models:', availableModels);

    res.json({
      success: true,
      status: {
        isConfigured,
        service: 'Google AI (Gemini Models)',
        ready: isConfigured,
        supportedModels: availableModels,
        defaultModel: FALLBACK_MODEL
      }
    });
  } catch (error) {
    console.error('Error checking AI status:', error);
    res.status(500).json({ error: 'Failed to check AI status', details: error.message });
  }
});

module.exports = {
  router,
  generateSummary
};