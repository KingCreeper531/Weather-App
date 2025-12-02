const searchInput = document.getElementById("search");
const goBtn = document.getElementById("goBtn");
const locNameEl = document.getElementById("locName");
const radarFrame = document.getElementById("radarFrame");
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

goBtn.addEventListener("click", () => {
  const q = searchInput.value.trim();
  if (!q) return;
  resolveLocation(q);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goBtn.click();
});

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    tabContents.forEach(c => {
      c.classList.toggle("hidden", c.id !== `${target}Tab`);
    });
  });
});

// Geocode ZIP/city → lat/lon
async function resolveLocation(query) {
  try {
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
    const data = await geo.json();
    if (!data.results || data.results.length === 0) throw new Error("Location not found.");
    const loc = data.results[0];
    const label = `${loc.name}, ${loc.admin1}`;
    getNWSForecast(loc.latitude, loc.longitude, label);
  } catch (err) {
    showError("Location lookup failed.");
  }
}

// NWS forecast
async function getNWSForecast(lat, lon, label) {
  try {
    const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
    const pointData = await pointRes.json();
    const forecastUrl = pointData.properties.forecast;
    const radarUrl = `https://www.rainviewer.com/map.html?loc=${lat},${lon},7&layer=radar&overlay=0&zoom=7&do=radar;`;
    radarFrame.src = radarUrl;

    const forecastRes = await fetch(forecastUrl);
    const forecastData = await forecastRes.json();
    const periods = forecastData.properties.periods;

    renderNow(periods[0], label);
    renderDaily(periods);
    loadWaterData(lat, lon, label);
  } catch (err) {
    showError("Failed to fetch NWS forecast.");
  }
}

function renderNow(period, label) {
  locNameEl.textContent = label;
  document.getElementById("nowTemp").textContent = `${period.temperature}°`;
  document.getElementById("nowSummary").textContent = period.shortForecast;
  document.getElementById("nowMeta").textContent = `Wind ${period.windSpeed} • ${period.windDirection}`;
  showCard(document.getElementById("nowCard"));
  showCard(document.getElementById("radarCard"));
}

function renderDaily(periods) {
  const daysWrap = document.getElementById("days");
  daysWrap.innerHTML = "";
  const daily = periods.filter(p => p.isDaytime).slice(0, 7);
  for (const p of daily) {
    const div = document.createElement("div");
    div.className = "day";
    div.innerHTML = `
      <div class="d-date">${p.name}</div>
      <div class="d-temp">${p.temperature}°</div>
      <div class="d-meta">${p.shortForecast}</div>
      <div class="d-meta">💨 ${p.windSpeed} • ${p.windDirection}</div>
    `;
    daysWrap.appendChild(div);
  }
  showCard(document.getElementById("dailyCard"));
}

async function loadWaterData(lat, lon, label) {
  const waterMeta = document.getElementById("waterMeta");
  try {
    const link = `https://water.noaa.gov/?lat=${lat}&lon=${lon}&zoom=9`;
    waterMeta.innerHTML = `
      🌊 NOAA Water service is available.<br>
      🔗 <a href="${link}" target="_blank">View streamflow near ${label}</a>
    `;
  } catch {
    waterMeta.textContent = "Water data unavailable.";
  }
}

function showCard(el) {
  el.classList.remove("hidden");
  el.classList.add("show");
}

function showError(msg) {
  locNameEl.textContent = "Error";
  document.getElementById("nowTemp").textContent = "--°";
  document.getElementById("nowSummary").textContent = msg;
  document.getElementById("nowMeta").textContent = "Wind -- • Humidity --%";
  showCard(document.getElementById("nowCard"));
}