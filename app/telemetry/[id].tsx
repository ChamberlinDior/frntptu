// app/telemetry/[id].tsx
/* ===CLE-MODIF-TELEMETRY-DETAIL-V5-GLASS-NEU-FR-FIX-COMPILE=== */

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "../../lib/api";
import type { TelemetrySnapshot } from "../../lib/types";

/* ==========================================================
   telemetry/[id].tsx — VERSION INTÉGRALE (PRO) + FIX COMPILATION
   ✅ 100% en français
   ✅ Neumorphism + Glassmorphism (premium, lisible, structuré)
   ✅ “ID .exe” => Nom de package (Application ID) (Android/iOS)
   ✅ Adresse: backend d’abord, sinon reverse geocode lat/lng (si permission)
   ✅ Un seul scroll
   ✅ Carte uniquement sur WEB (iframe OpenStreetMap)
   ✅ FIX: aucune balise JSX cassée / aucune expression tronquée
   ========================================================== */

const UI = {
  bg0: "#070A14",
  bg1: "#0A1020",
  bg2: "#0B1326",
  bg3: "#07101F",

  ink: "#F5F7FF",
  muted: "rgba(245,247,255,0.72)",
  muted2: "rgba(245,247,255,0.52)",
  faint: "rgba(245,247,255,0.32)",

  glass: "rgba(255,255,255,0.10)",
  glass2: "rgba(255,255,255,0.07)",
  stroke: "rgba(255,255,255,0.14)",
  stroke2: "rgba(255,255,255,0.10)",

  ok: "#2BE38B",
  warn: "#FFB020",
  bad: "#FF4D4D",
  info: "#6EA8FF",

  okBg: "rgba(43,227,139,0.12)",
  warnBg: "rgba(255,176,32,0.12)",
  badBg: "rgba(255,77,77,0.12)",
  infoBg: "rgba(110,168,255,0.12)",

  shadowA: "rgba(0,0,0,0.45)",
};

type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

function fmt(v?: any) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  return String(v);
}

function toDateLabel(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toneColors(tone: Tone) {
  if (tone === "ok") return { fg: UI.ok, bg: UI.okBg, bd: "rgba(43,227,139,0.25)" };
  if (tone === "warn") return { fg: UI.warn, bg: UI.warnBg, bd: "rgba(255,176,32,0.25)" };
  if (tone === "bad") return { fg: UI.bad, bg: UI.badBg, bd: "rgba(255,77,77,0.25)" };
  if (tone === "info") return { fg: UI.info, bg: UI.infoBg, bd: "rgba(110,168,255,0.25)" };
  return { fg: UI.ink, bg: "rgba(255,255,255,0.08)", bd: "rgba(255,255,255,0.14)" };
}

function batteryIcon(percent?: number | null, charging?: boolean | null) {
  if (charging) return "battery-charging-outline";
  if (percent === null || percent === undefined) return "battery-half-outline";
  if (percent <= 10) return "battery-dead-outline";
  if (percent <= 35) return "battery-half-outline";
  return "battery-full-outline";
}

function netIcon(net?: string | null) {
  const v = (net ?? "").toUpperCase();
  if (v.includes("WIFI")) return "wifi-outline";
  if (v.includes("ETH")) return "hardware-chip-outline";
  if (v.includes("4G") || v.includes("LTE") || v.includes("5G") || v.includes("3G") || v.includes("CELL"))
    return "cellular-outline";
  if (v.includes("NONE")) return "close-circle-outline";
  return "globe-outline";
}

function toneForBattery(p?: number | null) {
  if (p === null || p === undefined) return "info";
  if (p >= 50) return "ok";
  if (p >= 20) return "warn";
  return "bad";
}

function toneForSignal(s?: number | null | undefined) {
  if (s === null || s === undefined) return "info";
  if (s >= 3) return "ok";
  if (s === 2) return "warn";
  return "bad";
}

function toneForNetwork(net?: string | null) {
  const v = (net ?? "").toUpperCase();
  if (!v || v === "UNKNOWN") return "info";
  if (v.includes("NONE")) return "bad";
  if (v.includes("WIFI") || v.includes("ETH")) return "ok";
  return "info";
}

function toneForFreshness(capturedAt?: string | null, freshnessMin = 5) {
  if (!capturedAt) return "warn";
  const t = new Date(capturedAt).getTime();
  if (Number.isNaN(t)) return "warn";
  const diffMin = Math.abs(Date.now() - t) / 60000;
  if (diffMin <= freshnessMin) return "ok";
  if (diffMin <= freshnessMin * 3) return "warn";
  return "bad";
}

function openMaps(lat?: number | null, lng?: number | null, label?: string) {
  if (lat === null || lat === undefined) return;
  if (lng === null || lng === undefined) return;

  const q = encodeURIComponent(label ? `${label}` : `${lat},${lng}`);
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?q=${q}&ll=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  Linking.openURL(url).catch(() => {});
}

/* =========================
   BACKGROUND (premium)
   ========================= */

function SoftBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[UI.bg0, UI.bg1, UI.bg2, UI.bg3]} style={StyleSheet.absoluteFill} />
      <View style={[styles.halo, { top: -140, left: -140, width: 420, height: 420, opacity: 0.26 }]} />
      <View style={[styles.halo, { top: 90, right: -170, width: 480, height: 480, opacity: 0.20 }]} />
      <View style={[styles.halo, { bottom: -240, left: 60, width: 560, height: 560, opacity: 0.18 }]} />
      <View style={styles.grain} />
    </View>
  );
}

