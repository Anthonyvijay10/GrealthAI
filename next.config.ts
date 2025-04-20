/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  images: {
    domains: ["lh3.googleusercontent.com"],
  },
  // ✅ Ignore TypeScript build errors
  typescript: {
    ignoreBuildErrors: true,
  },
  // ✅ Ignore ESLint errors during build
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
