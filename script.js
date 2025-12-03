// ================================
//  API KEYS & CONFIG
// ================================
const TOMORROW_API = "SxfCeG33LbiKBLlR5iEegtxw5aXnZEOr";
const MAPBOX_KEY = "pk.eyJ1Ijoic3Rvcm0tc3VyZ2UiLCJhIjoiY21pcDM0emdxMDhwYzNmcHc2aTlqeTN5OSJ9.QYtnuhdixR4SGxLQldE9PA";

// Current state
let currentLat = 39.8283;
let currentLng = -98.5795; // Center of US
let currentRadarType = 'precipitationIntensity';

// Animation state
let isAnimating = true;
let animationInterval = null;
let currentTimeIndex = 11; // Start at "now" (latest frame)
let radarTimes = [];
let animationSpeed = 1000;

// ================================
//  WEATHER CODE TRANSLATION (Open-Meteo)
// ================================
const weatherText = {
    0: "Clear sky",
    1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    56: "Light freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
};

// ================================
//  MAPBOX INITIALIZATION
// ================================
mapboxgl.accessToken = MAPBOX_KEY;

const map = new mapboxgl.Map({
    container: 'map',
    style: "mapbox://styles/mapbox/dark-v11",
    center: [currentLng, currentLat],
    zoom: 4,
    minZoom: 2,
    maxZoom: 12
});

const RADAR_SOURCE = "nexrad-radar";
const RADAR_LAYER = "nexrad-radar-layer";

// ================================
//  RADAR ANIMATION FUNCTIONS
// ================================
function generateRadarTimes() {
    const times = [];
    const now = new Date();
    
    // Generate 12 time frames: 11 historical (every 15 minutes) + now
    for (let i = 11; i >= 0; i--) {
        const time = new Date(now.getTime() - (i * 15 * 60 * 1000));
        times.push(time);
    }
    
    radarTimes = times;
    return times;
}

function updateRadarLayer(radarType, timeIndex = 11) {
    if (!radarTimes.length) {
        generateRadarTimes();
    }
    
    const timestamp = timeIndex === 11 ? 'now' : radarTimes[timeIndex].toISOString();
    const tileURL = `https://api.tomorrow.io/v4/map/tile/{z}/{x}/{y}/${radarType}/${timestamp}.png?apikey=${TOMORROW_API}`;

    if (map.getSource(RADAR_SOURCE)) {
        map.getSource(RADAR_SOURCE).setTiles([tileURL]);
    } else {
        map.addSource(RADAR_SOURCE, {
            type: "raster",
            tiles: [tileURL],
            tileSize: 256
        });

        map.addLayer({
            id: RADAR_LAYER,
            type: "raster",
            source: RADAR_SOURCE,
            paint: { 
                "raster-opacity": 0.7,
                "raster-fade-duration": 300
            }
        });
    }

    updateRadarTimeDisplay(timeIndex);
    updateLegend(radarType);
}

function updateRadarTimeDisplay(timeIndex) {
    const timeSlider = document.getElementById('timeSlider');
    timeSlider.value = timeIndex;
    
    if (timeIndex === 11) {
        document.getElementById('radarTime').textContent = 'Now';
        document.getElementById('radarTimeMode').textContent = 'LIVE';
    } else {
        const time = radarTimes[timeIndex];
        const timeStr = time.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        const minutesAgo = Math.round((Date.now() - time.getTime()) / 60000);
        
        document.getElementById('radarTime').textContent = timeStr;
        document.getElementById('radarTimeMode').textContent = `${minutesAgo}m ago`;
    }
}

function startAnimation() {
    if (animationInterval) clearInterval(animationInterval);
    
    animationInterval = setInterval(() => {
        currentTimeIndex = (currentTimeIndex + 1) % radarTimes.length;
        updateRadarLayer(currentRadarType, currentTimeIndex);
    }, animationSpeed);
    
    isAnimating = true;
    document.getElementById('playPauseBtn').textContent = '⏸️';
    document.getElementById('playPauseBtn').classList.add('playing');
}

function stopAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    
    isAnimating = false;
    document.getElementById('playPauseBtn').textContent = '▶️';
    document.getElementById('playPauseBtn').classList.remove('playing');
}

function updateLegend(radarType) {
    const legendTitle = document.querySelector('.legend-title');
    const legendScale = document.querySelector('.legend-scale');
    
    const legends = {
        precipitationIntensity: {
            title: 'Precipitation Intensity',
            scale: [
                { color: '#00ff00', label: 'Light' },
                { color: '#ffff00', label: 'Moderate' },
                { color: '#ff8000', label: 'Heavy' },
                { color: '#ff0000', label: 'Intense' }
            ]
        },
        temperature: {
            title: 'Temperature',
            scale: [
                { color: '#0000ff', label: 'Cold' },
                { color: '#00ffff', label: 'Cool' },
                { color: '#00ff00', label: 'Mild' },
                { color: '#ffff00', label: 'Warm' },
                { color: '#ff0000', label: 'Hot' }
            ]
        },
        windSpeed: {
            title: 'Wind Speed',
            scale: [
                { color: '#00ff00', label: 'Light' },
                { color: '#ffff00', label: 'Moderate' },
                { color: '#ff8000', label: 'Strong' },
                { color: '#ff0000', label: 'Severe' }
            ]
        },
        cloudCover: {
            title: 'Cloud Cover',
            scale: [
                { color: '#ffffff', label: 'Clear' },
                { color: '#cccccc', label: 'Partly' },
                { color: '#888888', label: 'Mostly' },
                { color: '#444444', label: 'Overcast' }
            ]
        }
    };

    const legend = legends[radarType];
    legendTitle.textContent = legend.title;
    
    legendScale.innerHTML = legend.scale.map(item => 
        `<div class="legend-item">
            <div class="legend-color" style="background: ${item.color};"></div>
            <span>${item.label}</span>
        </div>`
    ).join('');
}

