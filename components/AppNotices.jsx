"use client";

import { useNotices } from "../lib/notices";
import UpdatePrompt from "./UpdatePrompt";
import WhatsNew from "./WhatsNew";
import NewRecipesNotice from "./NewRecipesNotice";

// At most one notice on screen: update prompt > what's new > new recipes.
// In-app only: no Notification API, no push.
export default function AppNotices() {
  const { update, whatsNew } = useNotices();
  return (
    <>
      <UpdatePrompt />
      <WhatsNew blocked={!!update} />
      <NewRecipesNotice blocked={!!update || whatsNew} />
    </>
  );
}
