// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const https = require('https');
const path = require('path');
const fs = require('fs');
const app = express();
const googleContextCache = require('./google-context-cache');
const aiIntegration = require('./ai-integration');

// FYI: `npx kill-port 8000`
const PORT = process.env.PORT || 8000;
const IS_DEV = process.env.NODE_ENV === 'development';
const clientPath = path.join(__dirname, '..', 'client');

// Middleware
app.use(express.static(clientPath));
app.use(express.json()); // For parsing application/json

// API routes
app.use('/api/zep', googleContextCache); // Using same endpoint for compatibility
app.use('/api/ai', aiIntegration.router);

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
app.get('/', (req, res) => res.sendFile(path.resolve(clientPath, 'index.html')));
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

https.createServer({}, app);