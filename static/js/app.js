import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, deleteUser } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, addDoc, onSnapshot, deleteDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app = initializeApp({ apiKey: "AIzaSyCGVDkVu41U1AFqOeZFgFSyM1kitTGnLLs", authDomain: "oopsie-poopsie-c32d7.firebaseapp.com", projectId: "oopsie-poopsie-c32d7", storageBucket: "oopsie-poopsie-c32d7.firebasestorage.app", messagingSenderId: "1074032955615", appId: "1:1074032955615:web:ed6e9c837aca3d5b0f596a" });
const auth = getAuth(app);
const db = getFirestore(app);

// ── CLOUDINARY CONSTANTS ────────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME = 'dd7xbjise';
const CLOUDINARY_UPLOAD_PRESET = 'OopsiePoopsie';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;


// Test Cloudinary connectivity
window.testCloudinary = async function () {
  console.log('Testing Cloudinary connection...');
  try {
    const response = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'OPTIONS' });
    console.log('Cloudinary test response:', response.status, response.ok);
    showToast('Cloudinary: ' + (response.ok ? 'Connected ✅' : 'Error ' + response.status + ' ❌'));
  } catch (error) {
    console.error('Cloudinary test failed:', error);
    showToast('Cloudinary connection failed ❌');
  }
};

window.testFileInput = function () {
  console.log('Testing file input label...');
  const input = document.getElementById('profile-picture-input');
  const label = document.querySelector('label[for="profile-picture-input"]');

  console.log('File input element:', input);
  console.log('Label element:', label);
  console.log('Input display:', window.getComputedStyle(input).display);
  console.log('Label display:', window.getComputedStyle(label).display);

  if (!input) {
    showToast('Error: File input not found ❌');
  } else if (!label) {
    showToast('Error: Label not found ❌');
  } else {
    showToast('File picker ready ✅');
    console.log('Attempting to click label...');
    label.click();
  }
};

// ── STATE ──────────────────────────────────────────────────────────────
const state = { user: { uid: '', name: '', username: '', email: '', profilePictureURL: '' }, profileReady: false, today: 0, week: [0, 0, 0, 0, 0, 0, 0], month: 0, year: 0, streak: 0, lastPoopDate: '', friends: [], pendingIn: [], currentViewingFriend: null, navHistory: ['home'] };
let unsubA = null, unsubB = null, unsubP = null;

// ── SECURITY: HTML ESCAPE ──────────────────────────────────────────────
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── THEME TOGGLE ────────────────────────────────────────────────────────
window.toggleTheme = function() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon();
};

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  btn.textContent = currentTheme === 'light' ? '🌙' : '☀️';
}

// Initialize theme on page load
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon();
}
let exitConfirmActive = false;

// ── UTILS ───────────────────────────────────────────────────────────────
const COLORS = ['#4a6fa5', '#c0394b', '#4a8a6a', '#7c4dff', '#f57c00', '#0097a7', '#e91e63'];
const colorFor = uid => COLORS[uid.charCodeAt(0) % COLORS.length];
const avatarOf = name => (name || '?')[0].toUpperCase();
const weekSum = w => (Array.isArray(w) ? w : [0, 0, 0, 0, 0, 0, 0]).reduce((a, b) => a + b, 0);
const localDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => localDateStr(new Date());
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d); };

function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

let _alertTimer = null;

function showSuccessAlert(msg, duration = 2500) {
  const el = document.getElementById('success-alert');
  const msgEl = document.getElementById('success-alert-msg');
  if (!el || !msgEl) return;

  msgEl.textContent = msg;
  el.classList.add('show');
  clearTimeout(_alertTimer);
  _alertTimer = setTimeout(() => el.classList.remove('show'), duration);
}

window.closeSuccessAlert = function () {
  const el = document.getElementById('success-alert');
  if (el) el.classList.remove('show');
  clearTimeout(_alertTimer);
};

function getTzLabel() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ');
}

function updateClock() {
  const now = new Date();
  const el = document.getElementById('clock-time');
  const tz = document.getElementById('tz-label');

  if (el) {
    el.textContent = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);
  }

  if (tz) tz.textContent = getTzLabel();
}

updateClock();
setInterval(updateClock, 30000);

// ── SOUND: small synthesized log confirmation, no media download required ──
// ── SOUND: small synthesized log confirmation, no media download required ──
let poopSoundEnabled = localStorage.getItem('poop-sound-enabled') !== 'false';
let poopAudioContext = null;

function updatePoopSoundButton() {
  const button = document.getElementById('poop-sound-toggle');

  if (!button) return;

  button.textContent = poopSoundEnabled ? '🔊' : '🔇';
  button.classList.toggle('is-muted', !poopSoundEnabled);
  button.setAttribute(
    'aria-pressed',
    String(poopSoundEnabled)
  );
}

function getPoopAudioContext() {
  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  if (!poopAudioContext) {
    poopAudioContext =
      new AudioContextClass();
  }

  return poopAudioContext;
}

async function enablePoopAudio() {
  const context =
    getPoopAudioContext();

  if (!context) {
    return false;
  }

  try {
    if (context.state !== 'running') {
      await context.resume();
    }

    return context.state === 'running';

  } catch (error) {
    console.error(
      'Could not enable poop audio:',
      error
    );

    return false;
  }
}

// Unlock Web Audio from a real user interaction.
// Chrome/Edge can keep AudioContext suspended until this happens.
document.addEventListener(
  'pointerdown',
  () => {
    if (!poopSoundEnabled) {
      return;
    }

    enablePoopAudio().catch(
      error =>
        console.error(
          'Audio unlock error:',
          error
        )
    );
  },
  {
    capture: true,
    passive: true
  }
);

window.togglePoopSound =
  async function (event) {

    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    poopSoundEnabled =
      !poopSoundEnabled;

    localStorage.setItem(
      'poop-sound-enabled',
      String(poopSoundEnabled)
    );

    updatePoopSoundButton();

    if (!poopSoundEnabled) {
      return;
    }

    const enabled =
      await enablePoopAudio();

    if (enabled) {
      playPoopSound();
    } else {
      showToast(
        'Browser audio is blocked. Click the sound button again to enable it.'
      );
    }
  };

function playPoopSound() {

  if (!poopSoundEnabled) {
    return;
  }

  const context =
    getPoopAudioContext();

  if (!context) {
    console.warn(
      'Web Audio is not supported in this browser.'
    );

    return;
  }

  const play = () => {

    try {

      const now =
        context.currentTime;

      const oscillator =
        context.createOscillator();

      const gain =
        context.createGain();

      oscillator.type =
        'sine';

      oscillator.frequency.setValueAtTime(
        190,
        now
      );

      oscillator.frequency.exponentialRampToValueAtTime(
        75,
        now + 0.22
      );

      gain.gain.setValueAtTime(
        0.0001,
        now
      );

      gain.gain.exponentialRampToValueAtTime(
        0.32,
        now + 0.025
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.24
      );

      oscillator.connect(gain);
      gain.connect(
        context.destination
      );

      oscillator.start(now);

      oscillator.stop(
        now + 0.25
      );

    } catch (error) {

      console.error(
        'Poop sound error:',
        error
      );

    }
  };

  if (
    context.state ===
    'running'
  ) {

    play();

  } else {

    context
      .resume()
      .then(() => {

        if (
          context.state ===
          'running'
        ) {
          play();
        }

      })
      .catch(
        error =>
          console.error(
            'Poop sound resume error:',
            error
          )
      );
  }
}

// ── ANIMATION: focused feedback for each successful poop log ─────────────
function animatePoopLog() {
  const counter = document.getElementById('today-count');

  if (!counter) return;

  counter.classList.remove('count-ripple');

  void counter.offsetWidth;

  counter.classList.add('count-ripple');

  const bounds = counter.getBoundingClientRect();

  [-26, 0, 26].forEach((drift, index) => {
    const particle = document.createElement('span');

    particle.className = 'log-particle';
    particle.textContent = index === 1 ? '💩' : '·';

    particle.style.left =
      `${bounds.left + bounds.width / 2}px`;

    particle.style.top =
      `${bounds.top + bounds.height / 2}px`;

    particle.style.setProperty(
      '--drift',
      `${drift}px`
    );

    document.body.appendChild(particle);

    particle.addEventListener(
      'animationend',
      () => particle.remove()
    );
  });
}

