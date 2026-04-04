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
const state = { user: { uid: '', name: '', username: '', email: '', profilePictureURL: '' }, today: 0, week: [0, 0, 0, 0, 0, 0, 0], month: 0, year: 0, streak: 0, lastPoopDate: '', friends: [], pendingIn: [], currentViewingFriend: null };
let unsubA = null, unsubB = null, unsubP = null;

// ── NAVIGATION HISTORY ─────────────────────────────────────────────────
let navigationHistory = ['home'];
const MAX_HISTORY = 10;

// ── UTILS ───────────────────────────────────────────────────────────────
const COLORS = ['#4a6fa5', '#c0394b', '#4a8a6a', '#7c4dff', '#f57c00', '#0097a7', '#e91e63'];
const colorFor = uid => COLORS[uid.charCodeAt(0) % COLORS.length];
const avatarOf = name => (name || '?')[0].toUpperCase();
const weekSum = w => (Array.isArray(w) ? w : [0, 0, 0, 0, 0, 0, 0]).reduce((a, b) => a + b, 0);
const localDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => localDateStr(new Date());
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return localDateStr(d); };

function showToast(msg, duration = 2800) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), duration); }

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

function getTzLabel() { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone, off = new Date().getTimezoneOffset(), absH = Math.floor(Math.abs(off) / 60), absM = Math.abs(off) % 60, sign = off <= 0 ? '+' : '-'; return tz.split('/').pop().replace(/_/g, ' ') + ' ' + sign + absH + ':' + String(absM).padStart(2, '0'); }
function updateClock() { const now = new Date(), el = document.getElementById('clock-time'), tz = document.getElementById('tz-label'); if (el) el.textContent = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0'); if (tz) tz.textContent = getTzLabel(); }
updateClock(); setInterval(updateClock, 30000);

// ── SHOW APP (called once auth confirmed) ──────────────────────────────
function showApp() {
  document.getElementById('app-wrap').style.display = '';
  // Show bottom nav on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('bottom-nav').style.display = 'block';
  }
  
  // Setup back button handler for mobile devices
  if (window.cordova) {
    document.addEventListener('backbutton', handleBackButton, false);
  } else {
    // Fallback for browsers without Cordova
    window.addEventListener('popstate', handleBackButton);
  }
}

// ── STREAK LOGIC ────────────────────────────────────────────────────────
function processStreakOnLoad(d) {
  const today = todayStr();
  const yesterday = yesterdayStr();
  const last = d.lastPoopDate || '';

  let streak = d.streak || 0;
  let todayCount = d.today || 0;
  let month = d.month || 0;
  let week = Array.isArray(d.week) ? d.week : [0, 0, 0, 0, 0, 0, 0];

  if (last && last < yesterday) streak = 0;

  if (last !== today) {
    todayCount = 0;
    const todayIdx = new Date().getDay();
    week[todayIdx] = 0;
  }

  const now = new Date();
  if (now.getDay() === 1 && last && last < today) {
    const thisMonday = new Date(); thisMonday.setDate(now.getDate() - now.getDay() + 1); thisMonday.setHours(0, 0, 0, 0);
    if (new Date(last) < thisMonday) week = [0, 0, 0, 0, 0, 0, 0];
  }

  const thisMonth = today.slice(0, 7);
  // Use stored monthKey so month only resets on real calendar-month changes,
  // not based on when lastPoopDate was.
  if (!d.monthKey) {
    // Legacy account: monthKey doesn't exist yet.
    // Seed month from the current week total so we recover any wiped count.
    const lastMonth = last ? last.slice(0, 7) : '';
    if (lastMonth && lastMonth !== thisMonth) {
      // Last poop was a previous month — seed from week total to recover data.
      month = weekSum(week);
    }
    // If lastMonth === thisMonth, month value is already correct — keep it.
  } else if (d.monthKey !== thisMonth) {
    // New calendar month — start fresh.
    month = 0;
  }

  // ── Year tracking ─────────────────────────────────────────────────
  let year = d.year || 0;
  const thisYear = String(new Date().getFullYear());
  if (!d.yearKey) {
    // Legacy: no yearKey yet. Seed from month value as best guess.
    const lastYear = last ? last.slice(0, 4) : '';
    if (lastYear && lastYear !== thisYear) year = 0; // pooped last year only
    else if (!lastYear) year = 0;
    // else keep stored year value
  } else if (d.yearKey !== thisYear) {
    year = 0; // New calendar year — reset
  }

  return { streak, today: todayCount, week, month, monthKey: thisMonth, year, yearKey: thisYear };
}

