/* ========== CONFIG ========== */
const ADMIN_EMAIL = 'admin@5g88.local'; // set email admin yang dipakai untuk rules
/* =========================== */

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const db   = firebase.database();
const auth = firebase.auth();
const storage = firebase.storage();

const player = $('#player');
const videoTitle = $('#videoTitle');
const listEl = $('#videoList');
const searchInput = $('#searchInput');
const searchBtn = $('#searchBtn');
const noDataEl = $('#noData');
const historyWrap = $('#historyWrap');
const watchHistoryEl = $('#watchHistory');
const searchHistoryEl = $('#searchHistory');

let videos = [];
let current = null;
let dblCount = 0, dblTimer;

/* ===== I18N ===== */
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
    const k = el.getAttribute('data-i18n'); if(!k||!dict[k]) return;
    const emoji = (el.textContent.trim().match(/^[^\w\s]/)?.[0] || '');
    el.textContent = (emoji ? `${emoji} ` : '') + dict[k];
  });
  const si = document.querySelector('[data-i18n-placeholder="searchPlaceholder"]');
  if (si && dict.searchPlaceholder) si.placeholder = dict.searchPlaceholder;
  $('#shareBtn').textContent = `🔗 ${dict.share}`;
  $('#fsBtn').textContent = `⛶ ${dict.fullscreen}`;
}
const SAVED_LANG = localStorage.getItem('lang') || 'id';
applyLang(SAVED_LANG);

/* ===== UI INIT ===== */
$('#menuBtn').onclick = () => { $('#sidebar').classList.toggle('open'); document.body.classList.toggle('sidebar-open'); };

const langWrap = $('#langSwitch');
$('#langBtn').onclick = () => langWrap.classList.toggle('open');
$$('#langMenu button').forEach(b=>{ b.onclick=()=>{ localStorage.setItem('lang', b.dataset.lang); applyLang(b.dataset.lang); langWrap.classList.remove('open'); }; });

$('#logoutBtn').addEventListener('click', async (e)=>{ e.preventDefault(); try { await auth.signOut(); } catch(e){} window.location.replace('login.html'); });
$('#adminPanelLink').classList.add('hidden'); // default hidden, akan shown jika admin

// Search: klik icon atau Enter
function doSearch(){
  const q = searchInput.value.trim().toLowerCase();
  renderList(q);
  if(q) saveSearchHistory(q);
}
searchBtn.onclick = doSearch;
searchInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doSearch(); }});
searchInput.oninput = () => { if(!searchInput.value) renderList(''); };

// Controls
$$('.controls .btn').forEach(b=>{
  b.onclick = () => {
    const s = parseInt(b.dataset.skip,10)||0;
    player.currentTime = Math.max(0, Math.min(player.duration || 0, player.currentTime + s));
  };
});
player.addEventListener('dblclick', ()=>{ dblCount++; const sec=10*dblCount; player.currentTime=Math.max(0,Math.min(player.duration||0,player.currentTime+sec)); clearTimeout(dblTimer); dblTimer=setTimeout(()=>{dblCount=0;},600); });
$('#fsBtn').onclick = ()=>{ if(!document.fullscreenElement) player.requestFullscreen?.(); else document.exitFullscreen?.(); };
$('#likeBtn').onclick = ()=> setReaction('like');
$('#dislikeBtn').onclick = ()=> setReaction('dislike');

