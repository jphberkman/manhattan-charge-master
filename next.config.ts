import type { NextConfig } from "next";
import { nextConfigSecurityHeaders } from "./src/lib/compliance/security-headers";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["jszip"],
  // Allow large hospital price transparency file uploads (up to 500MB)
  experimental: {
    middlewareClientMaxBodySize: 500 * 1024 * 1024, // 500MB in bytes
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: nextConfigSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
