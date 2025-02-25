import { h, useEffect, useRef, useState } from '../libs/preact.js';
import htm from '../libs/htm.js';
import LogoLinkHome from '../components/LogoLinkHome.js';

const html = htm.bind(h);

/**
 * Format message content with markdown-like syntax for display
 * @param {string} message - The message text to format
 * @returns {string} HTML formatted message
 */
const formatMessage = (message) => {
  if (!message) return '';
  
  // Apply formatting rules
  let formatted = message
    // Bold text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic text
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Line breaks
    .replace(/\n/g, '<br>');
    
  return formatted;
};

/**
 * Check if a message is important based on keywords
 * @param {Object} message - Message object with role and content
 * @returns {boolean} Whether the message is important
 */
const isImportant = (message) => {
  if (message.role !== 'system') return false;
  
  const importantKeywords = ['error', 'warning', 'failed', 'issue', 'success', 'completed'];
  return importantKeywords.some(keyword => 
    message.content.toLowerCase().includes(keyword)
  );
};

/**
 * PersonalAgent component - Provides an AI chat interface
 */
export default function PersonalAgent() {
  // State hooks
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [aiConfigured, setAiConfigured] = useState(true);

  // Refs
  const conversationRef = useRef(null);
  const conversationHistory = useRef([]);
  const timeoutRef = useRef(null);

  // Initialize the agent when the component mounts
  useEffect(() => {
    initializeAgent();
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll to the newest messages
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages]);

  /**
   * Initialize the agent - check AI status and set up conversation
   */
  async function initializeAgent() {
    setIsInitializing(true);
    
    try {
      // Check AI status and get available models
      const status = await checkAiStatus();
      
      // Initial welcome message
      setMessages([
        {
          role: 'system',
          content: status.isConfigured 
            ? 'Welcome to Personal Agent! How can I help you today?' 
            : '⚠️ AI API not configured. Please add your GOOGLE_AI_API_KEY to .env'
        }
      ]);
      
      // Initial system instruction
      conversationHistory.current = [
        {
          role: 'system',
          content: 'You are a helpful AI assistant for the PunkStrat website.'
        }
      ];
      
    } catch (error) {
      console.error('Initialization error:', error);
      setMessages([
        {
          role: 'system',
          content: `⚠️ Initialization error: ${error.message}. Please refresh the page or try again later.`
        }
      ]);
      setAiConfigured(false);
    } finally {
      setIsInitializing(false);
    }
  }

  /**
   * Check AI API status and get available models
   */
  const checkAiStatus = async () => {
    try {
      const response = await fetch('/api/status');
      
      if (!response.ok) {
        throw new Error(`AI status check failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Unknown error checking AI status');
      }
      
      const status = data.status || {};
      const isConfigured = !!status.isConfigured;
      const models = status.supportedModels || [];
      const defaultModel = status.defaultModel || 'gemini-2.0-flash';
      
      console.log('AI Status:', status);
      setAiConfigured(isConfigured);
      
      if (!isConfigured) {
        console.warn('⚠️ AI API not configured properly');
      }
      
      // Set available models and default selection
      if (models && models.length > 0) {
        setAvailableModels(models);
        setSelectedModel(defaultModel || models[0]);
      } else {
        // If no models returned, set defaults
        setAvailableModels(['gemini-2.0-flash', 'gemini-1.5-pro']);
        setSelectedModel('gemini-2.0-flash');
      }
      
      return status;
    } catch (error) {
      console.error('Error checking AI status:', error);
      
      // Set default model if there's an error
      setAvailableModels(['gemini-2.0-flash', 'gemini-1.5-pro']);
      setSelectedModel('gemini-2.0-flash');
      setAiConfigured(false);
      
      throw error;
    }
  };

  // Input handlers
  const handleInputChange = (e) => setInputValue(e.target.value);
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Send message to the AI and process response
   */
  const sendMessage = async () => {
    // Validation
    if (!inputValue.trim() || isLoading || !aiConfigured) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    // Add user message to the UI
    setMessages(prevMessages => [
      ...prevMessages,
      { role: 'user', content: userMessage }
    ]);

    // Add user message to conversation history
    conversationHistory.current.push({
      role: 'user',
      content: userMessage
    });

    // Set loading state
    setIsLoading(true);
    
    // Set a timeout for slow responses
    timeoutRef.current = setTimeout(() => {
      setLoadingTimeout(true);
    }, 10000); // 10 seconds timeout

    try {
      // Call the AI service
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          context: conversationHistory.current,
          model: selectedModel
        })
      });

      if (!response.ok) {
        throw new Error(`AI service error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Unknown error processing your message');
      }

      // Clear loading timeout
      clearTimeout(timeoutRef.current);
      setLoadingTimeout(false);
      
      // Add AI response to the UI
      setMessages(prevMessages => [
        ...prevMessages.filter(m => m.role !== 'assistant' || !m.isLoading),
        { role: 'assistant', content: data.response }
      ]);

      // Add AI response to conversation history
      conversationHistory.current.push({
        role: 'assistant',
        content: data.response
      });
      
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Clear loading timeout
      clearTimeout(timeoutRef.current);
      setLoadingTimeout(false);
      
      // Show error message
      setMessages(prevMessages => [
        ...prevMessages.filter(m => m.role !== 'assistant' || !m.isLoading),
        { 
          role: 'system', 
          content: `⚠️ Error: ${error.message}. Please try again.` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Clear conversation history
   */
  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear the conversation history?')) {
      // Clear the UI
      setMessages([
        {
          role: 'system',
          content: 'Conversation history cleared. How can I help you today?'
        }
      ]);
      
      // Reset conversation history
      conversationHistory.current = [
        {
          role: 'system',
          content: 'You are a helpful AI assistant for the PunkStrat website.'
        }
      ];
    }
  };

  return html`
    <div class="personal-agent-container">
      <h1 class="title">Personal AI Agent</h1>
      
      <div class="control-panel">
        <div class="model-selector">
          <label for="model-select">AI Model:</label>
          <select 
            id="model-select" 
            value=${selectedModel} 
            onChange=${e => setSelectedModel(e.target.value)}
            disabled=${isLoading || isInitializing || !aiConfigured}
          >
            ${availableModels.map(model => html`
              <option value=${model}>${model}</option>
            `)}
          </select>
        </div>
        
        <button 
          class="clear-history-button" 
          onClick=${handleClearHistory}
          disabled=${isLoading || messages.length <= 1 || !aiConfigured}
        >
          Clear Chat
        </button>
      </div>
      
      ${!aiConfigured && html`
        <div class="api-warning">
          ⚠️ AI API not configured. Add your GOOGLE_AI_API_KEY to .env file and restart the server.
        </div>
      `}
      
      <div class="conversation-box" ref=${conversationRef}>
        ${messages.map((message, index) => html`
          <div class="message ${message.role} ${isImportant(message) ? 'important' : ''}">
            <div 
              class="message-content ${message.isLoading ? 'loading' : ''}"
              dangerouslySetInnerHTML=${{ __html: message.isLoading 
                ? '<div class="loading-indicator"><div><span class="dot"></span><span class="dot"></span><span class="dot"></span></div><div class="loading-text">Thinking...</div></div>'
                : formatMessage(message.content)
              }}
            >
            </div>
            ${message.isLoading && loadingTimeout && html`
              <div class="timeout-alert">This is taking longer than usual...</div>
            `}
          </div>
        `)}
        
        ${isLoading && html`
          <div class="message assistant">
            <div class="message-content loading">
              <div class="loading-indicator">
                <div>
                  <span class="dot"></span>
                  <span class="dot"></span>
                  <span class="dot"></span>
                </div>
                <div class="loading-text">Thinking...</div>
              </div>
              ${loadingTimeout && html`
                <div class="timeout-alert">This is taking longer than usual...</div>
              `}
            </div>
          </div>
        `}
      </div>
      
      <div class="input-box">
        <textarea 
          class="message-input" 
          value=${inputValue}
          onInput=${handleInputChange}
          onKeyDown=${handleKeyDown}
          placeholder=${aiConfigured 
            ? 'Type your message here...' 
            : 'AI API not configured. Please add your API key.'}
          disabled=${isLoading || isInitializing || !aiConfigured}
        ></textarea>
        <button 
          class="send-button" 
          onClick=${sendMessage}
          disabled=${!inputValue.trim() || isLoading || isInitializing || !aiConfigured}
        >
          Send
        </button>
      </div>
      
      <div class="footer-note">
        Using ${selectedModel || 'default'} model | Conversation stored locally in your browser
      </div>
      
      <${LogoLinkHome}/>
    </div>
  `;
}