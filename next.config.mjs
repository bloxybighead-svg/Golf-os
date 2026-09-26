/** @type {import('next').NextConfig} */
const nextConfig = {
  // The simulator pages moved under the Course Planner tab; keep old links working.
  async redirects() {
    return [
      { source: "/simulator", destination: "/planner/dispersion", permanent: false },
      { source: "/simulator/course", destination: "/planner", permanent: false },
      { source: "/simulator/:path*", destination: "/planner/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
