import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the local network IP so mobile devices on the same WiFi can
  // connect to the Next.js HMR websocket during development.
  allowedDevOrigins: ['192.168.100.8'],
};

export default nextConfig;
