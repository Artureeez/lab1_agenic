# Typing Defence

A browser typing game. Enemies fly toward your base and each one carries a word. Type the word to shoot the enemy down before it reaches you.

Built with plain **HTML, CSS and JavaScript**: no build step and no dependencies.

## How to play

- Type the **first letter** of a word to lock onto that enemy (the closest match is picked).
- Keep typing to finish the word. Each correct letter fires a shot.
- A typo resets your **combo**. A higher combo gives more points per kill.
- If you clear a wave without taking damage, the base repairs 1 HP.
- Every 5th wave has a **boss** with a short sentence to type (spaces count, shown as `·`). It does 3 damage if it reaches you.
- `Enter` starts the game, and `Esc` pauses it.

## Power-ups

Glowing orbs sometimes fall from the sky carrying an easy word. Type the word to collect the power-up. They never damage your base.

| Power-up        | Effect                                              | How often |
| --------------- | --------------------------------------------------- | --------- |
| ❤ Repair        | Restores 3 base HP                                  | Common    |
| ❄ Slow-mo       | Enemies move at 30% speed for 10 seconds            | Common    |
| ★ Cheat mode    | Any key counts as the correct letter for 20 seconds | Rare      |

## Name and leaderboard

Enter your name on the start screen. The top 10 scores are saved in your browser, with a separate leaderboard for each language and difficulty (Easy / Normal / Hard). Open it from **🏆 Leaderboard** on the start screen. The game-over screen shows where you placed. Scores are saved in this browser only and aren't shared with other players.

## Sound

Background music is generated in the browser while you play, so there are no audio files. It speeds up in later waves and slows down during slow-mo. 🎵 turns the music on and off, and 🔊 does the same for sound effects.

## Languages

Pick **English** or **עברית (Hebrew)** on the start screen. In Hebrew mode the enemies carry Hebrew words and the menus switch to right-to-left.

You don't need to change your computer's keyboard language. The game reads which physical key you pressed and uses the standard Israeli layout (for example, the `A` key types `ש` in Hebrew mode). Final letters (ך ם ן ף ץ) are separate keys, as on a real Hebrew keyboard.

## Files

| File         | Purpose                                    |
| ------------ | ------------------------------------------ |
| `index.html`     | Page layout, HUD and menus                          |
| `style.css`      | Styling                                             |
| `storage.js`     | Safe wrapper around browser storage                 |
| `words.js`       | Word lists per language (easy, medium, hard, boss sentences) |
| `i18n.js`        | Menu text and keyboard layouts per language         |
| `audio.js`       | Sound effects and generated background music        |
| `leaderboard.js` | Local top-10 leaderboard                            |
| `script.js`      | Game loop, typing, power-ups, rendering, menus      |

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Host on GitHub Pages

1. Push these files to the root of a GitHub repository.
2. On GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, set *Source* to **Deploy from a branch**, then pick `main` and `/ (root)`.
4. After about a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.
