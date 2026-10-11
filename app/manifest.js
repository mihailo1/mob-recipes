export default function manifest() {
  return {
    id: "/",
    name: "Mob Recipes",
    short_name: "Mob",
    description:
      "A searchable personal archive of Mob (mob.co.uk) recipes, built from the site's own public recipe data.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#fafaf6",
    background_color: "#fafaf6",
    categories: ["food", "lifestyle"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
