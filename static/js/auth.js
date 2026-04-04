import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app = initializeApp({ apiKey: "AIzaSyCGVDkVu41U1AFqOeZFgFSyM1kitTGnLLs", authDomain: "oopsie-poopsie-c32d7.firebaseapp.com", projectId: "oopsie-poopsie-c32d7", storageBucket: "oopsie-poopsie-c32d7.firebasestorage.app", messagingSenderId: "1074032955615", appId: "1:1074032955615:web:ed6e9c837aca3d5b0f596a" });
const auth = getAuth(app);
const db = getFirestore(app);

// ── FIREBASE SETTINGS ───────────────────────────────────────────────────
try {
  setPersistence(auth, browserLocalPersistence);
} catch (err) {
  console.warn('Persistence not available in this environment:', err.message);
}

// ── THEME INIT ──────────────────────────────────────────────────────────
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateAuthThemeIcon();
}

function updateAuthThemeIcon() {
  const btn = document.getElementById('auth-theme-toggle');
  if (btn) {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    btn.textContent = currentTheme === 'light' ? '🌙' : '☀️';
  }
}

window.toggleAuthTheme = function() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateAuthThemeIcon();
};

initTheme();

// ── If already logged in, skip straight to the app ────────────────────────
onAuthStateChanged(auth, user => {
  if (user) window.location.replace('index.html');
});

// ── UTILS ─────────────────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
window.show = show;

function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ── UTILS: MOBILE DETECTION ──────────────────────────────────────────────
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// ── UTILS: HANDLE REDIRECT RESULT (for mobile) ───────────────────────────
if (typeof window !== 'undefined') {
  getRedirectResult(auth)
    .then(cred => {
      if (cred) {
        console.log('✅ Redirect result received');
        handleGoogleAuthSuccess(cred.user);
      }
    })
    .catch(err => {
      console.error('Redirect result error:', err.code, err.message);
      if (err.code === 'auth/popup-closed-by-user') {
        console.log('User cancelled sign-in');
      } else if (err.code !== 'auth/operation-not-supported-in-this-environment') {
        showToast('Sign-in error: ' + (err.message || err.code));
      }
    });
}

// ── SIGNUP ────────────────────────────────────────────────────────────────
window.doSignup = async function () {
  const name = document.getElementById('signup-name').value.trim();
  const username = document.getElementById('signup-username').value.trim().toLowerCase();
  const email = document.getElementById('signup-email').value.trim();
  const pw = document.getElementById('signup-pw').value;

  if (!name || !username || !email || !pw) { showToast('Please fill all fields'); return; }

  const btn = document.getElementById('signup-btn');
  btn.disabled = true; btn.textContent = 'Creating…';

  try {
    const taken = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
    if (!taken.empty) { showToast('Username already taken ❌'); return; }

    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, username, email,
      today: 0, month: 0, week: [0, 0, 0, 0, 0, 0, 0],
      streak: 0, lastPoopDate: '',
      monthKey: new Date().toISOString().slice(0, 7),
      year: 0, yearKey: String(new Date().getFullYear()),
      createdAt: serverTimestamp()
    });
    showToast('Account created! 🎉', 1000);
    setTimeout(() => window.location.replace('index.html'), 600);
  } catch (err) {
    console.error('Signup error:', err.code, err.message);
    if (err.code === 'auth/operation-not-supported-in-this-environment') {
      showToast('Authentication service unavailable. Please try again in a few moments.');
    } else if (err.code === 'auth/email-already-in-use') {
      showToast('Email already registered.');
    } else if (err.code === 'auth/weak-password') {
      showToast('Password should be at least 6 characters.');
    } else if (err.code === 'auth/invalid-email') {
      showToast('Invalid email address.');
    } else {
      showToast(err.message || 'Signup failed. Please try again.');
    }
  }
  finally { btn.disabled = false; btn.textContent = 'CREATE ACCOUNT'; }
};