// ── LOCATION: friend-only locations are served by the FastAPI backend ────
const configuredLocationApiUrl =
  window.LOCATION_API_URL ||
  localStorage.getItem('location-api-url') ||
  'http://127.0.0.1:8000';

// Prefer IPv4 for the local FastAPI service.
// On some Windows setups, localhost resolves to IPv6 (::1)
// while Uvicorn is listening on IPv4.
const LOCATION_API_URL =
  configuredLocationApiUrl.replace(
    /^http:\/\/localhost(?=[:\/]|$)/i,
    'http://127.0.0.1'
  );

let locationMap = null;
let locationMarkers = [];
let locationWatchId = null;
let locationRefreshTimer = null;
let lastKnownPosition = null;
let locationTargetFriendId = null;

function setLocationStatus(message) {
  const status = document.getElementById('location-status');

  if (status) {
    status.textContent = message;
  }
}

async function locationRequest(path, options = {}) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('Sign in before sharing a location.');
  }

  const token = await user.getIdToken();

  const response = await fetch(
    `${LOCATION_API_URL}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    const detail =
      data?.detail ||
      `HTTP ${response.status}`;

    const error = new Error(detail);

    error.status = response.status;

    throw error;
  }

  return data;
}

function locationIcon(person) {
  const image = person.profilePictureURL
    ? `<img src="${escapeHtml(person.profilePictureURL)}" alt="">`
    : escapeHtml(avatarOf(person.name));

  return L.divIcon({
    className: '',
    html: `<div class="map-avatar">${image}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
}

function clearLocationMarkers() {
  locationMarkers.forEach(marker => marker.remove());

  locationMarkers = [];
}

function addLocationMarker(
  person,
  latitude,
  longitude,
  popupText
) {
  const marker = L.marker(
    [latitude, longitude],
    {
      icon: locationIcon(person)
    }
  )
    .addTo(locationMap)
    .bindPopup(
      escapeHtml(popupText)
    );

  locationMarkers.push(marker);

  return marker;
}

async function refreshFriendLocations() {
  if (!locationMap) return;

  try {
    const friends =
      await locationRequest('/api/location/friends');

    const bounds = [];

    if (lastKnownPosition) {
      const myPosition = [
        lastKnownPosition.latitude,
        lastKnownPosition.longitude
      ];

      addLocationMarker(
        state.user,
        myPosition[0],
        myPosition[1],
        'You'
      );

      bounds.push(myPosition);
    }

    let targetMarker = null;

    friends.forEach(friend => {
      const latitude = Number(friend.latitude);
      const longitude = Number(friend.longitude);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return;
      }

      const marker = addLocationMarker(
        friend,
        latitude,
        longitude,
        friend.name ||
        friend.username ||
        'Friend'
      );

      if (
        friend.uid === locationTargetFriendId
      ) {
        targetMarker = marker;
      }

      bounds.push([
        latitude,
        longitude
      ]);
    });

    if (friends.length === 0) {
      setLocationStatus(
        'No accepted friends are currently sharing a recent location.'
      );
    } else {
      setLocationStatus(
        `${friends.length} friend location${friends.length === 1 ? '' : 's'} shared.`
      );
    }

    if (locationTargetFriendId) {
      const target = friends.find(
        friend =>
          friend.uid === locationTargetFriendId
      );

      if (target) {
        const targetPosition = [
          Number(target.latitude),
          Number(target.longitude)
        ];

        locationMap.setView(
          targetPosition,
          16
        );

        if (targetMarker) {
          targetMarker.openPopup();
        }

        locationTargetFriendId = null;

        return;
      }

      setLocationStatus(
        'This friend is not sharing a recent location.'
      );

      locationTargetFriendId = null;
    }

    if (bounds.length > 1) {
      locationMap.fitBounds(
        bounds,
        {
          padding: [40, 40],
          maxZoom: 15
        }
      );
    } else if (bounds.length === 1) {
      locationMap.setView(
        bounds[0],
        14
      );
    }

  } catch (error) {
    console.error(
      'Failed to load friend locations:',
      error
    );

    setLocationStatus(
      'Could not load friend locations. Check that the location service is running.'
    );
  }
}

async function showLocation(position) {
  const latitude =
    position.coords.latitude;

  const longitude =
    position.coords.longitude;

  lastKnownPosition = {
    latitude,
    longitude
  };

  if (!locationMap) {
    locationMap = L.map(
      'location-map',
      {
        zoomControl: true
      }
    );

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; OpenStreetMap contributors'
      }
    ).addTo(locationMap);
  }

  try {
    await locationRequest(
      '/api/location',
      {
        method: 'POST',
        body: JSON.stringify({
          latitude,
          longitude
        })
      }
    );

    clearLocationMarkers();

    await refreshFriendLocations();

    setLocationStatus(
      'Sharing your current location with accepted friends.'
    );

  } catch (error) {
    console.warn(
      'Location service:',
      error
    );

    clearLocationMarkers();

    addLocationMarker(
      state.user,
      latitude,
      longitude,
      'You'
    );

    locationMap.setView(
      [latitude, longitude],
      14
    );

    setLocationStatus(
      'Your location is shown, but friend locations could not be loaded.'
    );
  }

  setTimeout(
    () => locationMap?.invalidateSize(),
    100
  );
}

function startLocationSharing() {
  if (!navigator.geolocation) return;

  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(
      locationWatchId
    );
  }

  locationWatchId =
    navigator.geolocation.watchPosition(
      showLocation,
      error => {
        console.warn(
          'Geolocation error:',
          error
        );

        if (
          error.code ===
          error.PERMISSION_DENIED
        ) {
          setLocationStatus(
            'Location permission was not granted.'
          );
        } else if (
          error.code ===
          error.POSITION_UNAVAILABLE
        ) {
          setLocationStatus(
            'Your current location is unavailable.'
          );
        } else if (
          error.code ===
          error.TIMEOUT
        ) {
          setLocationStatus(
            'Location request timed out.'
          );
        } else {
          setLocationStatus(
            'Unable to get your location.'
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 5000
      }
    );

  if (locationRefreshTimer) {
    clearInterval(
      locationRefreshTimer
    );
  }

  locationRefreshTimer =
    setInterval(
      async () => {
        if (!locationMap) return;

        clearLocationMarkers();

        await refreshFriendLocations();
      },
      10000
    );
}

async function startLocationSharingIfAlreadyGranted() {
  if (
    !navigator.geolocation ||
    !navigator.permissions
  ) {
    return;
  }

  try {
    const permission =
      await navigator.permissions.query({
        name: 'geolocation'
      });

    if (
      permission.state === 'granted'
    ) {
      startLocationSharing();
    }

  } catch (error) {
    console.warn(
      'Unable to check location permission:',
      error
    );
  }
}

window.openLocationMap = function () {
  if (!navigator.geolocation) {
    showToast(
      'Location is not available in this browser.'
    );

    return;
  }

  document
    .getElementById('location-modal')
    .classList.add('open');

  setLocationStatus(
    'Requesting device location...'
  );

  startLocationSharing();
};

window.closeLocationMap = function () {
  document
    .getElementById('location-modal')
    .classList.remove('open');
};

async function showSpecificFriendLocation(friend) {
  if (!friend?.uid) {
    showToast(
      'Choose a friend first.'
    );

    return;
  }

  if (!locationMap) {
    locationMap = L.map(
      'location-map',
      {
        zoomControl: true
      }
    );

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; OpenStreetMap contributors'
      }
    ).addTo(locationMap);
  }

  clearLocationMarkers();

  setLocationStatus(
    `Loading ${friend.name || friend.username || 'friend'}'s location...`
  );

  try {
    // IMPORTANT:
    // Request THIS FRIEND'S location directly.
    // Do not use the current user's GPS position for the friend view.
    const location =
      await locationRequest(
        `/api/location/friends/${encodeURIComponent(friend.uid)}`
      );

    const latitude =
      Number(location.latitude);

    const longitude =
      Number(location.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      throw new Error(
        'The friend location returned invalid coordinates.'
      );
    }

    const person = {
      ...friend,
      ...location
    };

    const marker = addLocationMarker(
      person,
      latitude,
      longitude,
      person.name ||
      person.username ||
      'Friend'
    );

    locationMap.setView(
      [latitude, longitude],
      16
    );

    marker.openPopup();

    setLocationStatus(
      `${person.name || person.username || 'Friend'}'s current location.`
    );

  } catch (error) {
    console.error(
      `Failed to load location for friend ${friend.uid}:`,
      error
    );

    if (error.status === 404) {
      setLocationStatus(
        `${friend.name || friend.username || 'This friend'} is not sharing a recent location.`
      );

    } else if (error.status === 403) {
      setLocationStatus(
        'This friend is not an accepted friend, so their location cannot be shown.'
      );

    } else if (error.status === 401) {
      setLocationStatus(
        'Your sign-in session is no longer valid. Please sign in again.'
      );

    } else {
      setLocationStatus(
        `Could not load ${friend.name || friend.username || 'friend'}'s location. Check that the Python location service is running.`
      );
    }
  }

  setTimeout(
    () => locationMap?.invalidateSize(),
    100
  );
}

