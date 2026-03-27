// app/terminal/[id].tsx
/* ===CLE-MODIF-TPE-MONITORING-TERMINAL-DETAILS-V1-BANK-GABON-GLASS-NEU-RENAME-FR=== */

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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

import { telemetryApi, terminalsApi } from "../../lib/api";
import type { TelemetrySnapshot, Terminal } from "../../lib/types";

/* ==========================================================
   terminal/[id].tsx
   ✅ Même design EXACT que index (glass / blur / halo / bottom bar)
   ✅ Fiche terminal claire (non-tech)
   ✅ Option RENOMMER (displayName) via PATCH /api/terminals/{id}/name
   ✅ Liste télémétrie (FlatList unique)
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

function toneForNetwork(net?: string | null) {
  if (!net) return "info";
  const v = String(net).toUpperCase();
  if (v === "WIFI" || v === "ETHERNET") return "ok";
  if (v === "NONE") return "bad";
  return "info";
}

function toneForStatus(status?: string | null) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "ok";
  if (s === "MAINTENANCE") return "warn";
  if (s === "INACTIVE" || s === "LOST") return "bad";
  return "info";
}

/* =========================
   UI: Glass surfaces (same as index)
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
   Screen
   ========================= */

export default function TerminalDetailsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 520;

  const params = useLocalSearchParams<{ id: string; sn?: string }>();
  const terminalId = useMemo(() => Number(params.id), [params.id]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

  // rename
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);

      const [t, tel] = await Promise.all([
        terminalsApi.getById(terminalId),
        telemetryApi.listByTerminal(terminalId, 60),
      ]);

      setTerminal(t);
      setTelemetry(tel ?? []);

      const currentName = (t as any)?.displayName || "";
      setRenameValue(String(currentName));
    } catch (e: any) {
      setError(e?.message ?? "Impossible de charger la fiche du terminal.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [terminalId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openRename = () => {
    const current = (terminal as any)?.displayName || "";
    setRenameValue(String(current));
    setRenameOpen(true);
  };

  const saveRename = async () => {
    const v = String(renameValue || "").trim();
    if (!v) {
      Alert.alert("Nom invalide", "Veuillez saisir un nom (ex: Agence Louis, TPE Caisse 1).");
      return;
    }
    if (v.length < 2) {
      Alert.alert("Nom trop court", "Veuillez saisir au moins 2 caractères.");
      return;
    }
    if (v.length > 60) {
      Alert.alert("Nom trop long", "Veuillez limiter à 60 caractères.");
      return;
    }

    try {
      setRenameSaving(true);
      const updated = await terminalsApi.rename(terminalId, { displayName: v });

      setTerminal(updated);
      setRenameOpen(false);
      Alert.alert("Enregistré", "Le nom du terminal a été mis à jour.");
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible d’enregistrer le nom.");
    } finally {
      setRenameSaving(false);
    }
  };

  const titlePrimary = useMemo(() => {
    const t: any = terminal as any;
    return t?.displayName || terminal?.serialNumber || params.sn || "Terminal";
  }, [terminal, params.sn]);

  const subLine = useMemo(() => {
    const t: any = terminal as any;
    const type = t?.deviceType ? `Type: ${t.deviceType}` : "Type: —";
    const last = `Dernier signal: ${toDateLabel(terminal?.lastSeenAt ?? null)}`;
    return `${type} • ${last}`;
  }, [terminal]);

  const headerStatusTone = useMemo(() => toneForStatus(terminal?.status ?? null) as any, [terminal?.status]);
  const headerStatusLabel = useMemo(() => {
    const s = String(terminal?.status || "—").toUpperCase();
    if (!s || s === "—") return "Inconnu";
    if (s === "ACTIVE") return "En service";
    if (s === "MAINTENANCE") return "Maintenance";
    if (s === "INACTIVE") return "Inactif";
    if (s === "LOST") return "Perdu";
    return s;
  }, [terminal?.status]);

  const lastAddr = useMemo(() => {
    const t: any = terminal as any;
    const addr = t?.lastAddressLine || t?.addressLine || terminal?.lastAddressLine || "—";
    return addr || "—";
  }, [terminal]);

  const hero = (
    <View>
      <GlassCard strong style={{ marginBottom: 12 }}>
        <View style={styles.heroTopRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && { transform: [{ scale: 0.99 }] }]}
          >
            <Ionicons name="chevron-back" size={18} color={UI.ink} />
            <Text style={styles.backText}>Retour</Text>
          </Pressable>

          <View style={{ flex: 1 }} />

          <Pressable
            onPress={openRename}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { transform: [{ scale: 0.99 }] }]}
          >
            <Ionicons name="pencil-outline" size={16} color={UI.ink} />
            <Text style={styles.secondaryBtnText}>Renommer</Text>
          </Pressable>
        </View>

        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle} numberOfLines={1}>
              {fmt(titlePrimary)}
            </Text>
            <Text style={styles.heroSub} numberOfLines={2}>
              {subLine}
            </Text>

            <View style={styles.heroMetaRow}>
              <StatusPill
                tone={headerStatusTone}
                icon={
                  headerStatusTone === "ok"
                    ? "checkmark-circle-outline"
                    : headerStatusTone === "warn"
                    ? "alert-circle-outline"
                    : headerStatusTone === "bad"
                    ? "close-circle-outline"
                    : "information-circle-outline"
                }
                label={headerStatusLabel}
              />
              <StatusPill tone="info" icon="finger-print-outline" label={`ID: ${fmt(terminal?.id)}`} />
              <StatusPill tone="info" icon="barcode-outline" label={`SN: ${fmt(terminal?.serialNumber)}`} />
            </View>
          </View>
        </View>

        <Divider />

        <View style={[styles.kpiRow, isMobile && { gap: 10 }]}>
          <GlassCard style={[styles.kpiCard, { marginTop: 0 }]}>{/* nested look (same as index vibe) */}
            <View style={styles.kpiTop}>
              <IconChip name="location-outline" tone="neutral" />
              <Text style={styles.kpiLabel}>Dernière adresse</Text>
            </View>
            <Text style={styles.kpiValueSmall} numberOfLines={2}>
              {fmt(lastAddr)}
            </Text>
            <Text style={styles.kpiFoot}>Adresse humaine (dernier signal)</Text>
          </GlassCard>

          <GlassCard style={[styles.kpiCard, { marginTop: 0 }]}>
            <View style={styles.kpiTop}>
              <IconChip name="business-outline" tone="neutral" />
              <Text style={styles.kpiLabel}>Organisation</Text>
            </View>
            <Text style={styles.kpiValueSmall} numberOfLines={1}>
              {fmt(terminal?.agency)}
            </Text>
            <Text style={styles.kpiFoot} numberOfLines={1}>
              Merchant: {fmt(terminal?.merchant)}
            </Text>
          </GlassCard>

          <GlassCard style={[styles.kpiCard, { marginTop: 0 }]}>
            <View style={styles.kpiTop}>
              <IconChip name="phone-portrait-outline" tone="neutral" />
              <Text style={styles.kpiLabel}>Appareil</Text>
            </View>
            <Text style={styles.kpiValueSmall} numberOfLines={1}>
              {fmt(terminal?.manufacturer)} {fmt(terminal?.model)}
            </Text>
            <Text style={styles.kpiFoot} numberOfLines={1}>
              AndroidId: {fmt(terminal?.androidId)}
            </Text>
          </GlassCard>
        </View>
      </GlassCard>

      <View style={styles.sectionHead}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <IconChip name="pulse-outline" tone="neutral" />
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Dernières télémétries</Text>
            <Text style={styles.sectionSub} numberOfLines={2}>
              Appuyez sur une carte pour ouvrir le détail.
            </Text>
          </View>
        </View>

        <StatusPill tone="info" icon="list-outline" label={`Entrées: ${fmt(telemetry?.length ?? 0)}`} />
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.page}>
        <SoftBackdrop />
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.centerText}>Chargement de la fiche…</Text>
        </View>
        <BottomBar active="home" />
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

          <Pressable
            onPress={load}
            style={({ pressed }) => [
              styles.primaryBtn,
              { marginTop: 12, alignSelf: "flex-start" },
              pressed && { transform: [{ scale: 0.99 }] },
            ]}
          >
            <Ionicons name="refresh" size={16} color={UI.ink} />
            <Text style={styles.primaryBtnText}>Réessayer</Text>
          </Pressable>
        </GlassCard>
      ) : null}

      <FlatList
        data={telemetry}
        keyExtractor={(it) => String(it.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={UI.ink} />}
        ListHeaderComponent={hero}
        contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const batt =
            item.batteryPercent === null || item.batteryPercent === undefined
              ? null
              : clamp(Number(item.batteryPercent), 0, 100);

          const battLabel = batt === null ? "—" : `${batt}%`;
          const net = fmt(item.networkType);
          const addr = fmt(item.addressLine);
          const city = fmt(item.city);
          const captured = toDateLabel(item.capturedAt);

          const toneB = toneForBattery(batt) as any;
          const toneN = toneForNetwork(net) as any;

          return (
            <GlassCard style={{ marginTop: 12 }}>
              <Pressable
                onPress={() => router.push({ pathname: "/telemetry/[id]", params: { id: String(item.id) } })}
                style={({ pressed }) => [styles.telPress, pressed && { transform: [{ scale: 0.995 }] }]}
              >
                <View style={styles.telTop}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                    <IconChip name="wifi-outline" tone={toneN} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.telTitle} numberOfLines={1}>
                        Réseau: {net}
                      </Text>
                      <Text style={styles.telSub} numberOfLines={1}>
                        Capturé: {captured}
                      </Text>
                    </View>
                  </View>

                  <StatusPill
                    tone={toneB}
                    icon={batteryIcon(batt, item.charging ?? null)}
                    label={`Batterie: ${battLabel}`}
                  />
                </View>

                <Divider />

                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color={UI.muted2} />
                  <Text style={styles.infoText} numberOfLines={2}>
                    {addr !== "—" ? addr : `Ville: ${city}`}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="navigate-outline" size={16} color={UI.muted2} />
                  <Text style={styles.infoText} numberOfLines={1}>
                    GPS: {fmt(item.gpsLat)} , {fmt(item.gpsLng)} (± {fmt(item.gpsAccuracy)}m)
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="cellular-outline" size={16} color={UI.muted2} />
                  <Text style={styles.infoText} numberOfLines={1}>
                    Signal: {fmt(item.signalLevel)} • IP: {fmt(item.ipAddress)}
                  </Text>
                </View>

                <View style={styles.quickRow}>
                  <View style={styles.quickChip}>
                    <Ionicons name="reader-outline" size={14} color={UI.ink} />
                    <Text style={styles.quickChipText}>Lectures: {fmt(item.cardReadsSinceBoot)}</Text>
                  </View>
                  <View style={styles.quickChip}>
                    <Ionicons name="swap-horizontal-outline" size={14} color={UI.ink} />
                    <Text style={styles.quickChipText}>Transactions: {fmt(item.transactionsSinceBoot)}</Text>
                  </View>
                  <View style={styles.quickChip}>
                    <Ionicons name="alert-outline" size={14} color={UI.ink} />
                    <Text style={styles.quickChipText}>Erreurs: {fmt(item.errorsSinceBoot)}</Text>
                  </View>
                </View>
              </Pressable>
            </GlassCard>
          );
        }}
        ListEmptyComponent={
          <GlassCard style={{ marginTop: 12 }}>
            <Text style={styles.emptyTitle}>Aucune télémétrie</Text>
            <Text style={styles.emptyText}>Aucune entrée n’a été enregistrée pour ce terminal.</Text>

            <Pressable
              onPress={load}
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

      {/* Modal Rename */}
      <Modal visible={renameOpen} animationType="fade" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlayCenter}
        >
          <GlassCard strong style={styles.renameModal}>
            <View style={styles.modalTop}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                <IconChip name="pencil-outline" tone="neutral" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    Renommer le terminal
                  </Text>
                  <Text style={styles.modalSub} numberOfLines={1}>
                    SN: {fmt(terminal?.serialNumber)} • ID: {fmt(terminal?.id)}
                  </Text>
                </View>
              </View>

              <Pressable onPress={() => setRenameOpen(false)} style={styles.iconBtn}>
                <Ionicons name="close" size={18} color={UI.ink} />
              </Pressable>
            </View>

            <Divider />

            <Text style={styles.fieldLabel}>Nom affiché (ex: “TPE Caisse 1”, “Agence Louis”)</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="text-outline" size={16} color={UI.muted2} />
              <TextInput
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Saisir un nom…"
                placeholderTextColor={UI.muted2}
                style={styles.input}
                autoCapitalize="sentences"
                autoCorrect={false}
                maxLength={60}
                returnKeyType="done"
                onSubmitEditing={saveRename}
              />
            </View>

            <Text style={styles.hint}>
              Astuce: utilisez un nom humain + contexte (agence, caisse, ligne bus) pour les équipes non-tech.
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setRenameOpen(false)}
                style={({ pressed }) => [styles.secondaryBtn, pressed && { transform: [{ scale: 0.99 }] }]}
                disabled={renameSaving}
              >
                <Ionicons name="close-outline" size={16} color={UI.ink} />
                <Text style={styles.secondaryBtnText}>Annuler</Text>
              </Pressable>

              <Pressable
                onPress={saveRename}
                style={({ pressed }) => [styles.primaryBtn, pressed && { transform: [{ scale: 0.99 }] }]}
                disabled={renameSaving}
              >
                {renameSaving ? (
                  <ActivityIndicator />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color={UI.ink} />
                    <Text style={styles.primaryBtnText}>Enregistrer</Text>
                  </>
                )}
              </Pressable>
            </View>
          </GlassCard>
        </KeyboardAvoidingView>
      </Modal>

      <BottomBar active="home" />
    </View>
  );
}

