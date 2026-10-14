// Word pools used by the game, per language.
// English: lowercase a-z only. Hebrew: letters only, no niqqud, spaces or punctuation.
const WORDS = {
  en: {
    easy: [
      "cat", "dog", "sun", "run", "map", "key", "fox", "ice", "jet", "web",
      "bug", "code", "byte", "data", "fire", "bolt", "moon", "star", "wave", "zone",
      "grid", "loop", "node", "ping", "hack", "beam", "core", "dash", "echo", "flux",
      "glow", "hero", "iron", "jump", "kite", "lava", "mist", "nova", "orb", "quiz",
      "ray", "sky", "tank", "unit", "volt", "wing", "yard", "zap", "arc", "gem",
    ],
    medium: [
      "rocket", "shield", "laser", "orbit", "planet", "signal", "vector", "cipher", "binary", "cursor",
      "matrix", "plasma", "quartz", "radar", "sensor", "turret", "defend", "galaxy", "comet", "meteor",
      "photon", "proton", "switch", "script", "module", "socket", "thread", "kernel", "packet", "router",
      "server", "object", "method", "string", "number", "import", "export", "canvas", "render", "update",
      "frame", "pixel", "sprite", "engine", "impact", "cannon", "target", "ranger", "shadow", "thunder",
      "crystal", "station", "harbor", "voyage", "jungle", "yellow", "zenith", "nebula", "venom", "lunar",
    ],
    hard: [
      "asteroid", "satellite", "algorithm", "framework", "interface", "javascript", "stylesheet", "generator",
      "component", "lightning", "starship", "telescope", "hyperdrive", "firewall", "encryption", "bandwidth",
      "processor", "variable", "function", "reflection", "navigation", "dimension", "atmosphere", "commander",
      "reinforce", "fortress", "invisible", "spaceship", "blueprint", "overclock", "debugging", "recursion",
      "prototype", "keyboard", "quarantine", "wavelength", "magnitude", "outpost", "zeppelin", "juggernaut",
    ],
    boss: [
      "constellation", "electromagnetic", "interplanetary", "extraterrestrial", "thermodynamics",
      "synchronization", "infrastructure", "hyperspace", "gravitational", "intergalactic",
      "reconnaissance", "mothership", "annihilation", "obliteration", "juxtaposition",
    ],
  },

  he: {
    easy: [
      "אב", "אם", "בן", "בת", "יד", "עץ", "גן", "דג", "ים", "הר",
      "לב", "אור", "אש", "מים", "שמש", "ירח", "כוכב", "גל", "חול", "סוס",
      "דוב", "כלב", "חתול", "ספר", "בית", "דלת", "חלון", "שיר", "לחם", "חלב",
      "תפוח", "עוף", "נמר", "זאב", "פיל", "קוף", "רוח", "ענן", "גשם", "שלג",
      "קיר", "מגן", "חץ", "קשת", "טיל", "חרב", "צבע", "זהב", "כסף", "ברק",
    ],
    medium: [
      "מקלדת", "מחשב", "חללית", "שביט", "מטאור", "גלקסיה", "מבצר", "מגדל", "לוחם", "ניצחון",
      "תותח", "רובוט", "מכונה", "תוכנה", "אתגר", "הגנה", "התקפה", "מהירות", "אנרגיה", "סערה",
      "רעם", "ספינה", "מטוס", "רכבת", "אופניים", "עולם", "שמיים", "כדור", "פרפר", "נחש",
      "תנין", "ארנב", "חברים", "תלמיד", "מורה", "שולחן", "כיסא", "מנורה", "מפתח", "טלפון",
      "מצלמה", "משקפיים", "עיפרון", "מחברת", "אדום", "כחול", "ירוק", "לבן", "שחור", "צוללת",
    ],
    hard: [
      "אסטרונאוט", "טלסקוף", "אלגוריתם", "אינטרנט", "אוניברסיטה", "ירושלים", "ספרייה", "מחשבון",
      "לוויין", "טורנדו", "הוריקן", "פרויקט", "מתכנת", "מדענים", "מעבדה", "ממשלה",
      "היסטוריה", "גאוגרפיה", "מתמטיקה", "פיזיקה", "ביולוגיה", "כימיה", "הרפתקה", "מסתורין",
      "טכנולוגיה", "מכונית", "מסוק", "חלליות", "כוכבים", "מטאורים", "צוללות", "ניווט",
    ],
    boss: [
      "אנציקלופדיה", "טכנולוגיות", "אוניברסיטאות", "התגוננות", "אסטרונומיה",
      "מתמטיקאים", "ארכיאולוגיה", "פסיכולוגיה", "התפתחות", "ביוטכנולוגיה",
      "אלקטרומגנטי", "הסתערות", "אינטליגנציה", "קונסטלציה",
    ],
  },
};
