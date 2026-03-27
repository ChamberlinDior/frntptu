import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0B0F12" },
          headerTintColor: "#FFFFFF",
          contentStyle: { backgroundColor: "#0B0F12" },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="terminal/[id]"
          options={{ title: "Terminal" }}
        />
        <Stack.Screen
          name="telemetry/[id]"
          options={{ title: "Telemetry" }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Config" }}
        />
      </Stack>
    </>
  );
}
