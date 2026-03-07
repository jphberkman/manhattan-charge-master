import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["jszip"],
  // Allow large hospital price transparency file uploads (up to 500MB)
  experimental: {
    middlewareClientMaxBodySize: 500 * 1024 * 1024, // 500MB in bytes
  },
};

export default nextConfig;