window.viewCurrentFriendLocation = function () {
  if (!state.currentViewingFriend) {
    return showToast(
      'Choose a friend first.'
    );
  }

  document
    .getElementById('location-modal')
    .classList.add('open');

  showSpecificFriendLocation(
    state.currentViewingFriend
  );
};

// ── SHOW APP (called once auth confirmed) ──────────────────────────────
function showApp() {
  document
    .getElementById('app-wrap')
    .style.display = '';

  updatePoopSoundButton();

  setTimeout(
    () =>
      document
        .getElementById('app-intro')
        ?.classList.add('is-finished'),
    350
  );

  // Show bottom nav on mobile
  if (window.innerWidth <= 768) {
    document
      .getElementById('bottom-nav')
      .style.display = 'block';
  }

  // Register back button handler after app is ready
  setupBackButtonHandler();
}

// ── BACK BUTTON HANDLER ────────────────────────────────────────────────
function setupBackButtonHandler() {
  // Handle device back button (Android/Niotron)
  if (window.cordova) {
    document.addEventListener(
      'backbutton',
      onDeviceBackButton,
      false
    );
  }

  // Handle browser back button event
  window.addEventListener(
    'popstate',
    onDeviceBackButton
  );
}

function onDeviceBackButton(e) {
  e.preventDefault();

  const currentPage =
    document.querySelector('.page.active')?.id ||
    'page-home';

  const isHomePage =
    currentPage === 'page-home';

  if (isHomePage) {
    // On home page - show exit confirmation
    showExitConfirmation();
  } else {
    // Not on home page - go back to home
    navTo('home');
  }
}

function showExitConfirmation() {
  if (exitConfirmActive) return;

  exitConfirmActive = true;

  const confirmed = confirm(
    'Close Oopsie Poopsie? 💩\n\nTap "OK" to close or "Cancel" to stay.'
  );

  if (confirmed) {
    if (
      window.cordova &&
      navigator.app
    ) {
      navigator.app.exitApp();

    } else if (
      window.cordova &&
      navigator.device
    ) {
      navigator.device.exitApp();

    } else {
      window.close();
    }
  }

  exitConfirmActive = false;
}

// ── STREAK LOGIC ────────────────────────────────────────────────────────
function processStreakOnLoad(d) {
  const today = todayStr();
  const yesterday = yesterdayStr();
  const last = d.lastPoopDate || '';

  let streak = d.streak || 0;
  let todayCount = d.today || 0;
  let month = d.month || 0;
  let week = Array.isArray(d.week)
    ? d.week
    : [0, 0, 0, 0, 0, 0, 0];

  if (
    last &&
    last < yesterday
  ) {
    streak = 0;
  }

  if (last !== today) {
    todayCount = 0;

    const todayIdx =
      new Date().getDay();

    week[todayIdx] = 0;
  }

  const now = new Date();

  if (
    now.getDay() === 1 &&
    last &&
    last < today
  ) {
    const thisMonday =
      new Date();

    thisMonday.setDate(
      now.getDate() -
      now.getDay() +
      1
    );

    thisMonday.setHours(
      0,
      0,
      0,
      0
    );

    if (
      new Date(last) <
      thisMonday
    ) {
      week = [
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ];
    }
  }

  const thisMonth =
    today.slice(0, 7);

  // Use stored monthKey so month only resets on real calendar-month changes,
  // not based on when lastPoopDate was.
  if (!d.monthKey) {
    // Legacy account: monthKey doesn't exist yet.
    // Seed month from the current week total so we recover any wiped count.
    const lastMonth =
      last
        ? last.slice(0, 7)
        : '';

    if (
      lastMonth &&
      lastMonth !== thisMonth
    ) {
      month = weekSum(week);
    }

  } else if (
    d.monthKey !== thisMonth
  ) {
    month = 0;
  }

  // ── Year tracking ─────────────────────────────────────────────────
  let year = d.year || 0;

  const thisYear =
    String(
      new Date().getFullYear()
    );

  if (!d.yearKey) {
    // Legacy: no yearKey yet.
    // Seed from month value as best guess.
    const lastYear =
      last
        ? last.slice(0, 4)
        : '';

    if (
      lastYear &&
      lastYear !== thisYear
    ) {
      year = 0;
    } else if (!lastYear) {
      year = 0;
    }

  } else if (
    d.yearKey !== thisYear
  ) {
    year = 0;
  }

  return {
    streak,
    today: todayCount,
    week,
    month,
    monthKey: thisMonth,
    year,
    yearKey: thisYear
  };
}

function recalculateStreak() {
  const today = todayStr();
  const last = state.lastPoopDate;

  if (!last) return 1;

  if (last === today) {
    return state.streak;
  }

  if (last === yesterdayStr()) {
    return state.streak + 1;
  }

  return 1;
}

// ── FIRESTORE HELPERS ───────────────────────────────────────────────────
async function savePoopData() {
  if (!state.user.uid) return;

  const yearKey =
    String(
      new Date().getFullYear()
    );

  await setDoc(
    doc(
      db,
      'users',
      state.user.uid
    ),
    {
      today: state.today,
      month: state.month,
      week: state.week,
      streak: state.streak,
      lastPoopDate:
        state.lastPoopDate,
      monthKey:
        todayStr().slice(0, 7),
      year: state.year,
      yearKey
    },
    {
      merge: true
    }
  );
}

async function loadUserData(uid) {
  // Keep the authenticated UID even when an older account has no Firestore
  // profile. That account can then be repaired from Settings.
  const authUser =
    auth.currentUser;

  state.user = {
    uid,
    name: '',
    username: '',
    email:
      authUser?.email || '',
    profilePictureURL: ''
  };

  state.profileReady = false;

  const snap =
    await getDoc(
      doc(db, 'users', uid)
    );

  if (snap.exists()) {
    const d =
      snap.data();

    state.user = {
      uid,
      name: d.name || '',
      username:
        d.username || '',
      email:
        d.email || '',
      profilePictureURL:
        d.profilePictureURL || ''
    };

    const processed =
      processStreakOnLoad(d);

    state.today =
      processed.today;

    state.month =
      processed.month;

    state.week =
      processed.week;

    state.streak =
      processed.streak;

    state.year =
      processed.year;

    state.lastPoopDate =
      d.lastPoopDate || '';

    state.profileReady =
      Boolean(
        state.user.name &&
        state.user.username
      );

    if (
      d.today !== processed.today ||
      d.streak !== processed.streak ||
      (d.monthKey || '') !==
        processed.monthKey ||
      (d.yearKey || '') !==
        processed.yearKey
    ) {
      await setDoc(
        doc(
          db,
          'users',
          uid
        ),
        {
          today:
            processed.today,
          month:
            processed.month,
          week:
            processed.week,
          streak:
            processed.streak,
          monthKey:
            processed.monthKey,
          year:
            processed.year,
          yearKey:
            processed.yearKey
        },
        {
          merge: true
        }
      );
    }
  }

  return state.profileReady;
}

