"use client";

import React, { useState, useEffect, useRef, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import {
  Stethoscope,
  Sparkles,
  ArrowRight,
  Lightbulb,
  Heart,
  PieChart,
  Languages,
  Volume2,
  VolumeX,
  Upload,
  File,
  ImageIcon,
  Loader2,
  LogOut
} from "lucide-react";

// Types
type MessageType = "user" | "ai" | "system";

type ContextualInsight = {
  type: "recommendation" | "trend";
  content: string;
  severity: "low" | "medium" | "high";
  icon?: React.ReactNode;
};

interface Message {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
  insights?: ContextualInsight[];
  isPlaying?: boolean;
  audioUrl?: string;
  imageUrl?: string;
  isStreaming?: boolean;
}

// Auth Context
interface AuthContextType {
  token: string | null;
  user: any | null;
  login: (response: any) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  login: async () => {},
  logout: () => {},
});

// Auth Provider Component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    // Now that we're on the client, we can safely access localStorage
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
    }
    
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Failed to parse stored user data:', error);
        localStorage.removeItem('user');
      }
    }
  }, []);

  const login = async (googleResponse: any) => {
    try {
      const response = await fetch('https://quick-arachnid-infinitely.ngrok-free.app/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: googleResponse.credential }),
      });

      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error);
      
      if (isClient) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      
      setToken(data.token);
      setUser(data.user);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = () => {
    if (isClient) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("session_id");
      localStorage.removeItem("chatHistory");
      sessionStorage.clear();
      document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    }
    
    setToken(null);
    setUser(null);
    
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };
  
  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Text Formatting Function
const formatText = (text: string) => {
  const lines = text.split("\n");
  return lines.map((line, index) => {
    if (line.startsWith("* ")) {
      const cleanedLine = line.slice(2);
      const formattedLine = cleanedLine
        .split(/(\*\*.*?\*\*)/g)
        .map((part, partIndex) => {
          const boldMatch = part.match(/^\*\*(.*)\*\*$/);
          if (boldMatch) {
            return (
              <strong key={partIndex} className="text-blue-600">
                {boldMatch[1]}
              </strong>
            );
          }
          return <React.Fragment key={partIndex}>{part}</React.Fragment>;
        });

      return (
        <div key={index} className="mb-2 flex items-start">
          <span className="mr-2 mt-1">•</span>
          <p className="flex-1">{formattedLine}</p>
        </div>
      );
    }

    const formattedLine = line.split(/(\*\*.*?\*\*)/g).map((part, partIndex) => {
      const boldMatch = part.match(/^\*\*(.*)\*\*$/);
      if (boldMatch) {
        return (
          <strong key={partIndex} className="text-red-600">
            {boldMatch[1]}
          </strong>
        );
      }
      return <React.Fragment key={partIndex}>{part}</React.Fragment>;
    });

    return <p key={index} className="mb-2">{formattedLine}</p>;
  });
};

