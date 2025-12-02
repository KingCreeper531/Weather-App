// Storm Surge Weather — Open‑Meteo powered
// Features: default Columbus OH, ZIP lookup, theming by weather,
// hourly (12h) + 10-day forecasts, RainViewer radar embed.

const zipInput = document.getElementById("zip");
const goBtn = document.getElementById("goBtn");
const nowCard = document.getElementById("nowCard");
const hourlyCard = document.getElementById("hourlyCard");
const dailyCard = document.getElementById("dailyCard");
const radarCard = document.getElementById("radarCard");
const radarFrame = document.getElementById("radarFrame");

const locNameEl = document.getElementById("locName");

goBtn.addEventListener("click", () => {
  const zip = zipInput.value.trim();
  if (!/^\d{5}$/.test(zip)) {
    alert("Please enter a valid 5-digit US ZIP.");
    return;
  }
  getByZip(zip);
});

zipInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goBtn.click();
});

// Default: Columbus, OH (approx downtown)
const DEFAULT = { name: "Columbus, OH", lat: 39.9612, lon: -82.9988 };
init();

async function init() {
  locNameEl.textContent = DEFAULT.name;
  await loadWeather(DEFAULT.lat, DEFAULT.lon, DEFAULT.name);
}

// ZIP → lat/lon via Zippopotam
async function getByZip(zip) {
  try {
    const locRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!locRes.ok) throw new Error("Invalid ZIP or lookup failed.");
    const locData = await locRes.json();
    const place = locData.places[0];
    const lat = parseFloat(place.latitude);
    const lon = parseFloat(place.longitude);
    const city = place["place name"];
    const state = place["state abbreviation"];
    const label = `${city}, ${state}`;
    await loadWeather(lat, lon, label);
  } catch (err) {
    showError(err.message);
  }
}

// Main loader: fetch Open‑Meteo current/hourly/daily
async function loadWeather(lat, lon, label) {
  locNameEl.textContent = label;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("current", [
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "apparent_temperature",
    "precipitation",
    "weather_code",
    "is_day"
  ].join(","));
  url.searchParams.set("hourly", [
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "precipitation",
    "weather_code"
  ].join(","));
  url.searchParams.set("daily", [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "weather_code"
  ].join(","));
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch forecast.");
  const data = await res.json();

  renderNow(data);
  renderHourly(data);
  renderDaily(data);
  setTheme(data);
  setRadar(lat, lon);

  showCard(nowCard);
  showCard(hourlyCard);
  showCard(dailyCard);
  showCard(radarCard);
}

// Current conditions
function renderNow(data) {
  const c = data.current;
  const temp = Math.round(c.temperature_2m);
  const feels = Math.round(c.apparent_temperature);
  const wind = Math.round(c.wind_speed_10m);
  const hum = Math.round(c.relative_humidity_2m);

  document.getElementById("nowTemp").textContent = `${temp}°`;
  document.getElementById("nowFeels").textContent = `Feels like ${feels}°`;
  document.getElementById("nowWind").textContent = `Wind ${wind} mph`;
  document.getElementById("nowHum").textContent = `Humidity ${hum}%`;
  document.getElementById("nowSummary").textContent = codeToSummary(c.weather_code);

  setIconTheme(c.weather_code, c.is_day === 1);
}

// Hourly next 12 hours
function renderHourly(data) {
  const times = data.hourly.time;
  const temps = data.hourly.temperature_2m;
  const winds = data.hourly.wind_speed_10m;
  const hums = data.hourly.relative_humidity_2m;
  const precs = data.hourly.precipitation;
  const codes = data.hourly.weather_code;

  const nowISO = data.current.time;
  let nowIdx = times.indexOf(nowISO);
  if (nowIdx < 0) {
    // Fallback: find closest future time
    const now = new Date(nowISO || Date.now());
    nowIdx = times.findIndex(t => new Date(t) >= now);
    if (nowIdx < 0) nowIdx = 0;
  }

  const hoursWrap = document.getElementById("hours");
  hoursWrap.innerHTML = "";

  const sliceEnd = Math.min(nowIdx + 12, times.length);
  for (let i = nowIdx; i < sliceEnd; i++) {
    const t = new Date(times[i]);
    const h = t.toLocaleTimeString([], { hour: "numeric" });
    const temp = Math.round(temps[i]);
    const wind = Math.round(winds[i]);
    const hum = Math.round(hums[i]);
    const prec = Number(precs[i] || 0).toFixed(2);
    const code = codes[i];

    const div = document.createElement("div");
    div.className = "hour";
    div.innerHTML = `
      <div class="h-time">${h}</div>
      <div class="h-temp">${temp}°</div>
      <div class="h-meta">${codeToEmoji(code)} ${codeToSummary(code)}</div>
      <div class="h-meta">💨 ${wind} mph • 💧 ${hum}% • ☔ ${prec}"</div>
    `;
    hoursWrap.appendChild(div);
  }
}

