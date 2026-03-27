/* =========================================
   lib/config.ts
   ✅ Base URL backend (local Wi-Fi / prod)
   ✅ Aligné avec ton nouveau réseau (ipconfig)
   ========================================= */

import Constants from "expo-constants";

/**
 * ✅ IP du PC Windows qui héberge Spring Boot (ton ipconfig)
 * IPv4 Address: 10.13.91.250
 * Port: 8080 (server.port=8080)
 */
const FALLBACK_LOCAL_WIFI = "http://10.226.7.250:8080";

/**
 * Priorité:
 * 1) app.json -> expo.extra.API_BASE_URL
 * 2) EXPO_PUBLIC_API_URL
 * 3) EXPO_PUBLIC_BACKEND_URL
 * 4) EXPO_PUBLIC_API_BASE_URL
 * 5) FALLBACK_LOCAL_WIFI
 */
export const API_BASE_URL =
  ((Constants.expoConfig?.extra as any)?.API_BASE_URL as string) ||
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  FALLBACK_LOCAL_WIFI;