"use client";

import React, { useEffect, useState } from "react";
import Appmob from "./mobile/page";
import AIHealthCompanion from "./pc/page";
import { Loader2, HeartPulse } from "lucide-react";

const App: React.FC = () => {
  const [isPC, setIsPC] = useState<boolean | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Start loading animation
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 100) {
            clearInterval(progressInterval);
            return 100;
          }
          return prev + 10;
        });
      }, 150);

      // Detect device type
      const checkDeviceType = () => {
        const userAgent = navigator.userAgent.toLowerCase();
        const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
        setIsPC(!isMobile);
        clearInterval(progressInterval);
        setLoadingProgress(100);
      };

      // Simulate some delay for the loading screen (optional)
      const detectionTimer = setTimeout(checkDeviceType, 1000);

      return () => {
        clearInterval(progressInterval);
        clearTimeout(detectionTimer);
      };
    }
  }, []);

  if (isPC === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="flex justify-center mb-6">
            <HeartPulse className="w-12 h-12 text-blue-600 animate-pulse" />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Loading Health Companion
          </h1>
          <p className="text-gray-600 mb-6">
            Initializing your personalized health assistant...
          </p>
          
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-6">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
          
          <div className="flex items-center justify-center text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            <span>Detecting your device...</span>
          </div>
        </div>
        
        <div className="mt-8 text-center text-gray-500 text-xs">
          <p>© {new Date().getFullYear()} AI Health Guardian</p>
          <p className="mt-1">Your trusted health companion</p>
        </div>
      </div>
    );
  }

  return isPC ? <AIHealthCompanion /> : <Appmob />;
};

export default App;