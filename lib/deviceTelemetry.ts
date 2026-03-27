import * as Battery from "expo-battery";
import * as Device from "expo-device";
import * as Location from "expo-location";
import * as Network from "expo-network";

type NetworkType =
  | "WIFI"
  | "CELL_2G"
  | "CELL_3G"
  | "CELL_4G"
  | "CELL_5G"
  | "ETHERNET"
  | "NONE"
  | "UNKNOWN";

export type LocalTelemetry = {
  serialNumber: string;
  imei1?: string | null;
  imei2?: string | null;
  androidId?: string | null;

  model?: string | null;
  manufacturer?: string | null;

  city?: string | null;
  region?: string | null;
  country?: string | null;

  batteryPercent?: number | null;
  charging?: boolean | null;
  batteryTemp?: number | null;

  networkType?: NetworkType;
  signalLevel?: number | null;

  gpsLat?: number | null;
  gpsLng?: number | null;
  gpsAccuracy?: number | null;

  storageFreeMb?: number | null;
  uptimeSec?: number | null;

  osVersion?: string | null;
  agentVersion?: string | null;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function mapExpoNetworkToBackend(state: Network.NetworkState | null): NetworkType {
  if (!state || !state.isConnected) return "NONE";
  if (state.type === Network.NetworkStateType.WIFI) return "WIFI";
  if (state.type === Network.NetworkStateType.ETHERNET) return "ETHERNET";
  if (state.type === Network.NetworkStateType.CELLULAR) {
    // Expo ne donne pas précisément 2G/3G/4G/5G partout → on met CELL_4G par défaut si connecté
    return "CELL_4G";
  }
  return "UNKNOWN";
}

export async function requestPermissions(): Promise<string> {
  const loc = await Location.requestForegroundPermissionsAsync();
  return loc.status; // "granted" / "denied"
}

async function getNamedLocation() {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude, accuracy } = pos.coords;

    // Reverse geocode → nom ville/région/pays
    const res = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });

    const best = res?.[0];

    return {
      gpsLat: latitude,
      gpsLng: longitude,
      gpsAccuracy: accuracy ?? null,
      city: best?.city ?? best?.subregion ?? best?.district ?? null,
      region: best?.region ?? null,
      country: best?.country ?? null,
    };
  } catch {
    return null;
  }
}

async function getBattery() {
  try {
    const level = await Battery.getBatteryLevelAsync(); // 0..1
    const charging = await Battery.getBatteryStateAsync();
    const percent = clamp(Math.round(level * 100), 0, 100);

    return {
      batteryPercent: percent,
      charging: charging === Battery.BatteryState.CHARGING || charging === Battery.BatteryState.FULL,
      batteryTemp: null, // iOS ne donne pas facilement la temp batterie → null
    };
  } catch {
    return { batteryPercent: null, charging: null, batteryTemp: null };
  }
}

async function getNetwork() {
  try {
    const state = await Network.getNetworkStateAsync();
    return {
      networkType: mapExpoNetworkToBackend(state),
      signalLevel: null, // expo-network ne donne pas RSSI → null
    };
  } catch {
    return { networkType: "UNKNOWN" as NetworkType, signalLevel: null };
  }
}

export async function buildLocalTelemetry(): Promise<LocalTelemetry> {
  const serialNumber =
    (Device.osInternalBuildId ? String(Device.osInternalBuildId) : null) ||
    (Device.modelId ? String(Device.modelId) : null) ||
    `IOS-${Date.now()}`;

  const [loc, batt, net] = await Promise.all([
    getNamedLocation(),
    getBattery(),
    getNetwork(),
  ]);

  return {
    serialNumber,
    imei1: null,
    imei2: null,
    androidId: null,

    model: Device.modelName ?? null,
    manufacturer: Device.manufacturer ?? "APPLE",

    city: loc?.city ?? null,
    region: loc?.region ?? null,
    country: loc?.country ?? null,

    batteryPercent: batt.batteryPercent,
    charging: batt.charging,
    batteryTemp: batt.batteryTemp,

    networkType: net.networkType,
    signalLevel: net.signalLevel,

    gpsLat: loc?.gpsLat ?? null,
    gpsLng: loc?.gpsLng ?? null,
    gpsAccuracy: loc?.gpsAccuracy ?? null,

    storageFreeMb: null,
    uptimeSec: null,

    osVersion: Device.osVersion ?? null,
    agentVersion: "1.0.0",
  };
}
