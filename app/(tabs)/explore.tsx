// app/(tabs)/telemetry.tsx
/* ===CLE-MODIF-TPE-MONITORING-TELEMETRY-V3-BANK-GABON-GLASS-NEU-FR=== */

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { telemetryApi } from "../../lib/api";
import type { TelemetrySnapshot } from "../../lib/types";

/* ==========================================================
   OBJECTIF (BANQUE / NON TECH)
   - Page 100% FR, ultra lisible, rassurante
   - Même design que Index: glass + halo + profondeur
   - Icônes "inertes" (chips) + ombres propres
   - Un seul scroll (FlatList)
   - Adresse: backend d’abord, sinon reverse geocode (cache)
   - Recherche simple + filtres + KPI clairs
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
  if (typeof v === "boolean") return v ? "Oui" : "Non";
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

async function reverseGeocode(lat: number, lng: number) {
  try {
    if (Platform.OS === "web") return null;
    const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const first = res?.[0];
    if (!first) return null;

    const line1 = [first.name, first.street].filter(Boolean).join(" ");
    const line2 = [first.district, first.subregion, first.city].filter(Boolean).join(", ");
    const line3 = [first.region, first.postalCode, first.country].filter(Boolean).join(", ");
    const full = [line1, line2, line3].filter(Boolean).join(" — ");
    return full || null;
  } catch {
    return null;
  }
}

/* =========================
   UI: Glass surfaces (same as Index)
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

function StatusPill({
  tone,
  label,
  icon,
}: {
  tone: "ok" | "warn" | "bad" | "info";
  label: string;
  icon: any;
}) {
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
   UI: Info blocks
   ========================= */

