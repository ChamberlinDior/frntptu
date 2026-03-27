/* =========================================
   lib/types.ts
   ✅ Types alignés 1:1 avec le backend Spring (tpe-monitoring)
   ✅ Support TPE + Téléphone (deviceType)
   ✅ Nom terminal (displayName)
   ✅ Clé stable (deviceKey) + serialNumber
   ========================================= */

export type DeviceStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "LOST";

export type DeviceType = "TPE" | "PHONE" | "UNKNOWN";

export type NetworkType =
  | "WIFI"
  | "CELL_2G"
  | "CELL_3G"
  | "CELL_4G"
  | "CELL_5G"
  | "ETHERNET"
  | "NONE"
  | "UNKNOWN";

/** Forme possible d'erreur renvoyée par un backend Spring */
export type ApiErrorShape = {
  timestamp?: string;
  status?: number;
  error?: string;
  errorCode?: string;
  message?: string;
  path?: string;
  requestId?: string | null;
  correlationId?: string | null;
  details?: any;
};

/**
 * ✅ DTO: GET /api/terminals
 * Aligné avec TerminalSummaryResponse (backend) + champs ajoutés (displayName/deviceType/deviceKey).
 *
 * NOTE:
 * - online/secondsSinceLastSeen sont calculés côté backend.
 * - lastBatteryPercent/lastNetworkType/cardReadsSinceBoot/transactionsSinceBoot viennent du dernier snapshot.
 */
export type TerminalSummary = {
  id: number;

  // identité
  serialNumber: string;
  deviceKey?: string | null;
  displayName?: string | null;
  deviceType?: DeviceType | null;

  // inventory (terminal)
  model?: string | null;
  city?: string | null;
  lastSeenAt?: string | null;

  // telemetry (latest)
  lastBatteryPercent?: number | null;
  lastNetworkType?: NetworkType | string | null;

  // status online/offline
  online: boolean;
  secondsSinceLastSeen?: number | null;

  // adresse humaine
  addressLine?: string | null;
  country?: string | null;

  // compteurs
  cardReadsSinceBoot?: number | null;
  transactionsSinceBoot?: number | null;
};

/**
 * ✅ Entity Terminal (GET /api/terminals/{id})
 * Aligne les champs visibles du Terminal.java + champs ajoutés (displayName/deviceType/deviceKey).
 */
export type Terminal = {
  id: number;

  // identité
  serialNumber: string;
  deviceKey?: string | null;
  displayName?: string | null;
  deviceType?: DeviceType | null;

  imei1?: string | null;
  imei2?: string | null;
  androidId?: string | null;

  model?: string | null;
  manufacturer?: string | null;
  brand?: string | null;

  status?: DeviceStatus | null;

  // adresse (dérivée télémétrie)
  lastAddressLine?: string | null;
  lastDistrict?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  lastGpsLat?: number | null;
  lastGpsLng?: number | null;

  // org / métier
  agency?: string | null;
  merchant?: string | null;

  // versions
  osVersion?: string | null;
  sdkInt?: number | null;
  agentVersion?: string | null;
  appPackage?: string | null;
  appVersionName?: string | null;
  appVersionCode?: string | null;

  createdAt?: string | null;
  updatedAt?: string | null;
  lastSeenAt?: string | null;
};

/**
 * ✅ Entity TelemetrySnapshot (GET /api/telemetry, /api/telemetry/{id}, /api/telemetry/terminal/{terminalId})
 * Alignée avec TelemetrySnapshot.java (backend).
 */
export type TelemetrySnapshot = {
  id: number;
  terminalId: number;
  capturedAt: string;

  // =========================
  // Batterie
  // =========================
  batteryPercent?: number | null;
  charging?: boolean | null;
  batteryTemp?: number | null;
  batteryVoltageMv?: number | null;
  batteryHealth?: string | null;
  chargePlug?: string | null;

  // =========================
  // Réseau
  // =========================
  networkType?: NetworkType | null;
  signalLevel?: number | null;

  ipAddress?: string | null;
  publicIp?: string | null;

  carrierName?: string | null;
  carrierMccMnc?: string | null;
  roaming?: boolean | null;

  simOperatorName?: string | null;
  simCountryIso?: string | null;

  wifiSsid?: string | null;
  wifiBssid?: string | null;
  wifiRssi?: number | null;
  wifiLinkSpeedMbps?: number | null;

  // =========================
  // GPS + Adresse
  // =========================
  gpsLat?: number | null;
  gpsLng?: number | null;
  gpsAccuracy?: number | null;

  gpsAltMeters?: number | null;
  gpsSpeedMps?: number | null;
  gpsBearingDeg?: number | null;
  gpsProvider?: string | null;

  placeName?: string | null;
  addressLine?: string | null;
  district?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;

  // =========================
  // Système / device
  // =========================
  storageFreeMb?: number | null;
  storageTotalMb?: number | null;
  ramAvailMb?: number | null;
  ramTotalMb?: number | null;

  uptimeSec?: number | null;

  powerSaveMode?: boolean | null;
  deviceInteractive?: boolean | null;
  screenOn?: boolean | null;

  cpuCores?: number | null;
  cpuUsagePct?: number | null;
  deviceTempC?: number | null;

  // =========================
  // Versions
  // =========================
  osVersion?: string | null;
  sdkInt?: number | null;
  agentVersion?: string | null;

  appPackage?: string | null;
  appVersionName?: string | null;
  appVersionCode?: string | null;

  // =========================
  // Identité hardware
  // =========================
  manufacturer?: string | null;
  model?: string | null;
  brand?: string | null;
  device?: string | null;
  product?: string | null;
  hardware?: string | null;
  board?: string | null;

  // =========================
  // Compteurs métier
  // =========================
  cardReadsSinceBoot?: number | null;
  transactionsSinceBoot?: number | null;
  errorsSinceBoot?: number | null;
  lastCardReadAt?: string | null;
  lastTransactionAt?: string | null;

  // =========================
  // Extensibilité
  // =========================
  extraJson?: string | null;
};

