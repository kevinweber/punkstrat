/**
 * Google Context Cache implementation for document and conversation storage
 * Replacement for Zep memory storage
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const router = express.Router();
const aiIntegration = require('./ai-integration');

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, '../uploads');
      // Ensure uploads directory exists
      if (!fs.existsSync(uploadDir)){
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      // Create a unique filename with original extension
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  fileFilter: function (req, file, cb) {
    // Accept only PDF files
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed!'), false);
    }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Initialize the Google Generative AI
const getGoogleAI = () => {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.error('Google AI API key is missing! Please add GOOGLE_AI_API_KEY to your .env file');
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
};

// In-memory storage - will be replaced with Google Context Cache in production
const memoryStore = {
  messages: [],
  documents: [],
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

// Helper to ensure user exists
const ensureUser = (userId) => {
  if (!memoryStore.users[userId]) {
    memoryStore.users[userId] = {
      uuid: userId,
      created_at: new Date().toISOString(),
      conversations: []
    };
  }
  return memoryStore.users[userId];
};

// Add a message to memory
router.post('/memory', async (req, res) => {
  try {
    const { userId, text, metadata = {} } = req.body;
    
    if (!userId || !text) {
      return res.status(400).json({ error: 'userId and text are required' });
    }
    
    // Ensure user exists
    const user = ensureUser(userId);
    
    const messageId = `msg-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    
    // Save to in-memory store
    memoryStore.messages.push({
      id: messageId,
      user_id: userId,
      content: text,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    });
    
    res.json({ success: true, messageId });
  } catch (error) {
    console.error('Error adding to memory:', error);
    res.status(500).json({ error: 'Failed to store memory', details: error.message });
  }
});

// Upload and process PDF files
router.post('/upload-pdf', upload.single('files'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const { userId = 'default' } = req.body;

    // Ensure user exists
    ensureUser(userId);

    // Read the uploaded PDF file
    const dataBuffer = fs.readFileSync(req.file.path);
    
    // Parse the PDF content
    const pdfData = await pdfParse(dataBuffer);
    
    // Extract metadata from PDF
    const metadata = {
      userId,
      filename: req.file.originalname,
      filesize: req.file.size,
      filetype: req.file.mimetype,
      mime_type: req.file.mimetype,
      source: 'pdf',
      pages: pdfData.numpages,
      timestamp: new Date().toISOString()
    };
    
    // Get the full text
    const text = pdfData.text;
    
    // Create a unique document ID
    const documentId = `pdf-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    
    // Generate document summary using AI
    let summary = `PDF with ${pdfData.numpages} pages and ${text.length} characters`;
    
    try {
      // Generate an AI summary (limit text length to avoid token limits)
      const textForSummary = text.length > 15000 ? text.substring(0, 15000) + '...' : text;
      const summaryResult = await aiIntegration.generateSummary(textForSummary, req.file.originalname);
      if (summaryResult && summaryResult.summary) {
        summary = summaryResult.summary;
      }
    } catch (summaryError) {
      console.warn('Unable to generate AI summary:', summaryError.message);
      // Continue with basic summary if AI summary generation fails
    }
    
    // Store the entire document content and metadata
    memoryStore.documents.push({
      id: documentId,
      content: text,
      user_id: userId,
      metadata: {
        ...metadata,
        document_id: documentId,
        summary: summary
      }
    });
    
    // Clean up the uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({ 
      success: true, 
      filename: req.file.originalname,
      filetype: req.file.mimetype,
      documentId,
      pages: pdfData.numpages,
      summary: summary
    });
  } catch (error) {
    console.error('Error processing PDF:', error);
    
    // Clean up the uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to process PDF', details: error.message });
  }
});

// Search memory for document content
router.get('/documents/search', async (req, res) => {
  try {
    const { query, userId = 'default', limit = 15 } = req.query;
    
    // Filter documents by user ID and source, then by query content if provided
    let filteredDocs = memoryStore.documents.filter(doc => {
      // Basic filter by user ID and PDF source
      if (doc.user_id !== userId || doc.metadata.source !== 'pdf') {
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
    const results = filteredDocs.slice(0, parseInt(limit, 10)).map(doc => {
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
            summary: doc.metadata.summary || 'No summary available'
          }
        },
        score: 1.0 // Default score
      };
    });
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({ error: 'Failed to search documents', details: error.message });
  }
});

// Get conversation history
router.get('/memory', async (req, res) => {
  try {
    const { userId = 'default', source = 'conversation' } = req.query;
    
    // Filter messages by user ID
    const userMessages = memoryStore.messages.filter(msg => 
      msg.user_id === userId
    );
    
    // Format for response
    const results = userMessages.map(msg => ({
      content: msg.content,
      metadata: msg.metadata
    }));
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error retrieving memory:', error);
    res.status(500).json({ error: 'Failed to retrieve memory', details: error.message });
  }
});

// Get a list of documents
router.get('/documents', async (req, res) => {
  try {
    const { userId = 'default' } = req.query;
    
    // Filter PDF documents by user ID
    const pdfDocs = memoryStore.documents.filter(
      doc => doc.user_id === userId && doc.metadata.source === 'pdf'
    );
    
    // Extract document info with summaries
    const documents = pdfDocs.map(doc => ({
      name: doc.metadata.filename,
      id: doc.id,
      metadata: {
        pages: doc.metadata.pages || 1,
        filesize: doc.metadata.filesize,
        timestamp: doc.metadata.timestamp,
        summary: doc.metadata.summary || 'No summary available'
      }
    }));
    
    // Sort by timestamp (newest first)
    documents.sort((a, b) => new Date(b.metadata.timestamp) - new Date(a.metadata.timestamp));
    
    res.json({
      success: true,
      documents
    });
  } catch (error) {
    console.error('Error retrieving documents:', error);
    res.status(500).json({ error: 'Failed to retrieve documents', details: error.message });
  }
});

// Delete a PDF document
router.delete('/pdfs/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const { userId = 'default' } = req.query;
    
    // Filter documents to find PDF with matching filename
    const initialCount = memoryStore.documents.length;
    
    // Remove PDF from documents
    memoryStore.documents = memoryStore.documents.filter(
      doc => !(doc.user_id === userId && 
              doc.metadata.source === 'pdf' && 
              doc.metadata.filename === filename)
    );
    
    const deletedCount = initialCount - memoryStore.documents.length;
    
    res.json({ 
      success: true,
      deletedCount
    });
  } catch (error) {
    console.error('Error deleting PDF from memory:', error);
    res.status(500).json({ error: 'Failed to delete PDF', details: error.message });
  }
});

// Check service status
router.get('/status', async (req, res) => {
  try {
    const genAI = getGoogleAI();
    
    res.json({ 
      success: true, 
      status: {
        isReady: !!genAI,
        memory: {
          messages: memoryStore.messages.length,
          documents: memoryStore.documents.length
        }
      }
    });
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({ error: 'Failed to get status', details: error.message });
  }
});

module.exports = router; 