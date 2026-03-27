// app/(tabs)/index.tsx
/* ===CLE-MODIF-TPE-MONITORING-HOME-V3-DEDUP-STABLE-DEVICE-KEY-ANTI-IOS-TIMESTAMP=== */

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { telemetryApi, terminalsApi } from "../../lib/api";
import { buildLocalTelemetry, requestPermissions } from "../../lib/deviceTelemetry";
import type { LocalTelemetry, TerminalSummary } from "../../lib/types";

/* ==========================================================
   OBJECTIF (BANQUE / NON TECH)
   - Écran clair, lisible, rassurant
   - 3 blocs: Vue d’ensemble / Liste / Actions simples
   - Design glass + neumorphisme (premium, aligné)
   - Pas de jargon: "En service", "À vérifier", "Dernier signal"
   - Barre du bas sombre (icônes inertes) + navigation simple
   ========================================================== */

const UI = {
  bgTop: "#0B1020",
  bgMid: "#0B1225",
  bgBot: "#070B16",

  card: "rgba(255,255,255,0.10)",
  card2: "rgba(255,255,255,0.08)",
  stroke: "rgba(255,255,255,0.14)",
  stroke2: "rgba(255,255,255,0.10)",

  ink: "#F3F6FF",
  muted: "rgba(243,246,255,0.70)",
  muted2: "rgba(243,246,255,0.52)",
  faint: "rgba(243,246,255,0.35)",

  ok: "#2BE38B",
  warn: "#FFB020",
  bad: "#FF4D4D",
  info: "#6EA8FF",

  okBg: "rgba(43,227,139,0.12)",
  warnBg: "rgba(255,176,32,0.12)",
  badBg: "rgba(255,77,77,0.12)",
  infoBg: "rgba(110,168,255,0.12)",

  black: "#0B1020",
};

function fmt(v?: any) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

function batteryIcon(percent?: number | null, charging?: boolean | null) {
  if (charging) return "battery-charging-outline";
  if (percent === null || percent === undefined) return "battery-half-outline";
  if (percent <= 10) return "battery-dead-outline";
  if (percent <= 35) return "battery-half-outline";
  return "battery-full-outline";
}

function toneForBattery(percent?: number | null) {
  if (percent === null || percent === undefined) return "info";
  if (percent >= 50) return "ok";
  if (percent >= 20) return "warn";
  return "bad";
}

async function reverseGeocode(lat: number, lng: number) {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const first = res?.[0];
    if (!first) return null;
    const addressLine = [first.name, first.street, first.city, first.region, first.country]
      .filter(Boolean)
      .join(", ");
    return addressLine || null;
  } catch {
    return null;
  }
}

/**
 * ✅ DÉ-DUP ROBUSTE
 * Problème réel: certains backends créent un nouvel enregistrement à chaque "push"
 * et renvoient un "serialNumber" de type IOS-<timestamp> => change à chaque sync.
 *
 * Solution UI: ignorer ces "serialNumber" éphémères et préférer une clé stable
 * si disponible (deviceKey / deviceUid / hardwareId / iosIdfv / androidId).
 *
 * IMPORTANT BACKEND (recommandé):
 * - Faire un UPSERT sur deviceKey côté serveur (sinon la BDD gonfle).
 */

function normalizeKey(s: string) {
  return s.trim().toLowerCase();
}

function isEphemeralSerial(sn?: any) {
  if (!sn) return true;
  const s = String(sn).trim();
  if (!s) return true;

  // pattern typique: IOS-1772234332316 (timestamp / id non stable)
  if (/^IOS-\d{10,}$/.test(s)) return true;

  // autres IDs trop "génériques" qu’on préfère éviter comme clé primaire
  if (s.toLowerCase() === "unknown" || s === "—") return true;

  return false;
}

function safeText(v?: any) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}

