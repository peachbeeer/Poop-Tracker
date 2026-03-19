import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, deleteUser } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, addDoc, onSnapshot, deleteDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app  = initializeApp({ apiKey:"AIzaSyCGVDkVu41U1AFqOeZFgFSyM1kitTGnLLs", authDomain:"oopsie-poopsie-c32d7.firebaseapp.com", projectId:"oopsie-poopsie-c32d7", storageBucket:"oopsie-poopsie-c32d7.firebasestorage.app", messagingSenderId:"1074032955615", appId:"1:1074032955615:web:ed6e9c837aca3d5b0f596a" });
const auth = getAuth(app);
const db   = getFirestore(app);

// ── STATE ──────────────────────────────────────────────────────────────
const state = { user:{uid:'',name:'',username:'',email:''}, today:0, week:[0,0,0,0,0,0,0], month:0, streak:0, lastPoopDate:'', friends:[], pendingIn:[] };
let unsubA=null, unsubB=null, unsubP=null;

// ── UTILS ───────────────────────────────────────────────────────────────
const COLORS = ['#4a6fa5','#c0394b','#4a8a6a','#7c4dff','#f57c00','#0097a7','#e91e63'];
const colorFor = uid => COLORS[uid.charCodeAt(0)%COLORS.length];
const avatarOf = name => (name||'?')[0].toUpperCase();
const weekSum  = w => (Array.isArray(w)?w:[0,0,0,0,0,0,0]).reduce((a,b)=>a+b,0);
const todayStr = () => new Date().toISOString().slice(0,10);
const yesterdayStr = () => { const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); };

function showToast(msg, duration=2800){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),duration); }

let _alertTimer = null;
function showSuccessAlert(msg, duration=2500){
  const el = document.getElementById('success-alert');
  const msgEl = document.getElementById('success-alert-msg');
  if (!el || !msgEl) return;
  msgEl.textContent = msg;
  el.classList.add('show');
  clearTimeout(_alertTimer);
  _alertTimer = setTimeout(() => el.classList.remove('show'), duration);
}
window.closeSuccessAlert = function(){
  const el = document.getElementById('success-alert');
  if (el) el.classList.remove('show');
  clearTimeout(_alertTimer);
};

