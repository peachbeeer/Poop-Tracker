import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app = initializeApp({ apiKey: "AIzaSyCGVDkVu41U1AFqOeZFgFSyM1kitTGnLLs", authDomain: "oopsie-poopsie-c32d7.firebaseapp.com", projectId: "oopsie-poopsie-c32d7", storageBucket: "oopsie-poopsie-c32d7.firebasestorage.app", messagingSenderId: "1074032955615", appId: "1:1074032955615:web:ed6e9c837aca3d5b0f596a" });
const auth = getAuth(app);
const db = getFirestore(app);

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
  } catch (err) { showToast(err.message); }
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
  } catch (err) { showToast(err.message); }
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
