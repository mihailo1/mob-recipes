import SearchApp from "../components/SearchApp";

export default function HomePage() {
  return (
    <div className="container">
      <SearchApp />
      <p className="footer-note">
        Recipe content belongs to Mob (mob.co.uk). This is an unofficial,
        personal archive for search/reference — not affiliated with Mob.
      </p>
    </div>
  );
}