function recalculateStreak() {
  const today = todayStr();
  const last = state.lastPoopDate;
  if (!last) return 1; // First poop ever
  if (last === today) return state.streak; // Already pooped today, keep current streak
  else if (last === yesterdayStr()) return state.streak + 1; // Pooped yesterday, increment
  else return 1; // Gap in days, reset to 1
}

// ── FIRESTORE HELPERS ───────────────────────────────────────────────────
async function savePoopData() {
  if (!state.user.uid) return;
  const yearKey = String(new Date().getFullYear());
  await setDoc(doc(db, 'users', state.user.uid), {
    today: state.today, month: state.month, week: state.week,
    streak: state.streak, lastPoopDate: state.lastPoopDate,
    monthKey: todayStr().slice(0, 7),
    year: state.year, yearKey,
  }, { merge: true });
}

async function loadUserData(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) {
    const d = snap.data();
    state.user = { uid, name: d.name || '', username: d.username || '', email: d.email || '', profilePictureURL: d.profilePictureURL || '' };
    const processed = processStreakOnLoad(d);
    state.today = processed.today;
    state.month = processed.month;
    state.week = processed.week;
    state.streak = processed.streak;
    state.year = processed.year;
    state.lastPoopDate = d.lastPoopDate || '';
    if (d.today !== processed.today || d.streak !== processed.streak ||
        (d.monthKey || '') !== processed.monthKey ||
        (d.yearKey || '') !== processed.yearKey) {
      await setDoc(doc(db, 'users', uid), {
        today: processed.today, month: processed.month, week: processed.week,
        streak: processed.streak, monthKey: processed.monthKey,
        year: processed.year, yearKey: processed.yearKey,
      }, { merge: true });
    }
  }
}

// ── LIVE LISTENERS ──────────────────────────────────────────────────────
function startListeners(uid) {
  let s1 = [], s2 = [];
  const merge = () => {
    const all = [...s1, ...s2];
    const friendUids = all.map(f => f.user1 === uid ? f.user2 : f.user1);
    Promise.all(friendUids.map(fuid => getDoc(doc(db, 'users', fuid)))).then(snaps => {
      state.friends = snaps.filter(s => s.exists()).map(s => {
        const d = s.data();
        // Process friend data to reset today's count if it's not from today
        const processed = processStreakOnLoad(d);
        return {
          uid: s.id,
          ...d,
          today: processed.today,
          week: processed.week,
          month: processed.month,
          year: processed.year,
          color: colorFor(s.id),
          avatar: avatarOf(d.name)
        };
      });
      renderFriendsHome();
      if (document.getElementById('page-friends').classList.contains('active')) renderFriends();
    });
  };
  unsubA = onSnapshot(query(collection(db, 'friendships'), where('user1', '==', uid), where('status', '==', 'accepted')), snap => { s1 = snap.docs.map(d => d.data()); merge(); });
  unsubB = onSnapshot(query(collection(db, 'friendships'), where('user2', '==', uid), where('status', '==', 'accepted')), snap => { s2 = snap.docs.map(d => d.data()); merge(); });
  unsubP = onSnapshot(query(collection(db, 'friendships'), where('user2', '==', uid), where('status', '==', 'pending')), async snap => {
    const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sSnaps = await Promise.all(reqs.map(r => getDoc(doc(db, 'users', r.user1))));
    state.pendingIn = sSnaps.filter(s => s.exists()).map((s, i) => ({ docId: reqs[i].id, uid: s.id, name: s.data().name, username: s.data().username, color: colorFor(s.id), avatar: avatarOf(s.data().name) }));
    updatePendingBadge();
    if (document.getElementById('page-friends').classList.contains('active')) renderFriends();
  });
}
function stopListeners() { [unsubA, unsubB, unsubP].forEach(u => u && u()); unsubA = unsubB = unsubP = null; }

