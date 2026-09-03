import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a phone on the same router load the dev server at http://192.168.0.11:3001.
  // Without this, Next 16 blocks the HMR websocket and the error overlay, because
  // their Origin header is the LAN IP rather than localhost. Dev-only setting.
  // The address is DHCP-assigned, so re-check it if the router reassigns.
  allowedDevOrigins: ["192.168.0.11"],
};

export default nextConfig;
