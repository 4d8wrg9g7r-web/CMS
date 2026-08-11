import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import type { AppLinkTarget, AppPageBlock, AppTab } from "../contract";

/**
 * Native renderer for custom app pages — the upgrade the link-target model was
 * designed for: `tab` switches the bottom bar, `inapp` opens the IN-APP browser
 * (SFSafariViewController / Custom Tabs via expo-web-browser), `external` hands
 * off to the system browser.
 */

export function openTarget(target: AppLinkTarget, tabs: AppTab[], selectTab: (index: number) => void) {
  if (target.kind === "tab") {
    const index = tabs.findIndex((t) => t.kind === target.tab);
    selectTab(index >= 0 ? index : 0);
    return;
  }
  if (target.kind === "inapp") {
    void WebBrowser.openBrowserAsync(target.url);
    return;
  }
  void Linking.openURL(target.url);
}

export function PageBlocks({
  blocks,
  accent,
  tabs,
  selectTab,
}: {
  blocks: AppPageBlock[];
  accent: string;
  tabs: AppTab[];
  selectTab: (index: number) => void;
}) {
  return (
    <View style={styles.column}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "image": {
            const image = (
              <Image source={{ uri: block.url }} accessibilityLabel={block.alt} style={styles.image} resizeMode="cover" />
            );
            return block.link ? (
              <Pressable key={i} onPress={() => openTarget(block.link!, tabs, selectTab)}>
                {image}
              </Pressable>
            ) : (
              <View key={i}>{image}</View>
            );
          }
          case "heading":
            return (
              <Text key={i} style={styles.heading}>
                {block.text}
              </Text>
            );
          case "text":
            return (
              <Text key={i} style={styles.body}>
                {block.text}
              </Text>
            );
          case "button":
            return (
              <Pressable
                key={i}
                onPress={() => openTarget(block.target, tabs, selectTab)}
                style={[styles.button, { backgroundColor: accent }]}
              >
                <Text style={styles.buttonText}>{block.label}</Text>
              </Pressable>
            );
          case "divider":
            return <View key={i} style={styles.divider} />;
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  image: { width: "100%", aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: "#e5e5e2" },
  heading: { fontSize: 18, fontWeight: "700", color: "#171717", marginTop: 4 },
  body: { fontSize: 14, lineHeight: 20, color: "#404040" },
  button: { borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  buttonText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#e5e5e5" },
});
