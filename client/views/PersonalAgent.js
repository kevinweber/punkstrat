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

// Format message with support for Markdown-like syntax and line breaks
const formatMessage = (message) => {
  if (!message) return '';
  
  // Replace line breaks with <br> tags
  let formatted = message.replace(/\n/g, '<br>');
  
  // Bold text
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic text
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Code blocks
  formatted = formatted.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');
  
  // Inline code
  formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
  
  return formatted;
};

// Check if a message contains personal information that should be flagged as important
const isImportant = (message) => {
  const content = message.content.toLowerCase();
  return content.includes('my name is') || 
         content.includes('i am called') || 
         content.includes('i\'m called') ||
         content.includes('call me');
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
  const [dragActive, setDragActive] = useState(false);

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
        // Setup drag-and-drop listeners for file uploads
        setupDragAndDrop();
      } catch (error) {
        console.error('Error initializing:', error);
      }
    }

    initializeAgent();

    // Cleanup function to remove drag-and-drop listeners
    return () => {
      cleanupDragAndDrop();
    };
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
      // Fetch conversation history from Zep memory
      const response = await fetch(`/api/zep/memory?userId=${USER_ID}&source=conversation`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch memory: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.results && data.results.length > 0) {
        // Sort results by timestamp if available
        const sortedResults = [...data.results].sort((a, b) => {
          const timeA = a.metadata?.timestamp || '0';
          const timeB = b.metadata?.timestamp || '0';
          return new Date(timeA) - new Date(timeB);
        });
        
        // Extract messages from results
        const historyMessages = sortedResults.map(item => ({
          role: item.metadata?.role || 'system',
          content: item.content
        }));
        
        // Update conversation history
        conversationHistory.current = historyMessages;
        
        // Set messages state with welcome message and loaded history
        setMessages([
          { 
            role: 'system', 
            content: 'Welcome to your Personal AI Agent! Ask me anything or upload documents for me to analyze.' 
          },
          ...historyMessages
        ]);
      } else {
        // If no history found, just show welcome message
        setMessages([
          { 
            role: 'system', 
            content: 'Welcome to your Personal AI Agent! Ask me anything or upload documents for me to analyze.' 
          }
        ]);
      }
    } catch (error) {
      console.error('Error loading history:', error);
      
      // Show welcome message even if error occurs
      setMessages([
        { 
          role: 'system', 
          content: 'Welcome to your Personal AI Agent! Ask me anything or upload documents for me to analyze.' 
        }
      ]);
    }
  };

  // Load previously uploaded PDFs
  const loadUploadedPdfs = async () => {
    try {
      const response = await fetch(`/api/zep/documents?userId=${USER_ID}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.status}`);
      }
      
      const data = await response.json();
      if (data && data.documents) {
        setUploadedPdfs(data.documents.map(doc => ({
          name: doc.name,
          chunks: doc.chunk_count || 0,
          pages: doc.metadata?.pages || '?'
        })));
        
        // If there are documents, inform the user about them
        if (data.documents.length > 0) {
          const docNames = data.documents.map(doc => doc.name).join(', ');
          setMessages(prev => {
            // Check if we already have this message to avoid duplication
            if (!prev.some(m => m.role === 'system' && m.content.includes('Available PDFs:'))) {
              return [
                ...prev,
                {
                  role: 'system',
                  content: `Available PDFs: ${docNames}. You can ask questions about these documents.`
                }
              ];
            }
            return prev;
          });
        }
      }
    } catch (error) {
      console.error('Error loading uploaded PDFs:', error);
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

  // Process and upload PDF files
  const handlePdfUpload = async (files) => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    setMessages(prev => [
      ...prev,
      {
        role: 'system',
        content: `Processing ${files.length} PDF file(s)...`
      }
    ]);
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });
    formData.append('userId', USER_ID);
    
    try {
      const response = await fetch('/api/zep/upload-pdf', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Update uploaded PDFs list
      loadUploadedPdfs();
      
      // Inform user of successful upload
      setMessages(prev => [
        ...prev,
        {
          role: 'system',
          content: `Successfully processed ${files.length} PDF file(s). You can now ask questions about these documents.`
        }
      ]);
      
      // Add system message about added content
      const fileNames = Array.from(files).map(file => file.name).join(', ');
      
      // Add special message specifically for the AI to know about the PDFs
      conversationHistory.current = [
        ...conversationHistory.current,
        {
          role: 'system',
          content: `The user has uploaded the following PDFs: ${fileNames}. Please refer to these documents by name when discussing their content.`
        }
      ];
    } catch (error) {
      console.error('Error uploading PDF:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'system',
          content: `Error uploading PDF: ${error.message}`
        }
      ]);
    } finally {
      setIsUploading(false);
    }
  };

  // Send message to AI
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage = {
      role: 'user',
      content: input
    };
    
    // Update UI with user message
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    // Update conversation history
    conversationHistory.current = [...conversationHistory.current, userMessage];
    
    try {
      // Get relevant document context for the query
      let documentContext = [];
      try {
        const docResponse = await fetch(`/api/zep/documents/search?userId=${USER_ID}&query=${encodeURIComponent(input)}`);
        if (docResponse.ok) {
          const docData = await docResponse.json();
          if (docData.success && docData.results && docData.results.length > 0) {
            documentContext = docData.results.map(result => {
              const docName = result.document.metadata?.name || 'Unknown document';
              return `[${docName}]: ${result.content}`;
            });
          }
        }
      } catch (docError) {
        console.error('Error retrieving document context:', docError);
        // Continue even if document context retrieval fails
      }
      
      // Find any important personal information in the history
      const personalInfo = conversationHistory.current
        .filter(msg => msg.role === 'user' && isImportant(msg))
        .map(msg => msg.content);
      
      // Prepare history in the format expected by the AI
      const formattedHistory = conversationHistory.current.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));
      
      // Send request to AI
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: input,
          userId: USER_ID,
          model: selectedModel,
          context: formattedHistory,
          documents: documentContext,
          systemPrompt: `You are a helpful and knowledgeable AI assistant. ${personalInfo.length > 0 ? 'Important information about the user: ' + personalInfo.join('. ') : ''}`
        })
      });
      
      if (!response.ok) {
        throw new Error(`AI API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Create assistant message
      const assistantMessage = {
        role: 'assistant',
        content: data.response
      };
      
      // Update UI with assistant message
      setMessages(prev => [...prev, assistantMessage]);
      
      // Update conversation history
      conversationHistory.current = [...conversationHistory.current, assistantMessage];
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Show error message
      setMessages(prev => [
        ...prev,
        {
          role: 'system',
          content: `Error: ${error.message}. Please try again.`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a PDF document
  const handleDeletePdf = async (filename) => {
    if (window.confirm(`Are you sure you want to delete "${filename}"?`)) {
      try {
        const response = await fetch(`/api/zep/pdfs/${encodeURIComponent(filename)}?userId=${USER_ID}`, {
          method: 'DELETE'
        });
        
        if (!response.ok) {
          throw new Error(`Failed to delete document: ${response.status}`);
        }
        
        // Update the UI to reflect the deletion
        setUploadedPdfs(prev => prev.filter(pdf => (pdf.name || pdf.filename) !== filename));
        
        // Add a system message about the deletion
        setMessages(prev => [
          ...prev,
          {
            role: 'system',
            content: `Document "${filename}" has been deleted. It is no longer available for reference.`
          }
        ]);
        
        // Update conversation history about the deletion
        conversationHistory.current = [
          ...conversationHistory.current,
          {
            role: 'system',
            content: `The user has deleted the PDF document: ${filename}. This document is no longer available for reference.`
          }
        ];
      } catch (error) {
        console.error('Error deleting PDF:', error);
        setMessages(prev => [
          ...prev,
          {
            role: 'system',
            content: `Error deleting PDF: ${error.message}`
          }
        ]);
      }
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

  // Setup drag-and-drop event listeners
  const setupDragAndDrop = () => {
    const container = document.querySelector('.personal-agent-container');
    if (!container) return;

    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.classList.add('drag-active');
      setDragActive(true);
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Only remove the class if we're leaving the container (not entering a child)
      if (!e.currentTarget.contains(e.relatedTarget)) {
        container.classList.remove('drag-active');
        setDragActive(false);
      }
    };

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.classList.remove('drag-active');
      setDragActive(false);

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        // Process the dropped files
        handleFiles(e.dataTransfer.files);
      }
    };

    // Add dragenter event to show the indicator right away
    const handleDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.classList.add('drag-active');
      setDragActive(true);
    };

    container.addEventListener('dragenter', handleDragEnter);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('dragleave', handleDragLeave);
    container.addEventListener('drop', handleDrop);

    // Store event listeners in window for cleanup
    window._dragDropListeners = {
      container,
      handleDragEnter,
      handleDragOver,
      handleDragLeave,
      handleDrop
    };
  };

  // Cleanup drag-and-drop event listeners
  const cleanupDragAndDrop = () => {
    if (window._dragDropListeners) {
      const { container, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } = window._dragDropListeners;
      container.removeEventListener('dragenter', handleDragEnter);
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('dragleave', handleDragLeave);
      container.removeEventListener('drop', handleDrop);
      delete window._dragDropListeners;
    }
  };

  // Process uploaded files
  const handleFiles = (files) => {
    const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      setMessages(prev => [
        ...prev, 
        { 
          role: 'system', 
          content: 'Only PDF files are supported. Please upload PDF files only.' 
        }
      ]);
      return;
    }
    
    if (pdfFiles.length > 0) {
      handlePdfUpload(pdfFiles);
    }
  };

  // Handle file selection from input
  const handleFileUpload = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
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
            isImportant: isImportant(text) || text.toLowerCase().includes('my name is') || text.toLowerCase().includes('i am called'), // Mark introduction and important messages as important
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

  // Render the component
  return html`
    <div class="personal-agent-container ${dragActive ? 'drag-active' : ''}">
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
                  ${pdf.name || pdf.filename} (${pdf.chunks} chunks, ${pdf.pages || '?'} pages)
                  <button 
                    class="delete-pdf-button" 
                    onClick=${() => handleDeletePdf(pdf.name || pdf.filename)}
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