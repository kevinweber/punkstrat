import { h, useEffect, useRef, useState } from '../libs/preact.js';
import htm from '../libs/htm.js';
import LogoLinkHome from '../components/LogoLinkHome.js';

const html = htm.bind(h);

// API endpoints
const API_BASE_URL = '/api/zep';
const MEMORY_ENDPOINT = `${API_BASE_URL}/memory`;
const STATUS_ENDPOINT = `${API_BASE_URL}/status`;

// Fixed user ID (in a real app, this would come from authentication)
const USER_ID = 'user1';

export default function PersonalAgent() {
  // State hooks
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Refs
  const messagesEndRef = useRef(null);

  // Initialize and load data on component mount
  useEffect(() => {
    async function initializeAgent() {
      try {
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
  
  // Load conversation history
  const loadHistory = async () => {
    try {
      setMessages([
        { role: 'system', content: 'Welcome to your personal AI assistant. I can help answer questions and have conversations with you.' }
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
  
  // Process message and generate response
  const processMessage = async (userMessage) => {
    // This is a simple mock response generator
    // In a real application, you would call an LLM API here
    
    const responses = [
      'I\'m your personal assistant. How can I help you today?',
      'That\'s an interesting point. Tell me more about it.',
      'I understand. Is there anything specific you\'d like to know?',
      'I\'m here to assist you with any questions you might have.',
      'That\'s a great question. Let me think about that.'
    ];
    
    // Get a random response
    const randomIndex = Math.floor(Math.random() * responses.length);
    
    // Simulate a delay to make it feel more natural
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return responses[randomIndex];
  };
  
  // Send a message
  const sendMessage = async () => {
    if (!input.trim()) return;
    
    // Add user message to state
    const userMessage = { role: 'user', content: input };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      // Save user message to memory
      await saveToMemory(input);
      
      // Process the message and generate a response
      const response = await processMessage(input);
      
      // Add assistant response to state
      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: response }]);
      
      // Save assistant response to memory
      await saveToMemory(response, 'assistant');
    } catch (error) {
      console.error('Error processing message:', error);
      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: 'Sorry, I encountered an error processing your message.' }]);
    }
    
    setIsLoading(false);
  };
  
  // Render the component
  return html`
    <div class="personal-agent-container">
      <h1 class="title">Personal AI Agent</h1>
      <p><span class="highlight">Your intelligent assistant</span></p>
      
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
        This is a simple AI chat demo. For a more powerful experience, integrate with a language model API.
      </p>
      
      <${LogoLinkHome}/>
    </div>
  `;
} 