function getTzLabel(){ const tz=Intl.DateTimeFormat().resolvedOptions().timeZone,off=new Date().getTimezoneOffset(),absH=Math.floor(Math.abs(off)/60),absM=Math.abs(off)%60,sign=off<=0?'+':'-'; return tz.split('/').pop().replace(/_/g,' ')+' '+sign+absH+':'+String(absM).padStart(2,'0'); }
function updateClock(){ const now=new Date(),el=document.getElementById('clock-time'),tz=document.getElementById('tz-label'); if(el)el.textContent=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0'); if(tz)tz.textContent=getTzLabel(); }
updateClock(); setInterval(updateClock,30000);

// ── SHOW APP (called once auth confirmed) ──────────────────────────────
function showApp() {
  document.getElementById('app-wrap').style.display = '';
  // Show bottom nav on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('bottom-nav').style.display = 'block';
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
  let week = Array.isArray(d.week) ? d.week : [0,0,0,0,0,0,0];

  if (last && last < yesterday) streak = 0;

  if (last !== today) {
    todayCount = 0;
    const todayIdx = new Date().getDay();
    week[todayIdx] = 0;
  }

  const now = new Date();
  if (now.getDay() === 1 && last && last < today) {
    const thisMonday = new Date(); thisMonday.setDate(now.getDate() - now.getDay() + 1); thisMonday.setHours(0,0,0,0);
    if (new Date(last) < thisMonday) week = [0,0,0,0,0,0,0];
  }

  const lastMonth = last ? last.slice(0,7) : '';
  const thisMonth = today.slice(0,7);
  if (lastMonth && lastMonth !== thisMonth) month = 0;

  return { streak, today: todayCount, week, month };
}

function recalculateStreak() {
  const today = todayStr();
  const last = state.lastPoopDate;
  if (last === today) return state.streak;
  else if (last === yesterdayStr()) return state.streak + 1;
  else return 1;
}

// ── FIRESTORE HELPERS ───────────────────────────────────────────────────
async function savePoopData() {
  if(!state.user.uid) return;
  await setDoc(doc(db,'users',state.user.uid), {
    today: state.today, month: state.month, week: state.week,
    streak: state.streak, lastPoopDate: state.lastPoopDate,
  }, { merge:true });
}

async function loadUserData(uid) {
  const snap = await getDoc(doc(db,'users',uid));
  if(snap.exists()) {
    const d = snap.data();
    state.user = { uid, name:d.name||'', username:d.username||'', email:d.email||'' };
    const processed = processStreakOnLoad(d);
    state.today       = processed.today;
    state.month       = processed.month;
    state.week        = processed.week;
    state.streak      = processed.streak;
    state.lastPoopDate = d.lastPoopDate || '';
    if (d.today !== processed.today || d.streak !== processed.streak) {
      await setDoc(doc(db,'users',uid), { today:processed.today, month:processed.month, week:processed.week, streak:processed.streak }, { merge:true });
    }
  }
}

// ── LIVE LISTENERS ──────────────────────────────────────────────────────
function startListeners(uid){
  let s1=[], s2=[];
  const merge = () => {
    const all=[...s1,...s2];
    const friendUids=all.map(f=>f.user1===uid?f.user2:f.user1);
    Promise.all(friendUids.map(fuid=>getDoc(doc(db,'users',fuid)))).then(snaps=>{
      state.friends=snaps.filter(s=>s.exists()).map(s=>({ uid:s.id,...s.data(), color:colorFor(s.id), avatar:avatarOf(s.data().name) }));
      renderFriendsHome();
      if(document.getElementById('page-friends').classList.contains('active')) renderFriends();
    });
  };
  unsubA=onSnapshot(query(collection(db,'friendships'),where('user1','==',uid),where('status','==','accepted')),snap=>{ s1=snap.docs.map(d=>d.data()); merge(); });
  unsubB=onSnapshot(query(collection(db,'friendships'),where('user2','==',uid),where('status','==','accepted')),snap=>{ s2=snap.docs.map(d=>d.data()); merge(); });
  unsubP=onSnapshot(query(collection(db,'friendships'),where('user2','==',uid),where('status','==','pending')),async snap=>{
    const reqs=snap.docs.map(d=>({id:d.id,...d.data()}));
    const sSnaps=await Promise.all(reqs.map(r=>getDoc(doc(db,'users',r.user1))));
    state.pendingIn=sSnaps.filter(s=>s.exists()).map((s,i)=>({ docId:reqs[i].id, uid:s.id, name:s.data().name, username:s.data().username, color:colorFor(s.id), avatar:avatarOf(s.data().name) }));
    updatePendingBadge();
    if(document.getElementById('page-friends').classList.contains('active')) renderFriends();
  });
}
function stopListeners(){ [unsubA,unsubB,unsubP].forEach(u=>u&&u()); unsubA=unsubB=unsubP=null; }

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
window.doLogout = async function(){
  stopListeners();
  await signOut(auth);
  window.location.replace('login.html');
};

window.confirmDelete = async function(){
  if(!confirm('Are you sure? This permanently deletes your account and all poop data. 💩')) return;
  const user = auth.currentUser;
  if(user){
    try{ await deleteUser(user); }
    catch(e){ showToast('Please log out and back in, then try again.'); return; }
  }
  stopListeners();
  showToast('Account deleted. Goodbye! 👋', 1500);
  setTimeout(() => window.location.replace('login.html'), 1200);
};

// ── SIDEBAR TOGGLE ───────────────────────────────────────────────────────
let sidebarOpen = false;
const isMobile = () => window.innerWidth <= 768;

window.toggleSidebar = function(){
  if (isMobile()) {
    sidebarOpen = !sidebarOpen;
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('mobile-open', sidebarOpen);
    if (overlay) overlay.classList.toggle('open', sidebarOpen);
  } else {
    sidebarOpen = !sidebarOpen;
    const sidebar = document.querySelector('.sidebar');
    const layout  = document.getElementById('app-layout');
    sidebar.classList.toggle('hidden', !sidebarOpen);
    layout.classList.toggle('sidebar-hidden', !sidebarOpen);
  }
};

window.closeMobileSidebar = function(){
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
    const layout  = document.getElementById('app-layout');
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
window.navTo = function(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  const n=document.getElementById('nav-'+page); if(n) n.classList.add('active');
  const bn=document.getElementById('bnav-'+page); if(bn) bn.classList.add('active');
  closeMobileSidebar();
  if(page==='home') renderHome();
  if(page==='friends') renderFriends();
  if(page==='settings') renderSettings();
};

// ── HOME ─────────────────────────────────────────────────────────────────
function renderStreak(){
  const el = document.getElementById('streak-val');
  const sub = document.getElementById('streak-sub');
  if(!el) return;
  el.textContent = state.streak + (state.streak === 1 ? ' day' : ' days');
  if(state.streak === 0) sub.textContent = 'Start pooping!';
  else if(state.streak < 3) sub.textContent = 'Good start! 💪';
  else if(state.streak < 7) sub.textContent = 'On a roll! 🔥';
  else sub.textContent = 'Absolute legend! 👑';
}

function renderHome(){
  const name=state.user.name?state.user.name.split(' ')[0]:'there';
  document.getElementById('greeting-name').textContent=name;
  document.getElementById('topbar-avatar').textContent=name[0].toUpperCase();
  document.getElementById('topbar-username').textContent='@'+(state.user.username||'...');
  document.getElementById('today-count').textContent=state.today;
  document.getElementById('week-count').textContent=weekSum(state.week);
  document.getElementById('month-count').textContent=state.month;
  renderStreak();
  updateCounterMsg(); renderChart(); renderFriendsHome(); updatePendingBadge();
}

window.changeCount = async function(delta){
  state.today=Math.max(0,state.today+delta);
  if(delta>0){
    state.month++;
    state.streak = recalculateStreak();
    state.lastPoopDate = todayStr();
  } else if(delta<0 && state.month>0){
    state.month--;
    if(state.today === 0){ state.streak = 0; state.lastPoopDate = ''; }
  }
  const todayIdx=new Date().getDay();
  state.week[todayIdx]=state.today;
  const el=document.getElementById('today-count');
  el.textContent=state.today; el.classList.remove('pop-anim'); void el.offsetWidth; el.classList.add('pop-anim');
  document.getElementById('week-count').textContent=weekSum(state.week);
  document.getElementById('month-count').textContent=state.month;
  renderStreak();
  updateCounterMsg();
  if(delta>0) showSuccessAlert('Poop logged! 💩');
  renderChart();
  await savePoopData();
};

function updateCounterMsg(){
  const msgs=['Press + to log a poop!','Nice one! 💪',"You're on a roll!",'Pooping machine! 🏆','Legend. 👑'];
  const el=document.getElementById('counter-msg');
  if(el) el.textContent=state.today===0?msgs[0]:msgs[Math.min(state.today,msgs.length-1)];
}

function renderChart(){
  const days=['S','M','T','W','T','F','S'];
  const todayIdx=new Date().getDay();
  const data=[...state.week]; data[todayIdx]=state.today;
  const max=Math.max(...data,1);
  const chart=document.getElementById('bar-chart'); if(!chart) return;
  chart.innerHTML=data.map((v,i)=>`
    <div class="bar-col">
      <div class="bar" style="height:${Math.round((v/max)*100)}px;background:${i===todayIdx?'#c0394b':'#4a6fa5'};"></div>
      <div class="bar-day" style="color:${i===todayIdx?'#c0394b':'var(--muted)'};font-weight:${i===todayIdx?900:700};">${days[i]}</div>
    </div>`).join('');
}

function renderFriendsHome(){
  const el=document.getElementById('friends-home-list'); if(!el) return;
  if(state.friends.length===0){ el.innerHTML=`<div class="empty-state"><span class="big-emoji">🤷</span><p>No friends yet.<br>Add some in the Friends tab!</p></div>`; return; }
  el.innerHTML=state.friends.map(f=>`
    <div class="friend-row">
      <div class="avatar" style="background:${f.color}22;color:${f.color};">${f.avatar}</div>
      <div class="friend-info"><div class="friend-name">${f.name}</div><div class="friend-sub">@${f.username}</div></div>
      <div class="friend-stats">
        <span class="count-pill">${f.today||0} 💩 today</span>
        <span class="count-pill green">${weekSum(f.week)}w</span>
      </div>
    </div>`).join('');
}

function updatePendingBadge(){
  const n=state.pendingIn.length;
  const badge=document.getElementById('pending-badge');
  if(badge){ badge.style.display=n>0?'inline':'none'; badge.textContent=n; }
  const bnavBadge=document.getElementById('bnav-badge');
  if(bnavBadge){ bnavBadge.style.display=n>0?'flex':'none'; bnavBadge.textContent=n; }
}

// ── FRIENDS PAGE ─────────────────────────────────────────────────────────
function renderFriends(){
  const pendSec=document.getElementById('pending-section');
  if(pendSec) pendSec.style.display=state.pendingIn.length?'block':'none';
  const pendList=document.getElementById('pending-list');
  if(pendList) pendList.innerHTML=state.pendingIn.map(f=>`
    <div class="friend-card">
      <div class="avatar" style="background:${f.color}22;color:${f.color};">${f.avatar}</div>
      <div style="flex:1;"><div class="friend-name">${f.name}</div><div class="friend-sub">@${f.username}</div></div>
      <span class="pending-badge-label">Wants to be friends 💩</span>
      <button class="action-btn accept" onclick="acceptFriend('${f.docId}')">Accept</button>
      <button class="action-btn decline" onclick="declineFriend('${f.docId}')">Decline</button>
    </div>`).join('');
  const mainList=document.getElementById('friends-list-main'); if(!mainList) return;
  if(state.friends.length===0){ mainList.innerHTML=`<div class="empty-state"><span class="big-emoji">💩</span><p>No friends yet.<br>Search above to add someone!</p></div>`; return; }
  mainList.innerHTML=state.friends.map(f=>`
    <div class="friend-card">
      <div class="avatar" style="background:${f.color}22;color:${f.color};">${f.avatar}</div>
      <div style="flex:1;"><div class="friend-name">${f.name}</div><div class="friend-sub">@${f.username}</div></div>
      <div class="friend-stats" style="margin-right:16px;">
        <span class="count-pill">${f.today||0} 💩</span>
        <span class="count-pill green">${weekSum(f.week)} this week</span>
        <span class="count-pill pink">${f.month||0} this month</span>
      </div>
      <button class="action-btn remove" onclick="removeFriend('${f.uid}')">Remove</button>
    </div>`).join('');
}

window.searchFriend = async function(){
  const qText=document.getElementById('friend-search').value.trim().toLowerCase();
  const results=document.getElementById('search-results');
  if(!qText){ results.innerHTML=''; return; }
  try {
    const snap=await getDocs(query(collection(db,'users'),where('username','==',qText)));
    const myUid=state.user.uid;
    const friendUids=state.friends.map(f=>f.uid);
    const pendUids=state.pendingIn.map(f=>f.uid);
    if(snap.empty){ results.innerHTML=`<div style="padding:20px;color:var(--muted);font-size:14px;font-weight:600;">No user found with username "@${qText}"</div>`; return; }
    let html=`<p class="section-title">Search Results</p>`;
    snap.forEach(docSnap=>{
      if(docSnap.id===myUid) return;
      const u=docSnap.data(), color=colorFor(docSnap.id), avatar=avatarOf(u.name);
      const btnHtml=friendUids.includes(docSnap.id)
        ?`<span style="color:var(--green);font-weight:700;font-size:13px;">✅ Already friends</span>`
        :pendUids.includes(docSnap.id)
          ?`<span style="color:var(--muted);font-weight:700;font-size:13px;">⏳ Pending your acceptance</span>`
          :`<button class="action-btn add" onclick="sendRequest('${docSnap.id}','${u.name}','${u.username}')">+ Add Friend</button>`;
      html+=`<div class="friend-card"><div class="avatar" style="background:${color}22;color:${color};">${avatar}</div><div style="flex:1;"><div class="friend-name">${u.name}</div><div class="friend-sub">@${u.username}</div></div>${btnHtml}</div>`;
    });
    results.innerHTML=html;
  } catch(err){ console.error(err); showToast('Search failed ❌ — check Firestore rules'); }
};

window.sendRequest = async function(toUid,toName){
  try {
    const myUid=state.user.uid;
    const [c1,c2]=await Promise.all([
      getDocs(query(collection(db,'friendships'),where('user1','==',myUid),where('user2','==',toUid))),
      getDocs(query(collection(db,'friendships'),where('user1','==',toUid),where('user2','==',myUid)))
    ]);
    if(!c1.empty||!c2.empty){ showToast('Request already exists!'); return; }
    await addDoc(collection(db,'friendships'),{ user1:myUid, user2:toUid, status:'pending', createdAt:serverTimestamp() });
    document.getElementById('search-results').innerHTML='';
    document.getElementById('friend-search').value='';
    showToast(`Friend request sent to ${toName}! 💩`);
  } catch(err){ console.error(err); showToast('Failed to send request ❌'); }
};

window.acceptFriend = async function(docId){
  try{ await updateDoc(doc(db,'friendships',docId),{ status:'accepted' }); showSuccessAlert('Friend accepted! 🎉'); }
  catch(err){ console.error(err); showToast('Error ❌'); }
};

window.declineFriend = async function(docId){
  try{ await deleteDoc(doc(db,'friendships',docId)); showToast('Request declined.'); }
  catch(err){ console.error(err); showToast('Error ❌'); }
};

window.removeFriend = async function(friendUid){
  try {
    const uid=state.user.uid;
    const [q1,q2]=await Promise.all([
      getDocs(query(collection(db,'friendships'),where('user1','==',uid),where('user2','==',friendUid))),
      getDocs(query(collection(db,'friendships'),where('user1','==',friendUid),where('user2','==',uid)))
    ]);
    await Promise.all([...q1.docs,...q2.docs].map(d=>deleteDoc(d.ref)));
    showToast('Friend removed.');
  } catch(err){ console.error(err); showToast('Error ❌'); }
};

// ── SETTINGS ─────────────────────────────────────────────────────────────
function renderSettings(){
  const name=state.user.name||'Your Name';
  document.getElementById('settings-name').textContent=name;
  document.getElementById('settings-username').textContent='@'+(state.user.username||'username');
  document.getElementById('settings-avatar').textContent=name[0].toUpperCase();
  document.getElementById('s-name-val').textContent=name;
  document.getElementById('s-username-val').textContent='@'+(state.user.username||'');
  document.getElementById('s-email-val').textContent=state.user.email||'';
  document.getElementById('s-tz-val').textContent=getTzLabel();
}

let modalCallback=null;
window.editField = function(label,isPw=false){
  document.getElementById('modal-title').textContent='Edit '+label;
  document.getElementById('modal-label').textContent=label;
  const input=document.getElementById('modal-input');
  input.type=isPw?'password':'text'; input.value='';
  input.placeholder='Enter new '+label.toLowerCase()+'...';
  document.getElementById('edit-modal').classList.add('open'); input.focus();
  modalCallback=async val=>{
    if(!state.user.uid) return showToast('Not logged in');
    if(label==='Full Name') state.user.name=val;
    if(label==='Username')  state.user.username=val.replace('@','').toLowerCase();
    try{ await setDoc(doc(db,'users',state.user.uid),{ name:state.user.name, username:state.user.username },{ merge:true }); renderSettings(); renderHome(); showToast(label+' updated ✅'); }
    catch(e){ showToast('Error saving ❌'); }
  };
};
window.closeModal = ()=>document.getElementById('edit-modal').classList.remove('open');
window.saveModal  = ()=>{ const val=document.getElementById('modal-input').value.trim(); if(!val){ showToast('Field cannot be empty'); return; } if(modalCallback) modalCallback(val); closeModal(); };
document.getElementById('edit-modal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeModal(); });
