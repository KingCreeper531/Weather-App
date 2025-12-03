// Storm Surge Weather — Open‑Meteo + RainViewer
// ZIP -> lat/lon via Zippopotam; forecast via Open‑Meteo; radar via RainViewer.
// Auto-refresh every 10 minutes.

const zipInput = document.getElementById("zip");
const goBtn = document.getElementById("goBtn");
const nowCard = document.getElementById("nowCard");
const todayGrid = document.getElementById("todayGrid");
const dailyGrid = document.getElementById("dailyGrid");
const radarCard = document.getElementById("radarCard");

let lastLoc = null;      // { lat, lon, zip }
let refreshTimer = null; // interval handle

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

async function getByZip(zip) {
  try {
    const locRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!locRes.ok) throw new Error("Invalid ZIP or lookup failed.");
    const locData = await locRes.json();
    const lat = parseFloat(locData.places[0].latitude);
    const lon = parseFloat(locData.places[0].longitude);

    lastLoc = { lat, lon, zip };
    await loadAll(lat, lon);

    // Set up auto refresh every 10 minutes
    setupAutoRefresh();
  } catch (err) {
    showError(err.message);
  }
}

function setupAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    if (!lastLoc) return;
    await loadAll(lastLoc.lat, lastLoc.lon);
  }, 10 * 60 * 1000);
}

async function loadAll(lat, lon) {
  await Promise.all([
    loadWeather(lat, lon),
    loadRadar(lat, lon)
  ]);

  // Animate cards in
  showCard(nowCard);
  showCard(todayGrid);
  showCard(dailyGrid);
  showCard(radarCard);
}

async function loadWeather(lat, lon) {
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
    "time"
  ].join(","));
  url.searchParams.set("hourly", [
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "precipitation",
    "weather_code",
    "time"
  ].join(","));
  url.searchParams.set("daily", [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min"
  ].join(","));
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch forecast.");
  const data = await res.json();

  renderNow(data);
  renderHours(data);
  renderDaily(data);
}

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

  setIconTheme(c.weather_code);
}

function renderHours(data) {
  const times = data.hourly.time;
  const temps = data.hourly.temperature_2m;
  const winds = data.hourly.wind_speed_10m;
  const hums = data.hourly.relative_humidity_2m;
  const precs = data.hourly.precipitation;
  const codes = data.hourly.weather_code;

  const nowISO = data.current.time;
  const nowIdx = times.indexOf(nowISO);
  const sliceStart = Math.max(nowIdx, 0);
  const sliceEnd = Math.min(sliceStart + 8, times.length);

  const hoursWrap = document.getElementById("hours");
  hoursWrap.innerHTML = "";

  for (let i = sliceStart; i < sliceEnd; i++) {
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

function renderDaily(data) {
  const daysWrap = document.getElementById("days");
  daysWrap.innerHTML = "";

  const times = data.daily.time;
  const tmax = data.daily.temperature_2m_max;
  const tmin = data.daily.temperature_2m_min;
  const codes = data.daily.weather_code;

  for (let i = 0; i < times.length && i < 7; i++) {
    const d = new Date(times[i]);
    const label = d.toLocaleDateString([], { weekday: "short" });
    const hi = Math.round(tmax[i]);
    const lo = Math.round(tmin[i]);
    const code = codes[i];

    const div = document.createElement("div");
    div.className = "hour"; // reuse card style
    div.innerHTML = `
      <div class="h-time">${label}</div>
      <div class="h-temp">${hi}° / ${lo}°</div>
      <div class="h-meta">${codeToEmoji(code)} ${codeToSummary(code)}</div>
    `;
    daysWrap.appendChild(div);
  }
}

async function loadRadar(lat, lon) {
  // RainViewer live radar centered on lat/lon; z=7 is a good regional zoom
  const url = `https://www.rainviewer.com/weather-radar-map-live.html?x=${lon}&y=${lat}&z=7`;
  const iframe = document.getElementById("radar");
  iframe.src = url;
}

function showCard(el) {
  el.classList.remove("hidden");
  el.classList.add("show");
}

function showError(msg) {
  nowCard.classList.remove("hidden");
  nowCard.classList.add("show");
  document.getElementById("nowTemp").textContent = `--°`;
  document.getElementById("nowSummary").textContent = msg;
  document.getElementById("nowFeels").textContent = `Feels like --°`;
  document.getElementById("nowWind").textContent = `Wind -- mph`;
  document.getElementById("nowHum").textContent = `Humidity --%`;
}

// Simple WMO weather code map (subset)
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

function setIconTheme(code) {
  const sun = document.querySelector(".icon-sun");
  const cloud = document.querySelector(".icon-cloud");
  if (!sun || !cloud) return;

  sun.style.filter = "";
  cloud.style.filter = "";

  if ([0,1].includes(code)) {
    sun.style.opacity = "1";
    cloud.style.opacity = "0.15";
  } else if ([2].includes(code)) {
    sun.style.opacity = "0.9";
    cloud.style.opacity = "0.6";
  } else if ([3,45,48].includes(code)) {
    sun.style.opacity = "0.25";
    cloud.style.opacity = "0.95";
  } else if ([51,53,55,61,63,65,80,81,82].includes(code)) {
    sun.style.opacity = "0.2";
    cloud.style.opacity = "1";
    cloud.style.filter = "drop-shadow(0 6px 20px rgba(110,140,170,0.45))";
  } else if ([71,73,75].includes(code)) {
    sun.style.opacity = "0.2";
    cloud.style.opacity = "1";
  } else if ([95,96,99].includes(code)) {
    sun.style.opacity = "0.15";
    cloud.style.opacity = "1";
    cloud.style.filter = "drop-shadow(0 6px 24px rgba(150,110,170,0.5))";
  }
}