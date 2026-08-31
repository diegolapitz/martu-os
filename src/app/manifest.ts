import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Martu OS",
    short_name: "Martu OS",
    description: "Una supervisora contextual para el trabajo de Martu.",
    start_url: "/day",
    display: "standalone",
    background_color: "#f5f3ec",
    theme_color: "#f5f3ec",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}

