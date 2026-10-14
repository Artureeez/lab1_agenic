# Typing Defence

A browser typing game. Enemies fly toward your base and each one carries a word. Type the word to shoot the enemy down before it reaches you.

Built with plain **HTML, CSS and JavaScript**: no build step and no dependencies.

## How to play

- Type the **first letter** of a word to lock onto that enemy (the closest match is picked).
- Keep typing to finish the word. Each correct letter fires a shot.
- A typo resets your **combo**. A higher combo gives more points per kill.
- If you clear a wave without taking damage, the base repairs 1 HP.
- Every 5th wave has a **boss** with a long word. It does 3 damage if it reaches you.
- `Enter` starts the game, and `Esc` pauses it.

Best scores are saved in your browser for each difficulty (Easy / Normal / Hard).

## Files

| File         | Purpose                                    |
| ------------ | ------------------------------------------ |
| `index.html` | Page layout, HUD and menus                 |
| `style.css`  | Styling                                    |
| `words.js`   | Word lists (easy, medium, hard, boss)      |
| `script.js`  | Game loop, typing logic, rendering, sound  |

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