function computeDeviceKey(t: TerminalSummary) {
  const anyT: any = t as any;

  // 1) Priorité ABSOLUE: identifiant stable fourni par backend
  const stable =
    anyT.deviceKey ??
    anyT.deviceUid ??
    anyT.hardwareId ??
    anyT.iosIdfv ??
    anyT.androidId ??
    anyT.installId ??
    anyT.uniqueDeviceId;

  if (stable && safeText(stable)) return `k:${normalizeKey(String(stable))}`;

  // 2) SerialNumber uniquement si PAS éphémère
  const sn = anyT.serialNumber ?? t.serialNumber;
  if (sn && safeText(sn) && !isEphemeralSerial(sn)) return `sn:${normalizeKey(String(sn))}`;

  // 3) Sinon: empreinte “soft” (peut fusionner plusieurs iPhones identiques,
  // mais c’est mieux que 300 entrées du même iPhone dans le tableau)
  const displayName = safeText(anyT.displayName);
  const model = safeText(anyT.model || anyT.deviceModel || anyT.deviceName || "ios-device");
  const osName = safeText(anyT.osName || anyT.platform || Platform.OS);
  const osVer = safeText(anyT.osVersion || anyT.systemVersion || "");
  const city = safeText(anyT.city || "");
  const vendor = safeText(anyT.vendor || "unknown-vendor");

  const soft = `${vendor}|${osName}|${osVer}|${model}|${displayName}|${city}`;
  return `fp:${normalizeKey(soft)}`;
}

type TerminalGroup = {
  key: string;
  primary: TerminalSummary;
  items: TerminalSummary[];
  hasMulti: boolean;
};

function groupTerminals(terminals: TerminalSummary[]) {
  const map = new Map<string, TerminalSummary[]>();
  for (const t of terminals) {
    const k = computeDeviceKey(t);
    const arr = map.get(k) ?? [];
    arr.push(t);
    map.set(k, arr);
  }

  const groups: TerminalGroup[] = [];
  for (const [key, items] of map.entries()) {
    const sorted = [...items].sort((a, b) => {
      const ta = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const tb = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });
    const primary = sorted[0] ?? items[0];
    groups.push({ key, primary, items: sorted, hasMulti: sorted.length > 1 });
  }

  groups.sort((ga, gb) => {
    const ta = ga.primary?.lastSeenAt ? new Date(ga.primary.lastSeenAt).getTime() : 0;
    const tb = gb.primary?.lastSeenAt ? new Date(gb.primary.lastSeenAt).getTime() : 0;
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });

  return groups;
}

