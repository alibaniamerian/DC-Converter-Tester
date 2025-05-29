import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: { // ADD THIS BLOCK
    allowedDevOrigins: [
      "9003-idx-studio-1745500700404.cluster-3gc7bglotjgwuxlqpiut7yyqt4.cloudworkstations.dev",
      "9002-idx-studio-1745500700404.cluster-3gc7bglotjgwuxlqpiut7yyqt4.cloudworkstations.dev", // For port 9002 if you use it
      // Add any other origins if they appear in future error messages
    ],
  },
};

export default nextConfig;
