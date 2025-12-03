// ================================
//  API KEYS & CONFIG
// ================================
const TOMORROW_API = "SxfCeG33LbiKBLlR5iEegtxw5aXnZEOr";
const MAPBOX_KEY = "pk.eyJ1Ijoic3Rvcm0tc3VyZ2UiLCJhIjoiY21pcDM0emdxMDhwYzNmcHc2aTlqeTN5OSJ9.QYtnuhdixR4SGxLQldE9PA";

// Current state
let currentLat = 39.8283;
let currentLng = -98.5795; // Center of US
let currentRadarType = 'precipitationIntensity';
let currentTimeMode = 'now';

// ================================
//  WEATHER CODE TRANSLATION
// ================================
const weatherText = {
    1000: "Clear", 1100: "Mostly Clear", 1101: "Partly Cloudy", 1102: "Cloudy",
    2000: "Fog", 2100: "Light Fog", 3000: "Light Wind", 3001: "Windy", 3002: "Strong Wind",
    4000: "Drizzle", 4001: "Rain", 4200: "Light Rain", 4201: "Heavy Rain",
    5000: "Snow", 5001: "Flurries", 5100: "Light Snow", 5101: "Heavy Snow",
    6000: "Freezing Drizzle", 6001: "Freezing Rain", 6200: "Light Freezing Rain", 6201: "Heavy Freezing Rain",
    7000: "Ice Pellets", 7101: "Heavy Ice Pellets", 7102: "Light Ice Pellets",
    8000: "Thunderstorm"
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
//  RADAR FUNCTIONS
// ================================
function updateRadarLayer(radarType, timeMode = 'now') {
    let timestamp = 'now';
    
    // Convert time mode to appropriate timestamp
    if (timeMode !== 'now') {
        const now = new Date();
        switch(timeMode) {
            case 'yesterday':
                timestamp = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
                break;
            case 'tomorrow':
                timestamp = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
                break;
            default:
                timestamp = 'now';
        }
    }

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

    updateLegend(radarType);
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
//  WEATHER DATA FUNCTIONS
// ================================
async function getWeatherData(lat, lng) {
    try {
        const realtimeUrl = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lng}&apikey=${TOMORROW_API}`;
        const hourlyUrl = `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lng}&timesteps=1h&apikey=${TOMORROW_API}`;
        
        const [realtimeRes, hourlyRes] = await Promise.all([
            fetch(realtimeUrl),
            fetch(hourlyUrl)
        ]);
        
        const realtimeData = await realtimeRes.json();
        const hourlyData = await hourlyRes.json();
        
        return {
            current: realtimeData.data,
            hourly: hourlyData.timelines.hourly.slice(0, 24)
        };
    } catch (error) {
        console.error('Weather data fetch error:', error);
        return null;
    }
}

async function updateWeatherPanel(lat, lng) {
    const weatherData = await getWeatherData(lat, lng);
    
    if (!weatherData) {
        document.getElementById('locationName').textContent = 'Error loading weather data';
        return;
    }

    const current = weatherData.current.values;
    
    // Update location name (reverse geocoding would be ideal here)
    document.getElementById('locationName').textContent = `Weather at ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    
    // Update current weather
    document.getElementById('currentTemp').textContent = `${Math.round(current.temperature)}°`;
    document.getElementById('feelsLike').textContent = `Feels like ${Math.round(current.temperatureApparent)}°`;
    document.getElementById('conditions').textContent = weatherText[current.weatherCode] || 'Unknown';
    
    // Update details
    document.getElementById('humidity').textContent = `${Math.round(current.humidity)}%`;
    document.getElementById('windSpeed').textContent = `${Math.round(current.windSpeed)} mph`;
    document.getElementById('pressure').textContent = `${Math.round(current.pressureSeaLevel)} mb`;
    document.getElementById('visibility').textContent = `${Math.round(current.visibility)} mi`;
    document.getElementById('uvIndex').textContent = Math.round(current.uvIndex);
    document.getElementById('precipitation').textContent = `${current.precipitationIntensity.toFixed(2)} in`;
    
    // Update hourly forecast
    const hourlyContainer = document.getElementById('hourlyData');
    hourlyContainer.innerHTML = weatherData.hourly.map(hour => {
        const time = new Date(hour.time);
        const timeStr = time.getHours().toString().padStart(2, '0') + ':00';
        
        return `
            <div class="hourly-item">
                <div class="hourly-time">${timeStr}</div>
                <div class="hourly-temp">${Math.round(hour.values.temperature)}°</div>
                <div class="hourly-condition">${weatherText[hour.values.weatherCode] || 'N/A'}</div>
            </div>
        `;
    }).join('');
}

function showWeatherPanel(lat, lng) {
    const panel = document.getElementById('weatherPanel');
    panel.classList.remove('hidden');
    updateWeatherPanel(lat, lng);
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
    updateRadarLayer(currentRadarType, currentTimeMode);
});

// Map click handler
map.on('click', (e) => {
    currentLat = e.lngLat.lat;
    currentLng = e.lngLat.lng;
    showWeatherPanel(currentLat, currentLng);
});

// Time controls
document.querySelectorAll('.time-option').forEach(option => {
    option.addEventListener('click', () => {
        // Remove active class from all options
        document.querySelectorAll('.time-option').forEach(opt => opt.classList.remove('active'));
        
        // Add active class to clicked option
        option.classList.add('active');
        
        // Update current time mode
        currentTimeMode = option.dataset.time;
        const mode = option.dataset.mode;
        
        // Update display
        document.getElementById('currentTime').textContent = option.querySelector('span').textContent;
        document.getElementById('timeMode').textContent = mode.toUpperCase();
        
        // Update radar layer
        updateRadarLayer(currentRadarType, currentTimeMode);
    });
});

// Radar type selector
document.getElementById('radarType').addEventListener('change', (e) => {
    currentRadarType = e.target.value;
    updateRadarLayer(currentRadarType, currentTimeMode);
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

// Update time display
function updateTimeDisplay() {
    const now = new Date();
    document.getElementById('currentTime').textContent = 
        now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Update time display every minute
setInterval(updateTimeDisplay, 60000);
updateTimeDisplay();

// Auto-refresh radar every 5 minutes for realtime data
setInterval(() => {
    if (currentTimeMode === 'now') {
        updateRadarLayer(currentRadarType, currentTimeMode);
    }
}, 300000);

console.log('Weather Dashboard initialized successfully!');
console.log('Click anywhere on the map to get weather information for that location.');