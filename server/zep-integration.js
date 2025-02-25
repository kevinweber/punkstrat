const express = require('express');
const { ZepClient } = require('@getzep/zep-js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const router = express.Router();

// Configure file upload with multer
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, '..', 'uploads');
      
      // Create uploads directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Create unique filename with timestamp
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  fileFilter: (req, file, cb) => {
    // Accept only PDF files
    if (path.extname(file.originalname).toLowerCase() === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  }
});

// Use environment variables for Zep configuration
// If not set, fall back to demo values for testing
const ZEP_API_URL = process.env.ZEP_API_URL || 'https://api.demo.getzep.com';
const ZEP_API_KEY = process.env.ZEP_API_KEY || '';
const COLLECTION_NAME = process.env.ZEP_COLLECTION_NAME || 'personal_assistant';

// Log which environment we're using (without exposing the actual key)
console.log(`Using Zep API at: ${ZEP_API_URL} ${ZEP_API_KEY ? '(with API key)' : '(without API key)'}`);
console.log(`Using collection: ${COLLECTION_NAME}`);

let zepClient;
try {
  zepClient = new ZepClient(ZEP_API_URL, ZEP_API_KEY);
} catch (error) {
  console.error('Error initializing Zep client:', error);
}

// Create a collection if it doesn't exist
async function ensureCollection() {
  if (!zepClient) return null;
  
  try {
    let collection;
    try {
      collection = await zepClient.document.getCollection(COLLECTION_NAME);
      console.log(`Collection ${COLLECTION_NAME} already exists`);
    } catch (error) {
      if (error.message.includes('not found')) {
        collection = await zepClient.document.addCollection({
          name: COLLECTION_NAME,
          description: 'Personal Assistant Knowledge Collection',
          metadata: {
            source: 'personal-agent-app'
          }
        });
        console.log(`Collection ${COLLECTION_NAME} created`);
      } else {
        throw error;
      }
    }
    return collection;
  } catch (error) {
    console.error('Error ensuring collection exists:', error);
    return null;
  }
}

// Initialize the collection when the server starts
ensureCollection().catch(error => {
  console.error('Failed to initialize Zep collection:', error);
});

// Middleware to handle Zep client availability
router.use((req, res, next) => {
  if (!zepClient) {
    return res.status(503).json({ 
      error: 'Zep service unavailable',
      details: 'The Zep client is not properly initialized. Please check your configuration.'
    });
  }
  next();
});

// Add a message to the knowledge graph
router.post('/memory', async (req, res) => {
  try {
    const { userId, text, metadata = {} } = req.body;
    
    if (!userId || !text) {
      return res.status(400).json({ error: 'userId and text are required' });
    }
    
    const docUUID = await zepClient.document.addDocument({
      collection_name: COLLECTION_NAME,
      document: {
        content: text,
        metadata: {
          ...metadata,
          userId,
          timestamp: new Date().toISOString()
        }
      }
    });
    
    res.json({ success: true, documentId: docUUID });
  } catch (error) {
    console.error('Error adding document to Zep:', error);
    res.status(500).json({ error: 'Failed to store memory', details: error.message });
  }
});

// Search the knowledge graph
router.get('/memory', async (req, res) => {
  try {
    const { userId, query, limit = 5 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const searchParams = {
      collection_name: COLLECTION_NAME,
      limit: parseInt(limit, 10),
      filter: {
        metadata: { userId }
      }
    };
    
    // If a query is provided, do a semantic search
    if (query) {
      searchParams.text = query;
    }
    
    const searchResults = await zepClient.document.search(searchParams);
    
    res.json({ 
      success: true, 
      results: searchResults.map(result => ({
        content: result.content,
        metadata: result.metadata,
        score: result.score
      }))
    });
  } catch (error) {
    console.error('Error searching Zep documents:', error);
    res.status(500).json({ error: 'Failed to search memory', details: error.message });
  }
});

// Upload and process PDF
router.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }
    
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Extract text from PDF
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(dataBuffer);
    
    // Get PDF text content
    const pdfText = pdfData.text;
    
    // Get PDF metadata
    const metadata = {
      userId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      pageCount: pdfData.numpages,
      documentType: 'pdf',
      uploadedAt: new Date().toISOString()
    };
    
    // Split PDF content into chunks (max 8000 chars each to stay under token limits)
    const MAX_CHUNK_SIZE = 8000;
    const chunks = [];
    
    for (let i = 0; i < pdfText.length; i += MAX_CHUNK_SIZE) {
      chunks.push(pdfText.substring(i, i + MAX_CHUNK_SIZE));
    }
    
    // Store each chunk in Zep with sequential numbering
    const documentIds = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const docUUID = await zepClient.document.addDocument({
        collection_name: COLLECTION_NAME,
        document: {
          content: chunks[i],
          metadata: {
            ...metadata,
            chunkIndex: i,
            chunkCount: chunks.length,
            chunkId: `${req.file.originalname}-chunk-${i + 1}-of-${chunks.length}`
          }
        }
      });
      
      documentIds.push(docUUID);
    }
    
    // Clean up the temporary file
    fs.unlinkSync(req.file.path);
    
    // Return success response with IDs of all chunks
    res.json({
      success: true,
      fileName: req.file.originalname,
      documentIds: documentIds,
      chunks: chunks.length,
      metadata
    });
    
  } catch (error) {
    console.error('Error processing PDF:', error);
    
    // Clean up the temporary file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to process PDF', details: error.message });
  }
});

// Delete a document from the knowledge graph
router.delete('/memory/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    await zepClient.document.deleteDocument(COLLECTION_NAME, documentId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document from Zep:', error);
    res.status(500).json({ error: 'Failed to delete memory', details: error.message });
  }
});

// Check Zep service status
router.get('/status', async (req, res) => {
  try {
    const status = await zepClient.status();
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error checking Zep status:', error);
    res.status(500).json({ error: 'Failed to get Zep status', details: error.message });
  }
});

module.exports = router; 