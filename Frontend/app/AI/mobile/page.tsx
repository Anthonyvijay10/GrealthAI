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
  LogOut,
  X,
  Menu,
  Moon,
  Sun
} from "lucide-react";

// Types
type MessageType = "user" | "ai" | "system";
type ThemeType = "light" | "dark";

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
  confidence?: number; // Added confidence property
}

// Auth Context
interface AuthContextType {
  token: string | null;
  user: any | null;
  login: (response: any) => Promise<void>;
  logout: () => void;
  theme: ThemeType;
  toggleTheme: () => void;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  login: async () => {},
  logout: () => {},
  theme: "light",
  toggleTheme: () => {},
});

// Auth Provider Component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeType>("light");

  useEffect(() => {
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    setToken(storedToken);
    
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Failed to parse stored user data:', error);
      }
    }
    
    // Get stored theme preference
    const storedTheme = typeof window !== 'undefined' ? localStorage.getItem('theme') as ThemeType : null;
    if (storedTheme) {
      setTheme(storedTheme);
      document.documentElement.classList.toggle('dark', storedTheme === 'dark');
    }
    
    setIsLoading(false);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

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
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("session_id");
    localStorage.removeItem("chatHistory");
    sessionStorage.clear();
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    setToken(null);
    setUser(null);
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-blue-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, theme, toggleTheme }}>
      {children}
    </AuthContext.Provider>
  );
};

