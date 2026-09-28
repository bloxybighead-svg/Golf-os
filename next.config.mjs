/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pages retired by the three-tab nav (Play, Rounds, You); keep old links working.
  async redirects() {
    return [
      // Practice tab -> You
      { source: "/log", destination: "/you", permanent: false },
      { source: "/drills", destination: "/you", permanent: false },
      { source: "/trends", destination: "/you", permanent: false },
      // Course Planner sub-tabs -> the matching tool on /you/bag
      { source: "/planner/dispersion", destination: "/you/bag?view=dispersion", permanent: false },
      { source: "/planner/compare", destination: "/you/bag?view=compare", permanent: false },
      { source: "/planner/custom", destination: "/you/bag?view=custom", permanent: false },
      { source: "/planner/tbox", destination: "/you/bag?view=tbox", permanent: false },
      // The original /simulator pages, which later became Course Planner sub-tabs
      { source: "/simulator", destination: "/you/bag?view=dispersion", permanent: false },
      { source: "/simulator/course", destination: "/planner", permanent: false },
      { source: "/simulator/:view(dispersion|compare|custom|tbox)", destination: "/you/bag?view=:view", permanent: false },
    ];
  },
};

export default nextConfig;