// ── LIVE LISTENERS ──────────────────────────────────────────────────────
function startListeners(uid) {
  let s1 = [];
  let s2 = [];

  const merge = () => {
    const all = [
      ...s1,
      ...s2
    ];

    const friendUids =
      all.map(
        f =>
          f.user1 === uid
            ? f.user2
            : f.user1
      );

    Promise.all(
      friendUids.map(
        fuid =>
          getDoc(
            doc(
              db,
              'users',
              fuid
            )
          )
      )
    ).then(snaps => {
      state.friends =
        snaps
          .map((s, idx) => {
            if (!s.exists()) {
              const friendship =
                all[idx];

              if (friendship) {
                getDocs(
                  query(
                    collection(
                      db,
                      'friendships'
                    ),
                    where(
                      'user1',
                      '==',
                      friendship.user1
                    ),
                    where(
                      'user2',
                      '==',
                      friendship.user2
                    )
                  )
                ).then(snap => {
                  snap.docs.forEach(
                    doc =>
                      deleteDoc(
                        doc.ref
                      ).catch(
                        err =>
                          console.error(
                            'Failed to delete friendship:',
                            err
                          )
                      )
                  );
                });
              }

              return null;
            }

            const d =
              s.data();

            // Skip if user data is incomplete (corrupted)
            if (
              !d.name ||
              !d.username
            ) {
              return null;
            }

            const processed =
              processStreakOnLoad(d);

            return {
              uid: s.id,
              ...d,
              today:
                processed.today,
              week:
                processed.week,
              month:
                processed.month,
              year:
                processed.year,
              color:
                colorFor(s.id),
              avatar:
                avatarOf(d.name)
            };
          })
          .filter(Boolean);

      renderFriendsHome();

      if (
        document
          .getElementById(
            'page-friends'
          )
          .classList.contains(
            'active'
          )
      ) {
        renderFriends();
      }
    });
  };

  // Filter statuses in the browser so live queries do not require composite
  // Firestore indexes and incoming changes can be delivered immediately.
  unsubA =
    onSnapshot(
      query(
        collection(
          db,
          'friendships'
        ),
        where(
          'user1',
          '==',
          uid
        )
      ),
      snap => {
        s1 =
          snap.docs
            .map(
              d =>
                d.data()
            )
            .filter(
              f =>
                f.status ===
                'accepted'
            );

        merge();
      }
    );

  unsubB =
    onSnapshot(
      query(
        collection(
          db,
          'friendships'
        ),
        where(
          'user2',
          '==',
          uid
        )
      ),
      snap => {
        s2 =
          snap.docs
            .map(
              d =>
                d.data()
            )
            .filter(
              f =>
                f.status ===
                'accepted'
            );

        merge();
      }
    );

  // Query by recipient only, then filter locally.
  // This avoids requiring a Firestore composite index before an incoming
  // request can be displayed.
  unsubP =
    onSnapshot(
      query(
        collection(
          db,
          'friendships'
        ),
        where(
          'user2',
          '==',
          uid
        )
      ),
      snap =>
        syncPendingRequests(
          snap.docs,
          true
        ),
      err => {
        console.error(
          'Incoming friend-request listener failed:',
          err
        );

        refreshPending();
      }
    );
}

function stopListeners() {
  [
    unsubA,
    unsubB,
    unsubP
  ].forEach(
    u =>
      u &&
      u()
  );

  unsubA =
    unsubB =
    unsubP =
      null;
}

// ── AUTH STATE ───────────────────────────────────────────────────────────
onAuthStateChanged(
  auth,
  async user => {
    initTheme();

    if (user) {
      const profileReady =
        await loadUserData(
          user.uid
        );

      if (profileReady) {
        startListeners(
          user.uid
        );
      }

      showApp();
      renderHome();

      startLocationSharingIfAlreadyGranted();

      if (!profileReady) {
        navTo('settings');

        showToast(
          'Your account profile is incomplete. Add your name and username in Settings.'
        );
      }

      updateClock();

      const firstName =
        (
          state.user.name ||
          'there'
        ).split(' ')[0];

      showSuccessAlert(
        `Welcome back, ${firstName}! 💩`,
        3000
      );

    } else {
      // Not logged in — send to login page
      window.location.replace(
        'login.html'
      );
    }
  }
);

// ── LOGOUT / DELETE ──────────────────────────────────────────────────────
window.doLogout =
  async function () {
    stopListeners();

    await signOut(auth);

    window.location.replace(
      'login.html'
    );
  };

window.confirmDelete =
  async function () {
    if (
      !confirm(
        'Are you sure? This permanently deletes your account and all poop data. 💩'
      )
    ) {
      return;
    }

    const user =
      auth.currentUser;

    if (user) {
      try {
        // Delete Firestore document first
        await deleteDoc(
          doc(
            db,
            'users',
            user.uid
          )
        );

        // Delete all friendships associated with this user
        const [
          friendships1,
          friendships2
        ] =
          await Promise.all([
            getDocs(
              query(
                collection(
                  db,
                  'friendships'
                ),
                where(
                  'user1',
                  '==',
                  user.uid
                )
              )
            ),

            getDocs(
              query(
                collection(
                  db,
                  'friendships'
                ),
                where(
                  'user2',
                  '==',
                  user.uid
                )
              )
            )
          ]);

        await Promise.all(
          [
            ...friendships1.docs,
            ...friendships2.docs
          ].map(
            d =>
              deleteDoc(
                d.ref
              )
          )
        );

        // Finally delete Firebase Auth account
        await deleteUser(
          user
        );

      } catch (e) {
        showToast(
          'Please log out and back in, then try again.'
        );

        return;
      }
    }

    stopListeners();

    showToast(
      'Account deleted. Goodbye! 👋',
      1500
    );

    setTimeout(
      () =>
        window.location.replace(
          'login.html'
        ),
      1200
    );
  };

// ── SIDEBAR TOGGLE ───────────────────────────────────────────────────────
let sidebarOpen = false;

const isMobile =
  () =>
    window.innerWidth <=
    768;

window.toggleSidebar =
  function () {
    if (isMobile()) {
      sidebarOpen =
        !sidebarOpen;

      const sidebar =
        document.querySelector(
          '.sidebar'
        );

      const overlay =
        document.getElementById(
          'sidebar-overlay'
        );

      sidebar.classList.toggle(
        'mobile-open',
        sidebarOpen
      );

      if (overlay) {
        overlay.classList.toggle(
          'open',
          sidebarOpen
        );
      }

    } else {
      sidebarOpen =
        !sidebarOpen;

      const sidebar =
        document.querySelector(
          '.sidebar'
        );

      const layout =
        document.getElementById(
          'app-layout'
        );

      sidebar.classList.toggle(
        'hidden',
        !sidebarOpen
      );

      layout.classList.toggle(
        'sidebar-hidden',
        !sidebarOpen
      );
    }
  };

window.closeMobileSidebar =
  function () {
    sidebarOpen = false;

    const sidebar =
      document.querySelector(
        '.sidebar'
      );

    const overlay =
      document.getElementById(
        'sidebar-overlay'
      );

    sidebar.classList.remove(
      'mobile-open'
    );

    if (overlay) {
      overlay.classList.remove(
        'open'
      );
    }
  };

window.addEventListener(
  'resize',
  () => {
    if (!isMobile()) {
      closeMobileSidebar();

      const sidebar =
        document.querySelector(
          '.sidebar'
        );

      const layout =
        document.getElementById(
          'app-layout'
        );

      sidebar.classList.remove(
        'hidden'
      );

      layout.classList.remove(
        'sidebar-hidden'
      );

      sidebarOpen = true;

      // Show/hide bottom nav based on size
      document
        .getElementById(
          'bottom-nav'
        )
        .style.display =
        'none';

    } else {
      document
        .getElementById(
          'bottom-nav'
        )
        .style.display =
        'block';
    }
  }
);

// ── NAV ─────────────────────────────────────────────────────────────────
window.navTo =
  function (page) {
    // Track navigation history for back button
    if (
      state.navHistory[
        state.navHistory.length - 1
      ] !== page
    ) {
      state.navHistory.push(
        page
      );
    }

    document
      .querySelectorAll(
        '.page'
      )
      .forEach(
        p =>
          p.classList.remove(
            'active'
          )
      );

    document
      .querySelectorAll(
        '.nav-item'
      )
      .forEach(
        b =>
          b.classList.remove(
            'active'
          )
      );

    document
      .querySelectorAll(
        '.bottom-nav-btn'
      )
      .forEach(
        b =>
          b.classList.remove(
            'active'
          )
      );

    document
      .getElementById(
        'page-' + page
      )
      .classList.add(
        'active'
      );

    const n =
      document.getElementById(
        'nav-' + page
      );

    if (n) {
      n.classList.add(
        'active'
      );
    }

    const bn =
      document.getElementById(
        'bnav-' + page
      );

    if (bn) {
      bn.classList.add(
        'active'
      );
    }

    closeMobileSidebar();

    if (page === 'home') {
      renderHome();
    }

    if (page === 'friends') {
      refreshPending();
      renderFriends();
    }

    if (page === 'friend-details') {
      renderFriendDetails();
    }

    if (page === 'settings') {
      renderSettings();
    }
  };

