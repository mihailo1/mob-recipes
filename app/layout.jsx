import "./globals.css";
import { KitchenProvider } from "../lib/store";
import NavBar from "../components/NavBar";

export const metadata = {
  title: "Mob Recipes Archive",
  description:
    "A searchable personal archive of Mob (mob.co.uk) recipes, built from the site's own public recipe data.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <KitchenProvider>
          <NavBar />
          {children}
        </KitchenProvider>
      </body>
    </html>
  );
}