// ── AUTH STATE ───────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (user) {
    await loadUserData(user.uid);
    startListeners(user.uid);
    showApp();
    renderHome();
    updateClock();
    const firstName = (state.user.name || 'there').split(' ')[0];
    showSuccessAlert(`Welcome back, ${firstName}! 💩`, 3000);
  } else {
    // Not logged in — send to login page
    window.location.replace('login.html');
  }
});

// ── LOGOUT / DELETE ──────────────────────────────────────────────────────
window.doLogout = async function () {
  stopListeners();
  await signOut(auth);
  window.location.replace('login.html');
};

window.confirmDelete = async function () {
  if (!confirm('Are you sure? This permanently deletes your account and all poop data. 💩')) return;
  const user = auth.currentUser;
  if (user) {
    try { await deleteUser(user); }
    catch (e) { showToast('Please log out and back in, then try again.'); return; }
  }
  stopListeners();
  showToast('Account deleted. Goodbye! 👋', 1500);
  setTimeout(() => window.location.replace('login.html'), 1200);
};

// ── SIDEBAR TOGGLE ───────────────────────────────────────────────────────
let sidebarOpen = false;
const isMobile = () => window.innerWidth <= 768;

window.toggleSidebar = function () {
  if (isMobile()) {
    sidebarOpen = !sidebarOpen;
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('mobile-open', sidebarOpen);
    if (overlay) overlay.classList.toggle('open', sidebarOpen);
  } else {
    sidebarOpen = !sidebarOpen;
    const sidebar = document.querySelector('.sidebar');
    const layout = document.getElementById('app-layout');
    sidebar.classList.toggle('hidden', !sidebarOpen);
    layout.classList.toggle('sidebar-hidden', !sidebarOpen);
  }
};

window.closeMobileSidebar = function () {
  sidebarOpen = false;
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('open');
};

window.addEventListener('resize', () => {
  if (!isMobile()) {
    closeMobileSidebar();
    const sidebar = document.querySelector('.sidebar');
    const layout = document.getElementById('app-layout');
    sidebar.classList.remove('hidden');
    layout.classList.remove('sidebar-hidden');
    sidebarOpen = true;
    // Show/hide bottom nav based on size
    document.getElementById('bottom-nav').style.display = 'none';
  } else {
    document.getElementById('bottom-nav').style.display = 'block';
  }
});

// ── NAV ─────────────────────────────────────────────────────────────────
window.navTo = function (page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  const n = document.getElementById('nav-' + page); if (n) n.classList.add('active');
  const bn = document.getElementById('bnav-' + page); if (bn) bn.classList.add('active');
  closeMobileSidebar();
  
  // Add to navigation history if it's a different page
  if (navigationHistory[navigationHistory.length - 1] !== page) {
    navigationHistory.push(page);
    // Keep history size manageable
    if (navigationHistory.length > MAX_HISTORY) {
      navigationHistory.shift();
    }
  }
  
  if (page === 'home') renderHome();
  if (page === 'friends') renderFriends();
  if (page === 'friend-details') renderFriendDetails();
  if (page === 'settings') renderSettings();
};

