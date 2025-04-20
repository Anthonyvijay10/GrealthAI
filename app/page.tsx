"use client";

import React from "react";
import { useRouter } from "next/navigation";

const Home: React.FC = () => {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-900 to-black text-white flex flex-col items-center justify-center px-6 py-12">
      <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-center mb-8 tracking-tight">
        AI Healthcare Assistant
      </h1>
      <p className="text-lg sm:text-xl md:text-2xl text-gray-300 text-center max-w-2xl mb-12">
        Your personal medical assistant powered by AI. Get health information, symptom checks, and patient insights instantly.
      </p>
      <button
        onClick={() => router.push("/AI")}
        className="px-8 py-4 text-lg font-semibold bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg transition-transform transform hover:scale-105"
      >
        Talk to the Bot
      </button>

      <div className="absolute bottom-6 text-sm text-gray-500">
        Made with ❤️ by Your Team
      </div>
    </div>
  );
};

export default Home;
