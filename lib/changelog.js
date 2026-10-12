// User-facing release notes, newest first. Shown once per version by
// components/WhatsNew.jsx. Keep bullets short and plain.
// `silent: true` marks a release that updates by itself and is never listed
// (it must match SILENT_UPDATE in public/sw.js).
export const CHANGELOG = [
  {
    version: "0.7.0",
    title: "Smoother, darker, made for the kitchen",
    items: [
      "Cooking view: one big step per screen, swipe or tap Next. The ingredients each step needs are on top, the screen stays on, and the app remembers your step",
      "Tap an underlined ingredient in a step to see how much of it you need",
      "Photos fly from the list into the recipe and back, and tabs slide",
      "Dark theme that follows your phone's setting",
      "Shopping list sorted by supermarket aisle, and Send list shares what is left to buy",
      "Everything in Saved and My kitchen opens without internet too",
      "A light tap of vibration when you tick, save or add",
    ],
  },
  {
    version: "0.6.2",
    title: "Share everything, kept in sync",
    items: [
      "Saved, ⋯, Share everything now links the other phone: it gets all your saved recipes, folders and kitchen, and both stay in sync from then on",
      "A single recipe or folder is still shared as a copy",
    ],
  },
  {
    version: "0.6.1",
    title: "QR codes",
    items: [
      "Share shows a QR code for recipes and folders. On the other phone tap the new scan icon at the top: it opens right in the app, not in Safari",
      "Link devices for sync by scanning the QR code instead of typing the digits",
    ],
  },
  {
    version: "0.6.0",
    title: "Share and sync",
    items: [
      "Share a recipe from its page: AirDrop, Messages, Telegram or a copied link",
      "Share a folder (⋯ on the folder) or everything you saved (⋯ next to Folders). The other person saves their own copy",
      "Sync your devices: link your phone and laptop with a 6 digit code (bottom of My kitchen or Saved) and they keep the same kitchen and saved recipes",
    ],
  },
  {
    version: "0.5.0",
    title: "Recipes from your other device",
    items: [
      "When another phone or laptop on the same Wi-Fi has a recipe open, a chip at the bottom offers to open it here too",
      "Already cooking something? The chip still shows, tap it to switch to the other device's recipe",
    ],
  },
  { version: "0.4.4", title: "Bottom bar fix", silent: true, items: [] },
  {
    version: "0.4.3",
    title: "Easier update alerts",
    items: [
      "Turning on update alerts no longer asks for an access code, just tap the button",
    ],
  },
  {
    version: "0.4.2",
    title: "Update alerts",
    items: [
      "Optional: get a notification on your iPhone when a new version is ready (My kitchen, bottom of the page). At most one a day.",
    ],
  },
  {
    version: "0.4.1",
    title: "Steadier bottom bar",
    items: [
      "The bottom tab bar stays pinned to the bottom of the screen on iPhone, even after the keyboard closes",
    ],
  },
  {
    version: "0.4.0",
    title: "Folders for your Saved recipes",
    items: [
      "Sort saved recipes into folders, each with its own emoji and color",
      "Add a recipe to folders right from the recipe page or your Saved list",
      "Just saved something? Tap “Add to folder” in the message that pops up",
      "Removed a recipe by mistake? Tap Undo",
    ],
  },
  {
    version: "0.3.0",
    title: "A proper app for your phone",
    items: [
      "Add it to your iPhone home screen and it works offline",
      "Photos load faster",
      "New bottom tabs, plus a chip to jump back into the recipe you're cooking",
      "Your filters stay put when you go back",
      "Smarter ingredient search that knows synonyms (coriander = cilantro)",
      "Filter by cooking time range",
      "Sort and filter your Saved recipes",
      "Zoom in on recipe photos",
    ],
  },
];
