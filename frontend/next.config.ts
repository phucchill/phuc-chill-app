import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8080/:path*",
      },
      {
        source: "/ws",
        destination: "http://localhost:8080/ws",
      },
    ];
  },
  allowedDevOrigins: ['192.168.20.84'],
};

export default nextConfig;