const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PLANETS_FILE = path.join(DATA_DIR, 'planets.json');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');

// In-Memory Cache to eliminate repeated disk I/O
let cachedPlanets = [];
let cachedFavorites = [];

function refreshCache() {
  try {
    if (fs.existsSync(PLANETS_FILE)) {
      const raw = fs.readFileSync(PLANETS_FILE, 'utf8');
      cachedPlanets = JSON.parse(raw).planets || [];
    }
  } catch (err) {
    console.error('Failed reading planets cache:', err);
  }

  try {
    if (!fs.existsSync(FAVORITES_FILE)) {
      fs.writeFileSync(FAVORITES_FILE, JSON.stringify({ favorites: [] }, null, 2));
    }
    const raw = fs.readFileSync(FAVORITES_FILE, 'utf8');
    cachedFavorites = JSON.parse(raw).favorites || [];
  } catch (err) {
    console.error('Failed reading favorites cache:', err);
  }
}
refreshCache();

// Telemetry state
const telemetry = {
  startedAt: new Date().toISOString(),
  totalJumps: 0,
  planetVisits: {
    mercury: 0,
    venus: 0,
    earth: 12,
    mars: 28,
    jupiter: 0,
    saturn: 0,
    uranus: 0,
    neptune: 0
  }
};

const triviaList = [
  "One day on Venus is longer than one year on Venus — it rotates slower than its orbit!",
  "A sunset on Mars appears distinctly blue due to fine dust scattering red light in the thin atmosphere.",
  "Jupiter has 95 officially recognized moons, including Ganymede, which is larger than Mercury.",
  "Saturn's rings are mostly made of 99% pure water ice chunks ranging from pebble to mountain size.",
  "Uranus is the only planet named after a Greek god rather than a Roman god.",
  "Neptune's wind speeds can surpass 2,100 km/h (1,300 mph), faster than the speed of sound on Earth.",
  "Mercury has extreme temperature swings from 430°C in daylight down to -180°C at night.",
  "Light takes approximately 8 minutes and 20 seconds to travel from the Sun to Earth."
];

// High-Performance Middleware
app.use(cors());
app.use(compression({ level: 6 })); // Fast Gzip compression
app.use(express.json());

// Aggressive caching for static assets & media
app.use((req, res, next) => {
  if (req.url.match(/\.(svg|png|jpg|jpeg|mp4|webm|woff2|woff|css|js)$/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (req.url.match(/\.(html)$/)) {
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
});

// Serve primary 3D experience at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'planet-jumping.html'));
});

// Serve static frontend files
app.use(express.static(__dirname, {
  etag: true,
  lastModified: true,
  maxAge: '1d'
}));

function persistFavorites() {
  try {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify({ favorites: cachedFavorites }, null, 2));
  } catch (err) {
    console.error('Failed to persist favorites:', err);
  }
}

// ----------------- FAST REST API ROUTES ----------------- //

// Health & System diagnostics
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'YASH 3D Planetary Engine Backend',
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  });
});

// All Planets (Served from in-memory cache)
app.get('/api/planets', (req, res) => {
  res.json({
    success: true,
    count: cachedPlanets.length,
    planets: cachedPlanets
  });
});

// Single Planet details
app.get('/api/planets/:id', (req, res) => {
  const id = req.params.id.toLowerCase();
  const planet = cachedPlanets.find(p => p.id === id || p.name.toLowerCase() === id);

  if (!planet) {
    return res.status(404).json({ success: false, error: 'Planet not found' });
  }

  res.json({ success: true, planet });
});

// Telemetry & Stats
app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    telemetry: {
      ...telemetry,
      uptimeSeconds: Math.floor(process.uptime())
    }
  });
});

// Record visit / jump
app.post('/api/telemetry/visit', (req, res) => {
  const { planetId } = req.body;
  if (planetId && telemetry.planetVisits[planetId.toLowerCase()] !== undefined) {
    telemetry.planetVisits[planetId.toLowerCase()]++;
    telemetry.totalJumps++;
    return res.json({ success: true, visits: telemetry.planetVisits[planetId.toLowerCase()] });
  }
  res.json({ success: false, message: 'Invalid planet ID' });
});

// Bookmarks / Favorites
app.get('/api/favorites', (req, res) => {
  res.json({ success: true, favorites: cachedFavorites });
});

app.post('/api/favorites', (req, res) => {
  const { planetId, note } = req.body;
  if (!planetId) {
    return res.status(400).json({ success: false, error: 'planetId is required' });
  }

  const id = planetId.toLowerCase();
  const planet = cachedPlanets.find(p => p.id === id);
  const name = planet ? planet.name : planetId;

  const existingIdx = cachedFavorites.findIndex(f => f.id === id);
  if (existingIdx >= 0) {
    cachedFavorites[existingIdx].savedAt = new Date().toISOString();
    if (note) cachedFavorites[existingIdx].note = note;
  } else {
    cachedFavorites.push({
      id,
      name,
      savedAt: new Date().toISOString(),
      note: note || 'Bookmarked during interplanetary orbit'
    });
  }

  persistFavorites();
  res.json({ success: true, message: `Planet ${name} added to expedition favorites`, favorites: cachedFavorites });
});

app.delete('/api/favorites/:id', (req, res) => {
  const id = req.params.id.toLowerCase();
  cachedFavorites = cachedFavorites.filter(f => f.id !== id);
  persistFavorites();
  res.json({ success: true, message: `Removed ${id} from favorites`, favorites: cachedFavorites });
});

// Space trivia
app.get('/api/trivia', (req, res) => {
  const randomFact = triviaList[Math.floor(Math.random() * triviaList.length)];
  res.json({
    success: true,
    trivia: randomFact,
    allTrivia: triviaList
  });
});

// Fallback to planet-jumping.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'planet-jumping.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`⚡ [YASH Planetary Engine] Optimized Server running at http://localhost:${PORT}`);
  console.log(`🌌 In-memory cached dataset ready (${cachedPlanets.length} planets)`);
});

module.exports = app;
