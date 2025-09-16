/* ========== CONFIG ========== */
const ADMIN_EMAIL = 'admin@gmail.com'; // ganti email admin kau
/* =========================== */

// helpers
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const db   = firebase.database();
const auth = firebase.auth();

const player = $('#player');
const videoTitle = $('#videoTitle');
const listEl = $('#videoList');
const searchInput = $('#searchInput');
const historyWrap = $('#historyWrap');
const watchHistoryEl = $('#watchHistory');
const searchHistoryEl = $('#searchHistory');

let videos = [];
let current = null;
let dblCount = 0, dblTimer;

/* ======= I18N sederhana ======= */
const I18N = {
  en:{home:'Home',watchHistory:'Watch History',searchHistory:'Search History',newVideos:'New Videos',logout:'Logout',searchPlaceholder:'Search video title…',share:'Share',fullscreen:'Fullscreen'},
  zh:{home:'首页',watchHistory:'观看历史',searchHistory:'搜索历史',newVideos:'新视频',logout:'退出登录',searchPlaceholder:'搜索视频标题…',share:'分享',fullscreen:'全屏'},
  ms:{home:'Home',watchHistory:'Sejarah Tonton',searchHistory:'Sejarah Carian',newVideos:'Video Baharu',logout:'Log Keluar',searchPlaceholder:'Cari tajuk video…',share:'Kongsi',fullscreen:'Skrin Penuh'},
  id:{home:'Beranda',watchHistory:'Riwayat Nonton',searchHistory:'Riwayat Pencarian',newVideos:'Video Baru',logout:'Keluar',searchPlaceholder:'Cari judul video…',share:'Bagikan',fullscreen:'Layar Penuh'},
  vi:{home:'Trang chủ',watchHistory:'Lịch sử xem',searchHistory:'Lịch sử tìm kiếm',newVideos:'Video mới',logout:'Đăng xuất',searchPlaceholder:'Tìm tiêu đề video…',share:'Chia sẻ',fullscreen:'Toàn màn hình'}
};
function applyLang(lang){
  const dict = I18N[lang] || I18N.en;
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    if (!key || !dict[key]) return;
    const emoji = (el.textContent.trim().match(/^[^\w\s]/)?.[0] || '');
    el.textContent = (emoji ? `${emoji} ` : '') + dict[key];
  });
  const si = document.querySelector('[data-i18n-placeholder="searchPlaceholder"]');
  if (si && dict.searchPlaceholder) si.placeholder = dict.searchPlaceholder;
  const sb = $('#shareBtn'); if (sb) sb.textContent = `🔗 ${dict.share}`;
  const fb = $('#fsBtn');    if (fb) fb.textContent = `⛶ ${dict.fullscreen}`;
}
const SAVED_LANG = localStorage.getItem('lang') || 'id';
applyLang(SAVED_LANG);

// UI init
$('#menuBtn').onclick = () => {
  $('#sidebar').classList.toggle('open');
  document.body.classList.toggle('sidebar-open'); // geser konten saat sidebar buka (desktop)
};

const langWrap = $('#langSwitch');
$('#langBtn').onclick = () => langWrap.classList.toggle('open');
$$('#langMenu button').forEach(b=>{
  b.onclick = ()=>{ localStorage.setItem('lang', b.dataset.lang); applyLang(b.dataset.lang); langWrap.classList.remove('open'); };
});

// Logout: redirect pakai replace biar tak balik ke index via back
$('#logoutBtn').addEventListener('click', async (e)=>{
  e.preventDefault();
  try { await auth.signOut(); } catch (err) { console.error('signOut error', err); }
  window.location.replace('login.html');
});

$('#adminAddBtn').onclick = () => $('#addModal').showModal();
$('#m_save').onclick = async (e) => {
  e.preventDefault();
  const title = $('#m_title').value.trim();
  const src   = $('#m_src').value.trim();
  const intro = $('#m_intro').value.trim();
  if(!title || !src) return;

  const id = db.ref('videos').push().key;
  await db.ref(`videos/${id}`).set({ id, title, src, intro: intro || null, createdAt: Date.now() });
  $('#addModal').close();
  $('#m_title').value = $('#m_src').value = $('#m_intro').value = '';
};

$$('.nav-item').forEach(a=>{
  a.onclick = (e)=>{
    e.preventDefault();
    $$('.nav-item').forEach(x=>x.classList.remove('active'));
    a.classList.add('active');
    const key = a.dataset.nav;
    if (key === 'home' || key === 'newVideos') {
      historyWrap.classList.add('hidden');
      $('.container section:nth-of-type(2)').classList.remove('hidden');
    } else if (key === 'watchHistory' || key === 'searchHistory') {
      historyWrap.classList.remove('hidden');
      $('.container section:nth-of-type(2)').classList.add('hidden');
      renderHistories();
    }
  };
});

// skip buttons
$$('.controls .btn').forEach(b=>{
  b.onclick = () => {
    const s = parseInt(b.dataset.skip,10)||0;
    player.currentTime = Math.max(0, Math.min(player.duration || 0, player.currentTime + s));
  };
});

// double-click progressive skip 10s, 20s, 30s, ...
player.addEventListener('dblclick', ()=>{
  dblCount++;
  const sec = 10 * dblCount;
  player.currentTime = Math.max(0, Math.min(player.duration || 0, player.currentTime + sec));
  clearTimeout(dblTimer);
  dblTimer = setTimeout(()=>{ dblCount = 0; }, 600);
});

// fullscreen
$('#fsBtn').onclick = ()=>{
  if (!document.fullscreenElement) player.requestFullscreen?.();
  else document.exitFullscreen?.();
};

// like / dislike (store per video per user in DB)
$('#likeBtn').onclick = ()=> setReaction('like');
$('#dislikeBtn').onclick = ()=> setReaction('dislike');

