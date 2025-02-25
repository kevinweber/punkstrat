// Load environment variables from .env file - must be at the very top
require('dotenv').config();

// Verify API key is loaded
console.log('API Key loaded:', process.env.GOOGLE_AI_API_KEY ? 'YES (length: ' + process.env.GOOGLE_AI_API_KEY.length + ')' : 'NO');

const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const aiIntegration = require('./ai-integration');

// Constants
const PORT = process.env.PORT || 8000;
const IS_DEV = process.env.NODE_ENV === 'development';
const clientPath = path.join(__dirname, '..', 'client');

// Initialize Express app
const app = express();

// Apply middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(clientPath));

// API routes
app.use(aiIntegration.router);

// Simple status endpoint for client initialization
app.get('/api/status', (req, res) => {
  // Get AI status from the AI integration module
  const aiStatus = aiIntegration.getStatus();
    
  return res.json({
    success: true,
    status: {
      isConfigured: aiStatus.isConfigured,
      supportedModels: aiStatus.supportedModels,
      defaultModel: aiStatus.defaultModel
    }
  });
});

// Set up static routes for SPA
app.get('/', (req, res) => res.sendFile(path.join(clientPath, 'index.html')));
app.get('/personal-agent', (req, res) => res.sendFile(path.join(clientPath, 'personal-agent.html')));

// Gracefully handle 404s
app.use((req, res) => {
  res.status(404).sendFile(path.join(clientPath, '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Server error', 
    message: IS_DEV ? err.message : 'Internal server error'
  });
});

// Start the server with port checking
const startServer = () => {
  // Check if port is in use and handle gracefully
  const server = app.listen(PORT, () => {
    console.log(`⚡️[server]: Server running at port ${PORT} in mode: ${process.env.NODE_ENV || 'production'}`);
    console.log('⚡️[server]: Simple chat application with Google AI models');
    if (IS_DEV) {
      console.log(`⚡️[server]: Visit http://localhost:${PORT}`);
    }
  });
  
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Please use a different port or close the application using this port.`);
      process.exit(1);
    } else {
      console.error('Server failed to start:', e);
      process.exit(1);
    }
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down server');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down server');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
};

startServer();