// Main Component
const AIHealthCompanion: React.FC = () => {
  const { token, user, login, logout } = useContext(AuthContext);
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeInsight, setActiveInsight] = useState<ContextualInsight | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [isUploading, setIsUploading] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize session with authentication
  useEffect(() => {
    const initializeSession = async () => {
      if (!token) return;
      
      try {
        const response = await fetch("https://quick-arachnid-infinitely.ngrok-free.app/start_session", {
          headers: {
            'Authorization': `Bearer ${token}`,
            'ngrok-skip-browser-warning': 'true',
          }
        });
        const data = await response.json();
        setSessionId(data.session_id);
      } catch (error) {
        console.error("Session initialization failed:", error);
      }
    };

    initializeSession();
  }, [token]);

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "recommendation":
        return <Lightbulb className="text-blue-500" />;
      case "trend":
        return <PieChart className="text-green-500" />;
      default:
        return <Sparkles className="text-purple-500" />;
    }
  };

  const toggleAudio = async (messageId: string) => {
    const updatedMessages = messages.map(msg => {
      if (msg.id === messageId) {
        return { ...msg, isPlaying: !msg.isPlaying };
      }
      return { ...msg, isPlaying: false };
    });
    setMessages(updatedMessages);

    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    if (!message.audioUrl) {
      try {
        const response = await fetch(`https://quick-arachnid-infinitely.ngrok-free.app/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            text: message.content,
            language: selectedLanguage.toLowerCase()
          }),
        });
        
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, audioUrl } : msg
        ));

        if (!audioRefs.current[messageId]) {
          audioRefs.current[messageId] = new Audio(audioUrl);
          audioRefs.current[messageId].addEventListener('ended', () => {
            setMessages(prev => prev.map(msg => 
              msg.id === messageId ? { ...msg, isPlaying: false } : msg
            ));
          });
        }
      } catch (error) {
        console.error("TTS request failed:", error);
        return;
      }
    }

    if (audioRefs.current[messageId]) {
      if (audioRefs.current[messageId].paused) {
        Object.values(audioRefs.current).forEach(audio => audio.pause());
        audioRefs.current[messageId].play();
      } else {
        audioRefs.current[messageId].pause();
      }
    }
  };

  const viewImage = (imageUrl: string) => {
    setCurrentImage(imageUrl);
  };

  const sendMessage = async (message: string) => {
    if (!sessionId || !token) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      type: "user",
      content: message,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Create a temporary AI message
    const tempAiMessageId = `msg-${Date.now()}-ai-temp`;
    const tempAiMessage: Message = {
      id: tempAiMessageId,
      type: "ai",
      content: "",
      timestamp: Date.now(),
      isPlaying: false,
      isStreaming: true
    };

    setMessages((prev) => [...prev, tempAiMessage]);

    try {
      const response = await fetch(`https://quick-arachnid-infinitely.ngrok-free.app/chat/${sessionId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_message: `${message} explain only in ${selectedLanguage.toLowerCase()} language`,
          language: selectedLanguage.toLowerCase(),
          email: user?.email
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let insights: ContextualInsight[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            
            if (parsed.done) {
              insights = parsed.insights || [];
            } else if (parsed.chunk) {
              fullResponse += parsed.chunk;
              
              setMessages(prev => prev.map(msg => 
                msg.id === tempAiMessageId 
                  ? { ...msg, content: fullResponse } 
                  : msg
              ));
            }
          } catch (e) {
            console.error("Error parsing chunk:", e);
          }
        }
      }

      // Replace temporary message with final one
      const finalAiMessage: Message = {
        id: `msg-${Date.now()}-ai`,
        type: "ai",
        content: fullResponse,
        timestamp: Date.now(),
        insights: insights.map((insight: ContextualInsight) => ({
          ...insight,
          icon: getInsightIcon(insight.type),
        })),
        isPlaying: false,
      };

      setMessages(prev => [
        ...prev.filter(msg => msg.id !== tempAiMessageId),
        finalAiMessage
      ]);

      if (insights.length) {
        setActiveInsight(insights[0]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}-system`,
        type: "system",
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [
        ...prev.filter(msg => msg.id !== tempAiMessageId),
        errorMessage
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (file: File, userMessage?: string) => {
  if (!sessionId || !token || !user) {
    console.error("Missing session ID, token, or user data");
    const errorMessage: Message = {
      id: `msg-${Date.now()}-system`,
      type: "system",
      content: "Cannot upload file: Please ensure you're logged in and the session is initialized.",
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, errorMessage]);
    return;
  }

  setIsUploading(true);
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', selectedLanguage.toLowerCase());
  formData.append('user', user.email);
  
  // Add user message if provided
  if (userMessage) {
    formData.append('user_message', userMessage);
  }

  // Create user message for UI
  const userMsg: Message = {
    id: `msg-${Date.now()}-user`,
    type: "user",
    content: userMessage ? `with file: ${file.name}` : `Uploaded ${file.name}`,
    timestamp: Date.now(),
    imageUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
  };

  setMessages(prev => [...prev, userMsg]);

  // Create temporary AI message for streaming
  const tempAiMessageId = `msg-${Date.now()}-ai-temp`;
  const tempAiMessage: Message = {
    id: tempAiMessageId,
    type: "ai",
    content: "",
    timestamp: Date.now(),
    isStreaming: true,
  };

  setMessages(prev => [...prev, tempAiMessage]);

  try {
    const response = await fetch(
      `https://quick-arachnid-infinitely.ngrok-free.app/process_file/${sessionId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Upload failed with status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body received");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";
    let insights: ContextualInsight[] = [];
    let fileProcessed = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          
          if (parsed.error) {
            throw new Error(parsed.error);
          }

          if (parsed.done) {
            insights = parsed.insights || [];
            fileProcessed = parsed.file_processed || false;
          } else if (parsed.chunk) {
            fullResponse += parsed.chunk;
            setMessages(prev =>
              prev.map(msg =>
                msg.id === tempAiMessageId
                  ? { ...msg, content: fullResponse }
                  : msg
              )
            );
          }
        } catch (e) {
          console.error("Error parsing chunk:", e);
        }
      }
    }

    // Replace temporary message with final one
    const finalAiMessage: Message = {
      id: `msg-${Date.now()}-ai`,
      type: "ai",
      content: fullResponse,
      timestamp: Date.now(),
      insights: insights.map(insight => ({
        ...insight,
        icon: getInsightIcon(insight.type),
      })),
    };

    setMessages(prev => [
      ...prev.filter(msg => msg.id !== tempAiMessageId),
      finalAiMessage,
    ]);

    // Set current image if it's an image file
    if (file.type.startsWith('image/')) {
      setCurrentImage(URL.createObjectURL(file));
    }

    if (!fileProcessed) {
      const warningMessage: Message = {
        id: `msg-${Date.now()}-system`,
        type: "system",
        content: "File was uploaded but may not have been fully processed",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, warningMessage]);
    }

  } catch (error) {
    console.error("File upload error:", error);
    
    // Remove temporary message
    setMessages(prev => prev.filter(msg => msg.id !== tempAiMessageId));
    
    // Add error message
    const errorMessage: Message = {
      id: `msg-${Date.now()}-system`,
      type: "system",
      content: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, errorMessage]);

  } finally {
    setIsUploading(false);
  }
};

  const triggerFileUpload = () => {
    if (!sessionId || !token || !user) {
      console.error("Cannot upload file: missing required data", { 
        hasSessionId: !!sessionId, 
        hasToken: !!token, 
        hasUser: !!user 
      });
      const errorMessage: Message = {
        id: `msg-${Date.now()}-system`,
        type: "system",
        content: "Cannot upload file: Please ensure you're logged in and the session is initialized.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }
    fileInputRef.current?.click();
  };

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
        URL.revokeObjectURL(audio.src);
      });
      
      messages.forEach(msg => {
        if (msg.imageUrl && msg.imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(msg.imageUrl);
        }
      });
    };
  }, []);

  // Login screen
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl">
          <div className="flex items-center justify-center mb-6">
            <Image src="/logo.svg" alt="GrealthAI Logo" width={60} height={60} className="mr-4" />
            <h1 className="text-3xl font-bold text-gray-800">AI Health Assistant</h1>
          </div>
          <GoogleLogin
            onSuccess={login}
            onError={() => console.log('Login Failed')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
        <div className="md:col-span-2 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[calc(100vh-3rem)]">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-cyan-700 text-white p-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <Image
                  src="/logo.svg"
                  alt="GrealthAI Logo"
                  width={40}
                  height={40}
                  className="w-10 h-10 mr-4"
                />
                <h1 className="text-3xl font-bold">AI Health Guardian</h1>
              </div>
              <div className="flex items-center space-x-4">
                {user?.picture && (
                  <Image
                    src={user.picture}
                    alt="Profile"
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                )}
                <span className="text-white">{user?.name}</span>
                <button
                  onClick={logout}
                  className="bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded-lg flex items-center space-x-2 transition-colors"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
            <div className="mt-4 flex items-center space-x-4">
              <h4 className="text-lg font-bold">Chat Language:</h4>
              <Languages className="w-8 h-8 text-white" />
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-white text-blue-600 font-semibold rounded-lg px-3 py-1"
              >
                <option value="English">English</option>
                <option value="Tamil">Tamil</option>
                <option value="Hindi">Hindi</option>
                <option value="Telugu">Telugu</option>
              </select>
            </div>
          </div>
  
          <div 
            ref={chatRef} 
            className="flex-grow overflow-y-auto p-6 space-y-4"
            style={{ height: 'calc(100% - 160px)' }}
          >
            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: msg.type === "user" ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] p-4 rounded-2xl ${
                      msg.type === "user"
                        ? "bg-gradient-to-br from-blue-500 to-cyan-600 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-grow">
                        {msg.type === "ai" ? formatText(msg.content) : msg.content}
                        {msg.isStreaming && (
                          <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
                        )}
                      </div>
                      <div className="flex">
                        {msg.imageUrl && (
                          <button
                            onClick={() => viewImage(msg.imageUrl!)}
                            className="ml-2 p-2 hover:bg-gray-200 rounded-full transition-colors"
                          >
                            <ImageIcon className="w-5 h-5 text-blue-600" />
                          </button>
                        )}
                        {msg.type === "ai" && (
                          <button
                            onClick={() => toggleAudio(msg.id)}
                            className="ml-2 p-2 hover:bg-gray-200 rounded-full transition-colors"
                          >
                            {msg.isPlaying ? (
                              <VolumeX className="w-5 h-5 text-blue-600" />
                            ) : (
                              <Volume2 className="w-5 h-5 text-blue-600" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    {msg.insights && msg.insights.length > 0 && (
                      <div className="mt-2 flex space-x-2">
                        {msg.insights.map((insight, idx) => (
                          <button
                            key={idx}
                            onClick={() => setActiveInsight(insight)}
                            className="flex items-center text-sm bg-white/20 p-2 rounded-lg hover:bg-white/30 transition-colors"
                          >
                            {insight.icon}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
  
          <div className="bg-white border-t p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) {
                  sendMessage(input.trim());
                }
              }}
              className="flex items-center space-x-4"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe your health concern..."
                className="flex-grow p-3 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-800"
                disabled={isLoading || !sessionId || isUploading}
              />
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileUpload(file, user);
                  }
                }}
              />
              <button
                type="button"
                onClick={triggerFileUpload}
                disabled={isLoading || !sessionId || isUploading}
                className="bg-gradient-to-r from-green-500 to-teal-600 text-white p-3 rounded-xl hover:opacity-90 transition-opacity"
              >
                <Upload />
              </button>
              <button
                type="submit"
                disabled={isLoading || !input.trim() || !sessionId || isUploading}
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-3 rounded-xl hover:opacity-90 transition-opacity"
              >
                <ArrowRight />
              </button>
            </form>
          </div>
        </div>
  
        <div className="hidden md:block">
          <div className="flex flex-col space-y-6">
            {/* Health Insights Panel */}
            <div className="w-full bg-white rounded-3xl p-6 shadow-xl">
              <div className="flex items-center mb-6">
                <Sparkles className="w-8 h-8 mr-4 text-purple-600" />
                <h2 className="text-2xl font-bold text-gray-800">Health Insights</h2>
              </div>
    
              {activeInsight ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <div className="flex items-center space-x-4">
                    {activeInsight.icon}
                    <span className="font-semibold text-purple-400 text-lg capitalize">
                      {activeInsight.type} Insight
                    </span>
                  </div>
                  <p className="text-gray-700">{activeInsight.content}</p>
                  {activeInsight.severity && (
                    <div className="flex items-center space-x-2">
                      <Heart
                        className={`${
                          activeInsight.severity === "low"
                            ? "text-green-500"
                            : activeInsight.severity === "medium"
                            ? "text-yellow-500"
                            : "text-red-500"
                        }`}
                      />
                      <span className="capitalize text-2xl text-purple-600">
                        {activeInsight.severity} Priority
                      </span>
                    </div>
                  )}
                </motion.div>
              ) : (
                <p className="text-gray-500 text-center">
                  Select an insight icon or start chat to view details
                </p>
              )}
            </div>
            
            {/* Image Display Panel */}
            <div className="w-full bg-white rounded-3xl p-6 shadow-xl">
              <div className="flex items-center mb-6">
                <ImageIcon className="w-8 h-8 mr-4 text-blue-600" />
                <h2 className="text-2xl font-bold text-gray-800">Uploaded Image</h2>
              </div>
              
              {currentImage ? (
                <div className="flex flex-col items-center">
                  <div className="w-full h-64 relative rounded-lg overflow-hidden">
                    <Image 
                      src={currentImage} 
                      alt="Uploaded image" 
                      layout="fill"
                      objectFit="contain"
                      className="rounded-lg"
                    />
                  </div>
                  <button 
                    onClick={() => setCurrentImage(null)}
                    className="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    Clear Image
                  </button>
                </div>
              ) : (
                <p className="text-gray-500 text-center">
                  Upload an image to view it here
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Wrap with Google OAuth Provider
const AppPC: React.FC = () => {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}>
      <AuthProvider>
        <AIHealthCompanion />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
};

export default AppPC;