// ── BACK BUTTON HANDLER ────────────────────────────────────────────────
window.handleBackButton = function () {
  const currentPage = navigationHistory[navigationHistory.length - 1];
  
  if (currentPage === 'home') {
    // On home page - offer to close app
    const confirmExit = confirm('Exit Oopsie Poopsie? 💩');
    if (confirmExit) {
      if (navigator.app && navigator.app.exitApp) {
        navigator.app.exitApp(); // Cordova exit
      } else if (window.cordova && window.cordova.exec) {
        // For other Cordova scenarios
        navigator.app.exitApp();
      }
      // Fallback for web/no-exit capability
      showToast('Close this tab to exit 👋');
    }
  } else {
    // Navigate back
    navigationHistory.pop(); // Remove current page
    const previousPage = navigationHistory[navigationHistory.length - 1] || 'home';
    navTo(previousPage);
  }
};

// ── HOME ─────────────────────────────────────────────────────────────────
function renderYearStat() {
  const now = new Date();
  const dayLabel = now.toLocaleString('default', { month: 'short', day: 'numeric' });
  const yearNum  = now.getFullYear();
  const el = document.getElementById('year-count');
  const lbl = document.getElementById('year-label');
  const sub = document.getElementById('year-date');
  if (el)  el.textContent  = state.year;
  if (lbl) lbl.textContent = dayLabel;          // e.g. "Apr 4"
  if (sub) sub.textContent = `poops in ${yearNum}`;
}

function getISOWeekNumber() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); // nearest Thursday
  const yearStart = new Date(d.getFullYear(), 0, 4);   // Jan 4 is always in week 1
  return Math.round(((d - yearStart) / 86400000 + 1) / 7);
}

