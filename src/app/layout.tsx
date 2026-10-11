import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Pesito · Todas tus promos en un solo lugar.", template: "%s · Pesito" },
  description: "Promos bancarias, cupones de primera compra y beneficios de cumpleaños de Argentina, en un solo lugar.",
  applicationName: "Pesito",
  appleWebApp: { capable: true, title: "Pesito", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f5f7ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