/* =========================
   Bottom bar (same as index)
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
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.navItem, pressed && { transform: [{ scale: 0.99 }] }]}
      >
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
   Styles (same language as index)
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

  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  backBtn: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backText: { color: UI.ink, fontWeight: "900" },

  heroRow: { marginTop: 10, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  heroTitle: { color: UI.ink, fontSize: 16, fontWeight: "900" },
  heroSub: { marginTop: 8, color: UI.muted, fontWeight: "700", lineHeight: 18, maxWidth: 820 },
  heroMetaRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 },

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

  kpiRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  kpiCard: { flex: 1, minWidth: 220 },
  kpiTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  kpiLabel: { color: UI.muted, fontWeight: "900" },
  kpiValueSmall: { marginTop: 12, color: UI.ink, fontSize: 14, fontWeight: "900", lineHeight: 18 },
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

  // Telemetry card
  telPress: { borderRadius: 18 },
  telTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  telTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  telSub: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  infoText: { color: UI.ink, fontWeight: "900", fontSize: 13, flex: 1 },

  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quickChipText: { color: UI.ink, fontWeight: "900", fontSize: 12 },

  emptyTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  emptyText: { marginTop: 8, color: UI.muted, fontWeight: "800", lineHeight: 18 },

  // Error
  errTitle: { color: UI.ink, fontWeight: "900" },
  errText: { marginTop: 8, color: UI.muted, fontWeight: "800", lineHeight: 18 },

  // Modal
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 14,
  },
  renameModal: { width: "100%", maxWidth: 980, alignSelf: "center" },
  modalTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  modalTitle: { color: UI.ink, fontWeight: "900", fontSize: 14 },
  modalSub: { marginTop: 6, color: UI.muted2, fontWeight: "800", fontSize: 12 },

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

  fieldLabel: { color: UI.muted, fontWeight: "900", marginTop: 2 },
  inputWrap: {
    marginTop: 10,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: { flex: 1, color: UI.ink, fontWeight: "900" },
  hint: { marginTop: 10, color: UI.muted2, fontWeight: "800", lineHeight: 18 },

  modalActions: { marginTop: 14, flexDirection: "row", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" },

  // Bottom bar (same as index)
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