async function setReaction(kind){
  if (!current || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  await db.ref(`reactions/${current.id}/${uid}`).set(kind);
  updateReactionsUI(current.id);
}

$('#shareBtn').onclick = async ()=>{
  const url = location.origin + location.pathname + `?v=${encodeURIComponent(current?.id || '')}`;
  try{ await navigator.share?.({ title: current?.title || 'Video', url }); }
  catch(e){ await navigator.clipboard.writeText(url); alert('Link copied'); }
};

// Upload helpers
function uploadFileTo(path, file, onProgress){
  return new Promise((resolve,reject)=>{
    const ref = storage.ref().child(path);
    const task = ref.put(file);
    task.on('state_changed', s=>{
      onProgress?.(Math.round(100*s.bytesTransferred/s.totalBytes));
    }, reject, async ()=> resolve(await ref.getDownloadURL()));
  });
}
$('#adminAddBtn').onclick = () => $('#addModal').showModal();
$('#m_save').onclick = async (e)=>{
  e.preventDefault();
  const title = $('#m_title').value.trim();
  const urlMain   = $('#m_src').value.trim();
  const urlIntro  = $('#m_intro').value.trim();
  const fileMain  = $('#m_file')?.files?.[0] || null;
  const fileIntro = $('#m_file_intro')?.files?.[0] || null;
  const prog = $('#m_prog');
  if(!title) return alert('Judul wajib diisi');
  if(!urlMain && !fileMain) return alert('Isi URL video atau upload file');

  try{
    prog.style.display='block'; prog.value=0;
    const key = db.ref('videos').push().key;
    let finalMain = urlMain, finalIntro = urlIntro;

    if(fileMain)  finalMain  = await uploadFileTo(`videos/${key}/main_${Date.now()}_${fileMain.name}`, fileMain, p=>prog.value=p);
    if(fileIntro) finalIntro = await uploadFileTo(`videos/${key}/intro_${Date.now()}_${fileIntro.name}`, fileIntro, p=>prog.value=p);

    await db.ref(`videos/${key}`).set({ id:key, title, src:finalMain, intro:finalIntro||null, createdAt:Date.now() });

    prog.style.display='none';
    $('#addModal').close();
    $('#m_title').value = $('#m_src').value = $('#m_intro').value = '';
    if($('#m_file')) $('#m_file').value = '';
    if($('#m_file_intro')) $('#m_file_intro').value = '';
  }catch(err){ console.error(err); alert('Gagal upload/simpan video. Lihat console.'); prog.style.display='none'; }
};

// History save
player.addEventListener('ended', ()=>{ if(current) saveWatchHistory(current); });

/* ===== AUTH STATE ===== */
auth.onAuthStateChanged(async (u)=>{
  if(!u){ location.href='login.html'; return; }

  $('#userBadge').textContent = u.displayName || u.email || 'User';
  $('#username').textContent = `(profile) ${u.displayName || u.email}`;
  $('#userEmail').textContent = u.email || '';
  if (u.photoURL) $('#avatar').style.backgroundImage = `url(${u.photoURL})`;

  // simpan profil user (untuk admin page)
  const prv = u.providerData?.[0] || {};
  await db.ref('users/'+u.uid).update({
    uid: u.uid, email: u.email || null, displayName: u.displayName || null,
    photoURL: u.photoURL || null, providerId: prv.providerId || null, providerUID: prv.uid || null,
    lastLoginAt: Date.now()
  });

  if (u.email === ADMIN_EMAIL) { $('#adminAddBtn').classList.remove('hidden'); $('#adminPanelLink').classList.remove('hidden'); }

  // Load videos → fallback JSON
  db.ref('videos').on('value', async snap=>{
    try{
      const val = snap.val();
      if (val) {
        videos = Object.values(val).sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));
        renderList('');
        if (!current && videos[0]) loadVideo(videos[0]);
      } else {
        await loadFromJson();
      }
    }catch(e){ console.error(e); await loadFromJson(); }
  });

  // click profile → My Account
  $('#profileCard').onclick = ()=>{
    const html = `
      <li><b>UID</b>: ${u.uid}</li>
      <li><b>Email</b>: ${u.email || '-'}</li>
      <li><b>Display Name</b>: ${u.displayName || '-'}</li>
      <li><b>Provider</b>: ${(prv.providerId || '-')}</li>
      <li><b>Provider UID</b>: ${(prv.uid || '-')}</li>
      <li><b>Photo</b>: ${u.photoURL ? `<a href="${u.photoURL}" target="_blank">Open</a>` : '-'}</li>
      <li><b>Login Time</b>: ${new Date().toLocaleString()}</li>`;
    $('#accInfo').innerHTML = html;
    $('#accModal').showModal();
  };

  // URL ?v=… deep link
  const idParam = new URLSearchParams(location.search).get('v');
  if (idParam) window.__pendingVidId = idParam;
});

async function loadFromJson(){
  const seed = await fetch('video-data.json', {cache:'no-store'}).then(r=>r.json()).catch(()=>[]);
  videos = seed.map((v,i)=>({id:`seed-${i}`, title:v.title, src:v.src, intro:v.intro||null, createdAt:Date.now()-i*1000}));
  renderList('');
  if(!current && videos[0]) loadVideo(videos[0]);
}

/* ===== LIST / SEARCH / NO DATA ===== */
function renderList(filter=''){
  listEl.innerHTML = '';
  const data = videos.filter(v=> v.title.toLowerCase().includes(filter.toLowerCase()));
  if (data.length === 0) {
    noDataEl.classList.remove('hidden');
  } else {
    noDataEl.classList.add('hidden');
  }
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

function loadVideo(v){
  current = v;
  videoTitle.textContent = v.title;
  if (v.intro) {
    player.src = v.intro;
    player.play().catch(()=>{});
    const onEnded = ()=>{ player.removeEventListener('ended', onEnded); player.src = v.src; player.play().catch(()=>{}); };
    const guard = setInterval(()=>{ if(player.currentTime>=30){ clearInterval(guard); onEnded(); } }, 400);
    player.addEventListener('ended', onEnded);
  } else {
    player.src = v.src; player.play().catch(()=>{});
  }
  updateReactionsUI(v.id);
}

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

  // watch history → klik membuka video
  watchHistoryEl.innerHTML = (w.length? '' : '<li>No data</li>') + w.map(i=>{
    const url = `index.html?v=${encodeURIComponent(i.id)}`;
    return `<li><a href="${url}" class="hist-link" data-id="${i.id}">${new Date(i.t).toLocaleString()} — ${i.title}</a></li>`;
  }).join('');

  // search history (hanya tampilan)
  searchHistoryEl.innerHTML = (s.length? '' : '<li>No data</li>') + s.map(i=>{
    return `<li>${new Date(i.t).toLocaleString()} — ${i.q}</li>`;
  }).join('');

  // jika sedang di index, intercept klik agar tidak reload
  watchHistoryEl.querySelectorAll('.hist-link').forEach(a=>{
    a.onclick = (e)=>{
      e.preventDefault();
      const id = a.dataset.id;
      const v = videos.find(x=>x.id===id);
      if (v) loadVideo(v);
      else location.href = a.getAttribute('href'); // fallback
    };
  });
}
