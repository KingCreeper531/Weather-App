// ================================
//  API KEYS & CONFIG
// ================================
const TOMORROW_API = "SxfCeG33LbiKBLlR5iEegtxw5aXnZEOr";
const MAPBOX_KEY = "pk.eyJ1Ijoic3Rvcm0tc3VyZ2UiLCJhIjoiY21pcDM0emdxMDhwYzNmcHc2aTlqeTN5OSJ9.QYtnuhdixR4SGxLQldE9PA";

// Default location (Boston)
let lat = 42.3478;
let lon = -71.0466;

// ================================
//  WEATHER CODE TRANSLATION
// ================================
const weatherText = {
    1000: "Clear",
    1100: "Mostly Clear",
    1101: "Partly Cloudy",
    1102: "Cloudy",
    2000: "Fog",
    2100: "Light Fog",
    3000: "Light Wind",
    3001: "Windy",
    3002: "Strong Wind",
    4000: "Drizzle",
    4001: "Rain",
    4200: "Light Rain",
    4201: "Heavy Rain",
    5000: "Snow",
    5001: "Flurries",
    5100: "Light Snow",
    5101: "Heavy Snow",
    6000: "Freezing Drizzle",
    6001: "Freezing Rain",
    6200: "Light Freezing Rain",
    6201: "Heavy Freezing Rain",
    7000: "Ice Pellets",
    7101: "Heavy Ice Pellets",
    7102: "Light Ice Pellets",
    8000: "Thunderstorm"
};

// ================================
//  MAPBOX MAP INITIALIZATION
// ================================
mapboxgl.accessToken = MAPBOX_KEY;

const map = new mapboxgl.Map({
    container: 'map',
    style: "mapbox://styles/mapbox/dark-v11",
    center: [lon, lat],
    zoom: 9
});

const RASTER_SOURCE = "weatherRadar";
const RASTER_LAYER = "weatherRadarLayer";

// ================================
//  MAP OVERLAY FUNCTIONS
// ================================
function updateOverlay(dataField) {
    const tileURL = `https://api.tomorrow.io/v4/map/tile/{z}/{x}/{y}/${dataField}/now.png?apikey=${TOMORROW_API}`;

    if (map.getSource(RASTER_SOURCE)) {
        map.getSource(RASTER_SOURCE).setTiles([tileURL]);
    } else {
        map.addSource(RASTER_SOURCE, {
            type: "raster",
            tiles: [tileURL],
            tileSize: 256
        });

        map.addLayer({
            id: RASTER_LAYER,
            type: "raster",
            source: RASTER_SOURCE,
            paint: { "raster-opacity": 0.7 }
        });
    }
}

// ================================
//  WEATHER API FUNCTIONS
// ================================
async function getRealtime() {
    try {
        const url = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&apikey=${TOMORROW_API}`;
        const res = await fetch(url);
        const data = await res.json();

        const temp = Math.round(data.data.values.temperature);
        const code = data.data.values.weatherCode;

        document.getElementById("temp").textContent = `${temp}°C`;
        document.getElementById("conditions").textContent =
            weatherText[code] || `Code: ${code}`;

    } catch (err) {
        console.error("Realtime weather error:", err);
        document.getElementById("conditions").textContent = "Error loading weather";
    }
}

async function getForecast() {
    try {
        const url = `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${TOMORROW_API}`;
        const res = await fetch(url);
        const data = await res.json();

        const list = document.getElementById("forecast");
        list.innerHTML = "";

        // Show 5 days of forecast
        data.timelines.daily.slice(0, 5).forEach(day => {
            const li = document.createElement("li");
            const date = new Date(day.time).toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
            });
            
            li.innerHTML = `
                <span>${date}</span>
                <span>${Math.round(day.values.temperatureMax)}° / ${Math.round(day.values.temperatureMin)}°</span>
            `;
            list.appendChild(li);
        });

    } catch (err) {
        console.error("Forecast error:", err);
        document.getElementById("forecast").innerHTML = '<li class="loading">Error loading forecast</li>';
    }
}

async function getHistory() {
    try {
        const url = `https://api.tomorrow.io/v4/weather/history/recent?location=${lat},${lon}&apikey=${TOMORROW_API}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.data && data.data.length > 0) {
            document.getElementById("history").textContent =
                `Recent: ${Math.round(data.data[0].values.temperature)}°C`;
        } else {
            document.getElementById("history").textContent = "No recent history available";
        }

    } catch (err) {
        console.error("History error:", err);
        document.getElementById("history").textContent = "History unavailable";
    }
}

// ================================
//  LOCATION UPDATE FUNCTIONS
// ================================
function updateLocation(newLat, newLon) {
    lat = newLat;
    lon = newLon;
    map.setCenter([lon, lat]);
    document.getElementById("locationInput").value = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    
    // Update all weather data
    getRealtime();
    getForecast();
    getHistory();
}

// ================================
//  EVENT LISTENERS
// ================================

// Map loaded
map.on("load", () => {
    updateOverlay("precipitationIntensity");
    getRealtime();
    getForecast();
    getHistory();
});

// Map click to set location
map.on("click", (e) => {
    updateLocation(e.lngLat.lat, e.lngLat.lng);
});

// Overlay selector change
document.getElementById("overlaySelect").addEventListener("change", (e) => {
    updateOverlay(e.target.value);
});

// Manual location update
document.getElementById("updateBtn").addEventListener("click", () => {
    const input = document.getElementById("locationInput").value;

    if (input.includes(",")) {
        const [newLat, newLon] = input.split(",").map(x => parseFloat(x.trim()));
        if (!isNaN(newLat) && !isNaN(newLon)) {
            updateLocation(newLat, newLon);
        } else {
            alert("Please enter valid coordinates (e.g., 42.3478,-71.0466)");
        }
    } else {
        alert("Please enter coordinates in format: latitude,longitude");
    }
});

// Use device location
document.getElementById("myLocationBtn").addEventListener("click", () => {
    if (!navigator.geolocation) {
        alert("Your browser does not support location services.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            updateLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
            console.error("Geolocation error:", error);
            alert("Unable to get your location. Please check your browser permissions.");
        }
    );
});

// ================================
//  AUTO REFRESH
// ================================
setInterval(() => {
    getRealtime();
    getForecast();
    getHistory();
}, 300000); // Refresh every 5 minutes

// ================================
//  INITIALIZATION
// ================================
document.getElementById("locationInput").value = `${lat},${lon}`;

// Optional: Show debug output (uncomment to enable)
// document.querySelector('.debug-section').style.display = 'block';