/* =========================
   UI: Glass surfaces
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
      <BlurView intensity={strong ? 26 : 18} tint="dark" style={styles.glassBlur}>
        <View style={[styles.glassInner, strong ? styles.glassInnerStrong : null]}>{children}</View>
      </BlurView>
    </View>
  );
}

function IconChip({
  name,
  tone,
}: {
  name: any;
  tone: "ok" | "warn" | "bad" | "info" | "neutral";
}) {
  const bg =
    tone === "ok"
      ? UI.okBg
      : tone === "warn"
      ? UI.warnBg
      : tone === "bad"
      ? UI.badBg
      : tone === "info"
      ? UI.infoBg
      : "rgba(255,255,255,0.08)";

  const bd =
    tone === "ok"
      ? "rgba(43,227,139,0.22)"
      : tone === "warn"
      ? "rgba(255,176,32,0.22)"
      : tone === "bad"
      ? "rgba(255,77,77,0.22)"
      : tone === "info"
      ? "rgba(110,168,255,0.22)"
      : "rgba(255,255,255,0.14)";

  const fg =
    tone === "ok"
      ? UI.ok
      : tone === "warn"
      ? UI.warn
      : tone === "bad"
      ? UI.bad
      : tone === "info"
      ? UI.info
      : UI.ink;

  return (
    <View style={[styles.iconChip, { backgroundColor: bg, borderColor: bd }]}>
      <Ionicons name={name} size={16} color={fg} />
    </View>
  );
}

function StatusPill({ tone, label, icon }: { tone: "ok" | "warn" | "bad" | "info"; label: string; icon: any }) {
  const bg = tone === "ok" ? UI.okBg : tone === "warn" ? UI.warnBg : tone === "bad" ? UI.badBg : UI.infoBg;
  const bd =
    tone === "ok"
      ? "rgba(43,227,139,0.25)"
      : tone === "warn"
      ? "rgba(255,176,32,0.25)"
      : tone === "bad"
      ? "rgba(255,77,77,0.25)"
      : "rgba(110,168,255,0.25)";
  const fg = tone === "ok" ? UI.ok : tone === "warn" ? UI.warn : tone === "bad" ? UI.bad : UI.info;

  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: bd }]}>
      <Ionicons name={icon} size={14} color={fg} style={{ marginRight: 8 }} />
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function SoftBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[UI.bgTop, UI.bgMid, UI.bgBot]} style={StyleSheet.absoluteFill} />
      <View style={[styles.halo, { top: -120, left: -120, width: 360, height: 360, opacity: 0.32 }]} />
      <View style={[styles.halo, { top: 140, right: -160, width: 420, height: 420, opacity: 0.26 }]} />
      <View style={[styles.halo, { bottom: -200, left: 80, width: 520, height: 520, opacity: 0.22 }]} />
      <View style={styles.grain} />
    </View>
  );
}

/* =========================
   Screen
   ========================= */

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 520;

  const onlineCutoffMin = 5;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [terminals, setTerminals] = useState<TerminalSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [permInfo, setPermInfo] = useState<string>("—");
  const [localTel, setLocalTel] = useState<LocalTelemetry | null>(null);
  const [computedLocalAddress, setComputedLocalAddress] = useState<string | null>(null);

  const [syncState, setSyncState] = useState<"idle" | "syncing" | "ok" | "err">("idle");
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("—");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyGroup, setHistoryGroup] = useState<TerminalGroup | null>(null);

  const timerRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await terminalsApi.list();
      setTerminals(data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de charger la liste.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const syncOnce = useCallback(async () => {
    try {
      setSyncErr(null);
      setSyncState("syncing");

      // local telemetry (doit contenir une clé stable côté deviceTelemetry.ts)
      const tel = await buildLocalTelemetry();
      setLocalTel(tel);

      // push backend
      await telemetryApi.push(tel);

      setSyncState("ok");
      setLastUpdate(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));

      await load();
    } catch (e: any) {
      setSyncState("err");
      setSyncErr(e?.message ?? "La mise à jour a échoué.");
      await load().catch(() => null);
    }
  }, [load]);

  useEffect(() => {
    (async () => {
      const s = await requestPermissions().catch(() => "unknown");
      setPermInfo(String(s));

      // 1) premier sync (push + reload)
      await syncOnce();

      // 2) auto refresh
      timerRef.current = setInterval(syncOnce, 15000);
    })();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [syncOnce]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // Adresse simple: si déjà connue par champs, sinon reverse geocode
  useEffect(() => {
    (async () => {
      const fromFields = [localTel?.gpsAddressLine, localTel?.city, localTel?.region, localTel?.country]
        .filter(Boolean)
        .join(", ");

      if (fromFields) {
        setComputedLocalAddress(null);
        return;
      }

      const lat = localTel?.gpsLat;
      const lng = localTel?.gpsLng;
      if (lat === null || lat === undefined) return;
      if (lng === null || lng === undefined) return;

      const addr = await reverseGeocode(lat, lng);
      setComputedLocalAddress(addr);
    })();
  }, [localTel?.gpsLat, localTel?.gpsLng, localTel?.gpsAddressLine, localTel?.city, localTel?.region, localTel?.country]);

  const placeLabel = useMemo(() => {
    const fromFields = [localTel?.gpsAddressLine, localTel?.city, localTel?.region, localTel?.country]
      .filter(Boolean)
      .join(", ");
    return fromFields || computedLocalAddress || "—";
  }, [localTel?.gpsAddressLine, localTel?.city, localTel?.region, localTel?.country, computedLocalAddress]);

  const grouped = useMemo(() => groupTerminals(terminals), [terminals]);

  const stats = useMemo(() => {
    const total = grouped.length;

    const online = grouped.filter((g) => {
      const last = g.primary?.lastSeenAt;
      if (!last) return false;
      const t = new Date(last).getTime();
      if (Number.isNaN(t)) return false;
      const diffMin = Math.abs(Date.now() - t) / 60000;
      return diffMin <= onlineCutoffMin;
    }).length;

    return {
      total,
      online,
      offline: Math.max(0, total - online),
    };
  }, [grouped]);

  const syncTone: "ok" | "warn" | "bad" | "info" =
    syncState === "ok" ? "ok" : syncState === "err" ? "bad" : syncState === "syncing" ? "warn" : "info";

  const openHistory = (g: TerminalGroup) => {
    setHistoryGroup(g);
    setHistoryOpen(true);
  };

  const header = (
    <View>
      <GlassCard strong style={{ marginBottom: 12 }}>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Tableau de bord — Terminaux & disponibilité</Text>
            <Text style={styles.heroSub}>
              Vue simple et claire pour superviser l’état des appareils (TPE / mobiles) en temps réel.
            </Text>

            <View style={styles.heroMetaRow}>
              <StatusPill
                tone={syncTone}
                icon={
                  syncState === "syncing"
                    ? "sync-outline"
                    : syncState === "ok"
                    ? "checkmark-circle-outline"
                    : syncState === "err"
                    ? "alert-circle-outline"
                    : "information-circle-outline"
                }
                label={
                  syncState === "syncing"
                    ? "Mise à jour en cours"
                    : syncState === "ok"
                    ? `Dernière mise à jour: ${lastUpdate}`
                    : syncState === "err"
                    ? "Mise à jour impossible"
                    : "Mise à jour non démarrée"
                }
              />
              <StatusPill tone="info" icon="time-outline" label={`Signal “En service”: ≤ ${onlineCutoffMin} min`} />
            </View>
          </View>

          <View style={styles.heroActions}>
            <Pressable
              onPress={syncOnce}
              style={({ pressed }) => [styles.primaryBtn, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="refresh" size={16} color={UI.ink} />
              <Text style={styles.primaryBtnText}>Actualiser</Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/telemetry")}
              style={({ pressed }) => [styles.secondaryBtn, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="pulse-outline" size={16} color={UI.ink} />
              <Text style={styles.secondaryBtnText}>Voir la télémétrie</Text>
            </Pressable>
          </View>
        </View>

        {syncErr ? (
          <View style={styles.warnBox}>
            <Ionicons name="alert-circle-outline" size={16} color={UI.bad} />
            <Text style={styles.warnText}>{syncErr}</Text>
          </View>
        ) : null}
      </GlassCard>

      <View style={styles.kpiRow}>
        <GlassCard style={styles.kpiCard}>
          <View style={styles.kpiTop}>
            <IconChip name="server-outline" tone="info" />
            <Text style={styles.kpiLabel}>Appareils suivis</Text>
          </View>
          <Text style={styles.kpiValue}>{fmt(stats.total)}</Text>
          <Text style={styles.kpiFoot}>Nombre d’appareils uniques</Text>
        </GlassCard>

        <GlassCard style={styles.kpiCard}>
          <View style={styles.kpiTop}>
            <IconChip name="checkmark-circle-outline" tone="ok" />
            <Text style={styles.kpiLabel}>En service</Text>
          </View>
          <Text style={styles.kpiValue}>{fmt(stats.online)}</Text>
          <Text style={styles.kpiFoot}>Dernier signal récent</Text>
        </GlassCard>

        <GlassCard style={styles.kpiCard}>
          <View style={styles.kpiTop}>
            <IconChip name="alert-circle-outline" tone="warn" />
            <Text style={styles.kpiLabel}>À vérifier</Text>
          </View>
          <Text style={styles.kpiValue}>{fmt(stats.offline)}</Text>
          <Text style={styles.kpiFoot}>Signal absent / ancien</Text>
        </GlassCard>
      </View>

      <GlassCard style={{ marginTop: 12 }}>
        <View style={styles.localRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
            <IconChip name="navigate-outline" tone="neutral" />
            <View style={{ flex: 1 }}>
              <Text style={styles.localTitle}>Ce poste (application)</Text>
              <Text style={styles.localSub} numberOfLines={2}>
                Adresse estimée: {placeLabel}
              </Text>
              <Text style={styles.localSub} numberOfLines={1}>
                Autorisation localisation: {permInfo}
              </Text>
            </View>
          </View>

          <View style={[styles.localRight, isMobile && { alignItems: "flex-start" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <IconChip
                name={batteryIcon(localTel?.batteryPercent ?? null, localTel?.charging)}
                tone={toneForBattery(localTel?.batteryPercent ?? null) as any}
              />
              <Text style={styles.localRightText}>
                Batterie:{" "}
                {localTel?.batteryPercent === null || localTel?.batteryPercent === undefined
                  ? "—"
                  : `${clamp(localTel.batteryPercent, 0, 100)}%`}
              </Text>
            </View>
            <Text style={styles.localSub} numberOfLines={1}>
              Réseau: {fmt(localTel?.networkType)}
            </Text>
          </View>
        </View>
      </GlassCard>

      <View style={styles.sectionHead}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <IconChip name="list-outline" tone="neutral" />
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Liste des appareils</Text>
            <Text style={styles.sectionSub}>
              Appuyez sur une ligne pour ouvrir la fiche de l’appareil. (Simple, sans détails techniques)
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <StatusPill tone="info" icon="server-outline" label={`Total: ${fmt(grouped.length)}`} />
        </View>
      </View>

      {!isMobile ? (
        <GlassCard style={{ marginTop: 8 }}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, { flex: 1.2 }]}>Nom / Numéro</Text>
            <Text style={[styles.th, { flex: 0.9 }]}>Ville</Text>
            <Text style={[styles.th, { flex: 0.9, textAlign: "right" }]}>État</Text>
            <Text style={[styles.th, { flex: 1.1, textAlign: "right" }]}>Dernier signal</Text>
          </View>
        </GlassCard>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.page}>
        <SoftBackdrop />
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.centerText}>Chargement du tableau de bord…</Text>
        </View>
        <BottomBar active="home" />
      </View>
    );
  }

  const Content = (
    <FlatList
      data={grouped}
      keyExtractor={(g) => g.key}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.ink} />}
      ListHeaderComponent={header}
      contentContainerStyle={{ padding: 14, paddingBottom: 110 }}
      renderItem={({ item: g }) => {
        const t = g.primary;

        const statusTone: "ok" | "warn" | "bad" =
          !t.lastSeenAt
            ? "warn"
            : (() => {
                const ts = new Date(t.lastSeenAt).getTime();
                if (Number.isNaN(ts)) return "warn";
                const diffMin = Math.abs(Date.now() - ts) / 60000;
                return diffMin <= onlineCutoffMin ? "ok" : "bad";
              })();

        const statusLabel = statusTone === "ok" ? "En service" : statusTone === "bad" ? "À vérifier" : "Inconnu";
        const lastSeenLabel = toDateLabel(t.lastSeenAt ?? null);

        const battLabel =
          t.lastBatteryPercent === null || t.lastBatteryPercent === undefined ? "—" : `${t.lastBatteryPercent}%`;

        const anyT: any = t as any;
        const title = anyT.displayName || (isEphemeralSerial(anyT.serialNumber) ? "" : anyT.serialNumber) || "—";
        const city = t.city || "—";

        if (isMobile) {
          return (
            <GlassCard style={{ marginTop: 12 }}>
              <Pressable
                onPress={() => router.push({ pathname: "/terminal/[id]", params: { id: String((t as any).id) } })}
                style={({ pressed }) => [styles.mobilePress, pressed && { transform: [{ scale: 0.995 }] }]}
              >
                <View style={styles.mobileTop}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                    <IconChip name="tablet-portrait-outline" tone="neutral" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mobileTitle} numberOfLines={1}>
                        {fmt(title)}
                      </Text>
                      <Text style={styles.mobileSub} numberOfLines={1}>
                        Ville: {fmt(city)}
                      </Text>
                    </View>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <StatusPill
                      tone={statusTone === "ok" ? "ok" : statusTone === "bad" ? "warn" : "info"}
                      icon={statusTone === "ok" ? "checkmark-circle-outline" : "alert-circle-outline"}
                      label={statusLabel}
                    />
                    {g.items.length > 1 ? (
                      <StatusPill tone="info" icon="time-outline" label={`Historique: ${g.items.length}`} />
                    ) : null}
                  </View>
                </View>

                <Divider />

                <View style={styles.mobileInfoRow}>
                  <Ionicons name="time-outline" size={16} color={UI.muted} />
                  <Text style={styles.mobileInfoText}>Dernier signal: {lastSeenLabel}</Text>
                </View>

                <View style={styles.mobileInfoRow}>
                  <Ionicons
                    name={batteryIcon(t.lastBatteryPercent ?? null, (t as any).charging)}
                    size={16}
                    color={UI.muted}
                  />
                  <Text style={styles.mobileInfoText}>Batterie: {battLabel}</Text>
                </View>

                <View style={styles.mobileInfoRow}>
                  <Ionicons name="wifi-outline" size={16} color={UI.muted} />
                  <Text style={styles.mobileInfoText}>Réseau: {fmt(t.lastNetworkType)}</Text>
                </View>

                <View style={styles.mobileActions}>
                  <Pressable
                    onPress={() => router.push({ pathname: "/terminal/[id]", params: { id: String((t as any).id) } })}
                    style={({ pressed }) => [styles.actionBtn, pressed && { transform: [{ scale: 0.99 }] }]}
                  >
                    <Ionicons name="open-outline" size={16} color={UI.ink} />
                    <Text style={styles.actionText}>Ouvrir la fiche</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => openHistory(g)}
                    style={({ pressed }) => [styles.actionBtn, pressed && { transform: [{ scale: 0.99 }] }]}
                  >
                    <Ionicons name="time-outline" size={16} color={UI.ink} />
                    <Text style={styles.actionText}>Historique</Text>
                  </Pressable>
                </View>
              </Pressable>
            </GlassCard>
          );
        }

        return (
          <GlassCard style={{ marginTop: 10 }}>
            <Pressable
              onPress={() => router.push({ pathname: "/terminal/[id]", params: { id: String((t as any).id) } })}
              style={({ pressed }) => [styles.rowPress, pressed && { transform: [{ scale: 0.997 }] }]}
            >
              <View style={styles.rowCells}>
                <View style={{ flex: 1.2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <IconChip name="tablet-portrait-outline" tone="neutral" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {fmt(title)}
                      </Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        Batterie: {battLabel} • Réseau: {fmt(t.lastNetworkType)}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={[styles.rowMid, { flex: 0.9 }]} numberOfLines={1}>
                  {fmt(city)}
                </Text>

                <View style={{ flex: 0.9, alignItems: "flex-end" }}>
                  <StatusPill
                    tone={statusTone === "ok" ? "ok" : statusTone === "bad" ? "warn" : "info"}
                    icon={statusTone === "ok" ? "checkmark-circle-outline" : "alert-circle-outline"}
                    label={statusLabel}
                  />
                </View>

                <Text style={[styles.rowMid, { flex: 1.1, textAlign: "right" }]} numberOfLines={1}>
                  {lastSeenLabel}
                </Text>

                <View style={{ width: 10 }} />

                <Pressable
                  onPress={() => openHistory(g)}
                  style={({ pressed }) => [styles.miniBtn, pressed && { transform: [{ scale: 0.99 }] }]}
                >
                  <Ionicons name="time-outline" size={16} color={UI.ink} />
                  <Text style={styles.miniBtnText}>Historique</Text>
                  <View style={styles.miniBadge}>
                    <Text style={styles.miniBadgeText}>{g.items.length}</Text>
                  </View>
                </Pressable>
              </View>
            </Pressable>
          </GlassCard>
        );
      }}
      ListEmptyComponent={
        <GlassCard style={{ marginTop: 12 }}>
          <Text style={styles.emptyTitle}>Aucun appareil à afficher</Text>
          <Text style={styles.emptyText}>Appuyez sur “Actualiser” pour récupérer les données et afficher la liste.</Text>

          <Pressable
            onPress={syncOnce}
            style={({ pressed }) => [
              styles.primaryBtn,
              { marginTop: 12, alignSelf: "flex-start" },
              pressed && { transform: [{ scale: 0.99 }] },
            ]}
          >
            <Ionicons name="refresh" size={16} color={UI.ink} />
            <Text style={styles.primaryBtnText}>Actualiser</Text>
          </Pressable>
        </GlassCard>
      }
    />
  );

  return (
    <View style={styles.page}>
      <SoftBackdrop />

      {error ? (
        <GlassCard style={{ margin: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="alert-circle-outline" size={18} color={UI.warn} />
            <Text style={styles.errTitle}>Information</Text>
          </View>
          <Text style={styles.errText}>{error}</Text>
        </GlassCard>
      ) : null}

      {Content}

      <Modal visible={historyOpen} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <GlassCard strong style={styles.historyModal}>
            <View style={styles.historyTop}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                <IconChip name="time-outline" tone="neutral" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTitle} numberOfLines={1}>
                    Historique d’activité
                  </Text>
                  <Text style={styles.historySub} numberOfLines={1}>
                    {fmt((historyGroup?.primary as any)?.displayName || (historyGroup?.primary as any)?.serialNumber)} •
                    Entrées: {fmt(historyGroup?.items?.length)}
                  </Text>
                </View>
              </View>

              <Pressable onPress={() => setHistoryOpen(false)} style={styles.iconBtn}>
                <Ionicons name="close" size={18} color={UI.ink} />
              </Pressable>
            </View>

            <Divider />

            <View style={{ gap: 10 }}>
              {(historyGroup?.items ?? []).slice(0, 10).map((h, idx) => {
                const tone: "ok" | "warn" =
                  !h.lastSeenAt
                    ? "warn"
                    : (() => {
                        const ts = new Date(h.lastSeenAt).getTime();
                        if (Number.isNaN(ts)) return "warn";
                        const diffMin = Math.abs(Date.now() - ts) / 60000;
                        return diffMin <= onlineCutoffMin ? "ok" : "warn";
                      })();

                const label = tone === "ok" ? "En service" : "À vérifier";
                const battLabel =
                  h.lastBatteryPercent === null || h.lastBatteryPercent === undefined ? "—" : `${h.lastBatteryPercent}%`;

                const anyH: any = h as any;
                const hTitle =
                  anyH.displayName || (isEphemeralSerial(anyH.serialNumber) ? "" : anyH.serialNumber) || "—";

                return (
                  <GlassCard key={`${String((h as any).id)}-${idx}`} style={styles.historyRow}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <IconChip name="server-outline" tone="neutral" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyRowTitle} numberOfLines={1}>
                          {fmt(hTitle)} • Ville: {fmt(h.city)}
                        </Text>
                        <Text style={styles.historyRowSub} numberOfLines={1}>
                          Dernier signal: {toDateLabel(h.lastSeenAt ?? null)} • Batterie: {battLabel} • Réseau:{" "}
                          {fmt(h.lastNetworkType)}
                        </Text>
                      </View>
                      <StatusPill tone={tone === "ok" ? "ok" : "warn"} icon="alert-circle-outline" label={label} />
                    </View>

                    <View style={{ height: 10 }} />

                    <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                      <Pressable
                        onPress={() =>
                          router.push({ pathname: "/terminal/[id]", params: { id: String((h as any).id) } })
                        }
                        style={({ pressed }) => [styles.secondaryBtn, pressed && { transform: [{ scale: 0.99 }] }]}
                      >
                        <Ionicons name="open-outline" size={16} color={UI.ink} />
                        <Text style={styles.secondaryBtnText}>Ouvrir</Text>
                      </Pressable>
                    </View>
                  </GlassCard>
                );
              })}

              {(historyGroup?.items?.length ?? 0) > 10 ? (
                <Text style={styles.historyHint}>Affichage limité à 10 entrées pour rester clair.</Text>
              ) : null}
            </View>

            <Pressable
              onPress={() => setHistoryOpen(false)}
              style={({ pressed }) => [
                styles.primaryBtn,
                { marginTop: 12, alignSelf: "flex-end" },
                pressed && { transform: [{ scale: 0.99 }] },
              ]}
            >
              <Ionicons name="checkmark" size={16} color={UI.ink} />
              <Text style={styles.primaryBtnText}>Fermer</Text>
            </Pressable>
          </GlassCard>
        </View>
      </Modal>

      <BottomBar active="home" />
    </View>
  );
}

/* =========================
   Bottom bar (dark, icons)
   ========================= */

function BottomBar({ active }: { active: "home" | "telemetry" | "explore" | "help" }) {
  const Item = ({
    id,
    icon,
    label,
    onPress,
  }: {
    id: "home" | "telemetry" | "explore" | "help";
    icon: any;
    label: string;
    onPress?: () => void;
  }) => {
    const isActive = active === id;

    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.navItem, pressed && { transform: [{ scale: 0.99 }] }]}>
        <View style={[styles.navIconWrap, isActive && styles.navIconWrapActive]}>
          <Ionicons name={icon} size={18} color={isActive ? UI.ink : UI.muted2} />
        </View>
        <Text style={[styles.navLabel, { color: isActive ? UI.ink : UI.muted2 }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.navBarWrap} pointerEvents="auto">
      <BlurView intensity={26} tint="dark" style={styles.navBar}>
        <View style={styles.navRow}>
          <Item id="home" icon="grid-outline" label="Tableau" onPress={() => router.push("/")} />
          <Item id="telemetry" icon="pulse-outline" label="Télémétrie" onPress={() => router.push("/telemetry")} />
          <Item id="explore" icon="compass-outline" label="Explorer" onPress={() => router.push("/explore")} />
          <Item
            id="help"
            icon="help-circle-outline"
            label="Aide"
            onPress={() => Alert.alert("Aide", "Support MVET Service — nous pouvons brancher un vrai support si besoin.")}
          />
        </View>
      </BlurView>
    </View>
  );
}

/* =========================
   Styles
   ========================= */

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: UI.black },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  centerText: { marginTop: 12, color: UI.muted, fontWeight: "800" },

  halo: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(110,168,255,0.22)",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 40, shadowOffset: { width: 10, height: 18 } },
      android: { elevation: 2 },
    }),
  },
  grain: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.10,
    backgroundColor: "transparent",
  },

  glassOuter: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: UI.stroke,
    backgroundColor: UI.card2,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.30, shadowRadius: 28, shadowOffset: { width: 0, height: 16 } },
      android: { elevation: 6 },
    }),
  },
  glassBlur: { borderRadius: 22, overflow: "hidden" },
  glassInner: {
    padding: 14,
    backgroundColor: UI.card,
    borderWidth: 1,
    borderColor: UI.stroke2,
  },
  glassInnerStrong: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginVertical: 12 },

  heroRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  heroTitle: { color: UI.ink, fontSize: 16, fontWeight: "900" },
  heroSub: { marginTop: 8, color: UI.muted, fontWeight: "700", lineHeight: 18, maxWidth: 720 },
  heroMetaRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 },

  heroActions: { gap: 10, alignItems: "flex-end", justifyContent: "flex-start" },

  primaryBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryBtnText: { color: UI.ink, fontWeight: "900" },

  secondaryBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondaryBtnText: { color: UI.ink, fontWeight: "900" },

  warnBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,77,77,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,77,77,0.18)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  warnText: { color: UI.ink, fontWeight: "800", flex: 1 },

  kpiRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  kpiCard: { flex: 1, minWidth: 220 },
  kpiTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  kpiLabel: { color: UI.muted, fontWeight: "900" },
  kpiValue: { marginTop: 12, color: UI.ink, fontSize: 22, fontWeight: "900" },
  kpiFoot: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },

  localRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  localTitle: { color: UI.ink, fontWeight: "900" },
  localSub: { marginTop: 6, color: UI.muted, fontWeight: "800", fontSize: 12 },
  localRight: { gap: 8, alignItems: "flex-end" },
  localRightText: { color: UI.ink, fontWeight: "900" },

  sectionHead: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  sectionTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  sectionSub: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12, maxWidth: 760 },

  tableHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  th: { color: UI.muted2, fontWeight: "900", fontSize: 12 },

  iconChip: {
    width: 38,
    height: 38,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 4 },
    }),
  },

  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  pillText: { fontWeight: "900", fontSize: 12 },

  rowPress: { borderRadius: 18 },
  rowCells: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  rowTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  rowSub: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },
  rowMid: { color: UI.ink, fontWeight: "900", fontSize: 13 },

  miniBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  miniBtnText: { color: UI.ink, fontWeight: "900", fontSize: 12 },
  miniBadge: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  miniBadgeText: { color: UI.ink, fontWeight: "900", fontSize: 12 },

  emptyTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  emptyText: { marginTop: 8, color: UI.muted, fontWeight: "800", lineHeight: 18 },

  mobilePress: { borderRadius: 18 },
  mobileTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  mobileTitle: { color: UI.ink, fontWeight: "900", fontSize: 15 },
  mobileSub: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },
  mobileInfoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  mobileInfoText: { color: UI.ink, fontWeight: "900", fontSize: 13 },

  mobileActions: { flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" },
  actionBtn: {
    flexGrow: 1,
    minWidth: 160,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  actionText: { color: UI.ink, fontWeight: "900" },

  errTitle: { color: UI.ink, fontWeight: "900" },
  errText: { marginTop: 8, color: UI.muted, fontWeight: "800", lineHeight: 18 },

  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 14,
  },
  historyModal: { width: "100%", maxWidth: 980, alignSelf: "center" },
  historyTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  historyTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  historySub: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },
  historyRow: { marginTop: 10 },
  historyRowTitle: { color: UI.ink, fontWeight: "900", fontSize: 12 },
  historyRowSub: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },
  historyHint: { marginTop: 10, color: UI.muted2, fontWeight: "800", fontSize: 12 },

  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  navBarWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.36, shadowRadius: 28, shadowOffset: { width: 0, height: 18 } },
      android: { elevation: 10 },
    }),
  },
  navBar: {
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(10,14,28,0.70)",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  navIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  navIconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.20)",
  },
  navLabel: { fontSize: 11, fontWeight: "900" },
});