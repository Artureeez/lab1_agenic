// Local leaderboard: top scores saved in this browser, one board per
// language + difficulty combination.
const LEADERBOARD_SIZE = 10;

const leaderboard = {
  key(language, difficulty) {
    return `td.board.${language}.${difficulty}`;
  },

  load(language, difficulty) {
    const list = storage.get(this.key(language, difficulty), []);
    return Array.isArray(list) ? list : [];
  },

  // Adds an entry and returns its 1-based rank, or 0 if it didn't place.
  add(language, difficulty, entry) {
    if (entry.score <= 0) return 0;
    const list = this.load(language, difficulty);
    const record = { ...entry, at: Date.now() };
    list.push(record);
    list.sort((a, b) => b.score - a.score || a.at - b.at);
    const top = list.slice(0, LEADERBOARD_SIZE);
    storage.set(this.key(language, difficulty), top);
    return top.indexOf(record) + 1;
  },

  topScore(language, difficulty) {
    const list = this.load(language, difficulty);
    return list.length ? list[0].score : 0;
  },
};
