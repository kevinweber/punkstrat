import { h, useEffect, useRef, useState } from '../libs/preact.js';
import htm from '../libs/htm.js';
import LogoLinkHome from '../components/LogoLinkHome.js';

const html = htm.bind(h);

// API endpoints
const API_BASE_URL = '/api/zep';
const AI_API_URL = '/api/ai';
const MEMORY_ENDPOINT = `${API_BASE_URL}/memory`;
const STATUS_ENDPOINT = `${AI_API_URL}/status`;

// Fixed user ID (in a real app, this would come from authentication)
const USER_ID = 'user1';

// Load PDF.js (we'll add this to the HTML file)
const loadPdfJs = async () => {
  if (window.pdfjsLib) return window.pdfjsLib;

  // We'll check if it exists first
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/pdfjs-dist@3.5.141/build/pdf.min.js';
    script.onload = () => resolve(window.pdfjsLib);
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

export default function PersonalAgent() {
  // State hooks
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState({ isConfigured: false });
  const [uploadedPdfs, setUploadedPdfs] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');

  // Refs
  const messagesEndRef = useRef(null);
  const conversationHistory = useRef([]);
  const fileInputRef = useRef(null);
  const documentContext = useRef([]);

  // Initialize and load data on component mount
  useEffect(() => {
    async function initializeAgent() {
      try {
        // Check AI API status
        await checkAiStatus();
        // Load conversation history
        await loadHistory();
        // Load PDF.js library
        await loadPdfJs();
      } catch (error) {
        console.error('Error initializing:', error);
      }
    }

    initializeAgent();
  }, []);

  // Scroll to bottom of messages when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Check AI API status
  const checkAiStatus = async () => {
    try {
      const response = await fetch(STATUS_ENDPOINT);
      if (response.ok) {
        const data = await response.json();
        setAiStatus(data.status);
      }
    } catch (error) {
      console.error('Error checking AI status:', error);
    }
  };

  // Load conversation history
  const loadHistory = async () => {
    try {
      setMessages([
        { role: 'system', content: 'Welcome to your personal AI assistant powered by Google Gemini. I can help answer questions and have conversations with you.' }
      ]);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  // Handle input change in textarea
  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  // Handle key press in textarea (send on Enter)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle file upload button click
  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  // Process uploaded PDFs on the client side
  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    setIsUploading(true);

    try {
      const pdfjsLib = await loadPdfJs();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type !== 'application/pdf') {
          alert('Only PDF files are supported.');
          continue;
        }

        // Read file as array buffer
        const arrayBuffer = await file.arrayBuffer();

        // Load PDF document
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        // Process each page
        const chunks = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');

          // Split text into chunks
          const chunkSize = 1000;
          for (let j = 0; j < pageText.length; j += chunkSize) {
            const chunk = pageText.slice(j, j + chunkSize);
            if (chunk.trim()) {
              chunks.push(chunk);
            }
          }
        }

        // Store chunks in Zep memory
        for (let j = 0; j < chunks.length; j++) {
          await saveToMemory(chunks[j], 'document', {
            source: 'pdf',
            filename: file.name,
            chunkIndex: j,
            totalChunks: chunks.length
          });
        }

        // Add content to document context
        documentContext.current.push(...chunks);

        // Add to uploaded PDFs list
        setUploadedPdfs(prev => [...prev, {
          name: file.name,
          timestamp: new Date().toISOString(),
          pages: pdf.numPages,
          chunks: chunks.length
        }]);

        // Add a system message to confirm upload
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Uploaded and processed "${file.name}" (${pdf.numPages} pages, ${chunks.length} chunks). You can now ask questions about this document.`
        }]);
      }
    } catch (error) {
      console.error('Error processing PDF:', error);
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error processing PDF: ${error.message}`
      }]);
    } finally {
      setIsUploading(false);
      // Clear file input value to allow uploading the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Save message to memory
  const saveToMemory = async (text, role = 'user', additionalMetadata = {}) => {
    try {
      const response = await fetch(MEMORY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: USER_ID,
          text,
          metadata: {
            role,
            timestamp: new Date().toISOString(),
            ...additionalMetadata
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save to memory');
      }
    } catch (error) {
      console.error('Error saving to memory:', error);
      // Continue even if saving to memory fails
    }
  };

  // Process message using Google AI API
  const processMessage = async (userMessage) => {
    try {
      // Update conversation history for context
      if (conversationHistory.current.length > 10) {
        // Keep only the last 10 messages to avoid context length issues
        conversationHistory.current = conversationHistory.current.slice(-10);
      }

      // Search Zep memory for relevant context
      let relevantContext = [];
      try {
        const searchResponse = await fetch(`${API_BASE_URL}/memory?userId=${USER_ID}&query=${encodeURIComponent(userMessage)}&limit=5`);
        if (searchResponse.ok) {
          const data = await searchResponse.json();
          if (data.results && data.results.length > 0) {
            relevantContext = data.results.map(item => item.content);
          }
        }
      } catch (error) {
        console.warn('Failed to search memory for context:', error);
      }

      const response = await fetch(`${AI_API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          userId: USER_ID,
          context: conversationHistory.current,
          documents: relevantContext,
          modelName: selectedModel
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'AI service error');
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error('Error calling AI service:', error);
      return aiStatus.isConfigured
        ? 'I\'m having trouble connecting to my AI service. Please try again later.'
        : 'AI service is not configured. Please add your GOOGLE_AI_API_KEY to the .env file.';
    }
  };

  // Send a message
  const sendMessage = async () => {
    if (!input.trim()) return;

    // Add user message to state and history
    const userMessage = { role: 'user', content: input };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    conversationHistory.current.push(userMessage);
    setInput('');
    setIsLoading(true);

    try {
      // Save user message to memory
      await saveToMemory(input);

      // Process the message and generate a response
      const responseText = await processMessage(input);

      // Add assistant response to state and history
      const assistantMessage = { role: 'assistant', content: responseText };
      setMessages(prevMessages => [...prevMessages, assistantMessage]);
      conversationHistory.current.push(assistantMessage);

      // Save assistant response to memory
      await saveToMemory(responseText, 'assistant');
    } catch (error) {
      console.error('Error processing message:', error);
      setMessages(prevMessages => [...prevMessages, {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your message.'
      }]);
    }

    setIsLoading(false);
  };

  // Render the component
  return html`
    <div class="personal-agent-container">
      <h1 class="title">Personal AI Agent</h1>
      <p>
        <span class="highlight">
          ${aiStatus.isConfigured
      ? `Powered by ${aiStatus.service}`
      : 'AI API not configured - Add your GOOGLE_AI_API_KEY to .env'}
        </span>
      </p>
      
      <div class="model-selector">
        <label for="model-select">AI Model:</label>
        <select 
          id="model-select" 
          value=${selectedModel} 
          onChange=${e => setSelectedModel(e.target.value)}
        >
          <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
          <option value="gemini-2.0-flash">Gemini 2.0 Flash Light</option>
        </select>
      </div>
      
      <div class="conversation-box">
        ${messages.map(message => html`
          <div class="message ${message.role}">
            <div class="message-content">${message.content}</div>
          </div>
        `)}
        ${isLoading && html`
          <div class="message assistant">
            <div class="message-content loading">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
        `}
        <div ref=${messagesEndRef}></div>
      </div>
      
      <div class="input-box">
        <textarea 
          class="message-input" 
          placeholder="Type your message..."
          value=${input}
          onInput=${handleInputChange}
          onKeyDown=${handleKeyDown}
        ></textarea>
        <button 
          class="send-button" 
          onClick=${sendMessage}
          disabled=${isLoading || !input.trim()}
        >
          Send
        </button>
      </div>
      
      <div class="file-upload-container">
        <input 
          type="file" 
          ref=${fileInputRef} 
          style="display: none" 
          onChange=${handleFileUpload} 
          accept=".pdf" 
          multiple
        />
        <button 
          class="upload-button" 
          onClick=${handleUploadClick}
          disabled=${isUploading}
        >
          ${isUploading ? 'Processing...' : 'Upload PDF'}
        </button>
        ${uploadedPdfs.length > 0 && html`
          <div class="uploaded-pdfs">
            <p>Uploaded PDFs:</p>
            <ul>
              ${uploadedPdfs.map(pdf => html`
                <li>${pdf.name} (${pdf.pages} pages, ${pdf.chunks} chunks)</li>
              `)}
            </ul>
          </div>
        `}
      </div>
      
      <p class="footer-note">
        This AI chat is powered by Google's Gemini models with PDF knowledge base support.
      </p>
      
      <${LogoLinkHome}/>
    </div>
  `;
} 