// ── HOME ─────────────────────────────────────────────────────────────────
function renderYearStat() {
  const now = new Date();

  const dayLabel =
    now.toLocaleString(
      'default',
      {
        month: 'short',
        day: 'numeric'
      }
    );

  const yearNum =
    now.getFullYear();

  const el =
    document.getElementById(
      'year-count'
    );

  const lbl =
    document.getElementById(
      'year-label'
    );

  const sub =
    document.getElementById(
      'year-date'
    );

  if (el) {
    el.textContent =
      state.year;
  }

  if (lbl) {
    lbl.textContent =
      dayLabel;
  }

  if (sub) {
    sub.textContent =
      `poops in ${yearNum}`;
  }
}

function getISOWeekNumber() {
  const d = new Date();

  d.setHours(
    0,
    0,
    0,
    0
  );

  d.setDate(
    d.getDate() +
    3 -
    (d.getDay() + 6) % 7
  );

  const yearStart =
    new Date(
      d.getFullYear(),
      0,
      4
    );

  return Math.round(
    (
      (
        d -
        yearStart
      ) /
        86400000 +
      1
    ) / 7
  );
}

// ── AVATAR HELPER ───────────────────────────────────────────────────────
function updateAvatarDisplay(
  elementId
) {
  const el =
    document.getElementById(
      elementId
    );

  if (!el) return;

  const name =
    state.user.name ||
    'User';

  if (
    state.user.profilePictureURL
  ) {
    el.innerHTML =
      `<img src="${state.user.profilePictureURL}" alt="${name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
  } else {
    el.textContent =
      name[0].toUpperCase();
  }
}

function renderHome() {
  const name =
    state.user.name
      ? state.user.name.split(' ')[0]
      : 'there';

  document
    .getElementById(
      'greeting-name'
    )
    .textContent =
    name;

  updateAvatarDisplay(
    'topbar-avatar'
  );

  document
    .getElementById(
      'topbar-username'
    )
    .textContent =
    '@' +
    (
      state.user.username ||
      '...'
    );

  document
    .getElementById(
      'today-count'
    )
    .textContent =
    state.today;

  document
    .getElementById(
      'week-count'
    )
    .textContent =
    weekSum(
      state.week
    );

  document
    .getElementById(
      'month-count'
    )
    .textContent =
    state.month;

  // Dynamic labels
  const monthName =
    new Date().toLocaleString(
      'default',
      {
        month: 'long'
      }
    );

  const weekNum =
    getISOWeekNumber();

  const mlEl =
    document.getElementById(
      'month-label'
    );

  const wlEl =
    document.getElementById(
      'week-label'
    );

  if (mlEl) {
    mlEl.textContent =
      monthName;
  }

  if (wlEl) {
    wlEl.textContent =
      `Week ${weekNum}`;
  }

  renderYearStat();
  updateCounterMsg();
  renderChart();
  renderFriendsHome();
  updatePendingBadge();
}

window.changeCount =
  async function (delta) {
    const today =
      todayStr();

    const todayIdx =
      new Date().getDay();

    if (delta > 0) {
      // Adding a poop
      state.today++;
      state.month++;
      state.year++;
      state.week[
        todayIdx
      ] = state.today;

      // Update streak only if this is the first poop today
      if (
        state.lastPoopDate !==
        today
      ) {
        state.streak =
          recalculateStreak();

        state.lastPoopDate =
          today;
      }

    } else if (delta < 0) {
      // Removing a poop
      state.today =
        Math.max(
          0,
          state.today - 1
        );

      state.week[
        todayIdx
      ] = state.today;

      if (state.month > 0) {
        state.month--;
      }

      if (state.year > 0) {
        state.year--;
      }

      // If we removed all poops for today, reset streak and date
      if (state.today === 0) {
        state.streak = 0;
        state.lastPoopDate = '';
      }
    }

    const el =
      document.getElementById(
        'today-count'
      );

    el.textContent =
      state.today;

    el.classList.remove(
      'pop-anim'
    );

    void el.offsetWidth;

    el.classList.add(
      'pop-anim'
    );

    document
      .getElementById(
        'week-count'
      )
      .textContent =
      weekSum(
        state.week
      );

    document
      .getElementById(
        'month-count'
      )
      .textContent =
      state.month;

    renderYearStat();
    updateCounterMsg();

    if (delta > 0) {
      animatePoopLog();
      playPoopSound();

      showSuccessAlert(
        'Poop logged! 💩'
      );
    }

    renderChart();

    await savePoopData();
  };

function updateCounterMsg() {
  const msgs = [
    'Press + to log a poop!',
    'Nice one! 💪',
    "You're on a roll!",
    'ema koto bar hagli re',
    'smelly caaaaaaaaaaaaaaaaat! smelly caaaaaaaaaaaaaaaaat what are they feeding u 🐱',
    'ebaba hege dilo cheeeeeeeeeeeeee 😂🫵',
    'Pooping machine! 🏆',
    'Legend. 👑',
    'oh you so big huh king',
    'fucking god',
    'bro u need ors',
    'u need o2 tablet at this point',
    'YOU FUCKING LEGEND',
    '🐐',
    'this is why u eat fibers',
    'now stop bro',
    'u can stop now',
    'FUCKING STOP',
    'BRO ENOUGH NOW',
    'STOP!',
    'BRUH I WAS KIDDING STOP!',
    'I AM WORRIED!',
    'BITCH GO TO A DOCTOR',
    'LORD OF SHIT',
    'oh u sexy buoyeee 😏🫦 ',
    'I HAVE NO COMMENTS ANYMORE',
    'I know your 𝑔𝑎𝑦',
    'these are manual comments, ran out of em, no more energy, u go boi 🖕'
  ];

  const el =
    document.getElementById(
      'counter-msg'
    );

  if (el) {
    el.textContent =
      state.today === 0
        ? msgs[0]
        : msgs[
            Math.min(
              state.today,
              msgs.length - 1
            )
          ];
  }
}

const PX_PER_POOP = 28;

function renderChart() {
  const days = [
    'S',
    'M',
    'T',
    'W',
    'T',
    'F',
    'S'
  ];

  const todayIdx =
    new Date().getDay();

  const chart =
    document.getElementById(
      'bar-chart'
    );

  if (!chart) return;

  chart.innerHTML =
    state.week
      .map(
        (v, i) => `
    <div class="bar-col">
      <div class="bar" style="height:${Math.max(v, 0) * PX_PER_POOP + (v > 0 ? 4 : 0)}px;min-height:4px;background:${i === todayIdx ? '#c0394b' : '#4a6fa5'};"></div>
      <div class="bar-label" style="font-size:11px;font-weight:700;color:${i === todayIdx ? '#c0394b' : 'var(--muted)'};text-align:center;margin-bottom:2px;">${v > 0 ? v : ''}</div>
      <div class="bar-day" style="color:${i === todayIdx ? '#c0394b' : 'var(--muted)'};font-weight:${i === todayIdx ? 900 : 700};">${days[i]}</div>
    </div>`
      )
      .join('');
}

function renderFriendsHome() {
  const el =
    document.getElementById(
      'friends-home-list'
    );

  if (!el) return;

  if (
    state.friends.length === 0
  ) {
    el.innerHTML =
      `<div class="empty-state"><span class="big-emoji">🤷</span><p>No friends yet.<br>Add some in the Friends tab!</p></div>`;

    return;
  }

  el.innerHTML =
    state.friends
      .map(
        f => `
    <div class="friend-row" onclick="viewFriendDetails('${escapeHtml(f.uid)}')">
      <div class="avatar" style="background:${f.profilePictureURL ? 'transparent' : f.color + '22'};color:${f.color};">${f.profilePictureURL ? `<img src="${f.profilePictureURL}" alt="${escapeHtml(f.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : f.avatar}</div>
      <div class="friend-info"><div class="friend-name">${escapeHtml(f.name)}</div><div class="friend-sub">@${escapeHtml(f.username)}</div></div>
      <div class="friend-stats">
        <span class="count-pill">${f.today || 0} 💩 today</span>
        <span class="count-pill green">${weekSum(f.week)}w</span>
      </div>
    </div>`
      )
      .join('');
}

function updatePendingBadge() {
  const n =
    state.pendingIn.length;

  const badge =
    document.getElementById(
      'pending-badge'
    );

  if (badge) {
    badge.style.display =
      n > 0
        ? 'inline'
        : 'none';

    badge.textContent = n;
  }

  const bnavBadge =
    document.getElementById(
      'bnav-badge'
    );

  if (bnavBadge) {
    bnavBadge.style.display =
      n > 0
        ? 'flex'
        : 'none';

    bnavBadge.textContent =
      n;
  }
}

// ── INCOMING FRIEND REQUESTS ──────────────────────────────────────────────
async function syncPendingRequests(
  friendshipDocs,
  removeOrphans = false
) {
  const reqs =
    friendshipDocs
      .map(
        d => ({
          id: d.id,
          ...d.data()
        })
      )
      .filter(
        request =>
          request.status ===
          'pending'
      );

  const senderSnaps =
    await Promise.all(
      reqs.map(
        request =>
          getDoc(
            doc(
              db,
              'users',
              request.user1
            )
          )
      )
    );

  state.pendingIn =
    senderSnaps
      .map(
        (
          senderSnap,
          index
        ) => {
          if (
            !senderSnap.exists()
          ) {
            if (removeOrphans) {
              deleteDoc(
                doc(
                  db,
                  'friendships',
                  reqs[index].id
                )
              ).catch(
                err =>
                  console.error(
                    'Failed to delete orphaned friendship:',
                    err
                  )
              );
            }

            return null;
          }

          const sender =
            senderSnap.data();

          return {
            docId:
              reqs[index].id,
            uid:
              senderSnap.id,
            name:
              sender.name ||
              'Unknown user',
            username:
              sender.username ||
              'unknown',
            profilePictureURL:
              sender.profilePictureURL ||
              '',
            color:
              colorFor(
                senderSnap.id
              ),
            avatar:
              avatarOf(
                sender.name
              )
          };
        }
      )
      .filter(Boolean);

  updatePendingBadge();

  if (
    document
      .getElementById(
        'page-friends'
      )
      .classList.contains(
        'active'
      )
  ) {
    renderFriends();
  }
}

// ── REFRESH PENDING (initial load and listener fallback) ─────────────────
async function refreshPending() {
  if (!state.user.uid) return;

  try {
    const snap =
      await getDocs(
        query(
          collection(
            db,
            'friendships'
          ),
          where(
            'user2',
            '==',
            state.user.uid
          )
        )
      );

    await syncPendingRequests(
      snap.docs
    );

  } catch (err) {
    console.error(
      'refreshPending error:',
      err
    );
  }
}

// ── FRIENDS PAGE ─────────────────────────────────────────────────────────
function renderFriends() {
  const pendSec =
    document.getElementById(
      'pending-section'
    );

  if (pendSec) {
    pendSec.style.display =
      state.pendingIn.length
        ? 'block'
        : 'none';
  }

  const pendList =
    document.getElementById(
      'pending-list'
    );

  if (pendList) {
    pendList.innerHTML =
      state.pendingIn
        .map(
          f => `
    <div class="friend-card">
      <div class="avatar" style="background:${f.profilePictureURL ? 'transparent' : f.color + '22'};color:${f.color};">${f.profilePictureURL ? `<img src="${f.profilePictureURL}" alt="${escapeHtml(f.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : f.avatar}</div>
      <div style="flex:1;"><div class="friend-name">${escapeHtml(f.name)}</div><div class="friend-sub">@${escapeHtml(f.username)}</div></div>
      <span class="pending-badge-label">Wants to be friends 💩</span>
      <button class="action-btn accept" onclick="acceptFriend('${escapeHtml(f.docId)}')">Accept</button>
      <button class="action-btn decline" onclick="declineFriend('${escapeHtml(f.docId)}')">Decline</button>
    </div>`
        )
        .join('');
  }

  const mainList =
    document.getElementById(
      'friends-list-main'
    );

  if (!mainList) return;

  if (
    state.friends.length === 0
  ) {
    mainList.innerHTML =
      `<div class="empty-state"><span class="big-emoji">💩</span><p>No friends yet.<br>Search above to add someone!</p></div>`;

    return;
  }

  mainList.innerHTML =
    state.friends
      .map(
        f => `
    <div class="friend-card" onclick="viewFriendDetails('${escapeHtml(f.uid)}')">
      <div class="avatar" style="background:${f.profilePictureURL ? 'transparent' : f.color + '22'};color:${f.color};">${f.profilePictureURL ? `<img src="${f.profilePictureURL}" alt="${escapeHtml(f.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : f.avatar}</div>
      <div style="flex:1;"><div class="friend-name">${escapeHtml(f.name)}</div><div class="friend-sub">@${escapeHtml(f.username)}</div></div>
      <div class="friend-stats" style="margin-right:16px;">
        <span class="count-pill">${f.today || 0} 💩</span>
        <span class="count-pill green">${weekSum(f.week)} this week</span>
        <span class="count-pill pink">${f.month || 0} this month</span>
      </div>
      <button class="action-btn remove" onclick="event.stopPropagation(); removeFriend('${escapeHtml(f.uid)}')">Remove</button>
    </div>`
      )
      .join('');
}

window.viewFriendDetails =
  function (friendUid) {
    const friend =
      state.friends.find(
        f =>
          f.uid ===
          friendUid
      );

    if (!friend) return;

    state.currentViewingFriend =
      friend;

    renderFriendDetails();

    navTo(
      'friend-details'
    );
  };

function renderFriendDetails() {
  if (
    !state.currentViewingFriend
  ) {
    return;
  }

  const f =
    state.currentViewingFriend;

  const now = new Date();

  const yearNum =
    now.getFullYear();

  // Display friend's profile picture or avatar
  const avatarEl =
    document.getElementById(
      'friend-detail-avatar'
    );

  if (f.profilePictureURL) {
    avatarEl.innerHTML =
      `<img src="${f.profilePictureURL}" alt="${f.name}">`;
  } else {
    avatarEl.textContent =
      f.avatar ||
      f.name[0].toUpperCase();
  }

  document
    .getElementById(
      'friend-detail-name'
    )
    .textContent =
    f.name;

  document
    .getElementById(
      'friend-detail-username'
    )
    .textContent =
    '@' + f.username;

  document
    .getElementById(
      'friend-year-count'
    )
    .textContent =
    f.year || 0;

  document
    .getElementById(
      'friend-year-date'
    )
    .textContent =
    `poops in ${yearNum}`;

  document
    .getElementById(
      'friend-month-count'
    )
    .textContent =
    f.month || 0;

  document
    .getElementById(
      'friend-week-count'
    )
    .textContent =
    weekSum(
      f.week ||
      [
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ]
    );

  document
    .getElementById(
      'friend-today-count'
    )
    .textContent =
    f.today || 0;

  // Render friend's weekly chart
  const days = [
    'S',
    'M',
    'T',
    'W',
    'T',
    'F',
    'S'
  ];

  const todayIdx =
    new Date().getDay();

  const week =
    f.week ||
    [
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];

  const chart =
    document.getElementById(
      'friend-bar-chart'
    );

  if (chart) {
    chart.innerHTML =
      week
        .map(
          (v, i) => `
      <div class="bar-col">
        <div class="bar" style="height:${Math.max(v, 0) * PX_PER_POOP + (v > 0 ? 4 : 0)}px;min-height:4px;background:${i === todayIdx ? '#c0394b' : '#4a6fa5'};"></div>
        <div class="bar-label" style="font-size:11px;font-weight:700;color:${i === todayIdx ? '#c0394b' : 'var(--muted)'};text-align:center;margin-bottom:2px;">${v > 0 ? v : ''}</div>
        <div class="bar-day" style="color:${i === todayIdx ? '#c0394b' : 'var(--muted)'};font-weight:${i === todayIdx ? 900 : 700};">${days[i]}</div>
      </div>`
        )
        .join('');
  }
}

window.searchFriend =
  async function () {
    const qText =
      document
        .getElementById(
          'friend-search'
        )
        .value
        .trim()
        .toLowerCase();

    const results =
      document.getElementById(
        'search-results'
      );

    if (!qText) {
      results.innerHTML = '';
      return;
    }

    try {
      const snap =
        await getDocs(
          query(
            collection(
              db,
              'users'
            ),
            where(
              'username',
              '==',
              qText
            )
          )
        );

      const myUid =
        state.user.uid;

      const friendUids =
        state.friends.map(
          f => f.uid
        );

      // Separate outgoing (I sent) vs incoming (sent to me) pending requests
      const [
        outgoingSnap,
        incomingSnap
      ] =
        await Promise.all([
          getDocs(
            query(
              collection(
                db,
                'friendships'
              ),
              where(
                'user1',
                '==',
                myUid
              )
            )
          ),

          getDocs(
            query(
              collection(
                db,
                'friendships'
              ),
              where(
                'user2',
                '==',
                myUid
              )
            )
          )
        ]);

      const pendOutUids =
        new Set(
          outgoingSnap.docs
            .filter(
              d =>
                d.data()
                  .status ===
                'pending'
            )
            .map(
              d =>
                d.data()
                  .user2
            )
        );

      // Map incoming sender UID → friendship doc ID
      const pendInMap =
        new Map();

      incomingSnap.docs
        .filter(
          d =>
            d.data()
              .status ===
            'pending'
        )
        .forEach(
          d =>
            pendInMap.set(
              d.data()
                .user1,
              d.id
            )
        );

      if (snap.empty) {
        results.innerHTML =
          `<div style="padding:20px;color:var(--muted);font-size:14px;font-weight:600;">No user found with username "@${qText}"</div>`;

        return;
      }

      let html =
        `<p class="section-title">Search Results</p>`;

      snap.forEach(
        docSnap => {
          if (
            docSnap.id ===
            myUid
          ) {
            return;
          }

          const u =
            docSnap.data();

          if (
            !u.name ||
            !u.username
          ) {
            return;
          }

          const color =
            colorFor(
              docSnap.id
            );

          const avatar =
            avatarOf(
              u.name
            );

          let btnHtml;

          if (
            friendUids.includes(
              docSnap.id
            )
          ) {
            btnHtml =
              `<span style="color:var(--green);font-weight:700;font-size:13px;">✅ Already friends</span>`;

          } else if (
            pendInMap.has(
              docSnap.id
            )
          ) {
            const docId =
              pendInMap.get(
                docSnap.id
              );

            btnHtml =
              `<span class="pending-badge-label">Wants to be friends 💩</span>
          <button class="action-btn accept" onclick="event.stopPropagation(); acceptFriend('${escapeHtml(docId)}')">Accept</button>
          <button class="action-btn decline" onclick="event.stopPropagation(); declineFriend('${escapeHtml(docId)}')">Decline</button>`;

          } else if (
            pendOutUids.has(
              docSnap.id
            )
          ) {
            btnHtml =
              `<span style="color:var(--muted);font-weight:700;font-size:13px;">⏳ Request sent</span>`;

          } else {
            btnHtml =
              `<button class="action-btn add" onclick="sendRequest('${escapeHtml(docSnap.id)}','${escapeHtml(u.name)}','${escapeHtml(u.username)}')">+ Add Friend</button>`;
          }

          const avatarHtml =
            u.profilePictureURL
              ? `<img src="${u.profilePictureURL}" alt="${escapeHtml(u.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
              : avatar;

          html +=
            `<div class="friend-card"><div class="avatar" style="background:${u.profilePictureURL ? 'transparent' : color + '22'};color:${color};">${avatarHtml}</div><div style="flex:1;"><div class="friend-name">${escapeHtml(u.name)}</div><div class="friend-sub">@${escapeHtml(u.username)}</div></div>${btnHtml}</div>`;
        }
      );

      results.innerHTML =
        html;

    } catch (err) {
      console.error(
        err
      );

      showToast(
        'Search failed ❌ — check Firestore rules'
      );
    }
  };

window.sendRequest =
  async function (
    toUid,
    toName
  ) {
    try {
      const myUid =
        state.user.uid;

      if (
        !myUid ||
        !state.profileReady
      ) {
        showToast(
          'Complete your profile in Settings before adding friends.'
        );

        return;
      }

      if (
        myUid ===
        toUid
      ) {
        showToast(
          'You cannot add yourself.'
        );

        return;
      }

      // One predictable document per pair prevents duplicate requests without
      // querying multiple fields (which required a Firestore composite index).
      const friendshipId =
        [
          myUid,
          toUid
        ]
          .sort()
          .join('_');

      const friendshipRef =
        doc(
          db,
          'friendships',
          friendshipId
        );

      const existing =
        await getDoc(
          friendshipRef
        );

      if (
        existing.exists()
      ) {
        showToast(
          'Request already exists!'
        );

        return;
      }

      await setDoc(
        friendshipRef,
        {
          user1:
            myUid,
          user2:
            toUid,
          status:
            'pending',
          createdAt:
            serverTimestamp()
        }
      );

      document
        .getElementById(
          'search-results'
        )
        .innerHTML = '';

      document
        .getElementById(
          'friend-search'
        )
        .value = '';

      showToast(
        `Friend request sent to ${toName}! 💩`
      );

    } catch (err) {
      console.error(
        err
      );

      showToast(
        'Failed to send request ❌'
      );
    }
  };

window.acceptFriend =
  async function (
    docId
  ) {
    try {
      await updateDoc(
        doc(
          db,
          'friendships',
          docId
        ),
        {
          status:
            'accepted'
        }
      );

      document
        .getElementById(
          'search-results'
        )
        .innerHTML = '';

      document
        .getElementById(
          'friend-search'
        )
        .value = '';

      await refreshPending();

      renderFriends();

      showSuccessAlert(
        'Friend accepted! 🎉'
      );

    } catch (err) {
      console.error(
        err
      );

      showToast(
        'Error ❌'
      );
    }
  };

window.declineFriend =
  async function (
    docId
  ) {
    try {
      await deleteDoc(
        doc(
          db,
          'friendships',
          docId
        )
      );

      document
        .getElementById(
          'search-results'
        )
        .innerHTML = '';

      document
        .getElementById(
          'friend-search'
        )
        .value = '';

      await refreshPending();

      renderFriends();

      showToast(
        'Request declined.'
      );

    } catch (err) {
      console.error(
        err
      );

      showToast(
        'Error ❌'
      );
    }
  };

window.removeFriend =
  async function (
    friendUid
  ) {
    try {
      const uid =
        state.user.uid;

      const [
        q1,
        q2
      ] =
        await Promise.all([
          getDocs(
            query(
              collection(
                db,
                'friendships'
              ),
              where(
                'user1',
                '==',
                uid
              ),
              where(
                'user2',
                '==',
                friendUid
              )
            )
          ),

          getDocs(
            query(
              collection(
                db,
                'friendships'
              ),
              where(
                'user1',
                '==',
                friendUid
              ),
              where(
                'user2',
                '==',
                uid
              )
            )
          )
        ]);

      await Promise.all(
        [
          ...q1.docs,
          ...q2.docs
        ].map(
          d =>
            deleteDoc(
              d.ref
            )
        )
      );

      showToast(
        'Friend removed.'
      );

    } catch (err) {
      console.error(
        err
      );

      showToast(
        'Error ❌'
      );
    }
  };

// ── SETTINGS ─────────────────────────────────────────────────────────────
async function renderSettings() {
  if (!state.user.uid) {
    displaySettings();
    return;
  }

  try {
    const snap =
      await getDoc(
        doc(
          db,
          'users',
          state.user.uid
        )
      );

    if (snap.exists()) {
      const d =
        snap.data();

      state.user.name =
        d.name || '';

      state.user.username =
        d.username || '';

      state.user.email =
        d.email || '';

      state.user.profilePictureURL =
        d.profilePictureURL ||
        '';
    }

  } catch (err) {
    console.error(
      'Error loading settings:',
      err
    );
  }

  displaySettings();
}

function displaySettings() {
  const name =
    state.user.name ||
    'Your Name';

  const username =
    state.user.username ||
    'username';

  const email =
    state.user.email ||
    '';

  const nameEl =
    document.getElementById(
      'settings-name'
    );

  const usernameEl =
    document.getElementById(
      'settings-username'
    );

  const nameValEl =
    document.getElementById(
      's-name-val'
    );

  const usernameValEl =
    document.getElementById(
      's-username-val'
    );

  const emailValEl =
    document.getElementById(
      's-email-val'
    );

  const tzValEl =
    document.getElementById(
      's-tz-val'
    );

  if (nameEl) {
    nameEl.textContent =
      name;
  }

  if (usernameEl) {
    usernameEl.textContent =
      '@' + username;
  }

  if (nameValEl) {
    nameValEl.textContent =
      name;
  }

  if (usernameValEl) {
    usernameValEl.textContent =
      '@' + username;
  }

  if (emailValEl) {
    emailValEl.textContent =
      email;
  }

  if (tzValEl) {
    tzValEl.textContent =
      getTzLabel();
  }

  updateAvatarDisplay(
    'settings-avatar'
  );
}


async function compressProfileImage(file) {
  const dataUrl =
    await new Promise(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onload =
          () =>
            resolve(
              reader.result
            );

        reader.onerror =
          () =>
            reject(
              new Error(
                'Could not read the image.'
              )
            );

        reader.readAsDataURL(
          file
        );
      }
    );

  const image =
    await new Promise(
      (resolve, reject) => {
        const img =
          new Image();

        img.onload =
          () =>
            resolve(img);

        img.onerror =
          () =>
            reject(
              new Error(
                'Could not process the image.'
              )
            );

        img.src =
          dataUrl;
      }
    );

  const maxSide = 600;

  const scale =
    Math.min(
      1,
      maxSide /
        Math.max(
          image.width,
          image.height
        )
    );

  const canvas =
    document.createElement(
      'canvas'
    );

  canvas.width =
    Math.max(
      1,
      Math.round(
        image.width *
          scale
      )
    );

  canvas.height =
    Math.max(
      1,
      Math.round(
        image.height *
          scale
      )
    );

  const context =
    canvas.getContext(
      '2d'
    );

  if (!context) {
    throw new Error(
      'Image processing is not supported.'
    );
  }

  context.drawImage(
    image,
    0,
    0,
    canvas.width,
    canvas.height
  );

  let quality = 0.82;

  let compressed =
    canvas.toDataURL(
      'image/webp',
      quality
    );

  // Firestore documents have a size limit,
  // so keep the fallback comfortably below 1 MB.
  while (
    compressed.length >
      900000 &&
    quality > 0.45
  ) {
    quality -= 0.08;

    compressed =
      canvas.toDataURL(
        'image/webp',
        quality
      );
  }

  if (
    compressed.length >
    900000
  ) {
    throw new Error(
      'Image is still too large after compression.'
    );
  }

  return compressed;
}

window.handleProfilePictureUpload =
  async function (event) {
    try {
      console.log(
        'handleProfilePictureUpload triggered'
      );

      console.log(
        'Event:',
        event
      );

      console.log(
        'Event target:',
        event.target
      );

      console.log(
        'Files:',
        event.target.files
      );

      const file =
        event.target.files?.[0];

      if (!file) {
        console.log(
          'No file selected'
        );

        showToast(
          'No file selected ❌'
        );

        return;
      }

      console.log(
        'File selected:',
        file.name,
        'Size:',
        file.size,
        'Type:',
        file.type
      );

      showToast(
        'File selected, uploading... ⏳'
      );

      // Validate file size
      if (
        file.size >
        5 * 1024 * 1024
      ) {
        showToast(
          'Image too large. Max 5MB ❌'
        );

        console.log(
          'File rejected: too large'
        );

        return;
      }

      // Validate file type
      if (
        !file.type.startsWith(
          'image/'
        )
      ) {
        showToast(
          'Please select an image file ❌'
        );

        console.log(
          'File rejected: not an image'
        );

        return;
      }

      console.log(
        'File validation passed'
      );

      showToast(
        'Uploading image... ⏳'
      );

      let downloadURL = '';

      // Keep the existing Cloudinary upload as the first choice.
      try {
        const formData =
          new FormData();

        formData.append(
          'file',
          file
        );

        formData.append(
          'upload_preset',
          CLOUDINARY_UPLOAD_PRESET
        );

        console.log(
          'Uploading to:',
          CLOUDINARY_UPLOAD_URL
        );

        console.log(
          'Preset:',
          CLOUDINARY_UPLOAD_PRESET
        );

        const response =
          await fetch(
            CLOUDINARY_UPLOAD_URL,
            {
              method:
                'POST',
              body:
                formData
            }
          );

        console.log(
          'Upload response status:',
          response.status
        );

        if (
          !response.ok
        ) {
          const errorText =
            await response.text();

          console.error(
            'Cloudinary error response:',
            response.status,
            errorText
          );

          throw new Error(
            `Cloudinary upload failed (${response.status})`
          );
        }

        const data =
          await response.json();

        downloadURL =
          data.secure_url ||
          '';

        if (!downloadURL) {
          throw new Error(
            'Cloudinary did not return an image URL.'
          );
        }

        console.log(
          'Cloudinary upload successful, URL:',
          downloadURL
        );

      } catch (
        cloudinaryError
      ) {
        // Fallback: compress the image and store it directly in the user's
        // Firestore document. This keeps profile pictures working even when
        // the Cloudinary preset is unavailable or blocked by the network.
        console.warn(
          'Cloudinary profile upload failed. Using Firestore fallback.',
          cloudinaryError
        );

        showToast(
          'Cloudinary unavailable. Saving a compressed profile picture... ⏳'
        );

        downloadURL =
          await compressProfileImage(
            file
          );
      }

      // Save URL/data URL to Firestore
      const uid =
        state.user.uid;

      console.log(
        'Saving to Firestore - User:',
        uid
      );

      state.user.profilePictureURL =
        downloadURL;

      await setDoc(
  doc(
    db,
    'users',
    uid
  ),
  {
    name:
      state.user.name || '',

    username:
      state.user.username || '',

    email:
      state.user.email ||
      auth.currentUser?.email ||
      '',

    profilePictureURL:
      downloadURL
  },
  {
    merge: true
  }
);

      console.log(
        'Firestore update complete'
      );

      renderSettings();
      renderHome();
      renderFriendsHome();

      showSuccessAlert(
        'Profile picture updated! 📸'
      );

    } catch (error) {
      console.error(
        'Upload error:',
        error.message
      );

      console.error(
        'Full error:',
        error
      );

      showToast(
        'Upload failed: ' +
        error.message +
        ' ❌'
      );

    } finally {
      // Reset file input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

// Bind the file picker after the upload function exists.
if (
  document.readyState ===
  'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    setupProfilePictureUpload
  );
} else {
  setupProfilePictureUpload();
}

let modalCallback = null;

window.editField =
  function (
    label,
    isPw = false
  ) {
    document
      .getElementById(
        'modal-title'
      )
      .textContent =
      'Edit ' + label;

    document
      .getElementById(
        'modal-label'
      )
      .textContent =
      label;

    const input =
      document.getElementById(
        'modal-input'
      );

    input.type =
      isPw
        ? 'password'
        : 'text';

    input.value = '';

    input.placeholder =
      'Enter new ' +
      label.toLowerCase() +
      '...';

    document
      .getElementById(
        'edit-modal'
      )
      .classList.add(
        'open'
      );

    input.focus();

    modalCallback =
      async val => {
        if (!state.user.uid) {
          return showToast(
            'Not logged in'
          );
        }

        if (
          label ===
          'Full Name'
        ) {
          state.user.name =
            val;
        }

        if (
          label ===
          'Username'
        ) {
          state.user.username =
            val
              .replace(
                '@',
                ''
              )
              .toLowerCase();
        }

        try {
          await setDoc(
            doc(
              db,
              'users',
              state.user.uid
            ),
            {
              name:
                state.user.name,
              username:
                state.user.username
            },
            {
              merge:
                true
            }
          );

          state.profileReady =
            Boolean(
              state.user.name &&
              state.user.username
            );

          if (
            state.profileReady &&
            !unsubA &&
            !unsubB &&
            !unsubP
          ) {
            startListeners(
              state.user.uid
            );
          }

          renderSettings();
          renderHome();

          showToast(
            state.profileReady
              ? 'Profile updated ✅'
              : 'Add both name and username to finish your profile.'
          );

        } catch (e) {
          showToast(
            'Error saving ❌'
          );
        }
      };
  };

window.closeModal =
  () =>
    document
      .getElementById(
        'edit-modal'
      )
      .classList.remove(
        'open'
      );

window.saveModal =
  () => {
    const val =
      document
        .getElementById(
          'modal-input'
        )
        .value
        .trim();

    if (!val) {
      showToast(
        'Field cannot be empty'
      );

      return;
    }

    if (modalCallback) {
      modalCallback(val);
    }

    closeModal();
  };

document
  .getElementById(
    'edit-modal'
  )
  .addEventListener(
    'click',
    e => {
      if (
        e.target ===
        e.currentTarget
      ) {
        closeModal();
      }
    }
  );