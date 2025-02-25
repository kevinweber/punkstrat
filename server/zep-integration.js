const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const router = express.Router();

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

// Simple in-memory storage for the demo app
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

// Helper to ensure user exists
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

console.log('Using enhanced in-memory storage for building knowledge graph');
console.log('Collection "personal_assistant" is ready to use');

// Add a message to memory
router.post('/memory', async (req, res) => {
  try {
    const { userId, text, metadata = {} } = req.body;
    
    if (!userId || !text) {
      return res.status(400).json({ error: 'userId and text are required' });
    }
    
    // Ensure session exists for this user
    const session = ensureSession(userId);
    
    const documentId = `doc-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    
    memoryStore.messages.push({
      id: documentId,
      session_id: session.uuid,
      content: text,
      metadata: {
        ...metadata,
        userId,
        timestamp: new Date().toISOString(),
        source: 'conversation'
      }
    });
    
    // Update session last interaction time
    session.updated_at = new Date().toISOString();
    
    res.json({ success: true, documentId, sessionId: session.uuid });
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

    // Ensure session exists for this user
    const session = ensureSession(userId);

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
      timestamp: new Date().toISOString(),
      session_id: session.uuid
    };
    
    // Get the full text
    const text = pdfData.text;
    
    // Create a unique document ID
    const documentId = `pdf-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    
    // Generate document summary using AI (if available)
    let summary = `PDF with ${pdfData.numpages} pages and ${text.length} characters`;
    
    try {
      // If we have the AI integration available
      const aiModule = require('./ai-integration');
      if (aiModule.generateSummary) {
        // Generate an AI summary (limit text length to avoid token limits)
        const textForSummary = text.length > 10000 ? text.substring(0, 10000) + '...' : text;
        const summaryResult = await aiModule.generateSummary(textForSummary, req.file.originalname);
        if (summaryResult && summaryResult.summary) {
          summary = summaryResult.summary;
        }
      }
    } catch (summaryError) {
      console.warn('Unable to generate AI summary:', summaryError.message);
      // Continue with basic summary if AI summary generation fails
    }
    
    // Store the entire document content and metadata
    memoryStore.documents.push({
      id: documentId,
      content: text,
      session_id: session.uuid,
      metadata: {
        ...metadata,
        document_id: documentId,
        summary: summary
      }
    });
    
    // Update session last interaction time
    session.updated_at = new Date().toISOString();
    
    // Clean up the uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({ 
      success: true, 
      filename: req.file.originalname,
      filetype: req.file.mimetype,
      documentId,
      pages: pdfData.numpages,
      sessionId: session.uuid,
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
            timestamp: doc.metadata.timestamp
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

// Get a list of PDF files in the memory
router.get('/pdfs', async (req, res) => {
  try {
    const { userId = 'default' } = req.query;
    
    // Filter documents by user ID and source
    const pdfDocs = memoryStore.documents.filter(
      doc => doc.metadata.userId === userId && doc.metadata.source === 'pdf'
    );
    
    // Extract unique filenames
    const pdfs = [];
    const seenFilenames = new Set();
    
    pdfDocs.forEach(doc => {
      const { filename, timestamp, pages } = doc.metadata;
      if (filename && !seenFilenames.has(filename)) {
        seenFilenames.add(filename);
        pdfs.push({
          filename,
          timestamp,
          pages: pages || 1
        });
      }
    });
    
    // Sort by timestamp (newest first)
    pdfs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      success: true,
      pdfs
    });
  } catch (error) {
    console.error('Error retrieving PDF list:', error);
    res.status(500).json({ error: 'Failed to retrieve PDF list', details: error.message });
  }
});

// Delete a document from memory
router.delete('/memory/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Remove document from messages
    const messageIndex = memoryStore.messages.findIndex(
      msg => msg.id === documentId && msg.metadata.userId === userId
    );
    
    if (messageIndex !== -1) {
      memoryStore.messages.splice(messageIndex, 1);
    }
    
    // Remove document from documents
    const documentIndex = memoryStore.documents.findIndex(
      doc => doc.id === documentId && doc.metadata.userId === userId
    );
    
    if (documentIndex !== -1) {
      memoryStore.documents.splice(documentIndex, 1);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting from memory:', error);
    res.status(500).json({ error: 'Failed to delete memory', details: error.message });
  }
});

// Delete a PDF and all its chunks from memory
router.delete('/pdfs/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const { userId = 'default' } = req.query;
    
    // Filter documents to find PDF with matching filename
    const initialCount = memoryStore.documents.length;
    
    // Remove PDF from documents
    memoryStore.documents = memoryStore.documents.filter(
      doc => !(doc.metadata.userId === userId && 
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
    res.json({ 
      success: true, 
      status: {
        isReady: true,
        collections: memoryStore.collections.length,
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

// Get a list of documents
router.get('/documents', async (req, res) => {
  try {
    const { userId = 'default' } = req.query;
    
    // Filter PDF documents by user ID
    const pdfDocs = memoryStore.documents.filter(
      doc => doc.metadata.userId === userId && doc.metadata.source === 'pdf'
    );
    
    // Extract document info
    const documents = pdfDocs.map(doc => ({
      name: doc.metadata.filename,
      id: doc.id,
      metadata: {
        pages: doc.metadata.pages || 1,
        filesize: doc.metadata.filesize,
        timestamp: doc.metadata.timestamp
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

module.exports = router; 