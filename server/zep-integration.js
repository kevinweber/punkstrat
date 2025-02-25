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
router.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

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
    
    // Split the text into chunks to handle large documents
    const chunkSize = 1000; // characters per chunk
    const text = pdfData.text;
    const chunks = [];
    
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    
    // Add each chunk to memory
    const documentIds = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk.trim().length === 0) continue;
      
      const documentId = `pdf-${Date.now()}-${i}-${Math.round(Math.random() * 1E9)}`;
      
      memoryStore.documents.push({
        id: documentId,
        content: chunk,
        session_id: session.uuid,
        metadata: {
          ...metadata,
          chunkIndex: i,
          totalChunks: chunks.length,
          document_id: documentId
        }
      });
      
      documentIds.push(documentId);
    }
    
    // Update session last interaction time
    session.updated_at = new Date().toISOString();
    
    // Clean up the uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({ 
      success: true, 
      filename: req.file.originalname,
      filetype: req.file.mimetype,
      documentIds,
      totalChunks: chunks.length,
      pages: pdfData.numpages,
      sessionId: session.uuid,
      summary: `Processed ${chunks.length} chunks from PDF with ${pdfData.numpages} pages`
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

// Search memory
router.get('/memory', async (req, res) => {
  try {
    const { userId, query, limit = 5, source } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Simple filtering function
    const filterItem = (item) => {
      if (item.metadata.userId !== userId) return false;
      if (source && item.metadata.source !== source) return false;
      if (query && !item.content.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    };
    
    // Combine messages and documents
    const allItems = [...memoryStore.messages, ...memoryStore.documents];
    
    // Filter and limit results
    const results = allItems
      .filter(filterItem)
      .slice(0, parseInt(limit, 10))
      .map(item => ({
        content: item.content,
        metadata: item.metadata,
        score: 1.0 // Dummy score for compatibility
      }));
    
    res.json({ 
      success: true, 
      results
    });
  } catch (error) {
    console.error('Error searching memory:', error);
    res.status(500).json({ error: 'Failed to search memory', details: error.message });
  }
});

// Get a list of PDF files in the memory
router.get('/pdfs', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Filter documents by user ID and source
    const pdfDocs = memoryStore.documents.filter(
      doc => doc.metadata.userId === userId && doc.metadata.source === 'pdf'
    );
    
    // Extract unique filenames
    const pdfs = new Map();
    pdfDocs.forEach(doc => {
      const { filename, timestamp } = doc.metadata;
      if (filename && !pdfs.has(filename)) {
        pdfs.set(filename, {
          filename,
          timestamp,
          chunks: 1
        });
      } else if (filename) {
        const pdf = pdfs.get(filename);
        pdf.chunks += 1;
      }
    });
    
    res.json({
      success: true,
      pdfs: Array.from(pdfs.values())
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
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Filter documents to find PDF chunks with matching filename
    const initialCount = memoryStore.documents.length;
    
    // Remove PDF chunks from documents
    memoryStore.documents = memoryStore.documents.filter(
      doc => !(doc.metadata.userId === userId && 
              doc.metadata.source === 'pdf' && 
              doc.metadata.filename === filename)
    );
    
    const deletedCount = initialCount - memoryStore.documents.length;
    
    res.json({ 
      success: true,
      deletedChunks: deletedCount
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

module.exports = router; 