function MetaRow({
  icon,
  label,
  value,
  tone = "info",
  lines = 2,
  sub,
}: {
  icon: any;
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad" | "info";
  lines?: number;
  sub?: string;
}) {
  const fg = tone === "ok" ? UI.ok : tone === "warn" ? UI.warn : tone === "bad" ? UI.bad : UI.info;
  const bg = tone === "ok" ? UI.okBg : tone === "warn" ? UI.warnBg : tone === "bad" ? UI.badBg : UI.infoBg;
  const bd =
    tone === "ok"
      ? "rgba(43,227,139,0.22)"
      : tone === "warn"
      ? "rgba(255,176,32,0.22)"
      : tone === "bad"
      ? "rgba(255,77,77,0.22)"
      : "rgba(110,168,255,0.22)";

  return (
    <View style={styles.metaRow}>
      <View style={[styles.metaIcon, { backgroundColor: bg, borderColor: bd }]}>
        <Ionicons name={icon} size={18} color={fg} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue} numberOfLines={lines}>
          {value}
        </Text>
        {sub ? <Text style={styles.metaSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/* =========================
   Screen
   ========================= */

type FilterMode = "TOUT" | "RECENT" | "A_VERIFIER";

export default function TelemetryTab() {
  const { width } = useWindowDimensions();
  const isMobile = width < 560;
  const isWide = width >= 980;

  const numColumns = useMemo(() => {
    if (isMobile) return 1;
    return isWide ? 2 : 1;
  }, [isMobile, isWide]);

  const freshnessMin = 5;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<TelemetrySnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

  // recherche / filtres
  const [q, setQ] = useState<string>("");
  const [mode, setMode] = useState<FilterMode>("TOUT");

  // cache adresse calculée (fallback)
  const [addrById, setAddrById] = useState<Record<number, string>>({});
  const workingIdsRef = useRef<Set<number>>(new Set());

  // modal "Aide / lecture"
  const [helpOpen, setHelpOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await telemetryApi.listLatest(120);
      setItems(data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de charger la télémétrie.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // reverse geocode (uniquement si backend n’a pas fourni l’adresse)
  useEffect(() => {
    let alive = true;

    (async () => {
      const targets = items
        .filter((x: any) => !(x.addressLine || x.gpsAddressLine))
        .filter((x) => (x.gpsLat ?? null) !== null && (x.gpsLng ?? null) !== null)
        .filter((x) => !addrById[x.id])
        .filter((x) => !workingIdsRef.current.has(x.id))
        .slice(0, 10);

      if (!targets.length) return;

      for (const t of targets) workingIdsRef.current.add(t.id);

      const copy: Record<number, string> = { ...addrById };

      for (const t of targets) {
        const lat = t.gpsLat as number;
        const lng = t.gpsLng as number;
        const addr = await reverseGeocode(lat, lng);

        if (!alive) return;

        if (addr) copy[t.id] = addr;
        workingIdsRef.current.delete(t.id);
      }

      if (!alive) return;
      setAddrById(copy);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    const byQuery = (arr: TelemetrySnapshot[]) => {
      if (!query) return arr;

      return arr.filter((it: any) => {
        const termId = String(it.terminalId ?? "");
        const snapId = String(it.id ?? "");
        const net = String(it.networkType ?? "");
        const ip = String(it.ipAddress ?? "");
        const carrier = String(it.carrierName ?? "");
        const city = String(it.city ?? "");
        const region = String(it.region ?? "");
        const country = String(it.country ?? "");
        const addr = String(it.addressLine || it.gpsAddressLine || addrById[it.id] || "");

        const blob = `${termId} ${snapId} ${net} ${ip} ${carrier} ${city} ${region} ${country} ${addr}`.toLowerCase();
        return blob.includes(query);
      });
    };

    const byMode = (arr: TelemetrySnapshot[]) => {
      if (mode === "TOUT") return arr;

      return arr.filter((it) => {
        const batt =
          it.batteryPercent === null || it.batteryPercent === undefined ? null : clamp(Number(it.batteryPercent), 0, 100);
        const net = String(it.networkType ?? "");
        const sig = it.signalLevel ?? null;

        const freshTone = toneForFreshness(it.capturedAt ?? null, freshnessMin);
        const battTone = toneForBattery(batt);
        const sigTone = toneForSignal(sig);
        const netTone = toneForNetwork(net);

        const isBad =
          freshTone === "bad" ||
          battTone === "bad" ||
          sigTone === "bad" ||
          netTone === "bad" ||
          (String(net).toUpperCase().includes("NONE") && freshTone !== "ok");

        if (mode === "RECENT") return freshTone === "ok";
        if (mode === "A_VERIFIER") return isBad;
        return true;
      });
    };

    // ordre: plus récent d'abord
    const sorted = [...items].sort((a, b) => {
      const ta = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
      const tb = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
    });

    return byMode(byQuery(sorted));
  }, [items, q, mode, addrById]);

  const stats = useMemo(() => {
    const total = items.length;

    const recent = items.filter((it) => toneForFreshness(it.capturedAt ?? null, freshnessMin) === "ok").length;

    const batteryLow = items.filter((it) => {
      const batt =
        it.batteryPercent === null || it.batteryPercent === undefined ? null : clamp(Number(it.batteryPercent), 0, 100);
      return batt !== null && batt < 20;
    }).length;

    const noNetwork = items.filter((it) => String(it.networkType ?? "").toUpperCase().includes("NONE")).length;

    const uniqueTerminals = new Set(items.map((x) => String(x.terminalId ?? "—"))).size;

    return { total, recent, batteryLow, noNetwork, uniqueTerminals };
  }, [items]);

  const header = (
    <View>
      <GlassCard strong style={{ marginBottom: 12 }}>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Télémétrie — Santé des appareils</Text>
            <Text style={styles.heroSub}>
              Lecture simple, claire et exploitable. On voit l’état du réseau, de la batterie et la localisation estimée.
            </Text>

            <View style={styles.heroMetaRow}>
              <StatusPill
                tone={mode === "TOUT" ? "info" : mode === "RECENT" ? "ok" : "warn"}
                icon={mode === "TOUT" ? "list-outline" : mode === "RECENT" ? "time-outline" : "alert-circle-outline"}
                label={
                  mode === "TOUT"
                    ? "Filtre: tout afficher"
                    : mode === "RECENT"
                    ? `Filtre: récent (≤ ${freshnessMin} min)`
                    : "Filtre: à vérifier"
                }
              />
              <StatusPill tone="info" icon="server-outline" label={`Terminaux: ${fmt(stats.uniqueTerminals)}`} />
              <StatusPill tone="info" icon="pulse-outline" label={`Entrées: ${fmt(stats.total)}`} />
            </View>
          </View>

          <View style={styles.heroActions}>
            <Pressable
              onPress={load}
              style={({ pressed }) => [styles.primaryBtn, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="refresh" size={16} color={UI.ink} />
              <Text style={styles.primaryBtnText}>Actualiser</Text>
            </Pressable>

            <Pressable
              onPress={() => setHelpOpen(true)}
              style={({ pressed }) => [styles.secondaryBtn, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="help-circle-outline" size={16} color={UI.ink} />
              <Text style={styles.secondaryBtnText}>Comprendre</Text>
            </Pressable>
          </View>
        </View>

        <Divider />

        <View style={styles.filtersRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color={UI.muted2} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Rechercher: terminal, réseau, adresse, opérateur…"
              placeholderTextColor="rgba(243,246,255,0.42)"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {q?.trim() ? (
              <Pressable onPress={() => setQ("")} style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.85 }]}>
                <Ionicons name="close" size={16} color={UI.ink} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.modeRow}>
            <ModeChip active={mode === "TOUT"} label="Tout" icon="list-outline" onPress={() => setMode("TOUT")} />
            <ModeChip
              active={mode === "RECENT"}
              label="Récent"
              icon="time-outline"
              onPress={() => setMode("RECENT")}
            />
            <ModeChip
              active={mode === "A_VERIFIER"}
              label="À vérifier"
              icon="alert-circle-outline"
              onPress={() => setMode("A_VERIFIER")}
            />
          </View>
        </View>
      </GlassCard>

      <View style={styles.kpiRow}>
        <GlassCard style={styles.kpiCard}>
          <View style={styles.kpiTop}>
            <IconChip name="time-outline" tone="info" />
            <Text style={styles.kpiLabel}>Récents</Text>
          </View>
          <Text style={styles.kpiValue}>{fmt(stats.recent)}</Text>
          <Text style={styles.kpiFoot}>{`≤ ${freshnessMin} min`}</Text>
        </GlassCard>

        <GlassCard style={styles.kpiCard}>
          <View style={styles.kpiTop}>
            <IconChip name="battery-dead-outline" tone="warn" />
            <Text style={styles.kpiLabel}>Batterie faible</Text>
          </View>
          <Text style={styles.kpiValue}>{fmt(stats.batteryLow)}</Text>
          <Text style={styles.kpiFoot}>{"< 20%"}</Text>
        </GlassCard>

        <GlassCard style={styles.kpiCard}>
          <View style={styles.kpiTop}>
            <IconChip name="close-circle-outline" tone="bad" />
            <Text style={styles.kpiLabel}>Sans réseau</Text>
          </View>
          <Text style={styles.kpiValue}>{fmt(stats.noNetwork)}</Text>
          <Text style={styles.kpiFoot}>Réseau “NONE”</Text>
        </GlassCard>
      </View>

      <View style={styles.sectionHead}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <IconChip name="pulse-outline" tone="neutral" />
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Liste des relevés</Text>
            <Text style={styles.sectionSub}>
              Appuyez sur un relevé pour ouvrir les détails complets. (Toujours en langage clair)
            </Text>
          </View>
        </View>

        <StatusPill tone="info" icon="funnel-outline" label={`Affichés: ${fmt(filtered.length)}`} />
      </View>

      {!isMobile ? (
        <GlassCard style={{ marginTop: 8 }}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, { flex: 1.2 }]}>Terminal</Text>
            <Text style={[styles.th, { flex: 0.9 }]}>Réseau</Text>
            <Text style={[styles.th, { flex: 0.9 }]}>Batterie</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: "right" }]}>Capturé</Text>
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
          <Text style={styles.centerText}>Chargement de la télémétrie…</Text>
        </View>
        <BottomBar active="telemetry" />
      </View>
    );
  }

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

      <FlatList
        data={filtered}
        key={numColumns}
        numColumns={numColumns}
        keyExtractor={(it) => String(it.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.ink} />}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 14, paddingBottom: 110 }}
        columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => {
          const batt =
            item.batteryPercent === null || item.batteryPercent === undefined
              ? null
              : clamp(Number(item.batteryPercent), 0, 100);

          const charge = item.charging === null || item.charging === undefined ? null : Boolean(item.charging);

          const net = fmt(item.networkType);
          const sig = item.signalLevel ?? null;

          const battTone = toneForBattery(batt);
          const sigTone = toneForSignal(sig);
          const netTone = toneForNetwork(String(item.networkType ?? ""));

          const freshTone = toneForFreshness(item.capturedAt ?? null, freshnessMin);
          const freshLabel =
            freshTone === "ok" ? `Récent (≤ ${freshnessMin} min)` : freshTone === "warn" ? "Assez récent" : "Ancien";

          const anyItem: any = item as any;
          const addr =
            anyItem.addressLine ||
            anyItem.gpsAddressLine ||
            addrById[item.id] ||
            "—";

          const addrSource =
            anyItem.addressLine || anyItem.gpsAddressLine
              ? "Adresse fournie par l’appareil (via serveur)"
              : addrById[item.id]
              ? "Adresse estimée à partir des coordonnées GPS"
              : "Adresse indisponible";

          const terminalLabel = `Terminal #${fmt(item.terminalId)}`;

          // Mobile: carte très lisible
          if (isMobile) {
            return (
              <GlassCard style={{ marginTop: 12 }}>
                <Pressable
                  onPress={() => router.push({ pathname: "/telemetry/[id]", params: { id: String(item.id) } })}
                  style={({ pressed }) => [styles.mobilePress, pressed && { transform: [{ scale: 0.995 }] }]}
                >
                  <View style={styles.mobileTop}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                      <IconChip name="terminal-outline" tone="neutral" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mobileTitle} numberOfLines={1}>
                          {terminalLabel}
                        </Text>
                        <Text style={styles.mobileSub} numberOfLines={1}>
                          Capturé: {toDateLabel(item.capturedAt)}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: "flex-end", gap: 8 }}>
                      <StatusPill
                        tone={freshTone === "ok" ? "ok" : freshTone === "warn" ? "warn" : "bad"}
                        icon={freshTone === "ok" ? "checkmark-circle-outline" : "alert-circle-outline"}
                        label={freshLabel}
                      />
                    </View>
                  </View>

                  <Divider />

                  <View style={styles.mobileInfoRow}>
                    <Ionicons name={netIcon(item.networkType ?? null)} size={16} color={UI.muted} />
                    <Text style={styles.mobileInfoText}>
                      Réseau: {fmt(net)} • Signal: {fmt(sig)}
                    </Text>
                  </View>

                  <View style={styles.mobileInfoRow}>
                    <Ionicons name={batteryIcon(batt, charge)} size={16} color={UI.muted} />
                    <Text style={styles.mobileInfoText}>
                      Batterie: {batt === null ? "—" : `${batt}%`} • En charge:{" "}
                      {charge === null ? "—" : charge ? "Oui" : "Non"}
                    </Text>
                  </View>

                  <View style={styles.addrBox}>
                    <Ionicons name="location-outline" size={14} color={UI.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.addrText} numberOfLines={4}>
                        {addr}
                      </Text>
                      <Text style={styles.addrSub} numberOfLines={2}>
                        {addrSource}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.mobileActions}>
                    <Pressable
                      onPress={() => router.push({ pathname: "/telemetry/[id]", params: { id: String(item.id) } })}
                      style={({ pressed }) => [styles.actionBtn, pressed && { transform: [{ scale: 0.99 }] }]}
                    >
                      <Ionicons name="open-outline" size={16} color={UI.ink} />
                      <Text style={styles.actionText}>Ouvrir le détail</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => router.push({ pathname: "/terminal/[id]", params: { id: String(item.terminalId) } })}
                      style={({ pressed }) => [styles.actionBtn, pressed && { transform: [{ scale: 0.99 }] }]}
                    >
                      <Ionicons name="tablet-portrait-outline" size={16} color={UI.ink} />
                      <Text style={styles.actionText}>Voir le terminal</Text>
                    </Pressable>
                  </View>
                </Pressable>
              </GlassCard>
            );
          }

          // Desktop/Wide: ligne “table” + détail condensé
          return (
            <GlassCard style={{ marginTop: 10, ...(numColumns > 1 ? { flex: 1 } : null) }}>
              <Pressable
                onPress={() => router.push({ pathname: "/telemetry/[id]", params: { id: String(item.id) } })}
                style={({ pressed }) => [styles.rowPress, pressed && { transform: [{ scale: 0.997 }] }]}
              >
                <View style={styles.rowCells}>
                  <View style={{ flex: 1.2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <IconChip name="terminal-outline" tone="neutral" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {terminalLabel}
                        </Text>
                        <Text style={styles.rowSub} numberOfLines={1}>
                          Adresse: {addr === "—" ? "Non disponible" : addr}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ flex: 0.9 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Ionicons name={netIcon(item.networkType ?? null)} size={16} color={UI.muted} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowMid} numberOfLines={1}>
                          {fmt(net)}
                        </Text>
                        <Text style={styles.rowSubSmall} numberOfLines={1}>
                          Signal: {fmt(sig)}
                        </Text>
                      </View>
                    </View>
                    <StatusPill
                      tone={netTone === "ok" ? "ok" : netTone === "bad" ? "bad" : "info"}
                      icon={netTone === "ok" ? "checkmark-circle-outline" : netTone === "bad" ? "alert-circle-outline" : "information-circle-outline"}
                      label={netTone === "ok" ? "Réseau OK" : netTone === "bad" ? "Réseau absent" : "Réseau variable"}
                    />
                  </View>

                  <View style={{ flex: 0.9 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Ionicons name={batteryIcon(batt, charge)} size={16} color={UI.muted} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowMid} numberOfLines={1}>
                          {batt === null ? "—" : `${batt}%`}
                        </Text>
                        <Text style={styles.rowSubSmall} numberOfLines={1}>
                          Charge: {charge === null ? "—" : charge ? "Oui" : "Non"}
                        </Text>
                      </View>
                    </View>
                    <StatusPill
                      tone={battTone === "ok" ? "ok" : battTone === "warn" ? "warn" : battTone === "bad" ? "bad" : "info"}
                      icon={battTone === "ok" ? "checkmark-circle-outline" : battTone === "warn" ? "alert-circle-outline" : battTone === "bad" ? "alert-circle-outline" : "information-circle-outline"}
                      label={
                        battTone === "ok" ? "Batterie OK" : battTone === "warn" ? "Batterie moyenne" : battTone === "bad" ? "Batterie faible" : "Batterie inconnue"
                      }
                    />
                  </View>

                  <View style={{ flex: 1.2, alignItems: "flex-end" }}>
                    <Text style={[styles.rowMid, { textAlign: "right" }]} numberOfLines={1}>
                      {toDateLabel(item.capturedAt)}
                    </Text>
                    <Text style={[styles.rowSubSmall, { textAlign: "right" }]} numberOfLines={1}>
                      Relevé #{fmt(item.id)}
                    </Text>
                    <StatusPill
                      tone={freshTone === "ok" ? "ok" : freshTone === "warn" ? "warn" : "bad"}
                      icon={freshTone === "ok" ? "time-outline" : "alert-circle-outline"}
                      label={freshLabel}
                    />
                  </View>
                </View>

                <Divider />

                <View style={styles.detailGrid}>
                  <View style={{ flex: 1 }}>
                    <MetaRow
                      icon="location-outline"
                      label="Localisation"
                      value={addr}
                      sub={addrSource}
                      tone={addr === "—" ? "warn" : "info"}
                      lines={3}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <MetaRow
                      icon="navigate-outline"
                      label="Coordonnées GPS"
                      value={`Lat: ${fmt(item.gpsLat)} • Lng: ${fmt(item.gpsLng)} • Précision: ±${fmt(item.gpsAccuracy)} m`}
                      sub={`OS: ${fmt((item as any).osVersion)} • Agent: ${fmt((item as any).agentVersion)}`}
                      tone={(item.gpsLat ?? null) === null || (item.gpsLng ?? null) === null ? "warn" : "info"}
                      lines={2}
                    />
                  </View>
                </View>

                <View style={styles.footerActionsRow}>
                  <Pressable
                    onPress={() => router.push({ pathname: "/terminal/[id]", params: { id: String(item.terminalId) } })}
                    style={({ pressed }) => [styles.miniBtn, pressed && { transform: [{ scale: 0.99 }] }]}
                  >
                    <Ionicons name="tablet-portrait-outline" size={16} color={UI.ink} />
                    <Text style={styles.miniBtnText}>Ouvrir le terminal</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => router.push({ pathname: "/telemetry/[id]", params: { id: String(item.id) } })}
                    style={({ pressed }) => [styles.miniBtn, pressed && { transform: [{ scale: 0.99 }] }]}
                  >
                    <Ionicons name="open-outline" size={16} color={UI.ink} />
                    <Text style={styles.miniBtnText}>Détails complets</Text>
                  </Pressable>
                </View>
              </Pressable>
            </GlassCard>
          );
        }}
        ListEmptyComponent={
          <GlassCard style={{ marginTop: 12 }}>
            <Text style={styles.emptyTitle}>Aucun relevé disponible</Text>
            <Text style={styles.emptyText}>
              Pour afficher des relevés, les appareils doivent envoyer leurs informations au serveur.
            </Text>

            <Pressable
              onPress={load}
              style={({ pressed }) => [styles.primaryBtn, { marginTop: 12, alignSelf: "flex-start" }, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="refresh" size={16} color={UI.ink} />
              <Text style={styles.primaryBtnText}>Actualiser</Text>
            </Pressable>
          </GlassCard>
        }
      />

      {/* Modal Aide (FR, simple) */}
      <Modal visible={helpOpen} animationType="fade" transparent>
        <View style={styles.modalOverlayCenter}>
          <GlassCard strong style={styles.helpModal}>
            <View style={styles.helpTop}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                <IconChip name="help-circle-outline" tone="neutral" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.helpTitle} numberOfLines={1}>
                    Comment lire cette page
                  </Text>
                  <Text style={styles.helpSub} numberOfLines={2}>
                    Ici, chaque carte représente un relevé envoyé par un appareil (réseau, batterie, position…).
                  </Text>
                </View>
              </View>

              <Pressable onPress={() => setHelpOpen(false)} style={styles.iconBtn}>
                <Ionicons name="close" size={18} color={UI.ink} />
              </Pressable>
            </View>

            <Divider />

            <View style={{ gap: 10 }}>
              <GlassCard style={styles.helpBlock}>
                <MetaRow
                  icon="time-outline"
                  label="Récent / Ancien"
                  value={`Récent = relevé reçu il y a ≤ ${freshnessMin} minutes. Au-delà, l’appareil peut être hors réseau, éteint ou en zone instable.`}
                  tone="info"
                  lines={3}
                />
              </GlassCard>

              <GlassCard style={styles.helpBlock}>
                <MetaRow
                  icon="battery-half-outline"
                  label="Batterie"
                  value="Sous 20% = à surveiller. En charge = l’appareil est branché. Une batterie trop basse peut expliquer l’absence de signal."
                  tone="warn"
                  lines={3}
                />
              </GlassCard>

              <GlassCard style={styles.helpBlock}>
                <MetaRow
                  icon="wifi-outline"
                  label="Réseau"
                  value="WIFI / ETHERNET = stable. CELL = variable. NONE = pas de connexion au moment du relevé."
                  tone="info"
                  lines={3}
                />
              </GlassCard>

              <GlassCard style={styles.helpBlock}>
                <MetaRow
                  icon="location-outline"
                  label="Adresse"
                  value="Si l’adresse n’est pas fournie par l’appareil, l’application tente de l’estimer à partir des coordonnées GPS (quand disponible)."
                  tone="info"
                  lines={3}
                />
              </GlassCard>

              <Text style={styles.helpHint}>
                Astuce: utilisez “À vérifier” pour afficher rapidement les relevés qui méritent une action.
              </Text>
            </View>

            <Pressable
              onPress={() => setHelpOpen(false)}
              style={({ pressed }) => [styles.primaryBtn, { marginTop: 12, alignSelf: "flex-end" }, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Ionicons name="checkmark" size={16} color={UI.ink} />
              <Text style={styles.primaryBtnText}>Compris</Text>
            </Pressable>
          </GlassCard>
        </View>
      </Modal>

      <BottomBar active="telemetry" />
    </View>
  );
}

/* =========================
   Mode chips
   ========================= */

function ModeChip({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: any;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.modeChip, active && styles.modeChipActive, pressed && { transform: [{ scale: 0.99 }] }]}>
      <Ionicons name={icon} size={14} color={active ? UI.ink : UI.muted2} />
      <Text style={[styles.modeChipText, { color: active ? UI.ink : UI.muted2 }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
          <Item id="help" icon="help-circle-outline" label="Aide" onPress={() => router.push("/help")} />
        </View>
      </BlurView>
    </View>
  );
}

/* =========================
   Styles (same language + same vibe as Index)
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

  filtersRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },

  searchWrap: {
    flex: 1,
    minWidth: 260,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, color: UI.ink, fontWeight: "900" },
  clearBtn: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  modeRow: { flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap" },
  modeChip: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modeChipActive: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.20)",
  },
  modeChipText: { fontSize: 12, fontWeight: "900" },

  kpiRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  kpiCard: { flex: 1, minWidth: 220 },
  kpiTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  kpiLabel: { color: UI.muted, fontWeight: "900" },
  kpiValue: { marginTop: 12, color: UI.ink, fontSize: 22, fontWeight: "900" },
  kpiFoot: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },

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

  // Row/cards
  rowPress: { borderRadius: 18 },
  rowCells: { flexDirection: "row", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  rowTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  rowSub: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },
  rowSubSmall: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },
  rowMid: { color: UI.ink, fontWeight: "900", fontSize: 13 },

  detailGrid: { flexDirection: "row", gap: 12, flexWrap: "wrap" },

  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  metaIcon: {
    width: 42,
    height: 42,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  metaLabel: { color: UI.muted2, fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },
  metaValue: { marginTop: 6, color: UI.ink, fontWeight: "900", fontSize: 14, lineHeight: 20 },
  metaSub: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12, lineHeight: 17 },

  footerActionsRow: { marginTop: 12, flexDirection: "row", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" },
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

  // Mobile cards
  mobilePress: { borderRadius: 18 },
  mobileTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  mobileTitle: { color: UI.ink, fontWeight: "900", fontSize: 15 },
  mobileSub: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },
  mobileInfoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  mobileInfoText: { color: UI.ink, fontWeight: "900", fontSize: 13 },

  addrBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  addrText: { flex: 1, fontWeight: "900", color: UI.ink, fontSize: 13, lineHeight: 18 },
  addrSub: { marginTop: 6, fontWeight: "800", color: UI.muted2, fontSize: 12, lineHeight: 16 },

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

  // Error
  errTitle: { color: UI.ink, fontWeight: "900" },
  errText: { marginTop: 8, color: UI.muted, fontWeight: "800", lineHeight: 18 },

  // Empty
  emptyTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  emptyText: { marginTop: 8, color: UI.muted, fontWeight: "800", lineHeight: 18 },

  // Modal help
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 14,
  },
  helpModal: { width: "100%", maxWidth: 980, alignSelf: "center" },
  helpTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  helpTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  helpSub: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },
  helpBlock: { marginTop: 10 },
  helpHint: { marginTop: 10, color: UI.muted2, fontWeight: "800", fontSize: 12 },

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

  // Bottom bar
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
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 10 },
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