async function setReaction(kind){
  if (!current || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  await db.ref(`reactions/${current.id}/${uid}`).set(kind);
  updateReactionsUI(current.id);
}

// share
$('#shareBtn').onclick = async ()=>{
  const url = location.origin + location.pathname + `?v=${encodeURIComponent(current?.id || '')}`;
  try{
    await navigator.share?.({ title: current?.title || 'Video', url });
  }catch(e){
    await navigator.clipboard.writeText(url);
    alert('Link copied');
  }
};

// search
searchInput.oninput = e => {
  const q = e.target.value.trim().toLowerCase();
  renderList(q);
  if(q) saveSearchHistory(q);
};

// watch history when ended
player.addEventListener('ended', ()=> {
  if(current) saveWatchHistory(current);
});

// load auth state
auth.onAuthStateChanged(async (u)=>{
  if(!u){ location.href = 'login.html'; return; }

  // badge
  $('#userBadge').textContent = u.displayName || u.email || 'User';
  $('#username').textContent = `(profile) ${u.displayName || u.email}`;
  $('#userEmail').textContent = u.email || '';
  if (u.photoURL) $('#avatar').style.backgroundImage = `url(${u.photoURL})`;

  // admin button
  if (u.email === ADMIN_EMAIL) $('#adminAddBtn').classList.remove('hidden');

  console.log('[app] auth ok, load videos…');

  // load videos from Firebase, fallback to json
  db.ref('videos').on('value', async snap => {
    try{
      const val = snap.val();
      if (val) {
        videos = Object.values(val).sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));
        console.log('[videos] RTDB:', videos.length);
        renderList('');
        if (!current && videos[0]) loadVideo(videos[0]);
      } else {
        console.warn('[videos] RTDB empty, fallback JSON');
        await loadFromJson();
      }
    }catch(err){
      console.error('[videos] RTDB handler error', err);
      await loadFromJson();
    }
  });

  // pick by URL ?v=id
  const params = new URLSearchParams(location.search);
  const vidParam = params.get('v');
  if (vidParam) window.__pendingVidId = vidParam;
});

async function loadFromJson(){
  try{
    const seed = await fetch('video-data.json', {cache:'no-store'}).then(r=>r.json());
    videos = seed.map((v,i)=> ({ id: `seed-${i}`, title:v.title, src:v.src, intro:v.intro||null, createdAt:Date.now()-i*1000 }));
    console.log('[videos] JSON:', videos.length);
    renderList('');
    if (!current && videos[0]) loadVideo(videos[0]);
  }catch(e){
    console.error('[videos] loadFromJson failed', e);
    alert('Gagal memuat daftar video. Periksa video-data.json & console.');
  }
}

// render list
function renderList(filter=''){
  listEl.innerHTML = '';
  const data = videos.filter(v => v.title.toLowerCase().includes(filter.toLowerCase()));
  data.forEach(v=>{
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = v.title;
    btn.onclick = ()=> loadVideo(v);
    li.appendChild(btn);
    listEl.appendChild(li);
  });

  if (window.__pendingVidId) {
    const t = videos.find(x=>x.id===window.__pendingVidId);
    if (t) loadVideo(t);
    window.__pendingVidId = null;
  }
}

// load video with optional 30s intro
function loadVideo(v){
  current = v;
  videoTitle.textContent = v.title;
  console.log('[player] load', v);

  if (v.intro) {
    player.src = v.intro;
    player.play().catch(err=>console.warn('[player] intro play err:', err));
    const onEnded = ()=>{
      player.removeEventListener('ended', onEnded);
      player.src = v.src; player.play().catch(err=>console.warn('[player] main play err:', err));
    };
    const guard = setInterval(()=>{
      if (player.currentTime >= 30) { clearInterval(guard); onEnded(); }
    }, 400);
    player.addEventListener('ended', onEnded);
  } else {
    player.src = v.src;
    player.play().catch(err=>console.warn('[player] play err:', err));
  }
  updateReactionsUI(v.id);
}

// update like/dislike counts
async function updateReactionsUI(id){
  const snap = await db.ref(`reactions/${id}`).get();
  const val = snap.val() || {};
  const arr = Object.values(val);
  $('#likeCount').textContent = arr.filter(x=>x==='like').length;
  $('#dislikeCount').textContent = arr.filter(x=>x==='dislike').length;
}

/* ===== Histories (localStorage) ===== */
const LS_WATCH = 'video.watch.v1';
const LS_SEARCH = 'video.search.v1';

function saveWatchHistory(v){
  const arr = JSON.parse(localStorage.getItem(LS_WATCH)||'[]');
  arr.unshift({ id:v.id, title:v.title, t:Date.now() });
  localStorage.setItem(LS_WATCH, JSON.stringify(arr.slice(0,100)));
}
function saveSearchHistory(q){
  const arr = JSON.parse(localStorage.getItem(LS_SEARCH)||'[]');
  if (arr[0]?.q === q) return;
  arr.unshift({ q, t:Date.now() });
  localStorage.setItem(LS_SEARCH, JSON.stringify(arr.slice(0,50)));
}
function renderHistories(){
  const w = JSON.parse(localStorage.getItem(LS_WATCH)||'[]');
  const s = JSON.parse(localStorage.getItem(LS_SEARCH)||'[]');
  watchHistoryEl.innerHTML = w.map(i=>`<li>${new Date(i.t).toLocaleString()} — ${i.title}</li>`).join('') || '<li>Belum ada.</li>';
  searchHistoryEl.innerHTML = s.map(i=>`<li>${new Date(i.t).toLocaleString()} — ${i.q}</li>`).join('') || '<li>Belum ada.</li>';
}
