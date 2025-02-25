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

export default function PersonalAgent() {
  // State hooks
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState({ isConfigured: false });
  
  // Refs
  const messagesEndRef = useRef(null);
  const conversationHistory = useRef([]);

  // Initialize and load data on component mount
  useEffect(() => {
    async function initializeAgent() {
      try {
        // Check AI API status
        await checkAiStatus();
        // Load conversation history
        await loadHistory();
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
  
  // Save message to memory
  const saveToMemory = async (text, role = 'user') => {
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
            timestamp: new Date().toISOString()
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
      
      const response = await fetch(`${AI_API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          userId: USER_ID,
          context: conversationHistory.current
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
      
      <p class="footer-note">
        This AI chat is powered by Google's Gemini 1.5 Pro model.
      </p>
      
      <${LogoLinkHome}/>
    </div>
  `;
} 