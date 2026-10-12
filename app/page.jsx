import SearchApp, { SearchAppSkeleton } from "../components/SearchApp";
import PageTransition from "../components/PageTransition";
import FirstLoadSuspense from "../components/FirstLoadSuspense";

export default function HomePage() {
  return (
    <PageTransition>
      <div className="container">
        {/* SearchApp reads the URL (useSearchParams), so on this static page it
            renders on the client only, below this boundary (first load only). */}
        <FirstLoadSuspense fallback={<SearchAppSkeleton />}>
          <SearchApp />
        </FirstLoadSuspense>
        <p className="footer-note">
          Recipe content belongs to Mob (mob.co.uk). This is an unofficial,
          personal archive for search/reference — not affiliated with Mob.
        </p>
      </div>
    </PageTransition>
  );
}
