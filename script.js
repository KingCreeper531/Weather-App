// ================================
//  API KEYS
// ================================
const TOMORROW_API = "SxfCeG33LbiKBLlR5iEegtxw5aXnZEOr";
const MAPBOX_KEY = "pk.eyJ1Ijoic3Rvcm0tc3VyZ2UiLCJhIjoiY21pcDM0emdxMDhwYzNmcHc2aTlqeTN5OSJ9.QYtnuhdixR4SGxLQldE9PA";

// Default location
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
//  MAPBOX MAP INIT
// ================================
mapboxgl.accessToken = MAPBOX_KEY;

const map = new mapboxgl.Map({
    container: 'map',
    style: "mapbox://styles/mapbox/dark-v11",
    center: [lon, lat],
    zoom: 9
});

map.on("load", () => {
    // Tomorrow.io weather tile layer
    map.addSource("weatherRadar", {
        type: "raster",
        tiles: [
            `https://api.tomorrow.io/v4/map/tile/temperature/{z}/{x}/{y}.png?apikey=${TOMORROW_API}`
        ],
        tileSize: 256
    });

    map.addLayer({
        id: "weatherRadarLayer",
        type: "raster",
        source: "weatherRadar",
        paint: { "raster-opacity": 0.7 }
    });
});


// ================================
//  REALTIME WEATHER
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
        console.error(err);
        document.getElementById("conditions").textContent = "Error loading realtime weather";
    }
}


// ================================
//  FORECAST
// ================================
async function getForecast() {
    try {
        const url = `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${TOMORROW_API}`;
        const res = await fetch(url);
        const data = await res.json();

        const list = document.getElementById("forecast");
        list.innerHTML = "";

        data.timelines.daily.forEach(day => {
            const li = document.createElement("li");
            li.textContent =
                `${day.time.split("T")[0]} — ${Math.round(day.values.temperatureMax)}° / ${Math.round(day.values.temperatureMin)}°`;
            list.appendChild(li);
        });

    } catch (err) {
        console.error(err);
    }
}


// ================================
//  RECENT HISTORY
// ================================
async function getHistory() {
    try {
        const url = `https://api.tomorrow.io/v4/weather/history/recent?location=${lat},${lon}&apikey=${TOMORROW_API}`;
        const res = await fetch(url);
        const data = await res.json();

        document.getElementById("history").textContent =
            `Recent temp: ${Math.round(data.data[0].values.temperature)}°C`;

    } catch (err) {
        console.error(err);
        document.getElementById("history").textContent = "History load error";
    }
}


// ================================
//  MANUAL LOCATION UPDATE
// ================================
document.getElementById("updateBtn").addEventListener("click", () => {
    const input = document.getElementById("locationInput").value;

    if (input.includes(",")) {
        const [newLat, newLon] = input.split(",");
        lat = parseFloat(newLat);
        lon = parseFloat(newLon);
        map.setCenter([lon, lat]);
    }

    getRealtime();
    getForecast();
    getHistory();
});


// ================================
//  CLICK MAP TO SET LOCATION
// ================================
map.on("click", (e) => {
    lat = e.lngLat.lat;
    lon = e.lngLat.lng;
    map.setCenter([lon, lat]);

    getRealtime();
    getForecast();
    getHistory();
});


// ================================
//  USE DEVICE LOCATION (button optional)
// ================================
function useMyLocation() {
    if (!navigator.geolocation) {
        alert("Your browser does not support location.");
        return;
    }

    navigator.geolocation.getCurrentPosition(pos => {
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
        map.setCenter([lon, lat]);

        getRealtime();
        getForecast();
        getHistory();
    });
}

const geoBtn = document.getElementById("myLocationBtn");
if (geoBtn) geoBtn.addEventListener("click", useMyLocation);


// ================================
//  AUTO REFRESH EVERY 60 SECONDS
// ================================
setInterval(() => {
    getRealtime();
    getForecast();
    getHistory();
}, 60000);


// ================================
//  INITIAL LOAD
// ================================
getRealtime();
getForecast();
getHistory();
