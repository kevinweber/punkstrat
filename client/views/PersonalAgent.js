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

// Simple markdown-like formatting helper
const formatMessage = (text) => {
  if (!text) return '';
  
  // Replace line breaks with <br> tags
  let formatted = text.replace(/\n/g, '<br>');
  
  // Bold text (** or __)
  formatted = formatted.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');
  
  // Italic text (* or _)
  formatted = formatted.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');
  
  // Code blocks
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  return formatted;
};

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
        // Load list of previously uploaded PDFs
        await loadUploadedPdfs();
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

  // Load conversation history from Zep memory
  const loadHistory = async () => {
    try {
      // Welcome message
      const welcomeMessage = { 
        role: 'system', 
        content: 'Welcome to your personal AI assistant powered by Google Gemini. I can help answer questions and have conversations with you.' 
      };
      
      // Try to fetch recent conversation history
      try {
        const response = await fetch(`${API_BASE_URL}/memory?userId=${USER_ID}&limit=10&source=conversation`);
        if (response.ok) {
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            // Sort by timestamp (oldest first)
            const sortedResults = data.results
              .filter(item => item.metadata && item.metadata.timestamp)
              .sort((a, b) => new Date(a.metadata.timestamp) - new Date(b.metadata.timestamp));
            
            // Recreate conversation from memory
            const historyMessages = sortedResults.map(item => ({
              role: item.metadata.role || 'user',
              content: item.content
            }));
            
            // Add welcome message at the beginning if not empty
            setMessages([welcomeMessage, ...historyMessages]);
            
            // Also update the conversation history ref
            conversationHistory.current = historyMessages;
            
            console.log(`Loaded ${historyMessages.length} messages from memory`);
            return;
          }
        }
      } catch (error) {
        console.warn('Error loading history from memory:', error);
      }
      
      // Fallback to just welcome message if no history or error
      setMessages([welcomeMessage]);
    } catch (error) {
      console.error('Error loading history:', error);
      setMessages([{ 
        role: 'system', 
        content: 'Welcome to your personal AI assistant. I can help answer questions and have conversations with you.' 
      }]);
    }
  };

  // Load previously uploaded PDFs
  const loadUploadedPdfs = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/pdfs?userId=${USER_ID}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.pdfs && data.pdfs.length > 0) {
          setUploadedPdfs(data.pdfs);
          
          // Add a system message about available PDFs if any exist
          if (data.pdfs.length > 0) {
            setMessages(prev => [
              ...prev, 
              { 
                role: 'system', 
                content: `You have ${data.pdfs.length} previously uploaded PDF document${data.pdfs.length > 1 ? 's' : ''} available. You can ask questions about the content.` 
              }
            ]);
          }
        }
      }
    } catch (error) {
      console.error('Error loading PDF list:', error);
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
            isImportant: text.toLowerCase().includes('my name is') || text.toLowerCase().includes('i am called'), // Mark introduction as important
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
      // We no longer limit the conversation history to 10 messages
      // This ensures the AI has access to the full conversation context
      
      // First, search specifically for important personal information
      let personalInfo = [];
      try {
        // Look for any messages where the user introduced themselves
        const personalInfoResponse = await fetch(`${API_BASE_URL}/memory?userId=${USER_ID}&source=conversation`);
        if (personalInfoResponse.ok) {
          const data = await personalInfoResponse.json();
          if (data.results && data.results.length > 0) {
            // Filter for messages containing personal information
            personalInfo = data.results
              .filter(item => 
                item.metadata?.isImportant === true || 
                item.content.toLowerCase().includes('my name is') ||
                item.content.toLowerCase().includes('i am called')
              )
              .map(item => {
                const role = item.metadata?.role === 'user' ? 'User' : 'Assistant';
                return `${role}: ${item.content}`;
              });
          }
        }
      } catch (error) {
        console.warn('Failed to retrieve personal information:', error);
      }
      
      // Search Zep memory for relevant context - increase retrieval limit for better recall
      let relevantContext = [];
      try {
        // First get document context (PDF knowledge)
        const docSearchResponse = await fetch(`${API_BASE_URL}/memory?userId=${USER_ID}&query=${encodeURIComponent(userMessage)}&limit=15&source=pdf`);
        if (docSearchResponse.ok) {
          const data = await docSearchResponse.json();
          if (data.results && data.results.length > 0) {
            // Add document source metadata to each item
            relevantContext = data.results.map(item => {
              const source = item.metadata?.filename ? `[Source: ${item.metadata.filename}]` : '';
              return `${source} ${item.content}`;
            });
          }
        }
        
        // Then get conversation memory context - increase limit for better recall
        const convSearchResponse = await fetch(`${API_BASE_URL}/memory?userId=${USER_ID}&query=${encodeURIComponent(userMessage)}&limit=15&source=conversation`);
        if (convSearchResponse.ok) {
          const data = await convSearchResponse.json();
          if (data.results && data.results.length > 0) {
            // Add conversation context but prevent duplicates with current history
            const existingContent = new Set(conversationHistory.current.map(msg => msg.content));
            const uniqueConvContext = data.results
              .filter(item => !existingContent.has(item.content))
              .map(item => {
                // Add role information if available
                const role = item.metadata?.role ? `[${item.metadata.role}] ` : '';
                return `${role}${item.content}`;
              });
            
            // Add to relevant context if unique
            if (uniqueConvContext.length > 0) {
              relevantContext = [...relevantContext, ...uniqueConvContext];
            }
          }
        }
      } catch (error) {
        console.warn('Failed to search memory for context:', error);
      }
      
      // Prepare history in the format expected by the AI - include all history
      const formattedHistory = conversationHistory.current.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        parts: [{ text: msg.content }]
      }));
      
      // Enhance context management with metadata
      const contextInfo = relevantContext.length > 0 
        ? `\n\nKnowledge context: ${relevantContext.length} relevant items found` 
        : '';
      
      // Create a more informative system message about available context
      const enhancedSystemPrompt = `You are a helpful assistant for the PunkStrat website. 
You have access to user conversation history and any uploaded document context.
Always remember user details like their name, preferences, and other personal information they share.
${personalInfo.length > 0 ? 'IMPORTANT USER INFORMATION:\n' + personalInfo.join('\n') + '\n\n' : ''}
Please use the provided PDF document context when answering questions about uploaded documents.${contextInfo}`;
      
      const response = await fetch(`${AI_API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          userId: USER_ID,
          context: formattedHistory,
          documents: relevantContext,
          modelName: selectedModel,
          systemPrompt: enhancedSystemPrompt
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

  // Delete a PDF and its chunks from memory
  const handleDeletePdf = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}"? This cannot be undone.`)) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/pdfs/${encodeURIComponent(filename)}?userId=${USER_ID}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Remove from the list of uploaded PDFs
        setUploadedPdfs(prev => prev.filter(pdf => pdf.name !== filename));
        
        // Notify the user
        setMessages(prev => [...prev, {
          role: 'system',
          content: `Deleted "${filename}" from memory.`
        }]);
      } else {
        throw new Error('Failed to delete PDF');
      }
    } catch (error) {
      console.error('Error deleting PDF:', error);
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Error deleting PDF: ${error.message}`
      }]);
    }
  };

  // Clear all conversation history
  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear your conversation history? This cannot be undone.')) {
      return;
    }
    
    try {
      // We don't have a bulk delete endpoint, so we'll just reset the UI state
      // In a real app, you would delete all conversation items from memory
      
      // Keep only the welcome message
      const welcomeMessage = { 
        role: 'system', 
        content: 'Conversation history cleared. How can I help you today?' 
      };
      
      setMessages([welcomeMessage]);
      conversationHistory.current = [];
      
      // Notify that we're having a fresh start
      console.log('Conversation history cleared');
    } catch (error) {
      console.error('Error clearing history:', error);
    }
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
      
      <div class="control-panel">
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
        
        <button 
          class="clear-history-button" 
          onClick=${handleClearHistory}
        >
          Clear History
        </button>
      </div>
      
      <div class="conversation-box">
        ${messages.map(message => html`
          <div class="message ${message.role}">
            <div class="message-content" dangerouslySetInnerHTML=${{ __html: formatMessage(message.content) }}></div>
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
                <li>
                  ${pdf.name} (${pdf.chunks} chunks)
                  <button 
                    class="delete-pdf-button" 
                    onClick=${() => handleDeletePdf(pdf.name)}
                    title="Delete this PDF"
                  >
                    ×
                  </button>
                </li>
              `)}
            </ul>
          </div>
        `}
      </div>
      
      <p class="footer-note">
        This AI chat is powered by Google's Gemini models with PDF knowledge base support.
        Your conversation history and document knowledge are stored using Zep memory.
      </p>
      
      <${LogoLinkHome}/>
    </div>
  `;
} 