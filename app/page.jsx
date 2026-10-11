import { Suspense } from "react";
import SearchApp, { SearchAppSkeleton } from "../components/SearchApp";

export default function HomePage() {
  return (
    <div className="container">
      {/* SearchApp reads the URL (useSearchParams), so on this static page it
          renders on the client only, below this boundary. */}
      <Suspense fallback={<SearchAppSkeleton />}>
        <SearchApp />
      </Suspense>
      <p className="footer-note">
        Recipe content belongs to Mob (mob.co.uk). This is an unofficial,
        personal archive for search/reference — not affiliated with Mob.
      </p>
    </div>
  );
}
