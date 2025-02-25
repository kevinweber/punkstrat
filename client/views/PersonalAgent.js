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
  const [zepStatus, setZepStatus] = useState('Connecting...');
  const [kitchenItems, setKitchenItems] = useState([]);
  
  // Refs
  const messagesEndRef = useRef(null);

  // Initialize and load data on component mount
  useEffect(() => {
    async function initializeAgent() {
      try {
        // Check Zep service status
        const response = await fetch(STATUS_ENDPOINT);
        if (response.ok) {
          setZepStatus('Connected');
        } else {
          const errorData = await response.json();
          throw new Error(errorData.details || 'Failed to connect to Zep service');
        }
        
        // Load conversation history
        await loadHistory();
        
        // Load kitchen items from memory
        await loadKitchenItems();
      } catch (error) {
        console.error('Error initializing:', error);
        setZepStatus(`Error: ${error.message}`);
        setMessages([
          { role: 'system', content: 'Welcome to your personal AI assistant. I can help keep track of information for you!' },
          { role: 'assistant', content: 'I\'m having trouble connecting to my memory service, but I\'ll do my best to help you.' }
        ]);
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
        { role: 'system', content: 'Welcome to your personal AI assistant. I can help keep track of information for you!' }
      ]);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };
  
  // Load kitchen items from memory
  const loadKitchenItems = async () => {
    try {
      const response = await fetch(`${MEMORY_ENDPOINT}?userId=${USER_ID}&query=kitchen items`);
      if (!response.ok) throw new Error('Failed to fetch kitchen items');
      
      const data = await response.json();
      
      // Parse kitchen items from memory results
      // In a real implementation, you'd have more sophisticated parsing
      const kitchenItemsSet = new Set();
      
      data.results.forEach(result => {
        const content = result.content.toLowerCase();
        
        // Extract items being added
        if (content.includes('have') || content.includes('add')) {
          const itemText = extractItemsText(content);
          if (itemText) {
            const items = parseItems(itemText);
            items.forEach(item => kitchenItemsSet.add(item));
          }
        }
        
        // Extract items being removed
        if (content.includes('remove') || content.includes('used') || content.includes('out of')) {
          const itemText = extractRemovalItemsText(content);
          if (itemText) {
            const items = parseItems(itemText);
            items.forEach(item => kitchenItemsSet.delete(item));
          }
        }
      });
      
      setKitchenItems(Array.from(kitchenItemsSet));
    } catch (error) {
      console.error('Error loading kitchen items:', error);
      // Fallback to example items for demonstration
      setKitchenItems(['eggs', 'milk', 'flour', 'sugar', 'coffee']);
    }
  };
  
  // Extract items being added to kitchen
  const extractItemsText = (content) => {
    const itemMatch = content.match(/i have|i've added|add|added|bought|purchased|got|have/i);
    if (itemMatch) {
      return content.substring(content.indexOf(itemMatch[0]) + itemMatch[0].length).trim();
    }
    return null;
  };
  
  // Extract items being removed from kitchen
  const extractRemovalItemsText = (content) => {
    const itemMatch = content.match(/i'm out of|i used|used|remove|removed|finished|ate/i);
    if (itemMatch) {
      return content.substring(content.indexOf(itemMatch[0]) + itemMatch[0].length).trim();
    }
    return null;
  };
  
  // Parse a text string of items into an array
  const parseItems = (itemsText) => {
    // Split by common separators (comma, 'and', semicolon)
    return itemsText
      .replace(/\s+and\s+/g, ',')
      .split(/,|;/)
      .map(item => item.trim().toLowerCase())
      .filter(item => item.length > 0);
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
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to save to memory');
      }
    } catch (error) {
      console.error('Error saving to memory:', error);
      // Continue even if saving to memory fails
    }
  };
  
  // Process message and generate response
  const processMessage = async (input, messages, kitchenItems) => {
    // Extract keywords or entities from user input
    const lowercaseInput = input.toLowerCase();
    
    // Kitchen items handling
    if (lowercaseInput.includes('kitchen') || lowercaseInput.includes('pantry') || lowercaseInput.includes('fridge')) {
      if (lowercaseInput.includes('add') || lowercaseInput.includes('have')) {
        // Extract items to add to kitchen inventory
        const itemMatch = lowercaseInput.match(/i have|i've added|add|added|bought|purchased|got|have/i);
        if (itemMatch) {
          const itemsText = lowercaseInput.substring(lowercaseInput.indexOf(itemMatch[0]) + itemMatch[0].length).trim();
          return `I've noted that you have ${itemsText} in your kitchen.`;
        }
      } else if (lowercaseInput.includes('remove') || lowercaseInput.includes('used') || lowercaseInput.includes('out of')) {
        // Extract items to remove from kitchen inventory
        const itemMatch = lowercaseInput.match(/i'm out of|i used|used|remove|removed|finished|ate/i);
        if (itemMatch) {
          const itemsText = lowercaseInput.substring(lowercaseInput.indexOf(itemMatch[0]) + itemMatch[0].length).trim();
          return `I've noted that you no longer have ${itemsText} in your kitchen.`;
        }
      } else if (lowercaseInput.includes('what') || lowercaseInput.includes('list') || lowercaseInput.includes('tell me')) {
        // Return the kitchen items
        if (kitchenItems.length === 0) {
          return 'Based on our conversations, you don\'t have any items in your kitchen yet. You can tell me what you have by saying something like \'I have eggs and milk in my kitchen\'.';
        }
        
        return `Based on our conversations, you have: ${kitchenItems.join(', ')} in your kitchen.`;
      }
    }
    
    // Default response
    return 'I\'m your personal assistant with memory. I can help you keep track of items in your kitchen, among other things. Try saying \'I have eggs and milk in my kitchen\' or \'What\'s in my kitchen?\'';
  };
  
  // Send a message
  const sendMessage = async () => {
    if (!input.trim()) return;
    
    // Add user message to state
    const userMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    
    try {
      // Save user message to memory
      await saveToMemory(input);
      
      // Process the message and generate a response
      const response = await processMessage(input, updatedMessages, kitchenItems);
      
      // Add assistant response to state
      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: response }]);
      setIsLoading(false);
      
      // Save assistant response to memory
      await saveToMemory(response, 'assistant');
      
      // Update kitchen items if the conversation was about kitchen inventory
      if (input.toLowerCase().includes('kitchen') || 
          input.toLowerCase().includes('fridge') || 
          input.toLowerCase().includes('pantry')) {
        await loadKitchenItems();
      }
    } catch (error) {
      console.error('Error processing message:', error);
      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: 'Sorry, I encountered an error processing your message.' }]);
      setIsLoading(false);
    }
  };
  
  // Render the component
  return html`
    <div class="personal-agent">
      <div class="agent-header">
        <h1 class="title">Personal AI Agent</h1>
        <p><span class="highlight">Your intelligent assistant with memory</span></p>
        <p>Status: <span class="${zepStatus.includes('Error') ? 'error' : 'success'}">${zepStatus}</span></p>
      </div>
      
      <div class="conversation-container">
        <div class="messages-container">
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
        
        <div class="input-container">
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
      </div>
      
      <div class="agent-footer">
        <p>This personal agent uses <a href="https://help.getzep.com/sdks" target="_blank">Zep API</a> to maintain a knowledge graph of your conversations.</p>
        <p>Try asking about your kitchen inventory or adding items to it.</p>
      </div>
      
      <${LogoLinkHome}/>
    </div>
  `;
} 