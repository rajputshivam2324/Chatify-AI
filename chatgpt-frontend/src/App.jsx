import React, { useState, useRef, useEffect } from 'react';
import './App.css';

const App = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState('chat');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const models = [
    { value: 'chat', label: 'LLaMA 3.1 8B', endpoint: '/model/chat', supportsImages: false },
    { value: 'qwen', label: 'Qwen 2.5 Coder 32B', endpoint: '/model/qwen', supportsImages: false }, // Temporarily disabled images
    { value: 'gemma', label: 'Gemma 2 9B', endpoint: '/model/gemma', supportsImages: false },
    { value: 'image', label: 'Stable Diffusion XL', endpoint: '/model/generate-image', supportsImages: false }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversation history when model changes
  useEffect(() => {
    const loadConversation = async () => {
      if (selectedModel === 'image') return; // No conversation for image generation
      
      try {
        const response = await fetch(`http://localhost:4001/model/${selectedModel}/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.conversationHistory && data.conversationHistory.length > 0) {
            const formattedMessages = data.conversationHistory.map(msg => ({
              id: msg.id,
              role: msg.role,
              text: msg.text,
              timestamp: msg.timestamp
            }));
            setMessages(formattedMessages);
          }
        }
      } catch (error) {
        console.log('No previous conversation found');
      }
    };

    loadConversation();
  }, [selectedModel, sessionId]);

  const handleModelChange = (e) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);
    
    // Clear current conversation and start fresh
    setMessages([]);
    setInputText('');
    setSelectedFile(null);
    
    // Generate new session ID for the new model
    setSessionId(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size should be less than 10MB');
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadImageToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    const userMessage = inputText.trim();
    setInputText('');
    setIsLoading(true);

    // Add user message to chat
    const newUserMessage = {
      id: Date.now(),
      role: 'user',
      text: userMessage,
      timestamp: Date.now(),
      file: selectedFile
    };
    
    setMessages(prev => [...prev, newUserMessage]);

    try {
      let response;
      const selectedModelConfig = models.find(m => m.value === selectedModel);
      
      console.log('Selected model:', selectedModel);
      console.log('Request URL:', `http://localhost:4001${selectedModelConfig.endpoint}`);

      if (selectedModel === 'image') {
        // Handle image generation
        const requestBody = { prompt: userMessage };
        console.log('Image request body:', requestBody);
        
        response = await fetch(`http://localhost:4001${selectedModelConfig.endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        console.log('Image response status:', response.status);

        if (response.ok) {
          const imageBlob = await response.blob();
          const imageUrl = URL.createObjectURL(imageBlob);
          
          const assistantMessage = {
            id: Date.now() + 1,
            role: 'assistant',
            text: `Generated image for: "${userMessage}"`,
            timestamp: Date.now(),
            imageUrl: imageUrl
          };
          
          setMessages(prev => [...prev, assistantMessage]);
        } else {
          const errorText = await response.text();
          throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
        }
      } else {
        // Handle text chat models
        let requestBody = {
          sessionId: sessionId
        };

        // Handle image upload for vision models
        if (selectedFile && selectedModelConfig.supportsImages) {
          const base64Image = await uploadImageToBase64(selectedFile);
          requestBody.imageData = base64Image;
        }

        if (selectedModel === 'chat') {
          requestBody.userMessage = userMessage;
        } else if (selectedModel === 'qwen') {
          requestBody.userMessage = userMessage;
          if (selectedFile) {
            const base64Image = await uploadImageToBase64(selectedFile);
            requestBody.imageUrl = base64Image;
          }
        } else if (selectedModel === 'gemma') {
          requestBody.prompt = userMessage;
          // Gemma doesn't support images in your current setup
        }

        console.log('Chat request body:', {
          ...requestBody,
          imageData: requestBody.imageData ? '[IMAGE_DATA]' : undefined,
          imageUrl: requestBody.imageUrl ? '[IMAGE_DATA]' : undefined
        });

        response = await fetch(`http://localhost:4001${selectedModelConfig.endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        console.log('Chat response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('Chat response data:', data);
          
          // Handle different response formats
          let replyText = '';
          if (data.reply) {
            replyText = data.reply;
          } else if (data.choices && data.choices[0] && data.choices[0].message) {
            replyText = data.choices[0].message.content;
          } else if (data.message) {
            replyText = data.message;
          } else if (typeof data === 'string') {
            replyText = data;
          } else {
            replyText = 'Received response but could not parse it.';
          }
          
          console.log('Extracted reply text:', replyText);
          
          const assistantMessage = {
            id: Date.now() + 1,
            role: 'assistant',
            text: replyText,
            timestamp: Date.now()
          };
          
          setMessages(prev => [...prev, assistantMessage]);
        } else {
          const errorText = await response.text();
          console.error('Response error:', errorText);
          throw new Error(`Request failed: ${response.status} - ${errorText}`);
        }
      }
    } catch (error) {
      console.error('Full error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        text: `Error: ${error.message}`,
        timestamp: Date.now(),
        isError: true
      };
      
      setMessages(prev => [...prev, errorMessage]);
    }

    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsLoading(false);
  };

  const startNewChat = () => {
    setMessages([]);
    setInputText('');
    setSelectedFile(null);
    setSessionId(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const currentModelConfig = models.find(m => m.value === selectedModel);

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={startNewChat}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            New chat
          </button>
        </div>
        
        <div className="sidebar-content">
          <div className="chat-history">
            <div className="section-title">Today</div>
            <div className="chat-item active">
              {currentModelConfig.label} - {messages.length > 0 ? 'Active Chat' : 'New Chat'}
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">U</div>
            <span>User</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="chat-header">
          <div className="model-selector">
            <select 
              value={selectedModel} 
              onChange={handleModelChange}
              className="model-dropdown"
            >
              {models.map(model => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
            {currentModelConfig.supportsImages && (
              <span className="model-feature">📷 Vision Enabled</span>
            )}
          </div>
        </div>

        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <h1>What's on your mind today?</h1>
              <p>Using {currentModelConfig.label}</p>
              {currentModelConfig.supportsImages && (
                <p className="feature-note">💡 This model supports image analysis</p>
              )}
              {selectedModel === 'image' && (
                <p className="feature-note">🎨 This model generates images from text</p>
              )}
            </div>
          ) : (
            <div className="messages">
              {messages.map((message) => (
                <div key={message.id} className={`message ${message.role}`}>
                  <div className="message-avatar">
                    {message.role === 'user' ? 'U' : 'AI'}
                  </div>
                  <div className="message-content">
                    {message.file && (
                      <div className="message-file">
                        📷 {message.file.name} ({Math.round(message.file.size / 1024)}KB)
                      </div>
                    )}
                    {message.text && (
                      <div className={`message-text ${message.isError ? 'error' : ''}`}>
                        {message.text}
                      </div>
                    )}
                    {message.imageUrl && (
                      <div className="message-image">
                        <img src={message.imageUrl} alt="Generated" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message assistant">
                  <div className="message-avatar">AI</div>
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="input-container">
          {selectedFile && (
            <div className="selected-file">
              <span>📷 {selectedFile.name} ({Math.round(selectedFile.size / 1024)}KB)</span>
              <button onClick={removeFile} className="remove-file">×</button>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="input-form">
            <div className="input-wrapper">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                style={{ display: 'none' }}
              />
              
              {/* Show attach button only for models that support images */}
              {(currentModelConfig.supportsImages || selectedModel === 'image') && (
                <button
                  type="button"
                  className="attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload image"
                >
                  📷
                </button>
              )}

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  selectedModel === 'image' 
                    ? 'Describe your dream image in detail...' 
                    : currentModelConfig.supportsImages 
                      ? 'Ask me anything or share an image...'
                      : 'Ask me anything...'
                }
                className="message-input"
                disabled={isLoading}
              />

              <button
                type="submit"
                className="send-btn"
                disabled={(!inputText.trim() && !selectedFile) || isLoading}
                title="Send message"
              >
                {isLoading ? (
                  <div className="loading">⏳</div>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 11L12 6L17 11M12 18V7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default App;