import "./globals.css";
import { KitchenProvider } from "../lib/store";
import NavBar from "../components/NavBar";
import SWRegister from "../components/SWRegister";
import IOSZoomGuard from "../components/IOSZoomGuard";

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

// No dark theme in globals.css yet, so a single theme color.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#fafaf6",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <KitchenProvider>
          <NavBar />
          {children}
        </KitchenProvider>
        <SWRegister />
        <IOSZoomGuard />
      </body>
    </html>
  );
}
