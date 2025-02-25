const express = require('express');
const { ZepClient } = require('@getzep/zep-js');
const router = express.Router();

// Initialize Zep client with test credentials
// Note: In a production environment, these values should be in environment variables
// For testing purposes only - replace with your own credentials in production
const ZEP_API_URL = process.env.ZEP_API_URL; // Zep demo API endpoint
const ZEP_API_KEY = process.env.ZEP_API_KEY || ''; // Public test key for demo purposes
const COLLECTION_NAME = 'personal_assistant';

// Log which environment we're using
console.log(`Using Zep API at: ${ZEP_API_URL} ${ZEP_API_KEY ? '(with API key)' : '(without API key)'}`);

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