/**
 * ✅ Payload officiel du backend: POST /api/telemetry/push
 * Aligné avec TelemetryPushRequest.java.
 *
 * IMPORTANT:
 * - serialNumber obligatoire
 * - si tests téléphone: androidId + imei1 => deviceKey stable côté backend
 */
export type TelemetryPushRequest = {
  // =========================
  // Identité minimale
  // =========================
  serialNumber: string;

  imei1?: string | null;
  imei2?: string | null;
  androidId?: string | null;

  // Device identity
  manufacturer?: string | null;
  model?: string | null;
  brand?: string | null;

  device?: string | null;
  product?: string | null;
  hardware?: string | null;
  board?: string | null;

  // =========================
  // Batterie
  // =========================
  batteryPercent?: number | null;
  charging?: boolean | null;
  batteryTemp?: number | null;

  batteryVoltageMv?: number | null;
  batteryHealth?: string | null;
  chargePlug?: string | null;

  // =========================
  // Réseau
  // =========================
  networkType?: NetworkType | null;
  signalLevel?: number | null;

  ipAddress?: string | null;
  publicIp?: string | null;

  carrierName?: string | null;
  carrierMccMnc?: string | null;
  roaming?: boolean | null;

  simOperatorName?: string | null;
  simCountryIso?: string | null;

  wifiSsid?: string | null;
  wifiBssid?: string | null;
  wifiRssi?: number | null;
  wifiLinkSpeedMbps?: number | null;

  // =========================
  // GPS
  // =========================
  gpsLat?: number | null;
  gpsLng?: number | null;
  gpsAccuracy?: number | null;

  gpsAltMeters?: number | null;
  gpsSpeedMps?: number | null;
  gpsBearingDeg?: number | null;
  gpsProvider?: string | null;

  // =========================
  // Adresse
  // =========================
  placeName?: string | null;
  addressLine?: string | null;
  district?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;

  // =========================
  // Système
  // =========================
  storageFreeMb?: number | null;
  storageTotalMb?: number | null;
  ramAvailMb?: number | null;
  ramTotalMb?: number | null;

  uptimeSec?: number | null;

  powerSaveMode?: boolean | null;
  deviceInteractive?: boolean | null;
  screenOn?: boolean | null;

  cpuCores?: number | null;
  cpuUsagePct?: number | null;
  deviceTempC?: number | null;

  // =========================
  // Versions
  // =========================
  osVersion?: string | null;
  sdkInt?: number | null;

  agentVersion?: string | null;

  appPackage?: string | null;
  appVersionName?: string | null;
  appVersionCode?: string | null;

  // =========================
  // Compteurs
  // =========================
  cardReadsSinceBoot?: number | null;
  transactionsSinceBoot?: number | null;
  errorsSinceBoot?: number | null;

  lastCardReadAtIso?: string | null;
  lastTransactionAtIso?: string | null;

  // Extensibilité
  extraJson?: string | null;
};

/**
 * ✅ DTO: POST /api/terminals/register
 * (aligné avec le backend modifié: enregistrement idempotent + deviceKey stable)
 */
export type TerminalRegisterRequest = {
  serialNumber: string;
  androidId?: string | null;
  imei1?: string | null;
  imei2?: string | null;

  manufacturer?: string | null;
  model?: string | null;
  brand?: string | null;

  deviceType?: DeviceType | null;
  displayName?: string | null;

  agentVersion?: string | null;
  appPackage?: string | null;
  appVersionName?: string | null;
  appVersionCode?: string | null;
};

export type TerminalRegisterResponse = {
  id: number;
  serialNumber: string;
  deviceKey?: string | null;
  displayName?: string | null;
  deviceType?: DeviceType | null;
  created: boolean; // true si nouveau, false si déjà existant (idempotent)
};

/**
 * ✅ DTO: PATCH /api/terminals/{id}/name
 */
export type TerminalRenameRequest = {
  displayName: string;
};

export type TerminalRenameResponse = Terminal;