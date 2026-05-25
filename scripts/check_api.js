async function check() {
  const res = await fetch('http://127.0.0.1:8080/api/sync/state');
  const json = await res.json();
  console.log('Watchlist:', json.trackerWatchlist?.length);
  console.log('Entries:', json.trackerEntries?.length);
}
check();
