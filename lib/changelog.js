// User-facing release notes, newest first. Shown once per version by
// components/WhatsNew.jsx. Keep bullets short and plain.
// `silent: true` marks a release that updates by itself and is never listed
// (it must match SILENT_UPDATE in public/sw.js).
export const CHANGELOG = [
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
