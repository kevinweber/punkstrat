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
      // Initialize the model with appropriate settings
      const model = genAI.getGenerativeModel({ 
        model: selectedModel,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 12288,  // Tripled from previous 4096 for much more complete responses
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
        ? context.map(msg => {
            // Handle different formats of context messages
            let role = 'User';
            let content = '';
            
            if (typeof msg === 'object') {
              // Handle different possible formats of message objects
              if (msg.role) {
                role = msg.role === 'user' ? 'User' : 'Assistant';
              }
              
              if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
                content = msg.parts[0].text || '';
              } else if (msg.content) {
                content = msg.content;
              }
            } else if (typeof msg === 'string') {
              content = msg;
            }
            
            return `${role}: ${content}`;
          }).join('\n\n') 
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
      const timeout = isDocumentAnalysis ? 180000 : 120000; // 3 minutes for doc analysis, 2 minutes otherwise
      
      // Generate content with the combined prompt and a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        // Use streaming for more reliable handling of large responses
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
        const fallbackModel = genAI.getGenerativeModel({ 
          model: FALLBACK_MODEL,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 12288,
            topP: 0.95,
            topK: 40,
          }
        });
        
        // Create a simple chat with just the essential context
        const fallbackResponse = await fallbackModel.generateContentStream(
          `You are an advanced, creative AI assistant. The user asked: ${message}`
        );
        
        let fallbackText = '';
        for await (const chunk of fallbackResponse.stream) {
          fallbackText += chunk.text();
        }
        
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