/* =========================
   GLASS COMPONENTS
   ========================= */

function GlassCard({
  children,
  style,
  strong,
}: {
  children: React.ReactNode;
  style?: any;
  strong?: boolean;
}) {
  return (
    <View style={[styles.glassOuter, style]}>
      <BlurView intensity={strong ? 28 : 18} tint="dark" style={styles.glassBlur}>
        <View style={[styles.glassInner, strong ? styles.glassInnerStrong : null]}>{children}</View>
      </BlurView>
    </View>
  );
}

function IconChip({ name, tone = "neutral" }: { name: any; tone?: Tone }) {
  const c = toneColors(tone);
  return (
    <View style={[styles.iconChip, { backgroundColor: c.bg, borderColor: c.bd }]}>
      <Ionicons name={name} size={16} color={c.fg} />
    </View>
  );
}

function StatusPill({
  tone,
  icon,
  label,
}: {
  tone: "ok" | "warn" | "bad" | "info";
  icon: any;
  label: string;
}) {
  const c = toneColors(tone);
  return (
    <View style={[styles.pill, { backgroundColor: c.bg, borderColor: c.bd }]}>
      <Ionicons name={icon} size={14} color={c.fg} style={{ marginRight: 8 }} />
      <Text style={[styles.pillText, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Divider({ tight }: { tight?: boolean }) {
  return <View style={[styles.divider, tight && { marginVertical: 10 }]} />;
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {sub ? <Text style={styles.sectionSub}>{sub}</Text> : null}
    </View>
  );
}

/* =========================
   Labels FR + icônes
   ========================= */

function labelFR(key: string) {
  const map: Record<string, { label: string; hint?: string; tone?: Tone }> = {
    id: { label: "Identifiant du relevé", hint: "ID unique du snapshot côté serveur.", tone: "info" },
    terminalId: { label: "Identifiant du terminal", hint: "Référence terminal dans ton système.", tone: "info" },
    capturedAt: { label: "Date/heure de capture", hint: "Moment d’envoi au backend.", tone: "neutral" },

    appPackageName: {
      label: "Nom de package (Application ID)",
      hint: "Équivalent “ID exécutable” sur Android.",
      tone: "info",
    },
    packageName: { label: "Nom de package (variante)", hint: "Si ton backend renvoie un champ alternatif.", tone: "neutral" },
    appBuildNumber: { label: "Numéro de build", hint: "Numéro de version compilée.", tone: "neutral" },
    agentVersion: { label: "Version de l’agent", hint: "Version de l’app/agent de télémétrie.", tone: "neutral" },
    osVersion: { label: "Version du système", hint: "Android/iOS sur l’appareil.", tone: "neutral" },

    batteryPercent: { label: "Batterie (%)", hint: "État batterie au moment du relevé.", tone: "neutral" },
    charging: { label: "En charge", hint: "Branché ou non.", tone: "neutral" },
    batteryTemp: { label: "Température batterie", hint: "Si disponible sur l’appareil.", tone: "neutral" },

    networkType: { label: "Type de réseau", hint: "Wi-Fi / Cellulaire / Ethernet / Aucun.", tone: "neutral" },
    signalLevel: { label: "Niveau de signal", hint: "0–4 selon appareils.", tone: "neutral" },
    ipAddress: { label: "Adresse IP", hint: "IP rapportée par l’appareil.", tone: "neutral" },
    wifiSsid: { label: "Nom Wi-Fi (SSID)", hint: "Nom du réseau Wi-Fi (si dispo).", tone: "neutral" },
    carrierName: { label: "Opérateur", hint: "Opérateur mobile (si dispo).", tone: "neutral" },
    simOperator: { label: "Opérateur SIM", hint: "Code opérateur SIM (si dispo).", tone: "neutral" },

    gpsLat: { label: "Latitude", hint: "Coordonnée GPS.", tone: "neutral" },
    gpsLng: { label: "Longitude", hint: "Coordonnée GPS.", tone: "neutral" },
    gpsAccuracy: { label: "Précision (m)", hint: "Plus petit = meilleure précision.", tone: "neutral" },
    gpsAddressLine: { label: "Adresse (backend)", hint: "Adresse déjà fournie par le serveur.", tone: "neutral" },
    gpsPostalCode: { label: "Code postal (backend)", hint: "Si fourni par le serveur.", tone: "neutral" },
    city: { label: "Ville (backend)", hint: "Si fourni par le serveur.", tone: "neutral" },
    region: { label: "Région/Province (backend)", hint: "Si fourni par le serveur.", tone: "neutral" },
    country: { label: "Pays (backend)", hint: "Si fourni par le serveur.", tone: "neutral" },

    storageFreeMb: { label: "Stockage libre (MB)", tone: "neutral" },
    storageTotalMb: { label: "Stockage total (MB)", tone: "neutral" },
    memFreeMb: { label: "Mémoire libre (MB)", tone: "neutral" },
    memTotalMb: { label: "Mémoire totale (MB)", tone: "neutral" },
    cpuCores: { label: "Cœurs CPU", tone: "neutral" },
    cpuUsagePercent: { label: "CPU (%)", tone: "neutral" },
    uptimeSec: { label: "Uptime (sec)", tone: "neutral" },

    lastCardScanAt: { label: "Dernier scan carte", hint: "Dernier passage carte/QR/RFID.", tone: "neutral" },
    scansCount24h: { label: "Scans (24h)", tone: "neutral" },
    transactionsCount24h: { label: "Transactions (24h)", tone: "neutral" },
  };

  return map[key] ?? { label: key, tone: "neutral" as Tone };
}

function keyIcon(k: string) {
  const map: Record<string, any> = {
    id: "pricetag-outline",
    terminalId: "terminal-outline",
    capturedAt: "time-outline",

    appPackageName: "apps-outline",
    packageName: "apps-outline",
    appBuildNumber: "git-branch-outline",
    agentVersion: "code-slash-outline",
    osVersion: "logo-android",

    batteryPercent: "battery-half-outline",
    charging: "flash-outline",
    batteryTemp: "thermometer-outline",

    networkType: "wifi-outline",
    signalLevel: "cellular-outline",
    ipAddress: "globe-outline",
    wifiSsid: "wifi-outline",
    carrierName: "radio-outline",
    simOperator: "card-outline",

    gpsLat: "navigate-outline",
    gpsLng: "navigate-outline",
    gpsAccuracy: "locate-outline",
    gpsAddressLine: "location-outline",
    gpsPostalCode: "mail-outline",
    city: "business-outline",
    region: "map-outline",
    country: "flag-outline",

    storageFreeMb: "server-outline",
    storageTotalMb: "server-outline",
    memFreeMb: "speedometer-outline",
    memTotalMb: "speedometer-outline",
    cpuCores: "hardware-chip-outline",
    cpuUsagePercent: "pulse-outline",
    uptimeSec: "time-outline",

    lastCardScanAt: "qr-code-outline",
    scansCount24h: "scan-outline",
    transactionsCount24h: "cash-outline",
  };
  return map[k] ?? "ellipse-outline";
}

function RowKV({
  k,
  v,
  tone,
  important,
}: {
  k: string;
  v: any;
  tone?: Tone;
  important?: boolean;
}) {
  const meta = labelFR(k);
  const t = tone ?? meta.tone ?? "neutral";
  const c = toneColors(t);

  return (
    <View style={styles.kvRow}>
      <View style={styles.kvLeft}>
        <View style={[styles.kvIcon, { backgroundColor: c.bg, borderColor: c.bd }]}>
          <Ionicons name={keyIcon(k)} size={16} color={c.fg} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.kLabel, important && { color: UI.ink }]} numberOfLines={1}>
            {meta.label}
          </Text>
          <Text style={styles.kKey} numberOfLines={1}>
            {k}
          </Text>
          {meta.hint ? (
            <Text style={styles.kHint} numberOfLines={2}>
              {meta.hint}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={[styles.v, important && { fontSize: 15 }]} numberOfLines={3}>
        {fmt(v)}
      </Text>
    </View>
  );
}

/* =========================
   Reverse geocode
   ========================= */

function formatAddressFromReverseGeo(first: any) {
  const line1 = [first?.name, first?.street, first?.district, first?.streetNumber].filter(Boolean).join(" ");
  const line2 = [first?.district, first?.city, first?.subregion, first?.region].filter(Boolean).join(", ");
  const line3 = [first?.postalCode, first?.country].filter(Boolean).join(" ");
  const full = [line1, line2, line3].filter(Boolean).join(" • ");

  return {
    addressLine: full || null,
    district: first?.district || null,
    city: first?.city || first?.subregion || null,
    region: first?.region || first?.subregion || null,
    country: first?.country || null,
    postalCode: first?.postalCode || null,
    isoCountryCode: first?.isoCountryCode || null,
  };
}

async function reverseGeocodeSafe(lat: number, lng: number) {
  try {
    const perm = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (perm && perm.status !== "granted") {
      return { blockedByPermission: true as const, data: null as any };
    }

    const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const first = res?.[0];
    if (!first) return { blockedByPermission: false as const, data: null as any };

    return { blockedByPermission: false as const, data: formatAddressFromReverseGeo(first) };
  } catch {
    return { blockedByPermission: false as const, data: null as any };
  }
}

/* =========================
   WEB MAP (OSM only)
   ========================= */

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

function bboxAround(lat: number, lng: number, delta: number) {
  const left = lng - delta;
  const right = lng + delta;
  const top = lat + delta;
  const bottom = lat - delta;
  return { left, right, top, bottom };
}

function buildOsmEmbedUrl(lat: number, lng: number) {
  const { left, right, top, bottom } = bboxAround(lat, lng, 0.01);
  const bbox = `${left}%2C${bottom}%2C${right}%2C${top}`;
  const marker = `${lat}%2C${lng}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
}

function openOsm(lat: number, lng: number) {
  const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  Linking.openURL(url).catch(() => {});
}

function WebMiniMap({ lat, lng, label }: { lat: number | null; lng: number | null; label?: string }) {
  const isWeb = Platform.OS === "web";
  if (!isWeb) return null;
  if (lat === null || lng === null) return null;

  const latR = round6(lat);
  const lngR = round6(lng);
  const src = buildOsmEmbedUrl(latR, lngR);

  return (
    <GlassCard style={{ marginTop: 10 }} strong>
      <View style={styles.webMapTopRow}>
        <IconChip name="map-outline" tone="info" />
        <View style={{ flex: 1 }}>
          <Text style={styles.webMapTitle} numberOfLines={1}>
            Carte (Web)
          </Text>
          <Text style={styles.webMapSub} numberOfLines={1}>
            {label && label !== "—" ? label : `${latR}, ${lngR}`}
          </Text>
        </View>

        <Pressable
          onPress={() => openOsm(latR, lngR)}
          style={({ pressed }) => [styles.webMapBtn, pressed && { transform: [{ scale: 0.99 }] }]}
        >
          <Ionicons name="open-outline" size={16} color={UI.ink} />
          <Text style={styles.webMapBtnText}>Ouvrir</Text>
        </Pressable>
      </View>

      <View style={styles.webMapFrame}>
        {/* @ts-ignore */}
        <iframe
          title="Carte Télémétrie"
          src={src}
          style={{ width: "100%", height: "100%", border: 0, borderRadius: 16, overflow: "hidden" }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <View pointerEvents="none" style={styles.webMapOverlay} />
      </View>

      <Text style={styles.webMapHint}>Source: OpenStreetMap • Visible uniquement sur Web</Text>
    </GlassCard>
  );
}

/* =========================
   SCREEN
   ========================= */

export default function TelemetryDetails() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = useMemo(() => Number(params.id), [params.id]);

  const freshnessMin = 5;

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<TelemetrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [computedAddr, setComputedAddr] = useState<{
    addressLine: string | null;
    district: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    postalCode: string | null;
    isoCountryCode: string | null;
  } | null>(null);

  const [geoBlocked, setGeoBlocked] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setComputedAddr(null);
      setGeoBlocked(false);

      const data = await api.get<TelemetrySnapshot>(`/api/telemetry/${id}`);
      setItem(data ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de charger ce relevé.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      if (!item) return;

      const anyItem: any = item as any;
      const lat = anyItem?.gpsLat as any;
      const lng = anyItem?.gpsLng as any;

      const hasBackendAddress =
        !!anyItem?.gpsAddressLine ||
        !!anyItem?.addressLine ||
        !!anyItem?.city ||
        !!anyItem?.region ||
        !!anyItem?.country ||
        !!anyItem?.gpsPostalCode;

      if (hasBackendAddress) return;
      if (lat === null || lat === undefined) return;
      if (lng === null || lng === undefined) return;

      const r = await reverseGeocodeSafe(Number(lat), Number(lng));
      if (r.blockedByPermission) {
        setGeoBlocked(true);
        return;
      }
      if (r.data) setComputedAddr(r.data);
    })();
  }, [item]);

  if (loading) {
    return (
      <View style={styles.page}>
        <SoftBackdrop />
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.centerText}>Chargement du relevé…</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.page}>
        <SoftBackdrop />
        <GlassCard style={{ margin: 14 }} strong>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <IconChip name="alert-circle-outline" tone="warn" />
            <Text style={styles.errTitle}>Erreur</Text>
          </View>
          <Text style={styles.errText}>{error}</Text>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="arrow-back-outline" size={16} color={UI.ink} />
              <Text style={styles.btnText}>Retour</Text>
            </Pressable>

            <Pressable
              onPress={load}
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="refresh" size={16} color={UI.ink} />
              <Text style={styles.btnText}>Réessayer</Text>
            </Pressable>
          </View>
        </GlassCard>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.page}>
        <SoftBackdrop />
        <GlassCard style={{ margin: 14 }} strong>
          <Text style={styles.errTitle}>Aucun relevé</Text>
          <Text style={styles.errText}>Le serveur ne renvoie pas de données pour cet identifiant.</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.btn, styles.btnPrimary, { marginTop: 12 }, pressed && { transform: [{ scale: 0.99 }] }]}
          >
            <Ionicons name="arrow-back-outline" size={16} color={UI.ink} />
            <Text style={styles.btnText}>Retour</Text>
          </Pressable>
        </GlassCard>
      </View>
    );
  }

  const anyItem: any = item as any;

  const battRaw = anyItem?.batteryPercent ?? null;
  const batt = battRaw === null || battRaw === undefined ? null : clamp(Number(battRaw), 0, 100);
  const battTone = toneForBattery(batt);

  const netTone = toneForNetwork(anyItem?.networkType ?? null);
  const sigTone = toneForSignal(anyItem?.signalLevel ?? null);
  const freshTone = toneForFreshness(anyItem?.capturedAt ?? null, freshnessMin);

  const freshLabel =
    freshTone === "ok"
      ? `Données récentes (≤ ${freshnessMin} min)`
      : freshTone === "warn"
      ? "Données assez récentes"
      : "Données anciennes";

  const packageId =
    fmt(anyItem?.appPackageName) !== "—"
      ? fmt(anyItem?.appPackageName)
      : fmt(anyItem?.packageName) !== "—"
      ? fmt(anyItem?.packageName)
      : "—";

  const addressFromBackend =
    [anyItem?.gpsAddressLine, anyItem?.addressLine, anyItem?.city, anyItem?.region, anyItem?.country]
      .filter(Boolean)
      .join(", ") || "";

  const addressFromComputed =
    [computedAddr?.addressLine, computedAddr?.district, computedAddr?.city, computedAddr?.region, computedAddr?.country]
      .filter(Boolean)
      .join(", ") || "";

  const finalAddress = addressFromBackend || addressFromComputed || "—";
  const addressSource =
    addressFromBackend
      ? "Serveur (backend)"
      : addressFromComputed
      ? "Estimé depuis GPS"
      : geoBlocked
      ? "Bloqué (permission GPS non accordée)"
      : "Non disponible";

  const latNum = anyItem?.gpsLat === null || anyItem?.gpsLat === undefined ? null : Number(anyItem.gpsLat);
  const lngNum = anyItem?.gpsLng === null || anyItem?.gpsLng === undefined ? null : Number(anyItem.gpsLng);

  return (
    <View style={styles.page}>
      <SoftBackdrop />

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
        {/* HERO */}
        <GlassCard strong>
          <View style={styles.heroTop}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
              <IconChip name="analytics-outline" tone="neutral" />
              <View style={{ flex: 1 }}>
                <Text style={styles.h1} numberOfLines={1}>
                  Télémétrie — Relevé #{fmt(anyItem?.id)}
                </Text>
                <Text style={styles.h2} numberOfLines={2}>
                  Terminal #{fmt(anyItem?.terminalId)} • {toDateLabel(anyItem?.capturedAt ?? null)}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.iconBtn, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="arrow-back-outline" size={18} color={UI.ink} />
            </Pressable>
          </View>

          <Divider />

          <View style={styles.pillsRow}>
            <StatusPill
              tone={freshTone === "ok" ? "ok" : freshTone === "warn" ? "warn" : "bad"}
              icon={freshTone === "ok" ? "checkmark-circle-outline" : "alert-circle-outline"}
              label={freshLabel}
            />
            <StatusPill
              tone={netTone === "ok" ? "ok" : netTone === "bad" ? "bad" : "info"}
              icon={netIcon(anyItem?.networkType ?? null)}
              label={`Réseau: ${fmt(anyItem?.networkType)}`}
            />
            <StatusPill
              tone={sigTone === "ok" ? "ok" : sigTone === "warn" ? "warn" : sigTone === "bad" ? "bad" : "info"}
              icon="cellular-outline"
              label={`Signal: ${fmt(anyItem?.signalLevel)}`}
            />
            <StatusPill
              tone={battTone as any}
              icon={batteryIcon(batt, anyItem?.charging ?? null)}
              label={`Batterie: ${batt === null ? "—" : `${batt}%`}`}
            />
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={load}
              style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="refresh" size={16} color={UI.ink} />
              <Text style={styles.btnText}>Actualiser</Text>
            </Pressable>

            <Pressable
              onPress={() => openMaps(latNum, lngNum, finalAddress !== "—" ? finalAddress : undefined)}
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="navigate-outline" size={16} color={UI.ink} />
              <Text style={styles.btnText}>Ouvrir Maps</Text>
            </Pressable>
          </View>
        </GlassCard>

        {/* ID EXÉCUTABLE */}
        <SectionTitle
          title="Identité de l’application (ID exécutable)"
          sub="Sur Android/iOS, il n’y a pas de “.exe”. L’identifiant équivalent est le nom de package (Application ID)."
        />

        <GlassCard style={{ marginTop: 10 }}>
          <RowKV k="appPackageName" v={anyItem?.appPackageName} tone={packageId === "—" ? "warn" : "info"} important />
          <RowKV k="packageName" v={anyItem?.packageName} />
          <RowKV k="appBuildNumber" v={anyItem?.appBuildNumber} />
          <RowKV k="agentVersion" v={anyItem?.agentVersion} />
          <RowKV k="osVersion" v={anyItem?.osVersion} />

          <Divider />

          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>Résumé “ID exécutable”</Text>
              <Text style={styles.summaryText} numberOfLines={4}>
                {packageId === "—"
                  ? "Le backend ne renvoie pas le nom de package pour ce relevé."
                  : `Nom de package: ${packageId}`}
                {"\n"}Build: {fmt(anyItem?.appBuildNumber)} • Agent: {fmt(anyItem?.agentVersion)}
              </Text>
            </View>
            <IconChip name="apps-outline" tone={packageId === "—" ? "warn" : "info"} />
          </View>
        </GlassCard>

        {/* LOCALISATION */}
        <SectionTitle
          title="Localisation"
          sub="Adresse prioritaire: backend. Sinon estimation depuis GPS (si permission accordée)."
        />

        <GlassCard style={{ marginTop: 10 }} strong>
          <View style={styles.addrTop}>
            <IconChip name="location-outline" tone={finalAddress === "—" ? "warn" : "info"} />
            <View style={{ flex: 1 }}>
              <Text style={styles.addrTitle}>Adresse détectée</Text>
              <Text style={styles.addrValue} numberOfLines={5}>
                {finalAddress}
              </Text>
              <Text style={styles.addrMeta} numberOfLines={2}>
                Source: {addressSource}
              </Text>
              {geoBlocked ? (
                <Text style={styles.addrWarn} numberOfLines={3}>
                  Permission GPS non accordée: l’adresse ne peut pas être calculée automatiquement sur ce terminal.
                </Text>
              ) : null}
            </View>
          </View>

          <Divider />

          <View style={styles.coordGrid}>
            <View style={styles.coordTile}>
              <Text style={styles.coordK}>Latitude</Text>
              <Text style={styles.coordV}>{fmt(anyItem?.gpsLat)}</Text>
            </View>
            <View style={styles.coordTile}>
              <Text style={styles.coordK}>Longitude</Text>
              <Text style={styles.coordV}>{fmt(anyItem?.gpsLng)}</Text>
            </View>
            <View style={styles.coordTile}>
              <Text style={styles.coordK}>Précision (m)</Text>
              <Text style={styles.coordV}>{fmt(anyItem?.gpsAccuracy)}</Text>
            </View>
          </View>
        </GlassCard>

        <WebMiniMap lat={latNum} lng={lngNum} label={finalAddress} />

        <GlassCard style={{ marginTop: 10 }}>
          <RowKV k="gpsAddressLine" v={anyItem?.gpsAddressLine} tone={anyItem?.gpsAddressLine ? "info" : "warn"} />
          <RowKV k="gpsPostalCode" v={anyItem?.gpsPostalCode} />
          <RowKV k="city" v={anyItem?.city} />
          <RowKV k="region" v={anyItem?.region} />
          <RowKV k="country" v={anyItem?.country} />
        </GlassCard>

        {/* BATTERIE */}
        <SectionTitle
          title="Batterie"
          sub="Lecture terrain: sous 20% = à surveiller (risque de coupure). En charge = plus stable."
        />

        <GlassCard style={{ marginTop: 10 }} strong>
          <View style={styles.bigLine}>
            <IconChip name={batteryIcon(batt, anyItem?.charging ?? null)} tone={battTone as any} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bigTitle}>{batt === null ? "—" : `${batt}%`}</Text>
              <Text style={styles.bigSub}>
                En charge: {fmt(anyItem?.charging)} • Température: {fmt(anyItem?.batteryTemp)}
              </Text>
            </View>
            <StatusPill
              tone={battTone as any}
              icon={battTone === "ok" ? "checkmark-circle-outline" : "alert-circle-outline"}
              label={battTone === "ok" ? "OK" : battTone === "warn" ? "À surveiller" : "Faible"}
            />
          </View>
        </GlassCard>

        <GlassCard style={{ marginTop: 10 }}>
          <RowKV k="batteryPercent" v={anyItem?.batteryPercent} tone={battTone as any} />
          <RowKV k="charging" v={anyItem?.charging} tone={anyItem?.charging ? "ok" : "warn"} />
          <RowKV k="batteryTemp" v={anyItem?.batteryTemp} />
        </GlassCard>

        {/* RÉSEAU */}
        <SectionTitle
          title="Réseau"
          sub="Wi-Fi/Ethernet = stable. Cellulaire = variable. Aucun = pas de connexion au moment du relevé."
        />

        <GlassCard style={{ marginTop: 10 }} strong>
          <View style={styles.bigLine}>
            <IconChip name={netIcon(anyItem?.networkType ?? null)} tone={netTone as any} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bigTitle}>{fmt(anyItem?.networkType)}</Text>
              <Text style={styles.bigSub}>
                Signal: {fmt(anyItem?.signalLevel)} • IP: {fmt(anyItem?.ipAddress)}
              </Text>
            </View>
            <StatusPill
              tone={netTone as any}
              icon={
                netTone === "ok"
                  ? "checkmark-circle-outline"
                  : netTone === "bad"
                  ? "alert-circle-outline"
                  : "information-circle-outline"
              }
              label={netTone === "ok" ? "Stable" : netTone === "bad" ? "Absent" : "Variable"}
            />
          </View>
        </GlassCard>

        <GlassCard style={{ marginTop: 10 }}>
          <RowKV k="networkType" v={anyItem?.networkType} tone={netTone as any} important />
          <RowKV k="signalLevel" v={anyItem?.signalLevel} tone={sigTone as any} />
          <RowKV k="ipAddress" v={anyItem?.ipAddress} />
          <RowKV k="wifiSsid" v={anyItem?.wifiSsid} />
          <RowKV k="carrierName" v={anyItem?.carrierName} />
          <RowKV k="simOperator" v={anyItem?.simOperator} />
        </GlassCard>

        {/* SYSTÈME */}
        <SectionTitle
          title="Système"
          sub="Stockage, mémoire, CPU, uptime. Utile pour diagnostiquer lenteurs, crashs et saturation."
        />

        <GlassCard style={{ marginTop: 10 }}>
          <RowKV k="storageFreeMb" v={anyItem?.storageFreeMb} />
          <RowKV k="storageTotalMb" v={anyItem?.storageTotalMb} />
          <RowKV k="memFreeMb" v={anyItem?.memFreeMb} />
          <RowKV k="memTotalMb" v={anyItem?.memTotalMb} />
          <RowKV k="cpuCores" v={anyItem?.cpuCores} />
          <RowKV k="cpuUsagePercent" v={anyItem?.cpuUsagePercent} />
          <RowKV k="uptimeSec" v={anyItem?.uptimeSec} />
        </GlassCard>

        {/* ACTIVITÉ */}
        <SectionTitle
          title="Activité"
          sub="Indicateurs métier: scans et transactions (si ton agent les remonte)."
        />

        <GlassCard style={{ marginTop: 10 }}>
          <RowKV k="lastCardScanAt" v={anyItem?.lastCardScanAt} />
          <RowKV k="scansCount24h" v={anyItem?.scansCount24h} />
          <RowKV k="transactionsCount24h" v={anyItem?.transactionsCount24h} />
        </GlassCard>

        <Text style={styles.footer}>
          Les données affichées proviennent du backend télémétrie. L’adresse est calculée uniquement si le serveur ne la
          fournit pas et si la permission GPS est accordée.
        </Text>
      </ScrollView>
    </View>
  );
}

/* =========================
   STYLES
   ========================= */

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: UI.bg0 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerText: { marginTop: 12, color: UI.muted, fontWeight: "900", fontSize: 14 },

  halo: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(110,168,255,0.16)",
  },
  grain: {
    position: "absolute",
    inset: 0,
    opacity: 0.12,
    backgroundColor: "transparent",
    ...(Platform.OS === "web"
      ? ({
          backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "6px 6px",
        } as any)
      : {}),
  },

  glassOuter: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: UI.stroke,
    overflow: "hidden",
    backgroundColor: UI.glass2,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: UI.shadowA,
          shadowOpacity: 0.35,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 14 },
        }
      : {}),
    ...(Platform.OS === "android" ? { elevation: 6 } : {}),
    ...(Platform.OS === "web" ? ({ boxShadow: "0 14px 30px rgba(0,0,0,0.35)" } as any) : {}),
  },
  glassBlur: { width: "100%" },
  glassInner: {
    padding: 14,
    backgroundColor: UI.glass,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: UI.stroke2,
  },
  glassInnerStrong: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  h1: { color: UI.ink, fontWeight: "900", fontSize: 18 },
  h2: { marginTop: 6, color: UI.muted, fontWeight: "900", fontSize: 13, lineHeight: 18 },

  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: UI.stroke2,
  },

  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.12)", marginVertical: 14 },

  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 340,
  },
  pillText: { fontWeight: "900", fontSize: 12 },

  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },

  btn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
  },
  btnPrimary: { backgroundColor: "rgba(110,168,255,0.18)", borderColor: "rgba(110,168,255,0.32)" },
  btnSecondary: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.16)" },
  btnText: { color: UI.ink, fontWeight: "900", fontSize: 13 },

  sectionTitle: { marginTop: 16, color: UI.ink, fontWeight: "900", fontSize: 16 },
  sectionSub: { marginTop: 8, color: UI.muted2, fontWeight: "800", fontSize: 12, lineHeight: 16 },

  kvRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  kvLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  kvIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  kLabel: { color: UI.muted, fontWeight: "900", fontSize: 13 },
  kKey: { marginTop: 3, color: UI.faint, fontWeight: "900", fontSize: 11 },
  kHint: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 11, lineHeight: 15 },
  v: { color: UI.ink, fontWeight: "900", textAlign: "right", fontSize: 14, maxWidth: "52%" },

  summaryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  summaryTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  summaryText: { marginTop: 8, color: UI.muted, fontWeight: "900", fontSize: 12, lineHeight: 16 },

  addrTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  addrTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  addrValue: { marginTop: 8, color: UI.ink, fontWeight: "900", fontSize: 13, lineHeight: 18 },
  addrMeta: { marginTop: 8, color: UI.muted2, fontWeight: "800", fontSize: 12 },
  addrWarn: { marginTop: 10, color: UI.warn, fontWeight: "900", fontSize: 12, lineHeight: 16 },

  coordGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  coordTile: {
    flexGrow: 1,
    minWidth: "30%",
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  coordK: { color: UI.muted2, fontWeight: "900", fontSize: 11 },
  coordV: { marginTop: 8, color: UI.ink, fontWeight: "900", fontSize: 13 },

  bigLine: { flexDirection: "row", alignItems: "center", gap: 12 },
  bigTitle: { color: UI.ink, fontWeight: "900", fontSize: 16 },
  bigSub: { marginTop: 6, color: UI.muted, fontWeight: "900", fontSize: 12, lineHeight: 16 },

  webMapTopRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  webMapTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  webMapSub: { marginTop: 2, color: UI.muted, fontWeight: "900", fontSize: 12 },
  webMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  webMapBtnText: { color: UI.ink, fontWeight: "900", fontSize: 12 },
  webMapFrame: {
    height: 190,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  webMapOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  webMapHint: { marginTop: 10, textAlign: "center", color: UI.muted2, fontWeight: "800", fontSize: 11 },

  errTitle: { color: UI.ink, fontWeight: "900", fontSize: 16 },
  errText: { marginTop: 10, color: UI.muted, fontWeight: "900", fontSize: 13, lineHeight: 18 },

  footer: {
    marginTop: 16,
    textAlign: "center",
    color: UI.muted2,
    fontWeight: "800",
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 10,
  },
});