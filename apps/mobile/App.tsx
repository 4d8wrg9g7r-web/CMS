import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { ChurchAppScreen } from "./src/screens/ChurchAppScreen";
import { DirectoryScreen } from "./src/screens/DirectoryScreen";

/**
 * Root of the container app (docs/domain/app.md "Container experience").
 * Two variants from ONE codebase, decided at build time in app.config.ts:
 *   - container: church picker (directory) → church app; selection persisted.
 *   - white-label: `pinnedAppId` locks the app to one church — no picker,
 *     no switch button, their brand only.
 */

const SELECTED_KEY = "cms.selectedAppId";

export default function App() {
  const rawPinned = (Constants.expoConfig?.extra as { pinnedAppId?: unknown } | undefined)?.pinnedAppId;
  const pinnedAppId = typeof rawPinned === "string" && rawPinned ? rawPinned : null;
  const [selected, setSelected] = useState<string | null>(pinnedAppId);
  const [restored, setRestored] = useState(Boolean(pinnedAppId));

  useEffect(() => {
    if (pinnedAppId) return;
    void AsyncStorage.getItem(SELECTED_KEY).then((saved) => {
      if (saved) setSelected(saved);
      setRestored(true);
    });
  }, [pinnedAppId]);

  if (!restored) return null;

  return (
    <>
      <StatusBar style="light" />
      {selected ? (
        <ChurchAppScreen
          publicAppId={selected}
          onSwitchChurch={
            pinnedAppId
              ? null
              : () => {
                  void AsyncStorage.removeItem(SELECTED_KEY);
                  setSelected(null);
                }
          }
        />
      ) : (
        <DirectoryScreen
          onSelect={(entry) => {
            void AsyncStorage.setItem(SELECTED_KEY, entry.public_app_id);
            setSelected(entry.public_app_id);
          }}
        />
      )}
    </>
  );
}