// ================================
//  SEARCH FUNCTIONALITY
// ================================
async function searchLocation(query) {
    try {
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_KEY}&limit=5&country=US`
        );
        const data = await response.json();
        
        return data.features.map(feature => ({
            name: feature.place_name,
            lng: feature.center[0],
            lat: feature.center[1]
        }));
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

function showSearchResults(results) {
    const resultsContainer = document.getElementById('searchResults');
    
    if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="search-result-item">No results found</div>';
    } else {
        resultsContainer.innerHTML = results.map(result => 
            `<div class="search-result-item" data-lat="${result.lat}" data-lng="${result.lng}">
                ${result.name}
            </div>`
        ).join('');
    }
    
    resultsContainer.classList.remove('hidden');
}

function hideSearchResults() {
    document.getElementById('searchResults').classList.add('hidden');
}

// ================================
//  WEATHER DATA FUNCTIONS (Open-Meteo)
// ================================
async function getWeatherData(lat, lng) {
    try {
        // Current weather
        const currentUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`;
        
        // Hourly forecast
        const hourlyUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,uv_index&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=2`;
        
        // Daily forecast
        const dailyUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,uv_index_max,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`;
        
        const [currentRes, hourlyRes, dailyRes] = await Promise.all([
            fetch(currentUrl),
            fetch(hourlyUrl),
            fetch(dailyUrl)
        ]);
        
        const currentData = await currentRes.json();
        const hourlyData = await hourlyRes.json();
        const dailyData = await dailyRes.json();
        
        return {
            current: currentData.current,
            hourly: hourlyData.hourly,
            daily: dailyData.daily
        };
    } catch (error) {
        console.error('Weather data fetch error:', error);
        return null;
    }
}

