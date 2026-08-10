import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CMS",
    short_name: "CMS",
    description: "Turn your church's content into a conversation.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f3",
    theme_color: "#b87b38",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
