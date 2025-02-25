// Load environment variables from .env file - must be at the very top
require('dotenv').config();

// Verify API key is loaded
console.log('API Key loaded:', process.env.GOOGLE_AI_API_KEY ? 'YES (length: ' + process.env.GOOGLE_AI_API_KEY.length + ')' : 'NO');

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const aiIntegration = require('./ai-integration');
const googleContextCache = require('./google-context-cache');

// FYI: `npx kill-port 8000`
const PORT = process.env.PORT || 8000;
const IS_DEV = process.env.NODE_ENV === 'development';
const clientPath = path.join(__dirname, '..', 'client');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(clientPath));

// API routes - using aiIntegration for the AI endpoints
app.use(aiIntegration.router);

// Use Google Context Cache for memory and document handling
// Keeping the '/api/zep' endpoint for compatibility
app.use('/api/zep', googleContextCache);

// CORS headers for development
if (IS_DEV) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
  });
}

// Emulate GitHub Pages behavior:
// Any URL that points to a non-existing HTML file gets redirected to 404.html
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../client/index.html')));
app.get('/:page/:subpage?', (req, res) => {
  function getPath(runFunction) {
    const isSubPage = !!req.params.subpage;
    return isSubPage ? runFunction(clientPath, req.params.page, `${req.params.subpage}.html`) : runFunction(clientPath, `${req.params.page}.html`);
  }

  const absolutePath = getPath(path.join);

  if (fs.existsSync(absolutePath)) {
    return res.sendFile(getPath(path.resolve));
  }

  return res.status(404).sendFile(path.resolve(clientPath, '404.html'));
});

app.listen(PORT, () => {
  console.log(`⚡️[server]: Server is running at port ${PORT} in NODE_ENV: ${process.env.NODE_ENV}`);
  console.log('⚡️[server]: Using Google AI for document processing and conversation memory');
  if (IS_DEV) {
    console.log(`⚡️[server]: Visit http://localhost:${PORT}`);
  }
});