async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_KEY}`
        );
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            return data.features[0].place_name;
        }
        return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    }
}

function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
}

function calculateDewPoint(temp, humidity) {
    // Magnus formula approximation
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * temp) / (b + temp)) + Math.log(humidity / 100);
    return (b * alpha) / (a - alpha);
}

async function updateWeatherPanel(lat, lng) {
    const weatherData = await getWeatherData(lat, lng);
    
    if (!weatherData) {
        document.getElementById('locationName').textContent = 'Error loading weather data';
        return;
    }

    const current = weatherData.current;
    
    // Update location info
    const locationName = await reverseGeocode(lat, lng);
    document.getElementById('locationName').textContent = 'Weather Information';
    document.getElementById('locationAddress').textContent = locationName;
    document.getElementById('locationCoords').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    
    // Update current weather
    document.getElementById('currentTemp').textContent = `${Math.round(current.temperature_2m)}°F`;
    document.getElementById('feelsLike').textContent = `Feels like ${Math.round(current.apparent_temperature)}°F`;
    document.getElementById('conditions').textContent = weatherText[current.weather_code] || 'Unknown';
    
    // Calculate dew point
    const dewPoint = calculateDewPoint(current.temperature_2m, current.relative_humidity_2m);
    
    // Update details
    document.getElementById('humidity').textContent = `${current.relative_humidity_2m}%`;
    document.getElementById('windSpeed').textContent = `${Math.round(current.wind_speed_10m)} mph`;
    document.getElementById('windDirection').textContent = getWindDirection(current.wind_direction_10m);
    document.getElementById('pressure').textContent = `${Math.round(current.pressure_msl)} mb`;
    document.getElementById('visibility').textContent = `10+ mi`; // Open-Meteo doesn't provide visibility in current
    document.getElementById('uvIndex').textContent = '--'; // Not available in current weather
    document.getElementById('dewPoint').textContent = `${Math.round(dewPoint)}°F`;
    document.getElementById('cloudCover').textContent = `${current.cloud_cover}%`;
    
    // Update hourly forecast (next 24 hours)
    const hourlyContainer = document.getElementById('hourlyData');
    const now = new Date();
    const currentHour = now.getHours();
    
    hourlyContainer.innerHTML = '';
    for (let i = 0; i < 24; i++) {
        const hourIndex = i;
        if (weatherData.hourly.time[hourIndex]) {
            const time = new Date(weatherData.hourly.time[hourIndex]);
            const timeStr = time.getHours().toString().padStart(2, '0') + ':00';
            
            const hourlyItem = document.createElement('div');
            hourlyItem.className = 'hourly-item';
            hourlyItem.innerHTML = `
                <div class="hourly-time">${timeStr}</div>
                <div class="hourly-temp">${Math.round(weatherData.hourly.temperature_2m[hourIndex])}°</div>
                <div class="hourly-condition">${(weatherText[weatherData.hourly.weather_code[hourIndex]] || 'N/A').substring(0, 8)}</div>
            `;
            hourlyContainer.appendChild(hourlyItem);
        }
    }

    // Update daily forecast
    const dailyContainer = document.getElementById('dailyData');
    dailyContainer.innerHTML = '';
    
    for (let i = 0; i < 7; i++) {
        if (weatherData.daily.time[i]) {
            const date = new Date(weatherData.daily.time[i]);
            const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            
            const dailyItem = document.createElement('div');
            dailyItem.className = 'daily-item';
            dailyItem.innerHTML = `
                <div class="daily-date">${dateStr}</div>
                <div class="daily-temps">${Math.round(weatherData.daily.temperature_2m_max[i])}° / ${Math.round(weatherData.daily.temperature_2m_min[i])}°</div>
            `;
            dailyContainer.appendChild(dailyItem);
        }
    }
}

function showClickMarker(lat, lng) {
    const marker = document.getElementById('clickMarker');
    const point = map.project([lng, lat]);
    
    marker.style.left = `${point.x}px`;
    marker.style.top = `${point.y}px`;
    marker.classList.remove('hidden');
    
    setTimeout(() => {
        marker.classList.add('hidden');
    }, 2000);
}

function showWeatherPanel(lat, lng) {
    const panel = document.getElementById('weatherPanel');
    panel.classList.remove('hidden');
    updateWeatherPanel(lat, lng);
    showClickMarker(lat, lng);
}

function hideWeatherPanel() {
    const panel = document.getElementById('weatherPanel');
    panel.classList.add('hidden');
}

// ================================
//  EVENT LISTENERS
// ================================

// Map initialization
map.on('load', () => {
    generateRadarTimes();
    updateRadarLayer(currentRadarType, currentTimeIndex);
    startAnimation();
});

// Map click handler
map.on('click', (e) => {
    currentLat = e.lngLat.lat;
    currentLng = e.lngLat.lng;
    showWeatherPanel(currentLat, currentLng);
});

// Search functionality
document.getElementById('searchBtn').addEventListener('click', async () => {
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
        const results = await searchLocation(query);
        showSearchResults(results);
    }
});

document.getElementById('searchInput').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) {
            const results = await searchLocation(query);
            showSearchResults(results);
        }
    }
});

// Search results click handler
document.getElementById('searchResults').addEventListener('click', (e) => {
    if (e.target.classList.contains('search-result-item')) {
        const lat = parseFloat(e.target.dataset.lat);
        const lng = parseFloat(e.target.dataset.lng);
        
        map.flyTo({
            center: [lng, lat],
            zoom: 10,
            duration: 1500
        });
        
        showWeatherPanel(lat, lng);
        hideSearchResults();
        document.getElementById('searchInput').value = '';
    }
});

// Hide search results when clicking elsewhere
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        hideSearchResults();
    }
});

// Animation controls
document.getElementById('playPauseBtn').addEventListener('click', () => {
    if (isAnimating) {
        stopAnimation();
    } else {
        startAnimation();
    }
});

document.getElementById('prevBtn').addEventListener('click', () => {
    stopAnimation();
    currentTimeIndex = Math.max(0, currentTimeIndex - 1);
    updateRadarLayer(currentRadarType, currentTimeIndex);
});

document.getElementById('nextBtn').addEventListener('click', () => {
    stopAnimation();
    currentTimeIndex = Math.min(radarTimes.length - 1, currentTimeIndex + 1);
    updateRadarLayer(currentRadarType, currentTimeIndex);
});

document.getElementById('animationSpeed').addEventListener('change', (e) => {
    animationSpeed = parseInt(e.target.value);
    if (isAnimating) {
        stopAnimation();
        startAnimation();
    }
});

document.getElementById('timeSlider').addEventListener('input', (e) => {
    stopAnimation();
    currentTimeIndex = parseInt(e.target.value);
    updateRadarLayer(currentRadarType, currentTimeIndex);
});

// Radar type selector
document.getElementById('radarType').addEventListener('change', (e) => {
    currentRadarType = e.target.value;
    updateRadarLayer(currentRadarType, currentTimeIndex);
});

// Opacity slider
document.getElementById('opacitySlider').addEventListener('input', (e) => {
    const opacity = e.target.value / 100;
    document.getElementById('opacityValue').textContent = `${e.target.value}%`;
    
    if (map.getLayer(RADAR_LAYER)) {
        map.setPaintProperty(RADAR_LAYER, 'raster-opacity', opacity);
    }
});

// Close weather panel
document.getElementById('closePanel').addEventListener('click', hideWeatherPanel);

// ================================
//  INITIALIZATION
// ================================

console.log('Weather Dashboard initialized successfully!');
console.log('Weather data: Open-Meteo API (free, no API key required)');
console.log('Radar data: Tomorrow.io API');
console.log('Click anywhere on the map to get weather information for that location.');