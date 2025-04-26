"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Activity, Brain, Users, Clock, ChevronRight, PanelRight, Menu, X } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  
  useEffect(() => {
    setIsLoaded(true);
    
    const interval = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % features.length);
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);
  
  const features = [
    {
    "icon": <Activity className='w-8 h-8 text-emerald-400' />,
    "title": "AI-Driven Diagnosis",
    "description": "Analyze medical documents and images using our advanced AI for accurate health insights."
  },
  {
    "icon": <Brain className='w-8 h-8 text-purple-400' />,
    "title": "Medical Jargon Simplification",
    "description": "Get easy-to-understand explanations for complex medical terms and diagnoses."
  },
  {
    "icon": <Clock className='w-8 h-8 text-blue-400' />,
    "title": "24/7 Health Assistance",
    "description": "Our AI assistant is available round the clock to address any of your health concerns, anytime."
  },
  {
    "icon": <Users className='w-8 h-8 text-amber-400' />,
    "title": "Personalized Health Recommendations",
    "description": "Receive tailored advice and action plans based on your specific symptoms and health history."
  }
  ];
  
  const testimonials = [
    {
      name: "Saran",
      role: "Automotive Innovator",
      content: "This AI healthcare assistant is a game-changer. Imagine uploading your prescription and instantly getting clear, precise answers—it's like having a personal doctor in your pocket, always ahead of the curve. The future is now!"
    },
    {
      name: "Adityaa",
      role: "3D Animator",
      content: "I never thought I'd see the day where AI could read prescriptions and respond so intelligently. It's almost like talking to a futuristic healthcare advisor. It’s like the virtual assistant of tomorrow, today."
    },
    {
      name: "Aravindh",
      role: "Doctor",
      content: "As a doctor, I’ve never seen anything like this. Patients upload their prescriptions, and in seconds, they get accurate, reliable information. It feels like we’re in the future of healthcare, where AI assists every step of the way. This is the evolution of patient care."
    }
    
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 text-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-black bg-opacity-20 backdrop-blur-lg z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Heart className="w-6 h-6 text-pink-500 fill-pink-500" />
            <span className="font-bold text-xl">GrealthAI</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="hover:text-indigo-300 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-indigo-300 transition-colors">How It Works</a>
            <a href="#testimonials" className="hover:text-indigo-300 transition-colors">Testimonials</a>
            <button 
              onClick={() => router.push("/AI")}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              Launch Assistant
            </button>
          </div>
          
          <button 
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>
      
      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black bg-opacity-95 pt-20 px-6 flex flex-col md:hidden">
          <a 
            href="#features" 
            className="py-4 border-b border-gray-800"
            onClick={() => setIsMenuOpen(false)}
          >
            Features
          </a>
          <a 
            href="#how-it-works" 
            className="py-4 border-b border-gray-800"
            onClick={() => setIsMenuOpen(false)}
          >
            How It Works
          </a>
          <a 
            href="#testimonials" 
            className="py-4 border-b border-gray-800"
            onClick={() => setIsMenuOpen(false)}
          >
            Testimonials
          </a>
          <button 
            onClick={() => router.push("/AI")}
            className="mt-6 bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 rounded-lg hover:opacity-90 transition-opacity"
          >
            Launch Assistant
          </button>
        </div>
      )}
      
      {/* Hero Section */}
      <div className={`pt-32 pb-20 px-6 max-w-7xl mx-auto flex flex-col lg:flex-row items-center transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
        <div className="lg:w-1/2 mb-12 lg:mb-0">
          <h1 className="text-5xl sm:text-6xl font-bold leading-tight mb-6">
            Your Personal <span className="bg-gradient-to-r from-indigo-400 to-pink-500 bg-clip-text text-transparent">AI Health</span> Assistant
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-lg">
            Get instant health insights, symptom analysis, and medical information tailored to your needs. Powered by cutting-edge AI technology.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => router.push("/AI")}
              className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg transition-all hover:shadow-indigo-500/50 hover:scale-105"
            >
              Start Consultation
            </button>
          </div>
        </div>
        
        
      
      {/* Features Section */}
      <div id="features" className="py-20 bg-black bg-opacity-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Advanced Features</h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Our AI healthcare assistant comes with a suite of powerful features to help you manage your health effectively.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index}
                className={`p-8 rounded-2xl transition-all duration-500 ${
                  activeFeature === index 
                    ? 'bg-gradient-to-br from-indigo-900 to-purple-900 scale-105 shadow-xl' 
                    : 'bg-gray-900 bg-opacity-40'
                }`}
              >
                <div className="mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-300">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* How It Works */}
      <div id="how-it-works" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Experience healthcare reimagined with our simple three-step process.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
             {
              "step": "01",
              "title": "Upload Medical Documents or Images",
              "description": "Easily upload your medical PDFs, prescriptions, or diagnostic images."
            },
            {
              "step": "02",
              "title": "AI Diagnosis & Analysis",
              "description": "Our AI analyzes your documents and images to provide insights and explanations."
            },
            {
              "step": "03",
              "title": "Personalized Recommendations",
              "description": "Receive tailored health advice and next steps based on your analysis."
            }
            ].map((item, index) => (
              <div key={index} className="relative">
                <div className="absolute -top-6 left-0 text-6xl font-bold text-indigo-800 opacity-50">{item.step}</div>
                <div className="bg-gray-900 bg-opacity-40 rounded-2xl p-8 pt-10">
                  <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                  <p className="text-gray-300">{item.description}</p>
                </div>
                {index < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform translate-x-1/2 -translate-y-1/2 z-10">
                    <ChevronRight className="w-6 h-6 text-indigo-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Testimonials */}
      <div id="testimonials" className="py-20 bg-black bg-opacity-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">What People Are Saying</h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Thousands of users trust our AI healthcare assistant for their health needs.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 shadow-lg">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-4 h-4 rounded-full bg-yellow-400"></div>
                  ))}
                </div>
                <p className="text-gray-300 mb-6">"{testimonial.content}"</p>
                <div>
                  <p className="font-semibold">{testimonial.name}</p>
                  <p className="text-sm text-gray-400">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* CTA Section */}
      <div className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-3xl p-12 text-center shadow-2xl">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to take control of your health?</h2>
            <p className="text-lg text-indigo-200 mb-8 max-w-xl mx-auto">
              Join thousands of users who are making better health decisions every day with our AI assistant.
            </p>
            <button
              onClick={() => router.push("/AI")}
              className="px-8 py-4 text-lg font-semibold bg-white text-indigo-900 rounded-xl shadow-lg transition-transform hover:scale-105"
            >
              Start Free Consultation
            </button>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="py-12 bg-black bg-opacity-60">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8">
            <div className="flex items-center gap-2 mb-6 md:mb-0">
              <Heart className="w-6 h-6 text-pink-500 fill-pink-500" />
              <span className="font-bold text-xl">GrealthAI</span>
            </div>
            
            <div className="flex gap-6">
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                Terms of Service
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                Support
              </a>
            </div>
          </div>
          
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm mb-4 md:mb-0">
              © {new Date().getFullYear()} GrealthAI. All rights reserved.
            </p>
            <p className="text-gray-400 text-sm">
              Built with care by Your Team
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
