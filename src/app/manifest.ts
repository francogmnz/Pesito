import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pesito · Cada pesito cuenta.",
    short_name: "Pesito",
    description: "Promos bancarias, cupones y beneficios de cumpleaños de Argentina en un solo lugar.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7ef",
    theme_color: "#f5f7ef",
    lang: "es-AR",
    icons: [
      { src: "/brand/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
