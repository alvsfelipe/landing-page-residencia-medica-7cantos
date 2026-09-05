import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "7cantos.s3.sa-east-1.amazonaws.com",
        pathname: "/**",
      },
    ],
  },
};
export default nextConfig;
