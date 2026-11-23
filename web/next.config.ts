import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The image runs the self-contained server Next writes to .next/standalone (lurk's next.config.ts).
  output: "standalone",
  // The floating dev badge would cover page content in dev screenshots; the dev bar is the dev UI.
  devIndicators: false,
  // Hosts other than localhost the dev server is opened at; without them Next blocks its dev scripts there and the page never hydrates.
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ""),
};

export default nextConfig;