// 10‑day daily forecast
function renderDaily(data) {
  const daysWrap = document.getElementById("days");
  daysWrap.innerHTML = "";

  const dates = data.daily.time;
  const tmax = data.daily.temperature_2m_max;
  const tmin = data.daily.temperature_2m_min;
  const precip = data.daily.precipitation_sum;
  const popMax = data.daily.precipitation_probability_max;
  const codes = data.daily.weather_code;

  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i]);
    const label = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const hi = Math.round(tmax[i]);
    const lo = Math.round(tmin[i]);
    const rain = Number(precip[i] || 0).toFixed(2);
    const pop = popMax?.[i] ?? "—";
    const code = codes[i];

    const div = document.createElement("div");
    div.className = "day";
    div.innerHTML = `
      <div class="d-date">${label}</div>
      <div class="d-temp">${hi}° / ${lo}°</div>
      <div class="d-meta">${codeToEmoji(code)} ${codeToSummary(code)}</div>
      <div class="d-meta">☔ ${rain}" • 📈 ${pop}%</div>
    `;
    daysWrap.appendChild(div);
  }
}

// Dynamic theme based on current weather and day/night
function setTheme(data) {
  const code = data.current.weather_code;
  const isDay = data.current.is_day === 1;

  let accent = "#5dd2ff";
  let surface = "#101722";
  let shadow = "rgba(0,0,0,0.35)";

  if ([0,1].includes(code) && isDay) {
    accent = "#ffd166"; // sunny day gold
    surface = "#111a24";
  } else if ([2].includes(code)) {
    accent = "#9bd7ff";
    surface = "#101a23";
  } else if ([3,45,48].includes(code)) {
    accent = "#8fb0cc"; // cloudy steel
    surface = "#0f1822";
  } else if ([51,53,55,61,63,65,80,81,82].includes(code)) {
    accent = "#64a8ff"; // rain blue
    surface = "#0e1721";
  } else if ([71,73,75].includes(code)) {
    accent = "#bfe3ff"; // snow icy blue
    surface = "#0e1720";
  } else if ([95,96,99].includes(code)) {
    accent = "#c57bff"; // storm purple
    surface = "#0e1520";
  }

  if (!isDay) {
    // Slightly cooler accents at night
    accent = shade(accent, -10);
    shadow = "rgba(0,0,0,0.45)";
  }

  document.documentElement.style.setProperty("--theme-accent", accent);
  document.documentElement.style.setProperty("--theme-surface", surface);
  document.documentElement.style.setProperty("--theme-shadow", shadow);
}

// Radar: RainViewer embed centered on lat/lon
function setRadar(lat, lon) {
  // Zoom 7 is a good regional view
  const url = `https://www.rainviewer.com/map.html?loc=${lat},${lon},7&layer=radar&overlay=0&zoom=7&do=radar;`;
  radarFrame.src = url;
}

function showCard(el) {
  el.classList.remove("hidden");
  el.classList.add("show");
}

function showError(msg) {
  showCard(nowCard);
  document.getElementById("nowTemp").textContent = `--°`;
  document.getElementById("nowSummary").textContent = msg;
  document.getElementById("nowFeels").textContent = `Feels like --°`;
  document.getElementById("nowWind").textContent = `Wind -- mph`;
  document.getElementById("nowHum").textContent = `Humidity --%`;
}

// WMO code maps
function codeToSummary(code) {
  const map = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Light rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm (hail)",
    99: "Thunderstorm (heavy hail)"
  };
  return map[code] ?? "—";
}

function codeToEmoji(code) {
  if ([0,1].includes(code)) return "☀️";
  if ([2].includes(code)) return "🌤️";
  if ([3,45,48].includes(code)) return "☁️";
  if ([51,53,55,61,63,65,80,81,82].includes(code)) return "🌧️";
  if ([71,73,75].includes(code)) return "❄️";
  if ([95,96,99].includes(code)) return "⛈️";
  return "🌡️";
}

// Icon emphasis by weather and day/night
function setIconTheme(code, isDay) {
  const sun = document.querySelector(".icon-sun");
  const cloud = document.querySelector(".icon-cloud");
  if (!sun || !cloud) return;

  const sunBase = isDay ? 1 : 0.3;

  if ([0,1].includes(code)) {
    sun.style.opacity = String(sunBase);
    cloud.style.opacity = "0.15";
  } else if ([2].includes(code)) {
    sun.style.opacity = String(Math.max(0.6, sunBase * 0.8));
    cloud.style.opacity = "0.6";
  } else if ([3,45,48].includes(code)) {
    sun.style.opacity = "0.2";
    cloud.style.opacity = "0.95";
  } else if ([51,53,55,61,63,65,80,81,82].includes(code)) {
    sun.style.opacity = "0.18";
    cloud.style.opacity = "1";
    cloud.style.filter = "drop-shadow(0 6px 20px rgba(110,140,170,0.45))";
  } else if ([71,73,75].includes(code)) {
    sun.style.opacity = "0.18";
    cloud.style.opacity = "1";
  } else if ([95,96,99].includes(code)) {
    sun.style.opacity = "0.15";
    cloud.style.opacity = "1";
    cloud.style.filter = "drop-shadow(0 6px 24px rgba(150,110,170,0.5))";
  }
}

// Utility: shade hex color by percentage (-100..100)
function shade(hex, percent) {
  try {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0,2), 16);
    const g = parseInt(h.substring(2,4), 16);
    const b = parseInt(h.substring(4,6), 16);
    const p = percent / 100;
    const nr = Math.min(255, Math.max(0, Math.round(r + (255 - r) * p)));
    const ng = Math.min(255, Math.max(0, Math.round(g + (255 - g) * p)));
    const nb = Math.min(255, Math.max(0, Math.round(b + (255 - b) * p)));
    return `#${nr.toString(16).padStart(2,"0")}${ng.toString(16).padStart(2,"0")}${nb.toString(16).padStart(2,"0")}`;
  } catch {
    return hex;
  }
}