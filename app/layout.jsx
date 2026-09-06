import "./globals.css";

export const metadata = {
  title: "Mob Recipes Archive",
  description:
    "A searchable personal archive of Mob (mob.co.uk) recipes, built from the site's own public recipe data.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
