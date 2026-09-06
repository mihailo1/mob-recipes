import SearchApp from "../components/SearchApp";

export default function HomePage() {
  return (
    <div className="container">
      <header className="header">
        <h1>Mob Recipes Archive</h1>
        <p>
          A personal, searchable mirror of mob.co.uk recipes — built from the
          site&apos;s own public recipe data.
        </p>
      </header>
      <SearchApp />
      <p className="footer-note">
        Recipe content belongs to Mob (mob.co.uk). This is an unofficial,
        personal archive for search/reference — not affiliated with Mob.
      </p>
    </div>
  );
}