const formatText = (text: string, confidence?: number) => {
  const lines = text.split("\n");
  const formattedContent = lines.map((line, index) => {
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

  return (
    <>
      {formattedContent}
      {confidence !== undefined && (
        <div className="mt-2 text-sm flex items-center">
          {/* <span className="inline-block px-2 py-1 rounded-lg bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            Confidence: {confidence.toFixed(1)}%
          </span> */}
        </div>
      )}
    </>
  );
};

const MobileAIHealthCompanion: React.FC = () => {
  const { token, user, login, logout, theme, toggleTheme } = useContext(AuthContext);
  const [sessionId, setSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeInsight, setActiveInsight] = useState<ContextualInsight | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("English");
  const [isUploading, setIsUploading] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate confidence score function
  const generateConfidenceScore = () => {
    return 90 + Math.random() * 9; // Random between 90-99
  };

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
    setShowImageViewer(true);
  };

  const handleFileUpload = async (file: File, user: any) => {
    if (!sessionId || !token || !user) {
      console.error("Cannot upload file: missing sessionId, token, or user data", { 
        hasSessionId: !!sessionId, 
        hasToken: !!token, 
        hasUser: !!user 
      });
      return;
    }
  
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('language', selectedLanguage.toLowerCase());
    formData.append('user', user?.email || 'unknown');
  
    // Create user message for UI
    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      type: "user",
      content: `Uploaded ${file.name}`,
      timestamp: Date.now(),
      imageUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    };
  
    setMessages((prev) => [...prev, userMsg]);
  
    // Create temporary AI message for streaming
    const tempAiMessageId = `msg-${Date.now()}-ai-temp`;
    const tempAiMessage: Message = {
      id: tempAiMessageId,
      type: "ai",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
    };
  
    setMessages((prev) => [...prev, tempAiMessage]);
  
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
  
      // Replace temporary message with final one including confidence score
      const finalAiMessage: Message = {
        id: `msg-${Date.now()}-ai`,
        type: "ai",
        content: fullResponse,
        timestamp: Date.now(),
        insights: insights.map(insight => ({
          ...insight,
          icon: getInsightIcon(insight.type),
        })),
        confidence: generateConfidenceScore(), // Add confidence score
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

    // Create a temporary AI message for streaming
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

      // Replace temporary message with final one including confidence score
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
        confidence: generateConfidenceScore(), // Add confidence score
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
      
      // Cleanup any created object URLs when component unmounts
      messages.forEach(msg => {
        if (msg.imageUrl && msg.imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(msg.imageUrl);
        }
      });
    };
  }, []);

  if (!token) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${theme === 'dark' ? 'from-gray-900 to-blue-900' : 'from-blue-50 to-indigo-100'} flex items-center justify-center p-4 transition-colors duration-300`}>
        <div className={`${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white'} p-6 rounded-2xl shadow-xl w-full max-w-sm transition-colors duration-300`}>
          <div className="flex items-center justify-center mb-6">
            <Image src="/logo.svg" alt="GrealthAI Logo" width={40} height={40} className="mr-3" />
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">AI Health Guardian</h1>
          </div>
          <button
            onClick={toggleTheme}
            className={`mb-4 p-2 rounded-full ${theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-800'} flex items-center justify-center w-full`}
          >
            {theme === 'dark' ? (
              <><Sun className="w-5 h-5 mr-2" /> Switch to Light Mode</>
            ) : (
              <><Moon className="w-5 h-5 mr-2" /> Switch to Dark Mode</>
            )}
          </button>
          <GoogleLogin
            onSuccess={login}
            onError={() => console.log('Login Failed')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${theme === 'dark' ? 'from-gray-900 to-blue-900' : 'from-blue-50 to-indigo-100'} transition-colors duration-300`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-700 text-white p-4 fixed top-0 left-0 right-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Image src="/logo.svg" alt="GrealthAI Logo" width={24} height={24} className="w-6 h-6 mr-2" />
            <h1 className="text-xl font-bold">AI Health Guardian</h1>
            <button
              onClick={() => setShowLanguageSelector(true)}
              className="p-2 hover:bg-white/20 rounded-full"
            >
              <Languages className="w-6 h-6" />
            </button>
          </div>
          <div className="flex items-center space-x-2">
            {/* Dark mode toggle button */}
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-white/20 rounded-full"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {user?.picture && (
              <Image
                src={user.picture}
                alt="Profile"
                width={24}
                height={24}
                className="rounded-full"
              />
            )}
            <button
              onClick={logout}
              className="p-2 hover:bg-white/20 rounded-full"
            >
              <LogOut className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowInsights(true)}
              className="p-2 hover:bg-white/20 rounded-full"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div 
        ref={chatRef}
        className={`pb-20 pt-16 px-4 overflow-y-auto ${theme === 'dark' ? 'text-white' : ''}`}
        style={{ height: 'calc(100vh - 4rem)' }}
      >
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"} mb-4`}
            >
              <div
                className={`max-w-[85%] p-3 rounded-xl ${
                  msg.type === "user"
                    ? "bg-gradient-to-br from-blue-500 to-cyan-600 text-white"
                    : theme === 'dark' 
                      ? "bg-gray-700 text-gray-100" 
                      : "bg-gray-100 text-gray-800"
                } transition-colors duration-300`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-grow">
                    {msg.type === "ai" ? formatText(msg.content, msg.confidence) : msg.content}
                    {msg.isStreaming && (
                      <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
                    )}
                  </div>
                  <div className="flex ml-2">
                    {msg.imageUrl && (
                      <button
                        onClick={() => viewImage(msg.imageUrl!)}
                        className={`p-2 ${theme === 'dark' ? 'hover:bg-gray-600' : 'hover:bg-gray-200'} rounded-full transition-colors`}
                      >
                        <ImageIcon className="w-5 h-5 text-orange-600" />
                      </button>
                    )}
                    {msg.type === "ai" && (
                      <button
                        onClick={() => toggleAudio(msg.id)}
                        className={`p-2 ${theme === 'dark' ? 'hover:bg-gray-600' : 'hover:bg-gray-200'} rounded-full transition-colors`}
                      >
                        {msg.isPlaying ? (
                          <VolumeX className="w-5 h-5 text-orange-600" />
                        ) : (
                          <Volume2 className="w-5 h-5 text-orange-600" />
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
                        onClick={() => {
                          setActiveInsight(insight);
                          setShowInsights(true);
                        }}
                        className="flex items-center text-sm bg-white/20 p-1.5 rounded-lg hover:bg-white/30 transition-colors"
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

      {/* Input Area */}
      <div className={`fixed bottom-0 left-0 right-0 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-t'} p-4 transition-colors duration-300`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) {
              sendMessage(input.trim());
            }
          }}
          className="flex items-center space-x-2"
        >
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
            className="bg-gradient-to-r from-green-500 to-teal-600 text-white p-2 rounded-xl"
          >
            <Upload className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your health concern..."
            className={`flex-grow p-2 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
              theme === 'dark' 
                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                : 'border-blue-200 text-gray-800'
            } text-sm transition-colors duration-300`}
            disabled={isLoading || !sessionId || isUploading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !sessionId || isUploading}
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-2 rounded-xl"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>
      </div>

      {/* Language Selector Modal */}
      <AnimatePresence>
        {showLanguageSelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white rounded-2xl w-full max-w-sm p-6"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl text-blue-600 font-bold">Select Language</h2>
                <button
                  onClick={() => setShowLanguageSelector(false)}
                  className="p-1 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-2 text-blue-500">
                {["English", "Tamil", "Hindi", "Telugu"].map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      setSelectedLanguage(lang);
                      setShowLanguageSelector(false);
                    }}
                    className={`w-full p-3 text-left rounded-lg ${
                      selectedLanguage === lang
                        ? "bg-blue-100 text-purple-500"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Insights Drawer */}
      <AnimatePresence>
        {showInsights && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-xl z-50"
          >
            <div className="p-4 bg-gradient-to-r from-blue-600 to-cyan-700 text-white">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <Sparkles className="w-6 h-6 mr-2" />
                  <h2 className="text-xl font-bold">Health Insights</h2>
                </div>
                <button
                  onClick={() => setShowInsights(false)}
                  className="p-1 hover:bg-white/20 rounded-full"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-4">
              {activeInsight ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <div className="flex items-center space-x-2">
                    {activeInsight.icon}
                    <span className="font-semibold text-purple-400 capitalize">
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
                      <span className="capitalize text-lg text-purple-600">
                        {activeInsight.severity} Priority
                      </span>
                    </div>
                  )}
                </motion.div>
              ) : (
                <p className="text-gray-500 text-center">
                  Select an insight icon to view details
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Viewer Modal */}
      <AnimatePresence>
        {showImageViewer && currentImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center p-4"
          >
            <button
              onClick={() => setShowImageViewer(false)}
              className="absolute top-4 right-4 bg-white/20 p-2 rounded-full text-white"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="relative w-full h-4/5 max-w-lg flex items-center justify-center">
              <Image
                src={currentImage}
                alt="Uploaded image"
                layout="fill"
                objectFit="contain"
                className="rounded-lg"
              />
            </div>
            
            <button
              onClick={() => {
                setShowImageViewer(false);
                setCurrentImage(null);
              }}
              className="mt-4 bg-red-500 text-white px-4 py-2 rounded-lg"
            >
              Clear Image
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Appmob = () => {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    // Get client ID after component mounts
    setClientId(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null);
  }, []);

  if (!clientId) {
    return <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <p className="text-red-600">Error: Google OAuth is not configured</p>
    </div>;
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <AuthProvider>
        <MobileAIHealthCompanion />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
};

export default Appmob;