// ── AVATAR HELPER ───────────────────────────────────────────────────────
function updateAvatarDisplay(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const name = state.user.name || 'User';
  if (state.user.profilePictureURL) {
    el.innerHTML = `<img src="${state.user.profilePictureURL}" alt="${name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
  } else {
    el.textContent = name[0].toUpperCase();
  }
}

function renderHome() {
  const name = state.user.name ? state.user.name.split(' ')[0] : 'there';
  document.getElementById('greeting-name').textContent = name;
  updateAvatarDisplay('topbar-avatar');
  document.getElementById('topbar-username').textContent = '@' + (state.user.username || '...');
  document.getElementById('today-count').textContent = state.today;
  document.getElementById('week-count').textContent = weekSum(state.week);
  document.getElementById('month-count').textContent = state.month;

  // Dynamic labels
  const monthName = new Date().toLocaleString('default', { month: 'long' });
  const weekNum   = getISOWeekNumber();
  const mlEl = document.getElementById('month-label');
  const wlEl = document.getElementById('week-label');
  if (mlEl) mlEl.textContent = monthName;
  if (wlEl) wlEl.textContent = `Week ${weekNum}`;

  renderYearStat();
  updateCounterMsg(); renderChart(); renderFriendsHome(); updatePendingBadge();
}


window.changeCount = async function (delta) {
  const today = todayStr();
  const todayIdx = new Date().getDay();

  if (delta > 0) {
    // Adding a poop
    state.today++;
    state.month++;
    state.year++;
    state.week[todayIdx] = state.today;

    // Update streak only if this is the first poop today
    if (state.lastPoopDate !== today) {
      state.streak = recalculateStreak();
      state.lastPoopDate = today;
    }

  } else if (delta < 0) {
    // Removing a poop
    state.today = Math.max(0, state.today - 1);
    state.week[todayIdx] = state.today;

    if (state.month > 0) state.month--;
    if (state.year > 0)  state.year--;

    // If we removed all poops for today, reset streak and date
    if (state.today === 0) {
      state.streak = 0;
      state.lastPoopDate = '';
    }
  }

  const el = document.getElementById('today-count');
  el.textContent = state.today;
  el.classList.remove('pop-anim');
  void el.offsetWidth;
  el.classList.add('pop-anim');

  document.getElementById('week-count').textContent = weekSum(state.week);
  document.getElementById('month-count').textContent = state.month;
  renderYearStat();
  updateCounterMsg();

  if (delta > 0) showSuccessAlert('Poop logged! 💩');

  renderChart();
  await savePoopData();
};

function updateCounterMsg() {
  const msgs = ['Press + to log a poop!', 'Nice one! 💪', "You're on a roll!", 'Pooping machine! 🏆', 'Legend. 👑'];
  const el = document.getElementById('counter-msg');
  if (el) el.textContent = state.today === 0 ? msgs[0] : msgs[Math.min(state.today, msgs.length - 1)];
}

const PX_PER_POOP = 28; // fixed pixels per poop — bars only grow, never shrink
function renderChart() {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const todayIdx = new Date().getDay();
  const chart = document.getElementById('bar-chart');
  if (!chart) return;
  chart.innerHTML = state.week.map((v, i) => `
    <div class="bar-col">
      <div class="bar" style="height:${Math.max(v, 0) * PX_PER_POOP + (v > 0 ? 4 : 0)}px;min-height:4px;background:${i === todayIdx ? '#c0394b' : '#4a6fa5'};"></div>
      <div class="bar-label" style="font-size:11px;font-weight:700;color:${i === todayIdx ? '#c0394b' : 'var(--muted)'};text-align:center;margin-bottom:2px;">${v > 0 ? v : ''}</div>
      <div class="bar-day" style="color:${i === todayIdx ? '#c0394b' : 'var(--muted)'};font-weight:${i === todayIdx ? 900 : 700};">${days[i]}</div>
    </div>`).join('');
}

function renderFriendsHome() {
  const el = document.getElementById('friends-home-list'); if (!el) return;
  if (state.friends.length === 0) { el.innerHTML = `<div class="empty-state"><span class="big-emoji">🤷</span><p>No friends yet.<br>Add some in the Friends tab!</p></div>`; return; }
  el.innerHTML = state.friends.map(f => `
    <div class="friend-row" onclick="viewFriendDetails('${f.uid}')">
      <div class="avatar" style="background:${f.profilePictureURL ? 'transparent' : f.color + '22'};color:${f.color};">${f.profilePictureURL ? `<img src="${f.profilePictureURL}" alt="${f.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : f.avatar}</div>
      <div class="friend-info"><div class="friend-name">${f.name}</div><div class="friend-sub">@${f.username}</div></div>
      <div class="friend-stats">
        <span class="count-pill">${f.today || 0} 💩 today</span>
        <span class="count-pill green">${weekSum(f.week)}w</span>
      </div>
    </div>`).join('');
}

function updatePendingBadge() {
  const n = state.pendingIn.length;
  const badge = document.getElementById('pending-badge');
  if (badge) { badge.style.display = n > 0 ? 'inline' : 'none'; badge.textContent = n; }
  const bnavBadge = document.getElementById('bnav-badge');
  if (bnavBadge) { bnavBadge.style.display = n > 0 ? 'flex' : 'none'; bnavBadge.textContent = n; }
}

// ── FRIENDS PAGE ─────────────────────────────────────────────────────────
function renderFriends() {
  const pendSec = document.getElementById('pending-section');
  if (pendSec) pendSec.style.display = state.pendingIn.length ? 'block' : 'none';
  const pendList = document.getElementById('pending-list');
  if (pendList) pendList.innerHTML = state.pendingIn.map(f => `
    <div class="friend-card">
      <div class="avatar" style="background:${f.profilePictureURL ? 'transparent' : f.color + '22'};color:${f.color};">${f.profilePictureURL ? `<img src="${f.profilePictureURL}" alt="${f.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : f.avatar}</div>
      <div style="flex:1;"><div class="friend-name">${f.name}</div><div class="friend-sub">@${f.username}</div></div>
      <span class="pending-badge-label">Wants to be friends 💩</span>
      <button class="action-btn accept" onclick="acceptFriend('${f.docId}')">Accept</button>
      <button class="action-btn decline" onclick="declineFriend('${f.docId}')">Decline</button>
    </div>`).join('');
  const mainList = document.getElementById('friends-list-main'); if (!mainList) return;
  if (state.friends.length === 0) { mainList.innerHTML = `<div class="empty-state"><span class="big-emoji">💩</span><p>No friends yet.<br>Search above to add someone!</p></div>`; return; }
  mainList.innerHTML = state.friends.map(f => `
    <div class="friend-card" onclick="viewFriendDetails('${f.uid}')">
      <div class="avatar" style="background:${f.profilePictureURL ? 'transparent' : f.color + '22'};color:${f.color};">${f.profilePictureURL ? `<img src="${f.profilePictureURL}" alt="${f.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : f.avatar}</div>
      <div style="flex:1;"><div class="friend-name">${f.name}</div><div class="friend-sub">@${f.username}</div></div>
      <div class="friend-stats" style="margin-right:16px;">
        <span class="count-pill">${f.today || 0} 💩</span>
        <span class="count-pill green">${weekSum(f.week)} this week</span>
        <span class="count-pill pink">${f.month || 0} this month</span>
      </div>
      <button class="action-btn remove" onclick="event.stopPropagation(); removeFriend('${f.uid}')">Remove</button>
    </div>`).join('');
}

window.viewFriendDetails = function (friendUid) {
  const friend = state.friends.find(f => f.uid === friendUid);
  if (!friend) return;
  
  state.currentViewingFriend = friend;
  renderFriendDetails();
  navTo('friend-details');
};

function renderFriendDetails() {
  if (!state.currentViewingFriend) return;
  
  const f = state.currentViewingFriend;
  const now = new Date();
  const yearNum = now.getFullYear();
  
  // Display friend's profile picture or avatar
  const avatarEl = document.getElementById('friend-detail-avatar');
  if (f.profilePictureURL) {
    avatarEl.innerHTML = `<img src="${f.profilePictureURL}" alt="${f.name}">`;
  } else {
    avatarEl.textContent = f.avatar || f.name[0].toUpperCase();
  }
  
  document.getElementById('friend-detail-name').textContent = f.name;
  document.getElementById('friend-detail-username').textContent = '@' + f.username;
  document.getElementById('friend-year-count').textContent = f.year || 0;
  document.getElementById('friend-year-date').textContent = `poops in ${yearNum}`;
  document.getElementById('friend-month-count').textContent = f.month || 0;
  document.getElementById('friend-week-count').textContent = weekSum(f.week || [0, 0, 0, 0, 0, 0, 0]);
  document.getElementById('friend-today-count').textContent = f.today || 0;
  
  // Render friend's weekly chart
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const todayIdx = new Date().getDay();
  const week = f.week || [0, 0, 0, 0, 0, 0, 0];
  const chart = document.getElementById('friend-bar-chart');
  if (chart) {
    chart.innerHTML = week.map((v, i) => `
      <div class="bar-col">
        <div class="bar" style="height:${Math.max(v, 0) * PX_PER_POOP + (v > 0 ? 4 : 0)}px;min-height:4px;background:${i === todayIdx ? '#c0394b' : '#4a6fa5'};"></div>
        <div class="bar-label" style="font-size:11px;font-weight:700;color:${i === todayIdx ? '#c0394b' : 'var(--muted)'};text-align:center;margin-bottom:2px;">${v > 0 ? v : ''}</div>
        <div class="bar-day" style="color:${i === todayIdx ? '#c0394b' : 'var(--muted)'};font-weight:${i === todayIdx ? 900 : 700};">${days[i]}</div>
      </div>`).join('');
  }
}

window.searchFriend = async function () {
  const qText = document.getElementById('friend-search').value.trim().toLowerCase();
  const results = document.getElementById('search-results');
  if (!qText) { results.innerHTML = ''; return; }
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('username', '==', qText)));
    const myUid = state.user.uid;
    const friendUids = state.friends.map(f => f.uid);
    const pendUids = state.pendingIn.map(f => f.uid);
    if (snap.empty) { results.innerHTML = `<div style="padding:20px;color:var(--muted);font-size:14px;font-weight:600;">No user found with username "@${qText}"</div>`; return; }
    let html = `<p class="section-title">Search Results</p>`;
    snap.forEach(docSnap => {
      if (docSnap.id === myUid) return;
      const u = docSnap.data(), color = colorFor(docSnap.id), avatar = avatarOf(u.name);
      const btnHtml = friendUids.includes(docSnap.id)
        ? `<span style="color:var(--green);font-weight:700;font-size:13px;">✅ Already friends</span>`
        : pendUids.includes(docSnap.id)
          ? `<span style="color:var(--muted);font-weight:700;font-size:13px;">⏳ Pending your acceptance</span>`
          : `<button class="action-btn add" onclick="sendRequest('${docSnap.id}','${u.name}','${u.username}')">+ Add Friend</button>`;
      const avatarHtml = u.profilePictureURL ? `<img src="${u.profilePictureURL}" alt="${u.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : avatar;
      html += `<div class="friend-card"><div class="avatar" style="background:${u.profilePictureURL ? 'transparent' : color + '22'};color:${color};">${avatarHtml}</div><div style="flex:1;"><div class="friend-name">${u.name}</div><div class="friend-sub">@${u.username}</div></div>${btnHtml}</div>`;
    });
    results.innerHTML = html;
  } catch (err) { console.error(err); showToast('Search failed ❌ — check Firestore rules'); }
};

window.sendRequest = async function (toUid, toName) {
  try {
    const myUid = state.user.uid;
    const [c1, c2] = await Promise.all([
      getDocs(query(collection(db, 'friendships'), where('user1', '==', myUid), where('user2', '==', toUid))),
      getDocs(query(collection(db, 'friendships'), where('user1', '==', toUid), where('user2', '==', myUid)))
    ]);
    if (!c1.empty || !c2.empty) { showToast('Request already exists!'); return; }
    await addDoc(collection(db, 'friendships'), { user1: myUid, user2: toUid, status: 'pending', createdAt: serverTimestamp() });
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('friend-search').value = '';
    showToast(`Friend request sent to ${toName}! 💩`);
  } catch (err) { console.error(err); showToast('Failed to send request ❌'); }
};

window.acceptFriend = async function (docId) {
  try { await updateDoc(doc(db, 'friendships', docId), { status: 'accepted' }); showSuccessAlert('Friend accepted! 🎉'); }
  catch (err) { console.error(err); showToast('Error ❌'); }
};

window.declineFriend = async function (docId) {
  try { await deleteDoc(doc(db, 'friendships', docId)); showToast('Request declined.'); }
  catch (err) { console.error(err); showToast('Error ❌'); }
};

window.removeFriend = async function (friendUid) {
  try {
    const uid = state.user.uid;
    const [q1, q2] = await Promise.all([
      getDocs(query(collection(db, 'friendships'), where('user1', '==', uid), where('user2', '==', friendUid))),
      getDocs(query(collection(db, 'friendships'), where('user1', '==', friendUid), where('user2', '==', uid)))
    ]);
    await Promise.all([...q1.docs, ...q2.docs].map(d => deleteDoc(d.ref)));
    showToast('Friend removed.');
  } catch (err) { console.error(err); showToast('Error ❌'); }
};

// ── SETTINGS ─────────────────────────────────────────────────────────────
function renderSettings() {
  const name = state.user.name || 'Your Name';
  document.getElementById('settings-name').textContent = name;
  document.getElementById('settings-username').textContent = '@' + (state.user.username || 'username');
  updateAvatarDisplay('settings-avatar');
  document.getElementById('s-name-val').textContent = name;
  document.getElementById('s-username-val').textContent = '@' + (state.user.username || '');
  document.getElementById('s-email-val').textContent = state.user.email || '';
  document.getElementById('s-tz-val').textContent = getTzLabel();
}

window.triggerProfilePictureUpload = function () {
  console.log('triggerProfilePictureUpload called');
  // Label now handles this - left for compatibility
};

window.handleProfilePictureUpload = async function (event) {
  try {
    console.log('handleProfilePictureUpload triggered');
    console.log('Event:', event);
    console.log('Event target:', event.target);
    console.log('Files:', event.target.files);
    
    const file = event.target.files?.[0];
    if (!file) {
      console.log('No file selected');
      showToast('No file selected ❌');
      return;
    }
    
    console.log('File selected:', file.name, 'Size:', file.size, 'Type:', file.type);
    showToast('File selected, uploading... ⏳');
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image too large. Max 5MB ❌');
      console.log('File rejected: too large');
      return;
    }
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file ❌');
      console.log('File rejected: not an image');
      return;
    }
    
    console.log('File validation passed');
    showToast('Uploading image... ⏳');
    
    // Create FormData for Cloudinary upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    console.log('Uploading to:', CLOUDINARY_UPLOAD_URL);
    console.log('Preset:', CLOUDINARY_UPLOAD_PRESET);
    
    // Upload to Cloudinary
    const response = await fetch(CLOUDINARY_UPLOAD_URL, {
      method: 'POST',
      body: formData
    });
    
    console.log('Upload response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloudinary error response:', response.status, errorText);
      
      if (response.status === 400) {
        throw new Error('Invalid upload preset or settings');
      } else if (response.status === 401) {
        throw new Error('Unauthorized - check upload preset');
      } else if (response.status === 404) {
        throw new Error('Cloudinary endpoint not found');
      } else {
        throw new Error(`Upload failed (${response.status})`);
      }
    }
    
    const data = await response.json();
    console.log('Upload successful, URL:', data.secure_url);
    const downloadURL = data.secure_url;
    
    // Save URL to Firestore
    const uid = state.user.uid;
    console.log('Saving to Firestore - User:', uid);
    state.user.profilePictureURL = downloadURL;
    await setDoc(doc(db, 'users', uid), { profilePictureURL: downloadURL }, { merge: true });
    
    console.log('Firestore update complete');
    renderSettings();
    renderHome();
    renderFriendsHome();
    showSuccessAlert('Profile picture updated! 📸');
  } catch (error) {
    console.error('Upload error:', error.message);
    console.error('Full error:', error);
    showToast('Upload failed: ' + error.message + ' ❌');
  } finally {
    // Reset file input
    if (event.target) event.target.value = '';
  }
};

let modalCallback = null;
window.editField = function (label, isPw = false) {
  document.getElementById('modal-title').textContent = 'Edit ' + label;
  document.getElementById('modal-label').textContent = label;
  const input = document.getElementById('modal-input');
  input.type = isPw ? 'password' : 'text'; input.value = '';
  input.placeholder = 'Enter new ' + label.toLowerCase() + '...';
  document.getElementById('edit-modal').classList.add('open'); input.focus();
  modalCallback = async val => {
    if (!state.user.uid) return showToast('Not logged in');
    if (label === 'Full Name') state.user.name = val;
    if (label === 'Username') state.user.username = val.replace('@', '').toLowerCase();
    try { await setDoc(doc(db, 'users', state.user.uid), { name: state.user.name, username: state.user.username }, { merge: true }); renderSettings(); renderHome(); showToast(label + ' updated ✅'); }
    catch (e) { showToast('Error saving ❌'); }
  };
};
window.closeModal = () => document.getElementById('edit-modal').classList.remove('open');
window.saveModal = () => { const val = document.getElementById('modal-input').value.trim(); if (!val) { showToast('Field cannot be empty'); return; } if (modalCallback) modalCallback(val); closeModal(); };
document.getElementById('edit-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });