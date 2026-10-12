import "./globals.css";
import { KitchenProvider } from "../lib/store";
import NavBar from "../components/NavBar";
import SWRegister from "../components/SWRegister";
import IOSZoomGuard from "../components/IOSZoomGuard";
import ViewportFix from "../components/ViewportFix";
import NearbySync from "../components/NearbySync";
import SyncEngine from "../components/SyncEngine";
import Providers from "../components/Providers";
import AppNotices from "../components/AppNotices";
import GlobalOverlays from "../components/GlobalOverlays";
import OfflineKeeper from "../components/OfflineKeeper";
import { APP_VERSION } from "../lib/version";

export const metadata = {
  title: "Mob Recipes Archive",
  description:
    "A searchable personal archive of Mob (mob.co.uk) recipes, built from the site's own public recipe data.",
  applicationName: "Mob Recipes",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Mob",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

// Matches --bg in app/globals.css for the light and the dark theme.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#131511" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <KitchenProvider>
            <NavBar />
            {children}
            <p className="upd-version">Mob Recipes v{APP_VERSION}</p>
            <AppNotices />
            <GlobalOverlays />
            <SyncEngine />
            <OfflineKeeper />
          </KitchenProvider>
        </Providers>
        <SWRegister />
        <IOSZoomGuard />
        <ViewportFix />
        <NearbySync />
      </body>
    </html>
  );
}