// ── LOGIN ─────────────────────────────────────────────────────────────────
window.doLogin = async function () {
  const email = document.getElementById('login-email').value.trim();
  const pw = document.getElementById('login-pw').value;
  if (!email || !pw) { showToast('Please fill all fields'); return; }

  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Logging in…';

  try {
    await signInWithEmailAndPassword(auth, email, pw);
    showToast('Welcome back 💩', 1000);
    setTimeout(() => window.location.replace('index.html'), 600);
  } catch (err) {
    console.error('Login error:', err.code, err.message);
    if (err.code === 'auth/operation-not-supported-in-this-environment') {
      showToast('Authentication service unavailable. Please try again in a few moments.');
    } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
      showToast('Invalid email or password.');
    } else if (err.code === 'auth/user-disabled') {
      showToast('This account has been disabled.');
    } else if (err.code === 'auth/invalid-email') {
      showToast('Invalid email address.');
    } else {
      showToast(err.message || 'Login failed. Please try again.');
    }
  }
  finally { btn.disabled = false; btn.textContent = 'LOG IN'; }
};

// ── FORGOT ────────────────────────────────────────────────────────────────
window.doForgot = async function () {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { showToast('Enter your email'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    document.getElementById('forgot-success').style.display = 'block';
    setTimeout(() => show('login'), 2500);
  } catch (err) { showToast(err.message); }
};

// ── Enter key support ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const active = document.querySelector('.screen.active')?.id;
  if (active === 'login') doLogin();
  if (active === 'signup') doSignup();
  if (active === 'forgot') doForgot();
});

// ── GOOGLE AUTH: PROCESS SUCCESS ─────────────────────────────────────────
async function handleGoogleAuthSuccess(user) {
  try {
    console.log('Processing Google auth for user:', user.email);
    const userDocRef = doc(db, 'users', user.uid);
    const docSnap = await getDoc(userDocRef);

    if (!docSnap.exists()) {
      console.log('New user, creating profile...');
      let username = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!username) username = 'user';
      
      const unameQuery = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
      if (!unameQuery.empty) {
        username = username + Math.floor(Math.random() * 10000);
      }

      await setDoc(userDocRef, {
        name: user.displayName || 'Google User',
        username: username,
        email: user.email,
        today: 0, month: 0, week: [0, 0, 0, 0, 0, 0, 0],
        streak: 0, lastPoopDate: '',
        monthKey: new Date().toISOString().slice(0, 7),
        year: 0, yearKey: String(new Date().getFullYear()),
        createdAt: serverTimestamp()
      });
      showToast('Account created! 🎉', 800);
    } else {
      console.log('Returning user, logging in...');
      showToast('Welcome back 💩', 800);
    }
    console.log('Redirecting to app...');
    setTimeout(() => window.location.replace('index.html'), 300);
  } catch (err) {
    console.error('Error setting up profile:', err);
    showToast('Setup error: ' + err.message);
  }
}

// ── GOOGLE AUTH: MAIN HANDLER ────────────────────────────────────────────
window.doGoogleAuth = async function () {
  console.log('🔍 doGoogleAuth called');
  const provider = new GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');
  
  const btn = document.querySelector('.btn-google') || { disabled: false };
  const wasDisabled = btn.disabled;
  btn.disabled = true;
  const originalText = btn.textContent;

  try {
    console.log('📱 isMobile:', isMobile());
    
    // Set loading state
    btn.textContent = '🔄 Redirecting to Google...';
    
    if (isMobile()) {
      // Mobile: use redirect flow
      console.log('Using redirect flow for mobile');
      showToast('Opening Google sign-in...');
      await signInWithRedirect(auth, provider);
      // Page will redirect, no need to restore button state
      return;
    } else {
      // Desktop: use popup flow
      console.log('Using popup flow for desktop');
      btn.textContent = '🔄 Signing in...';
      const cred = await signInWithPopup(auth, provider);
      console.log('✅ Google sign-in successful');
      await handleGoogleAuthSuccess(cred.user);
    }
  } catch (err) {
    // Only restore button on errors
    btn.disabled = wasDisabled;
    btn.textContent = originalText;

    console.error('Google auth error:', err.code, err.message);

    // Handle specific error codes
    switch (err.code) {
      case 'auth/popup-blocked':
        showToast('Pop-up blocked. Please enable pop-ups and try again.');
        break;
      case 'auth/popup-closed-by-user':
        showToast('Sign-in cancelled.');
        break;
      case 'auth/network-request-failed':
        showToast('Network error. Check your connection and try again.');
        break;
      case 'auth/operation-not-allowed':
        showToast('Google sign-in is not enabled. Please contact support.');
        break;
      case 'auth/invalid-api-key':
        showToast('Configuration error. Please try again later.');
        break;
      default:
        showToast('Sign-in failed: ' + (err.message || 'Unknown error'));
    }
  }
};
