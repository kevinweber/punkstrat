/**
 * Google Context Cache implementation for document and conversation storage
 * Replacement for Zep memory storage
 * With fallback to in-memory storage when the Context Cache API is not available
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const aiIntegration = require('./ai-integration');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

// Limit uploads to PDFs and max 10MB
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Simple in-memory storage fallback
const memoryStore = {
  messages: [],
  documents: [],
  sessions: {},
  users: {},
  collections: [{
    name: 'personal_assistant',
    description: 'Personal Assistant Knowledge Collection',
    metadata: { source: 'personal-agent-app' },
    uuid: 'default-collection',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }]
};

// Flag to track if Context Cache API is available
let isContextCacheAvailable = true;

// Initialize Google Generative AI
const getGoogleAI = () => {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.error('Google AI API key is missing! Please add GOOGLE_AI_API_KEY to your .env file');
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
};

// Helper to ensure user exists in memory store
const ensureUser = (userId) => {
  if (!memoryStore.users[userId]) {
    memoryStore.users[userId] = {
      uuid: userId,
      created_at: new Date().toISOString(),
      sessions: []
    };
  }
  return memoryStore.users[userId];
};

// Helper to ensure session exists
const ensureSession = (userId) => {
  const user = ensureUser(userId);
  if (!memoryStore.sessions[userId]) {
    const sessionId = `session-${userId}-${Date.now()}`;
    memoryStore.sessions[userId] = {
      uuid: sessionId,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: { 
        browser: 'Web Browser',
        platform: 'Web'
      }
    };
    user.sessions.push(sessionId);
  }
  return memoryStore.sessions[userId];
};

// Google Context Cache API
const contextCacheAPI = {
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  modelName: 'gemini-1.5-pro', // Define the model name in one place
  
  // Get authorization header
  getAuthHeader() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('Google AI API key is missing! Please add GOOGLE_AI_API_KEY to your .env file');
    }
    return { params: { key: apiKey } };
  },
  
  // List all context caches
  async listContextCaches() {
    if (!isContextCacheAvailable) {
      console.log('Context Cache API not available, using in-memory fallback');
      return { contextCaches: [] };
    }
    
    try {
      console.log('Attempting to list context caches');
      const response = await axios.get(
        `${this.baseUrl}/${this.modelName}/contextCache`,
        this.getAuthHeader()
      );
      return response.data;
    } catch (error) {
      console.error('Error listing context caches:', error.response?.data || error.message);
      
      if (error.response?.status === 404) {
        console.log('Context Cache API appears to be unavailable (404 response)');
        isContextCacheAvailable = false;
        return { contextCaches: [] };
      }
      
      throw error;
    }
  },
  
  // Create a new context cache
  async createContextCache(displayName) {
    if (!isContextCacheAvailable) {
      console.log('Context Cache API not available, using in-memory fallback');
      return { name: `memory-${displayName}` };
    }
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.modelName}/contextCache`,
        { displayName },
        this.getAuthHeader()
      );
      return response.data;
    } catch (error) {
      console.error('Error creating context cache:', error.response?.data || error.message);
      
      if (error.response?.status === 404) {
        console.log('Context Cache API appears to be unavailable (404 response)');
        isContextCacheAvailable = false;
        return { name: `memory-${displayName}` };
      }
      
      throw error;
    }
  },
  
  // Get a specific context cache
  async getContextCache(contextCacheId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/${this.modelName}/contextCache/${contextCacheId}`,
        this.getAuthHeader()
      );
      return response.data;
    } catch (error) {
      console.error('Error getting context cache:', error.response?.data || error.message);
      throw error;
    }
  },
  
  // Add a document to the context cache
  async addDocument(contextCacheId, documentName, documentContent) {
    try {
      const docId = crypto.createHash('md5').update(documentName + Date.now()).digest('hex');
      
      const response = await axios.post(
        `${this.baseUrl}/${this.modelName}/contextCache/${contextCacheId}/documents`,
        {
          document: {
            id: docId,
            displayName: documentName,
            content: {
              parts: [{ text: documentContent }]
            }
          }
        },
        this.getAuthHeader()
      );
      return response.data;
    } catch (error) {
      console.error('Error adding document to context cache:', error.response?.data || error.message);
      throw error;
    }
  },
  
  // Search documents in the context cache
  async searchDocuments(contextCacheId, query) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.modelName}/contextCache/${contextCacheId}/documents:search`,
        {
          query,
          maxResults: 10
        },
        this.getAuthHeader()
      );
      return response.data;
    } catch (error) {
      console.error('Error searching documents in context cache:', error.response?.data || error.message);
      throw error;
    }
  },
  
  // Delete a document from the context cache
  async deleteDocument(contextCacheId, documentId) {
    try {
      const response = await axios.delete(
        `${this.baseUrl}/${this.modelName}/contextCache/${contextCacheId}/documents/${documentId}`,
        this.getAuthHeader()
      );
      return response.data;
    } catch (error) {
      console.error('Error deleting document from context cache:', error.response?.data || error.message);
      throw error;
    }
  },
  
  // Delete a context cache
  async deleteContextCache(contextCacheId) {
    try {
      const response = await axios.delete(
        `${this.baseUrl}/${this.modelName}/contextCache/${contextCacheId}`,
        this.getAuthHeader()
      );
      return response.data;
    } catch (error) {
      console.error('Error deleting context cache:', error.response?.data || error.message);
      throw error;
    }
  }
};

// User-to-context cache mapping
const userContextCaches = new Map();

// Helper function to ensure a user has a context cache
async function ensureUserContextCache(userId) {
  if (!userContextCaches.has(userId)) {
    try {
      // Check API availability first to avoid unnecessary requests
      if (!isContextCacheAvailable) {
        console.log(`Using in-memory storage for user ${userId}`);
        ensureSession(userId);
        userContextCaches.set(userId, `memory-User_${userId}_Cache`);
        return userContextCaches.get(userId);
      }
      
      // First check if we already have caches
      const caches = await contextCacheAPI.listContextCaches();
      
      // Look for an existing cache for this user
      let userCache = caches.contextCaches?.find(cache => 
        cache.displayName === `User_${userId}_Cache`
      );
      
      // If no cache exists, create one
      if (!userCache) {
        userCache = await contextCacheAPI.createContextCache(`User_${userId}_Cache`);
      }
      
      // Store the cache ID for this user
      userContextCaches.set(userId, userCache.name.split('/').pop());
    } catch (error) {
      console.error('Error ensuring user context cache:', error);
      // Fallback to in-memory storage on error
      console.log(`Falling back to in-memory storage for user ${userId} due to error`);
      isContextCacheAvailable = false;
      ensureSession(userId);
      userContextCaches.set(userId, `memory-User_${userId}_Cache`);
    }
  }
  
  return userContextCaches.get(userId);
}

// ----- Memory API Routes -----

// Add message to memory
router.post('/memory', async (req, res) => {
  try {
    const { userId, text, metadata = {}, role = 'user' } = req.body;
    
    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'userId and text are required' });
    }
    
    if (isContextCacheAvailable) {
      try {
        // For Google Context Cache, we store conversation messages as documents
        const contextCacheId = await ensureUserContextCache(userId);
        
        // Store as a document with a timestamp
        const timestamp = new Date().toISOString();
        const documentName = `conversation_${timestamp}`;
        const messageContent = `Role: ${role}\nTimestamp: ${timestamp}\nMessage: ${text}`;
        
        await contextCacheAPI.addDocument(contextCacheId, documentName, messageContent);
      } catch (error) {
        console.error('Error adding to Context Cache, using memory fallback:', error);
        // On error, fall back to memory storage
        isContextCacheAvailable = false;
      }
    }
    
    // If Context Cache API is not available, or we had an error, use in-memory storage
    if (!isContextCacheAvailable) {
      const session = ensureSession(userId);
      
      const documentId = `doc-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      
      memoryStore.messages.push({
        id: documentId,
        session_id: session.uuid,
        content: text,
        metadata: {
          ...metadata,
          userId,
          role,
          timestamp: new Date().toISOString(),
          source: 'conversation'
        }
      });
      
      // Update session last interaction time
      session.updated_at = new Date().toISOString();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding message to memory:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload and process PDF
router.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
    }
    
    const userId = req.body.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    
    // Extract text from PDF
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(dataBuffer);
    
    const fileName = req.file.originalname;
    const pageCount = pdfData.numpages;
    const fileContent = pdfData.text;
    
    // Get document summary
    const genAI = getGoogleAI();
    const summaryModel = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash', // Keep flash for summaries as it's faster
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      }
    });
    
    const summaryPrompt = `
      Please provide a comprehensive summary of the following document: "${fileName}".
      Focus on extracting the key points, main topics, and important information.
      Format your response as bullet points of the main themes followed by a brief overview.
      
      DOCUMENT CONTENT:
      ${fileContent.slice(0, 30000)} ${fileContent.length > 30000 ? '... (document truncated due to length)' : ''}
    `;
    
    const summaryResult = await summaryModel.generateContent(summaryPrompt);
    const summary = summaryResult.response.text();
    
    // Try to store in Context Cache if available
    if (isContextCacheAvailable) {
      try {
        // Ensure user has a context cache
        const contextCacheId = await ensureUserContextCache(userId);
        
        // Store document in context cache
        // Split document into chunks of ~10,000 characters to stay within API limits
        const chunkSize = 10000;
        const contentChunks = [];
        
        for (let i = 0; i < fileContent.length; i += chunkSize) {
          contentChunks.push(fileContent.slice(i, i + chunkSize));
        }
        
        // Store each chunk as a separate document
        for (let i = 0; i < contentChunks.length; i++) {
          const chunkName = `${fileName} (part ${i+1} of ${contentChunks.length})`;
          await contextCacheAPI.addDocument(contextCacheId, chunkName, contentChunks[i]);
        }
        
        // Store summary as a separate document with metadata
        const docMetadata = {
          name: fileName,
          pageCount,
          summary,
          uploadDate: new Date().toISOString()
        };
        
        const metadataDoc = `
          DOCUMENT: ${fileName}
          METADATA: ${JSON.stringify(docMetadata, null, 2)}
          SUMMARY: ${summary}
        `;
        
        await contextCacheAPI.addDocument(contextCacheId, `${fileName} (metadata)`, metadataDoc);
      } catch (error) {
        console.error('Error storing in Context Cache, using memory fallback:', error);
        // On error, fall back to memory storage
        isContextCacheAvailable = false;
      }
    }
    
    // If Context Cache API is not available, or we had an error, use in-memory storage
    if (!isContextCacheAvailable) {
      // Ensure session exists for this user
      const session = ensureSession(userId);
      
      // Create a unique document ID
      const documentId = `pdf-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      
      // Store the entire document content and metadata
      memoryStore.documents.push({
        id: documentId,
        content: fileContent,
        session_id: session.uuid,
        metadata: {
          userId,
          filename: fileName,
          filesize: req.file.size,
          filetype: 'application/pdf',
          mime_type: 'application/pdf',
          source: 'pdf',
          pages: pageCount,
          timestamp: new Date().toISOString(),
          session_id: session.uuid,
          document_id: documentId,
          summary: summary
        }
      });
      
      // Update session last interaction time
      session.updated_at = new Date().toISOString();
    }
    
    // Save metadata locally to enable document listing
    const metadataDir = path.join(__dirname, '../uploads/metadata');
    if (!fs.existsSync(metadataDir)) {
      fs.mkdirSync(metadataDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(metadataDir, `${userId}_${path.basename(req.file.filename)}.json`),
      JSON.stringify({
        filename: req.file.filename,
        originalName: fileName,
        path: req.file.path,
        size: req.file.size,
        pageCount,
        summary,
        uploadDate: new Date().toISOString(),
        contextCacheId: isContextCacheAvailable ? userContextCaches.get(userId) : null
      })
    );
    
    res.json({
      success: true,
      filename: req.file.filename,
      name: fileName,
      pageCount,
      summary
    });
  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search documents - used to find relevant document context for a query
router.get('/documents/search', async (req, res) => {
  try {
    const { userId, query } = req.query;
    
    if (!userId || !query) {
      return res.status(400).json({ success: false, error: 'userId and query are required' });
    }
    
    let results = [];
    
    // Try Context Cache API first if available
    if (isContextCacheAvailable) {
      try {
        // Ensure user has a context cache
        const contextCacheId = await ensureUserContextCache(userId);
        
        // Search documents in the context cache
        const searchResults = await contextCacheAPI.searchDocuments(contextCacheId, query);
        
        // Format results for client
        results = searchResults.documents?.map(doc => {
          // Extract document metadata if available
          const isMetadata = doc.displayName.includes('(metadata)');
          const content = doc.content.parts[0].text;
          
          let metadata = { name: doc.displayName };
          if (isMetadata) {
            try {
              // Extract metadata JSON from the content
              const metadataMatch = content.match(/METADATA: ({[\s\S]*?})(?=\nSUMMARY:|\n|$)/);
              if (metadataMatch && metadataMatch[1]) {
                metadata = JSON.parse(metadataMatch[1]);
              }
              
              // Extract summary from the content
              const summaryMatch = content.match(/SUMMARY: ([\s\S]*?)(?=\n|$)/);
              if (summaryMatch && summaryMatch[1]) {
                metadata.summary = summaryMatch[1];
              }
            } catch (parseError) {
              console.error('Error parsing metadata JSON:', parseError);
            }
          }
          
          return {
            score: doc.relevanceScore,
            content: content,
            document: {
              id: doc.id,
              metadata: metadata
            }
          };
        }) || [];
      } catch (error) {
        console.error('Error searching Context Cache, using memory fallback:', error);
        // On error, fall back to memory storage
        isContextCacheAvailable = false;
      }
    }
    
    // If Context Cache API is not available, or we had an error, use in-memory storage
    if (!isContextCacheAvailable) {
      // Filter documents by user ID and source, then by query content if provided
      let filteredDocs = memoryStore.documents.filter(doc => {
        // Basic filter by user ID and PDF source
        if (doc.metadata.userId !== userId || doc.metadata.source !== 'pdf') {
          return false;
        }
        
        // If query is provided, do a simple content search
        if (query && !doc.content.toLowerCase().includes(query.toLowerCase())) {
          return false;
        }
        
        return true;
      });
      
      // Sort by timestamp (newest first)
      filteredDocs.sort((a, b) => {
        return new Date(b.metadata.timestamp) - new Date(a.metadata.timestamp);
      });
      
      // Limit results and format for response
      results = filteredDocs.slice(0, 15).map(doc => {
        // Create an excerpt around the query term if it exists
        let excerpt = doc.content;
        if (query) {
          const queryIndex = doc.content.toLowerCase().indexOf(query.toLowerCase());
          if (queryIndex !== -1) {
            // Get a reasonable excerpt around the query match
            const start = Math.max(0, queryIndex - 100);
            const end = Math.min(doc.content.length, queryIndex + query.length + 300);
            excerpt = doc.content.substring(start, end);
            
            // Add ellipsis if we're not showing the beginning or end
            if (start > 0) excerpt = '...' + excerpt;
            if (end < doc.content.length) excerpt = excerpt + '...';
          } else {
            // If query not found directly, just take the first section
            excerpt = doc.content.substring(0, 400) + '...';
          }
        } else {
          // No query, just take the first section
          excerpt = doc.content.substring(0, 400) + '...';
        }
        
        return {
          content: excerpt,
          document: {
            id: doc.id,
            metadata: {
              name: doc.metadata.filename,
              pages: doc.metadata.pages,
              timestamp: doc.metadata.timestamp,
              summary: doc.metadata.summary
            }
          },
          score: 1.0 // Default score
        };
      });
    }
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get conversation history from memory
router.get('/memory', async (req, res) => {
  try {
    const { userId, limit = 20, source = 'conversation' } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    
    let messages = [];
    
    // Try Context Cache API first if available
    if (isContextCacheAvailable) {
      try {
        // Ensure user has a context cache
        const contextCacheId = await ensureUserContextCache(userId);
        
        // Search for conversation messages
        const searchResults = await contextCacheAPI.searchDocuments(contextCacheId, 'conversation');
        
        // Extract and format messages
        messages = searchResults.documents?.map(doc => {
          const content = doc.content.parts[0].text;
          const role = content.match(/Role: (\w+)/)?.[1] || 'user';
          const message = content.match(/Message: ([\s\S]*?)(?=\n|$)/)?.[1] || '';
          
          return {
            role: role === 'user' ? 'user' : 'assistant',
            content: message
          };
        }) || [];
      } catch (error) {
        console.error('Error getting memory from Context Cache, using memory fallback:', error);
        // On error, fall back to memory storage
        isContextCacheAvailable = false;
      }
    }
    
    // If Context Cache API is not available, or we had an error, use in-memory storage
    if (!isContextCacheAvailable) {
      // Filter messages by user ID and source
      const filteredMessages = memoryStore.messages.filter(
        msg => msg.metadata.userId === userId && msg.metadata.source === source
      );
      
      // Format messages
      messages = filteredMessages.map(msg => ({
        role: msg.metadata.role || 'user',
        content: msg.content
      }));
      
      // Sort by timestamp if available
      messages.sort((a, b) => {
        const timeA = a.timestamp || '0';
        const timeB = b.timestamp || '0';
        return new Date(timeA) - new Date(timeB);
      });
    }
    
    // Sort by timestamp if available and limit results
    const sortedMessages = messages
      .filter(msg => msg.content.trim() !== '')
      .slice(-limit);
    
    res.json({
      success: true,
      messages: sortedMessages
    });
  } catch (error) {
    console.error('Error getting memory:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List documents
router.get('/documents', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    
    // Read local metadata files for the user
    const metadataDir = path.join(__dirname, '../uploads/metadata');
    const documents = [];
    
    if (fs.existsSync(metadataDir)) {
      const files = fs.readdirSync(metadataDir);
      
      for (const file of files) {
        if (file.startsWith(userId + '_') && file.endsWith('.json')) {
          try {
            const metadata = JSON.parse(fs.readFileSync(path.join(metadataDir, file), 'utf-8'));
            documents.push(metadata);
          } catch (err) {
            console.error(`Error reading metadata file ${file}:`, err);
          }
        }
      }
    }
    
    // If no documents found in metadata directory and using memory storage,
    // get documents from memory store
    if (documents.length === 0 && !isContextCacheAvailable) {
      const inMemoryDocs = memoryStore.documents.filter(
        doc => doc.metadata.userId === userId && doc.metadata.source === 'pdf'
      );
      
      // Extract unique filenames
      const seenFilenames = new Set();
      
      inMemoryDocs.forEach(doc => {
        const { filename, timestamp, pages, summary } = doc.metadata;
        if (filename && !seenFilenames.has(filename)) {
          seenFilenames.add(filename);
          documents.push({
            originalName: filename,
            pageCount: pages,
            summary: summary,
            uploadDate: timestamp
          });
        }
      });
    }
    
    res.json({
      success: true,
      documents
    });
  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete PDF
router.delete('/pdfs/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    
    // Get metadata file path
    const metadataPath = path.join(__dirname, '../uploads/metadata', `${userId}_${filename}.json`);
    
    // Check if metadata exists
    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    
    // Read metadata to get context cache ID and file path
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    
    // Delete PDF file
    const filePath = metadata.path;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Delete metadata file
    fs.unlinkSync(metadataPath);
    
    // If using in-memory storage, remove from memory store
    if (!isContextCacheAvailable) {
      // Remove document from memory store
      memoryStore.documents = memoryStore.documents.filter(
        doc => !(doc.metadata.userId === userId && 
                doc.metadata.filename === metadata.originalName)
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting PDF:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check status
router.get('/status', async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    const isConfigured = !!apiKey;
    
    let contextCaches = [];
    let apiStatus = 'Unavailable (using in-memory fallback)';
    
    if (isConfigured && isContextCacheAvailable) {
      try {
        const caches = await contextCacheAPI.listContextCaches();
        contextCaches = caches.contextCaches || [];
        apiStatus = contextCaches.length > 0 ? 'Available' : 'Available (no caches)';
      } catch (apiError) {
        console.error('Error checking Context Cache API:', apiError);
        apiStatus = `Error: ${apiError.message}`;
        isContextCacheAvailable = false;
      }
    }
    
    res.json({
      success: true,
      status: {
        isConfigured,
        service: isContextCacheAvailable ? 'Google Context Cache API' : 'In-Memory Storage (Fallback)',
        apiStatus,
        contextCaches: isContextCacheAvailable ? contextCaches.length : 'N/A',
        memoryStoreType: isContextCacheAvailable ? 'Google Context Cache' : 'In-Memory',
        documents: memoryStore.documents.length,
        messages: memoryStore.messages.length
      }
    });
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router; 