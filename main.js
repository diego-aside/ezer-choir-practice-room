import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { MP } from './multiplayer.js'; // Phase 3 멀티플레이 (Realtime). 설정이 비어 있으면 no-op.

const $ = (s) => document.querySelector(s);
const cache = {};
const q = (s) => (cache[s] ??= $(s));

/* =====================================================================
   편집용 데이터 — 내용을 바꿀 때는 이 구간(과 playlist.json)만 고치면 됩니다.
   ===================================================================== */

// 성가대 파트 7개. spawn은 입장 시 자리(x, z).
const parts = {
  conductor: { name: '지휘자', icon: '🎼', color: 0x7d6b9c, spawn: [-1.2, -3.4] },
  accompanist: { name: '반주자', icon: '🎹', color: 0x809981, spawn: [-6.7, -0.8] },
  orchestra: { name: '앙상블', icon: '🎻', color: 0x3f8088, spawn: [6.4, -1.0] },
  soprano: { name: '소프라노', icon: '🎤', color: 0xd0899a, spawn: [-3.9, 0.2] },
  alto: { name: '알토', icon: '🎵', color: 0xc6ab63, spawn: [-1.6, 0.2] },
  tenor: { name: '테너', icon: '🎶', color: 0x829eb5, spawn: [1.6, 0.2] },
  bass: { name: '베이스', icon: '🎙️', color: 0x8b6a55, spawn: [3.9, 0.2] },
};
// 올해 앙상블 악기는 3가지뿐.
const instruments = {
  flute: { name: '플룻', icon: '🎶' },
  clarinet: { name: '클라리넷', icon: '🎵' },
  violin: { name: '바이올린', icon: '🎻' },
};
const BIBLE_NAMES = ['다윗', '미리암', '요한', '에스더', '한나', '사무엘', '루디아', '모세', '룻', '바울', '디모데', '마리아', '베드로', '다니엘', '요셉', '사라', '드보라', '엘리야', '나오미', '브리스길라'];

// 오늘의 찬양: 랜덤 찬송가 (yeram.org, 찬양대 헌금송 일정 기준 7곡).
// audio는 yeram.org 상세 페이지의 첫 번째 음원(스테레오 44.1kHz), sheet는 악보 GIF(og:image).
// sid는 재조회해도 같은 값으로 확인됨(2026-11-11).
const HYMNS = [
  { number: 428, skip: 6.0, title: '내 영혼에 햇빛 비치니', audio: 'https://yeram.org/?module=file&act=procFileDownload&file_srl=329564&sid=c0b447de2e75c58599939caae361a404&module_srl=117981', sheet: 'https://yeram.org/files/attach/images/117981/428/118/5b57f6af1285b45bc3c0ce0c83b71941.gif' },
  { number: 449, skip: 4.5, title: '예수 따라가며', audio: 'https://yeram.org/?module=file&act=procFileDownload&file_srl=329585&sid=035d3cf423941f1f7cfee59c180a9938&module_srl=117981', sheet: 'https://yeram.org/files/attach/images/117981/449/118/bced88ebfb8f5ef1ed3e92e69465c42c.gif' },
  { number: 314, skip: 6.7, title: '내 구주 예수를 더욱 사랑', audio: 'https://yeram.org/?module=file&act=procFileDownload&file_srl=329450&sid=bf61c18a802a7ed9db7ad61ad745d9c7&module_srl=117981', sheet: 'https://huam.yeram.org/files/attach/images/117981/314/118/040730346ef641f2b1a240ae329919db.gif' },
  { number: 50, skip: 5.1, title: '내게 있는 모든 것을', audio: 'https://yeram.org/?module=file&act=procFileDownload&file_srl=329186&sid=5c69dae9477fd30a61b2b82f2ad083c9&module_srl=117981', sheet: 'https://yeram.org/files/attach/images/117981/050/118/0bb49b90c4d760ea21ef2a1525ae19a8.gif' },
  { number: 38, skip: 5.0, title: '예수 우리 왕이여', audio: 'https://yeram.org/?module=file&act=procFileDownload&file_srl=329174&sid=1f68350f8a4db1bf84417af3304d44c2&module_srl=117981', sheet: 'https://yeram.org/files/attach/images/117981/038/118/a16c11f9a4a2eca55eee786b0b09f787.gif' },
  { number: 310, skip: 4.9, title: '아 하나님의 은혜로', audio: 'https://yeram.org/?module=file&act=procFileDownload&file_srl=329446&sid=1c9c3f57edd6bcbd477b7135b01cab8f&module_srl=117981', sheet: 'https://yeram.org/files/attach/images/117981/310/118/9b8fb65fe7f369bb4059c8dc3fac4926.gif' },
  { number: 384, skip: 5.4, title: '나의 갈 길 다 가도록', audio: 'https://yeram.org/?module=file&act=procFileDownload&file_srl=329520&sid=2da25d037db981b24216a2b512083384&module_srl=117981', sheet: 'https://yeram.org/files/attach/images/117981/384/118/5a9c70f8d858a6186d573c0d0248ad58.gif' },
];
let currentHymn = null;
function pickRandomHymn() {
  let h;
  do { h = HYMNS[Math.floor(Math.random() * HYMNS.length)]; } while (HYMNS.length > 1 && h === currentHymn);
  loadHymn(h);
}
function loadHymn(h) { // 오늘의 찬양 다이얼로그와 지휘 찬양이 같은 #hymn-audio를 쓴다
  currentHymn = h;
  $('#hymn-number').textContent = `${h.number}장`;
  $('#hymn-title').textContent = h.title;
  const audio = $('#hymn-audio');
  audio.src = h.audio + '#t=' + h.skip; // 앞부분 멘트(장·제목 안내) 건너뛰고 바로 찬송가부터
  audio.addEventListener('loadedmetadata', () => { if (audio.currentTime < h.skip) audio.currentTime = h.skip; }, { once: true });
  audio.load();
}
function openHymnSheet() {
  if (!currentHymn) return;
  $('#sheet-title').textContent = `${currentHymn.number}장 ${currentHymn.title}`;
  $('#sheet-content').replaceChildren();
  const img = document.createElement('img'); img.src = currentHymn.sheet; img.alt = `${currentHymn.title} 악보`;
  img.onerror = () => $('#sheet-content').textContent = '악보를 불러오지 못했어요. 파일 경로를 확인해 주세요.';
  $('#sheet-content').append(img); openDialog('#sheet');
}

// 공과: lessons/lessons.json에서 show_from이 지났고 가장 최근인 항목을 골라 5단계를 만든다 (코드 변경 없이 매주 전환).
let lessonList = [];
async function loadLessons() {
  try { const r = await fetch('lessons/lessons.json'); const d = await r.json(); lessonList = Array.isArray(d.lessons) ? d.lessons : []; } catch { lessonList = []; }
}
function currentLesson() {
  const now = Date.now(); let best = null, bestT = -Infinity;
  for (const l of lessonList) { const t = Date.parse(l && l.show_from); if (!Number.isNaN(t) && t <= now && t > bestT) { best = l; bestT = t; } }
  return best;
}
function numbered(qs) { return (qs || []).map((q, k) => `Q${k + 1}. ${q}`).join('\n\n'); }
function buildLessonSteps(l) {
  if (!l) return [];
  const sc = l.scripture ? `본문: ${l.scripture}${l.scripture_full ? ` · ${l.scripture_full}` : ''}` : '';
  return [
    { title: '공과 안내', body: [`${l.date || ''} · ${l.lesson_no || ''} ${l.title || ''}`.trim(), sc, l.goal ? `목표: ${l.goal}` : ''].filter(Boolean).join('\n\n') },
    { title: (l.story && l.story.heading) || 'Story', body: (l.story && l.story.question) || '' },
    { title: (l.bible && l.bible.heading) || 'Bible', body: numbered(l.bible && l.bible.questions) },
    { title: '말씀정리', img: l.summary_image || '' },
    { title: (l.act && l.act.heading) || 'Act', body: numbered(l.act && l.act.questions) },
  ];
}
let LESSON_STEPS = [];
const LESSON_EMPTY = '아직 본문 원고가 등록되지 않았어요. 원고가 준비되면 이 자리에 나타나요.';
function refreshLesson() { const l = currentLesson(); LESSON_STEPS = buildLessonSteps(l); state.lessonMeta = l; if (state.lessonStep >= LESSON_STEPS.length) state.lessonStep = 0; }

// 보물찾기: 숨겨진 황금 음표 5개의 위치 [x, y, z]
const TREASURE_NOTES = [
  [-8.4, 0.7, -7.2], // 왼쪽 식물 뒤
  [5.3, 0.55, -7.4], // 오른쪽 스피커 옆
  [-5.1, 1.05, 5.0], // 찬양대석 맨 위 모서리
  [-9.2, 2.0, 1.0], // 왼쪽 창가
  [-8.5, 0.7, 4.8], // 왼쪽 아래 식물 곁
];

// 말씀 채팅용 성경 구절(개역한글). 본문은 사용 전 교회에서 쓰는 역본으로 확인·교체해 주세요.
const VERSES = [
  { ref: '시 23:1', text: '여호와는 나의 목자시니 내가 부족함이 없으리로다' },
  { ref: '시 100:1', text: '온 땅이여 여호와께 즐거이 부를지어다' },
  { ref: '시 121:1', text: '내가 산을 향하여 눈을 들리라 나의 도움이 어디서 올고' },
  { ref: '시 150:6', text: '호흡이 있는 자마다 여호와를 찬양할지어다 할렐루야' },
  { ref: '잠 3:5', text: '너는 마음을 다하여 여호와를 신뢰하고 네 명철을 의지하지 말라' },
  { ref: '사 41:10', text: '두려워하지 말라 내가 너와 함께 함이라 놀라지 말라 나는 네 하나님이 됨이라 내가 너를 굳세게 하리라 참으로 너를 도와 주리라' },
  { ref: '마 11:28', text: '수고하고 무거운 짐진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라' },
  { ref: '요 3:16', text: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라' },
  { ref: '롬 8:28', text: '우리가 알거니와 하나님을 사랑하는 자 곧 그의 뜻대로 부르심을 입은 자들에게는 모든 것이 합력하여 선을 이루느니라' },
  { ref: '빌 4:13', text: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라' },
  { ref: '골 3:16', text: '그리스도의 말씀이 너희 속에 풍성히 거하여 모든 지혜로 서로 가르치며 권면하고 시와 찬미와 신령한 노래를 부르고 마음에 감사함으로 하나님께 찬양하고' },
  { ref: '살전 5:16', text: '항상 기뻐하라' },
];

// 스탠딩 칠판: 일요일 낮 12시(KST)를 기점으로 다음 항목으로 넘어갑니다. date는 해당 일요일.
// main = 본송, offering = 헌금송. null이면 없음.
const SCHEDULE = [
  { date: '2026-11-15', main: null, offering: null },
  { date: '2026-11-22', main: '온 맘 다해', offering: '310장 아 하나님의 은혜로' },
  { date: '2026-11-29', main: '요게벳의 노래', offering: '384장 나의 갈 길 다 가도록' },
  { date: '2026-12-06', main: '주님이 일하십니다', offering: null },
  { date: '2026-12-13', main: '변치 않는 주님의 사랑과', offering: null },
];

// 게임 규칙 상수
const PRAY_COFFEE_SEC = 180; // 이 시간 이상 기도해야 커피 권한
const PRAY_SKY_SEC = 30; // 이 시간 이상 기도하면 하늘로 손을 뻗는 자세
const MAX_SIPS = 5;
const VERSE_MAX = 36; // 머리 위 말풍선 최대 글자 수
const DETECT_RADIUS = 2.0; // 위장한 사람이 교사 NPC에게 들키는 거리
const MASK_COOLDOWN_MS = 15000;
const TABLE_SLOTS = 6;

// 공간 좌표
const DOOR = { x: 10, z: -4 };
const COFFEE = { x: 17.3, z: -3.9 };
const TABLE = { x: 13.4, z: -2.4 };
const TRASH = { x: 16.9, z: -1.5 };
const NPC_Z = -6.2;
const TV = { x: 0, y: 3.2, z: -8.1, w: 6.4 };
// 찬양대석: 10명씩 3줄 계단식(앞줄 낮고 뒷줄 높음)
const ENSEMBLE_SEATS = 6, ENSEMBLE_Z = -.3; // 앙상블 의자 한 줄
const TIERS = [{ z0: 0.85, z1: 2.35, y: 0.2 }, { z0: 2.35, z1: 3.85, y: 0.4 }, { z0: 3.85, z1: 5.35, y: 0.6 }];
const TIER_HALF_W = 5.7;

/* ===================================================================== */

const state = {
  entered: false, seated: null, target: null, queue: [], dest: null,
  emote: '', emoteEnd: 0, yaw: 0.28, pitch: 0.57, distance: 12.8, dragging: false,
  profile: null, disguised: false, maskBlockedUntil: 0, doorOpen: 0, tvFocus: false,
  prayStart: 0, coffeeRight: false, held: null, sips: 0, sipEnd: 0, panicEnd: 0, brewing: false,
  playing: false, conducting: false, conductWait: 0, praise: null,pianoUnlocked: false, stuck: false, notes: new Set(), lessonStep: 0, doorWarnAt: 0,
};
let renderer, cssRenderer, camera, scene, cssScene, avatar, torso, leftArm, rightArm, head, marker, screenObject, floor;
let me, npc, doorPivot, machineLed, board, boardTex;
let prayers = [], sheetVerses = [], prayerTimer, lastPrayer = -1;
let toastTimer, verseTimer, npcTimer, activePointer = null, pointerStart = null, lastPointer = null;
let instrumentObj = null, bowObj = null, heldCup = null, draw = null;
const cameraWalls = [], cameraProbe = new THREE.Raycaster();
const chairs = [], colliders = [], floors = [], noteHits = [], tableCups = [], keys = new Set(), joystick = new THREE.Vector2();
const clock = new THREE.Clock(), raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const mats = {};

/* ---------- 유틸 ---------- */
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const dist = (p) => Math.hypot(avatar.position.x - p.x, avatar.position.z - p.z);
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 3500); }
function openDialog(id) { if (!$(id).open) $(id).showModal(); keys.clear(); joystick.set(0, 0); }
function modalOpen() { return Boolean(document.querySelector('dialog[open]')); }
function setShown(sel, on) { const e = q(sel); if (e.hidden === on) e.hidden = !on; }
function setText(sel, text) { const e = q(sel); if (e.textContent !== text) e.textContent = text; }
function fmtTime(sec) { sec = Math.floor(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }

/* ---------- 컴퓨터 / 휴대폰 버전 ---------- */
function detectDevice() {
  const force = new URLSearchParams(location.search).get('device');
  if (force === 'mobile' || force === 'desktop') return force;
  const ua = navigator.userAgent || '';
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS
  if (navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touchMac) return 'mobile';
  return matchMedia('(pointer:coarse)').matches && innerWidth < 1024 ? 'mobile' : 'desktop';
}
function isMobile() { return document.body.dataset.device === 'mobile'; }
function applyDevice() {
  const device = detectDevice();
  if (document.body.dataset.device !== device) {
    document.body.dataset.device = device;
    $('#remote').classList.toggle('collapsed', device === 'mobile'); // 휴대폰은 상단 배너를 접은 채 시작
    $('#remote-toggle').setAttribute('aria-expanded', String(device !== 'mobile'));
  }
}

/* ---------- 3D 도우미 ---------- */
function material(color, roughness = .8) { return new THREE.MeshStandardMaterial({ color, roughness }); }
function box(w, h, d, color, x, y, z, parent = scene) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? material(color) : color); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
function cylinder(r1, r2, h, color, x, y, z, parent = scene) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 24), typeof color === 'number' ? material(color) : color); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
function sphere(r, color, x, y, z, parent = scene) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), typeof color === 'number' ? material(color) : color); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
function rod(a, b, r, color, parent = scene) { const dir = new THREE.Vector3().subVectors(b, a); const m = cylinder(r, r, dir.length(), color, 0, 0, 0, parent); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); return m; }
function sign(text, w, h, x, y, z, size = 48, color = '#ebe8d6', bg = '#536149', parent = scene) { const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w); const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `500 ${size}px sans-serif`; ctx.fillText(text, 512, c.height / 2, 970); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })); m.position.set(x, y, z); parent.add(m); return m; }
function obstacle(x, z, w, d) { colliders.push({ x, z, w: w / 2 + .28, d: d / 2 + .28 }); }
const PODIUM = { x: 1.1, z: -3.7, h: .25, half: .6 }, CONDUCT_RANGE = 1.2;
function onPodium(x, z) { return Math.abs(x - PODIUM.x) < PODIUM.half && Math.abs(z - PODIUM.z) < PODIUM.half; }
function buildConductorPodium() { // 지휘자 석: 낮은 단상 + 작은 지휘용 보면대 + 바닥 링 + 표지판. 단상은 장애물(걸어서 통과 불가), 위에 서는 건 groundY가 처리
  const { x, z, h, half } = PODIUM, g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.15, 48), new THREE.MeshBasicMaterial({ color: 0xd8b24a, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = .012; g.add(ring);
  box(half * 2, h, half * 2, 0x7d6b9c, 0, h / 2, 0, g); box(half * 2 + .06, .03, half * 2 + .06, 0x5e4f78, 0, h + .015, 0, g);
  const stand = musicStand(0, 0, Math.PI); stand.removeFromParent(); stand.position.set(0, h, half - .15); stand.scale.setScalar(.55); g.add(stand); // 악보면이 지휘자(-z쪽)를 향하도록 180° 회전
  sign('🎼 지휘자 석', 1.1, .26, 0, .02, .8, 60, '#f0edda', '#5e4f78', g).rotation.x = -Math.PI / 2;
  obstacle(x, z, half * 2, half * 2);
}
function groundY(x, z) { if (onPodium(x, z)) return PODIUM.h; if (Math.abs(x) < TIER_HALF_W) for (const t of TIERS) if (z >= t.z0 && z < t.z1) return t.y; return 0; }

/* ---------- 그랜드 피아노 · 벤치 · 연주 ---------- */
const PIANO = { x: -6.7, z: -2.2, rot: .24 }, BENCH_SEAT = 99, WHITE_KEYS = 21, KEY_W = .115, KEY_X0 = -(WHITE_KEYS - 1) * KEY_W / 2, KEY_BASE_MIDI = 48; // 흰 건반 21개 = C3~B5
const BENCH = { x: PIANO.x + Math.sin(PIANO.rot) * .95, y: 0, z: PIANO.z + Math.cos(PIANO.rot) * .95, rotation: PIANO.rot + Math.PI, bench: true }; // 피아노(-z)를 바라보고 앉는다
const kbDown = new Set(), pianoKeys = [], keyHeld = new Map(), pointerKeys = new Map(); // keyHeld: midi -> 누르는 입력 수(건반·키보드), pointerKeys: pointerId -> midi
const KEYBOARD_MAP = { KeyA: 60, KeyW: 61, KeyS: 62, KeyE: 63, KeyD: 64, KeyF: 65, KeyT: 66, KeyG: 67, KeyY: 68, KeyH: 69, KeyU: 70, KeyJ: 71, KeyK: 72 }; // C4~C5
const LOCK_MSG = '🎹 지휘자가 1분간 지휘해야 피아노에서 일어날 수 있어요', UNLOCK_MSG = '🎹 지휘 1분 완료 — 반주자가 피아노에서 일어날 수 있어요', CONDUCT_UNLOCK_MS = 60000;
const condSince = new Map(); // 지휘 중인 사람(id) -> 연속 지휘 시작 시각. 지휘 시작/종료 신호(MP.sendConduct)로 각 클라이언트가 각자 잰다
function pianoOutline(shape) { // 날개 모양 윤곽: x=좌우(오른쪽=고음쪽 곡선), y=앞(건반)에서 뒤(꼬리)까지 거리
  shape.moveTo(-1.3, 0); shape.lineTo(1.3, 0); shape.lineTo(1.3, .7);
  shape.bezierCurveTo(1.3, 1.5, .9, 2.2, .1, 2.5); shape.quadraticCurveTo(-.7, 2.65, -1.3, 2.2); shape.lineTo(-1.3, 0);
}
function buildGrandPiano() {
  const g = new THREE.Group(); g.position.set(PIANO.x, 0, PIANO.z); g.rotation.y = PIANO.rot; scene.add(g);
  const black = material(0x1b1c1e, .35), blackTop = material(0x2a2b2e, .25);
  const outline = new THREE.Shape(); pianoOutline(outline);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: .38, bevelEnabled: false }), black); body.rotation.x = -Math.PI / 2; body.position.y = .55; body.castShadow = body.receiveShadow = true; g.add(body); // 날개 모양 몸통
  const inner = new THREE.Mesh(new THREE.ShapeGeometry(outline), material(0x2c2118, .6)); inner.rotation.x = -Math.PI / 2; inner.position.y = .935; g.add(inner); // 열린 윗면(현 쪽)
  const lidGroup = new THREE.Group(); lidGroup.position.set(-1.3, .97, 0); lidGroup.rotation.z = .5; g.add(lidGroup); // 열린 리드: 왼쪽(긴 변)을 경첩으로 비스듬히 열림
  const lid = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: .05, bevelEnabled: false }), blackTop); lid.rotation.x = -Math.PI / 2; lid.position.x = 1.3; lid.castShadow = true; lidGroup.add(lid);
  box(.06, 1.0, .06, 0x2a2420, .5, 1.47, -1.0, g); // 리드 받침대
  box(2.6, .12, .5, 0x1b1c1e, 0, .75, .25, g); // 건반 받침
  box(.1, .3, .5, 0x1b1c1e, -1.25, .95, .25, g); box(.1, .3, .5, 0x1b1c1e, 1.25, .95, .25, g); // 건반 양옆 판
  const stand = box(1.2, .55, .04, 0x2a2420, 0, 1.2, -.1, g); stand.rotation.x = -.35; box(1.2, .05, .1, 0x2a2420, 0, .98, -.02, g); // 악보대
  for (const [x, z] of [[-1.15, -.15], [1.15, -.15], [.1, -2.0]]) { cylinder(.1, .06, .55, 0x1b1c1e, x, .28, z, g); sphere(.07, 0xb09040, x, .05, z, g); } // 다리 3개
  box(.08, .45, .08, 0x1b1c1e, 0, .35, .12, g); for (const x of [-.1, 0, .1]) box(.08, .03, .3, 0xb09040, x, .05, .3, g); // 페달
  const addKey = (midi, isBlack, x) => { // 건반마다 뒤쪽을 축으로 한 피벗 → 눌리면 앞이 내려간다
    const pivot = new THREE.Group(); pivot.position.set(x, isBlack ? .9 : .87, .06); g.add(pivot);
    const len = isBlack ? .3 : .44, mesh = new THREE.Mesh(new THREE.BoxGeometry(isBlack ? .066 : .108, isBlack ? .07 : .05, len), material(isBlack ? 0x202124 : 0xf4efde, .5)); mesh.position.z = len / 2; mesh.castShadow = true; pivot.add(mesh);
    mesh.userData.key = { midi, pivot, isBlack }; pianoKeys.push(mesh);
  };
  const WHITE_SEMI = [0, 2, 4, 5, 7, 9, 11];
  for (let i = 0; i < WHITE_KEYS; i++) {
    const midi = KEY_BASE_MIDI + Math.floor(i / 7) * 12 + WHITE_SEMI[i % 7], x = KEY_X0 + i * KEY_W;
    addKey(midi, false, x);
    if (![2, 6].includes(i % 7) && i < WHITE_KEYS - 1) addKey(midi + 1, true, x + KEY_W / 2);
  }
  obstacle(-6.8, -3.2, 2.8, 2.4); // 몸통 + 건반(회전 .24 고려한 축 정렬 영역)
  const b = new THREE.Group(); b.position.set(BENCH.x, 0, BENCH.z); b.rotation.y = PIANO.rot; scene.add(b); // 피아노 벤치
  box(1.1, .12, .46, 0x2a2420, 0, .66, 0, b); box(1.14, .05, .5, 0x6b3b3b, 0, .74, 0, b);
  for (const a of [-.48, .48]) for (const c of [-.18, .18]) box(.06, .6, .06, 0x1b1c1e, a, .3, c, b);
}
let audioCtx = null, masterGain = null;
const voices = new Map(); // midi -> { gain, oscs }
function ensureAudio() {
  if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; audioCtx = new AC(); masterGain = audioCtx.createGain(); masterGain.gain.value = .5; const comp = audioCtx.createDynamicsCompressor(); masterGain.connect(comp); comp.connect(audioCtx.destination); }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
function noteOn(midi) { // 오실레이터 배음 합성 + 피아노식 엔벨로프(빠른 어택·점점 줄어드는 감쇠). 로컬 전용(멀티플레이 동기화 없음)
  const ctx = ensureAudio(); if (!ctx) return; noteOff(midi, true);
  const f = 440 * 2 ** ((midi - 69) / 12), t0 = ctx.currentTime, gain = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(9000, f * 9), t0); lp.frequency.exponentialRampToValueAtTime(Math.max(800, f * 2.5), t0 + 1.2);
  gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(.55, t0 + .006); gain.gain.exponentialRampToValueAtTime(.18, t0 + .25); gain.gain.exponentialRampToValueAtTime(.0008, t0 + 3.2);
  gain.connect(lp); lp.connect(masterGain);
  const oscs = [[1, 'triangle', 1], [2, 'sine', .35], [3, 'sine', .15], [4, 'sine', .07]].map(([mul, type, amp]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = f * mul; o.detune.value = (Math.random() - .5) * 4; og.gain.value = amp; o.connect(og); og.connect(gain); o.start(t0); o.stop(t0 + 3.3); return o; });
  voices.set(midi, { gain, oscs });
}
function noteOff(midi, instant = false) { // 건반을 떼면 짧게 댐핑
  const v = voices.get(midi); if (!v || !audioCtx) return; voices.delete(midi);
  const t = audioCtx.currentTime; v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, .0008), t); v.gain.gain.exponentialRampToValueAtTime(.0008, t + (instant ? .03 : .22));
  for (const o of v.oscs) { try { o.stop(t + (instant ? .05 : .25)); } catch { /* 이미 정지 */ } }
}
function keyVisual(midi, down) { const k = pianoKeys.find((m) => m.userData.key.midi === midi); if (k) k.userData.key.pivot.rotation.x = down ? .05 : 0; }
function pressKey(midi) { const n = (keyHeld.get(midi) || 0) + 1; keyHeld.set(midi, n); if (n === 1) { noteOn(midi); keyVisual(midi, true); } }
function releaseKey(midi) { const n = (keyHeld.get(midi) || 0) - 1; if (n > 0) { keyHeld.set(midi, n); return; } if (!keyHeld.has(midi)) return; keyHeld.delete(midi); noteOff(midi); keyVisual(midi, false); }
function releaseAllKeys() { for (const midi of [...keyHeld.keys()]) { keyHeld.delete(midi); noteOff(midi); keyVisual(midi, false); } pointerKeys.clear(); kbDown.clear(); }
function pianoPlayable() { return state.seated === BENCH; }
// 모바일 터치 피아노 오버레이: 건반 DOM은 처음 열 때 한 번만 만든다. 포인터는 이 다이얼로그 안에서만 처리(modal이라 캔버스로 안 간다).
function buildTouchPiano() {
  const board = $('#pk-board'); if (board.childElementCount) return;
  const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], WHITE_SEMI = [0, 2, 4, 5, 7, 9, 11], held = new Map(); // held: pointerId -> midi
  const down = (e) => { if (held.has(e.pointerId)) return; const m = Number(e.currentTarget.dataset.midi); held.set(e.pointerId, m); e.currentTarget.classList.add('down'); pressKey(m); };
  const up = (e) => { if (!held.has(e.pointerId)) return; const m = held.get(e.pointerId); held.delete(e.pointerId); e.currentTarget.classList.remove('down'); releaseKey(m); };
  const bind = (el, midi) => { el.dataset.midi = midi; el.addEventListener('pointerdown', down); for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, up); el.addEventListener('contextmenu', (e) => e.preventDefault()); board.appendChild(el); };
  for (let i = 0; i < WHITE_KEYS; i++) {
    const w = document.createElement('div'); w.className = 'pk-white'; w.style.left = `${i / WHITE_KEYS * 100}%`; w.style.width = `${100 / WHITE_KEYS}%`;
    const label = document.createElement('span'); label.textContent = NAMES[i % 7] + (i % 7 === 0 ? 3 + Math.floor(i / 7) : ''); w.appendChild(label);
    bind(w, KEY_BASE_MIDI + Math.floor(i / 7) * 12 + WHITE_SEMI[i % 7]);
  }
  for (let i = 0; i < WHITE_KEYS - 1; i++) {
    if ([2, 6].includes(i % 7)) continue;
    const b = document.createElement('div'), bw = 100 / WHITE_KEYS * .6; b.className = 'pk-black'; b.style.width = `${bw}%`; b.style.left = `${(i + 1) / WHITE_KEYS * 100 - bw / 2}%`;
    bind(b, KEY_BASE_MIDI + Math.floor(i / 7) * 12 + WHITE_SEMI[i % 7] + 1);
  }
}
function openTouchPiano() { if (!pianoPlayable()) return; ensureAudio(); buildTouchPiano(); openDialog('#piano-keys'); }
function pianoKeyAt(e) { // 화면 좌표 → 건반 레이캐스트(검은 건반이 위에 있어 먼저 걸린다)
  pointer.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pianoKeys, false)[0]; return hit ? hit.object.userData.key : null;
}
function benchLocked() { return state.seated === BENCH && state.profile?.part === 'accompanist' && !state.pianoUnlocked; }
function seatLocked() { if (!benchLocked()) return false; toast(LOCK_MSG); return true; }
function dropSeat() { if (state.seated === BENCH) { MP.releaseSeat(); releaseAllKeys(); if ($('#piano-keys').open) $('#piano-keys').close(); } state.seated = null; }
function sitBench() {
  state.seated = BENCH; MP.claimSeat(BENCH_SEAT); state.target = null; state.queue = []; stopPlaying(); state.pianoUnlocked = false;
  const now = performance.now(); for (const id of condSince.keys()) condSince.set(id, now); // 앉은 뒤부터 60초 연속 지휘해야 풀린다
  avatar.position.set(BENCH.x, BENCH.y, BENCH.z); avatar.rotation.y = BENCH.rotation; ensureAudio();
  toast(state.profile.part === 'accompanist' ? '🎹 피아노 앞에 앉았어요. 건반을 눌러 연주해 보세요.' : isMobile() ? '🎹 피아노 벤치에 앉았어요. 건반을 눌러 연주해 보세요.' : '🎹 피아노 벤치에 앉았어요. 건반을 눌러(또는 A W S E D F T G Y H U J K) 연주해 보세요.');
}
// 지휘 신호(MP onRemoteConduct): 'start'(타이머 재시작 + 자기 자리로 모이기) · 'stop' · 'hymn:번호'(헌금송 또는 찬양이 없는 주의 랜덤 찬송가 공유)
function conductSignal(id, kind) {
  kind = String(kind);
  if (kind.startsWith('hymn:')) { if (id !== 'me') playPraiseHymn(Number(kind.slice(5)), id); return; }
  if (kind === 'start') { condSince.set(id, performance.now()); if (id !== 'me') gatherToSeat(); } // 시작은 언제나 타이머 재시작(중간에 끊겼다면 처음부터)
  else { condSince.delete(id); if (id === praiseFrom) stopHymnAudio(); }
}
function updateBenchLock(now) {
  if (state.seated === BENCH && !MP.hasSeat()) { state.seated = null; releaseAllKeys(); toast('같은 자리를 먼저 차지한 사람이 있어요.'); } // 자리 경합에서 졌을 때
  state.stuck = benchLocked();
  if (!state.stuck) return;
  for (const t of condSince.values()) if (now - t >= CONDUCT_UNLOCK_MS) { state.pianoUnlocked = true; state.stuck = false; toast(UNLOCK_MSG); return; }
}

function chair(x, z, rotation, y = 0, kind = 'choir') { // kind: 'choir'(합창석) | 'ensemble'(앙상블 의자)
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotation; scene.add(g);
  box(.86, .13, .82, 0x919a78, 0, .65, 0, g); box(.87, .62, .11, 0x919a78, 0, 1.01, -.36, g);
  for (const a of [-.33, .33]) for (const b of [-.29, .29]) box(.055, .61, .055, 0x575a46, a, .31, b, g);
  chairs.push({ group: g, x, y, z, rotation, kind });
}
function plant(x, z) {
  cylinder(.37, .27, .65, 0xd5c7ad, x, .33, z);
  for (let i = 0; i < 10; i++) { const a = i * 2.4; const y = .8 + (i % 4) * .24; rod(new THREE.Vector3(x, .5, z), new THREE.Vector3(x + Math.sin(a) * .5, y, z + Math.cos(a) * .5), .018, 0x526347); const leaf = sphere(.23, 0x6f8051, x + Math.sin(a) * .5, y, z + Math.cos(a) * .5); leaf.scale.set(.65, 1.7, .7); leaf.rotation.z = a; }
  obstacle(x, z, .6, .6);
}
function microphone(x, z) { cylinder(.22, .22, .045, 0x3f453d, x, .04, z); cylinder(.027, .027, 1.6, 0x444a43, x, .83, z); rod(new THREE.Vector3(x, 1.6, z), new THREE.Vector3(x + .4, 1.8, z), .023, 0x454a42); const mic = cylinder(.065, .065, .28, 0x252c28, x + .44, 1.82, z); mic.rotation.z = -Math.PI / 2; }
function musicStand(x, z, rotY = 0) {
  const stand = new THREE.Group(); stand.position.set(x, 0, z); stand.rotation.y = rotY; scene.add(stand);
  cylinder(.025, .025, 1.3, 0x475143, 0, .65, 0, stand);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; rod(new THREE.Vector3(0, .2, 0), new THREE.Vector3(Math.sin(a) * .4, .025, Math.cos(a) * .4), .023, 0x475143, stand); }
  const panel = box(.95, .63, .055, 0x49533f, 0, 1.52, 0, stand); panel.rotation.x = -.25; box(.7, .46, .01, 0xf0edda, 0, 1.53, .105, stand).rotation.x = -.25;
  return stand;
}
function speaker(x) {
  box(.95, 2.3, .6, 0x2f352d, x, 1.15, -7.75);
  for (const [y, r] of [[.65, .26], [1.6, .17]]) { const c = cylinder(r, r, .05, 0x1b1f1a, x, y, -7.43); c.rotation.x = Math.PI / 2; const ring = cylinder(r * 1.25, r * 1.25, .03, 0x555d50, x, y, -7.44); ring.rotation.x = Math.PI / 2; }
  obstacle(x, -7.7, .95, .6);
}

/* ---------- 스탠딩 칠판 (일요일 12시 KST 기점 자동 교체) ---------- */
const BOARD_FONT = "'Noto Sans KR', sans-serif";
function currentSchedule(now = new Date()) {
  const i = SCHEDULE.findIndex((s) => now < new Date(`${s.date}T12:00:00+09:00`));
  return i < 0 ? { current: null, next: null } : { current: SCHEDULE[i], next: SCHEDULE[i + 1] || null };
}
const fmtDate = (s) => { const [, m, d] = s.split('-').map(Number); return `${m}월 ${d}일 (일)`; };
function fitText(ctx, text, maxW, size, weight = 600) { while (size > 22) { ctx.font = `${weight} ${size}px ${BOARD_FONT}`; if (ctx.measureText(text).width <= maxW) return; size -= 2; } ctx.font = `${weight} ${size}px ${BOARD_FONT}`; }
function drawBoard() {
  const c = board, ctx = c.getContext('2d'), { current, next } = currentSchedule();
  ctx.fillStyle = '#2d4739'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ffffff10'; for (let i = 0; i < 9; i++) ctx.fillRect(0, i * 85 + 20, c.width, 30);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f2e6a3'; ctx.font = `700 64px ${BOARD_FONT}`; ctx.fillText('이번 주 찬양', 512, 90);
  if (!current) {
    ctx.fillStyle = '#eaeedd'; fitText(ctx, '다음 찬양 일정은 아직 정해지지 않았어요', 900, 52); ctx.fillText('다음 찬양 일정은 아직 정해지지 않았어요', 512, 380);
  } else {
    ctx.fillStyle = '#cfe0c8'; ctx.font = `500 40px ${BOARD_FONT}`; ctx.fillText(`${fmtDate(current.date)} 예배`, 512, 165);
    if (!current.main && !current.offering) { ctx.fillStyle = '#f7f4e6'; ctx.font = `700 120px ${BOARD_FONT}`; ctx.fillText('찬양 없음', 512, 380); }
    else {
      for (const [i, [label, value]] of [['본송', current.main], ['헌금송', current.offering]].entries()) {
        const y = 290 + i * 190;
        ctx.fillStyle = '#f4b7b0'; ctx.font = `700 44px ${BOARD_FONT}`; ctx.fillText(label, 512, y - 50);
        ctx.fillStyle = value ? '#f7f4e6' : '#9fb3a2'; const text = value || '없음'; fitText(ctx, text, 900, 76, 700); ctx.fillText(text, 512, y + 20);
      }
    }
  }
  ctx.fillStyle = '#9fb8a4'; ctx.font = `500 30px ${BOARD_FONT}`;
  ctx.fillText(next ? `다음 주 ${fmtDate(next.date)} · 본송 ${next.main || '없음'}` : '일요일 낮 12시에 다음 주 찬양으로 바뀌어요', 512, 712);
  boardTex.needsUpdate = true;
}

/* ---------- 사람 모델(플레이어·교사 NPC 공용) ---------- */
function buildPerson({ color, hair = 0x61513f, skin = 0xe1be99, pants = 0x5d6354 }) {
  const group = new THREE.Group(), tors = new THREE.Group(); group.add(tors);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.24, .45, 6, 16), material(color)); body.position.y = .82; body.castShadow = true; tors.add(body);
  const headG = new THREE.Group(); headG.position.set(0, 1.3, 0); tors.add(headG);
  sphere(.235, skin, 0, .18, 0, headG); sphere(.24, hair, 0, .28, -.035, headG).scale.y = .65;
  const eyesOpen = [], eyesClosed = [];
  for (const x of [-.08, .08]) {
    eyesOpen.push(sphere(.018, 0x453e32, x, .18, .215, headG));
    const lid = box(.06, .012, .012, 0x453e32, x, .17, .228, headG); lid.visible = false; eyesClosed.push(lid);
  }
  const la = new THREE.Group(); la.position.set(-.3, 1.05, 0); tors.add(la);
  const ra = new THREE.Group(); ra.position.set(.3, 1.05, 0); tors.add(ra);
  const sleeves = [];
  for (const arm of [la, ra]) { sleeves.push(box(.16, .34, .18, color, 0, -.12, 0, arm)); sphere(.085, skin, 0, -.34, 0, arm); }
  const legs = [];
  for (const x of [-.13, .13]) { legs.push(box(.17, .42, .19, pants, x, .3, 0, group)); box(.19, .12, .28, 0xede8d7, x, .07, .04, group); }
  return { group, torso: tors, head: headG, leftArm: la, rightArm: ra, legs, body, sleeves, eyesOpen, eyesClosed };
}
// 교사 선생님 얼굴 가면(안경·회색 머리·미소)
function buildMask() {
  const g = new THREE.Group();
  const face = sphere(.25, 0xe8c9a6, 0, .18, .15, g); face.scale.set(1, 1.08, .5);
  for (const x of [-.09, .09]) { const lens = new THREE.Mesh(new THREE.TorusGeometry(.055, .008, 8, 20), material(0x2e2e2e)); lens.position.set(x, .21, .275); g.add(lens); sphere(.012, 0x2b2b2b, x, .21, .272, g); }
  box(.06, .01, .01, 0x2e2e2e, 0, .21, .275, g);
  const hair = sphere(.255, 0xb9b9b9, 0, .3, .02, g); hair.scale.set(1, .5, .9);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(.05, .008, 6, 12, Math.PI), material(0x7a4a3a)); smile.position.set(0, .12, .272); smile.rotation.z = Math.PI; g.add(smile);
  g.visible = false; return g;
}
function buildCup() {
  const g = new THREE.Group();
  cylinder(.062, .045, .12, 0xf3f0e6, 0, 0, 0, g);
  const coffee = cylinder(.054, .047, .1, 0x5a3825, 0, 0, 0, g); coffee.position.y = .012; g.userData.coffee = coffee;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.03, .008, 6, 12, Math.PI), material(0xf3f0e6)); handle.position.set(.065, 0, 0); handle.rotation.z = -Math.PI / 2; g.add(handle);
  return g;
}
function setCupLevel(cup, sips) { const left = (MAX_SIPS - sips) / MAX_SIPS; cup.userData.coffee.visible = left > 0; cup.userData.coffee.scale.y = Math.max(.01, left); cup.userData.coffee.position.y = -.05 + .05 * left + .012; }
function buildInstrument(kind) {
  const g = new THREE.Group();
  if (kind === 'flute') { cylinder(.018, .018, .66, 0xd6d9dc, 0, 0, 0, g); for (let i = 0; i < 6; i++) sphere(.013, 0x8f969b, 0, -.22 + i * .09, .02, g); cylinder(.02, .02, .03, 0xb9bec2, 0, .3, 0, g); }
  if (kind === 'clarinet') { cylinder(.022, .022, .5, 0x1d1d1f, 0, .03, 0, g); cylinder(.022, .05, .1, 0x1d1d1f, 0, -.27, 0, g); cylinder(.026, .026, .035, 0xc9a96a, 0, .3, 0, g); for (let i = 0; i < 5; i++) sphere(.014, 0xc7ccd0, 0, -.12 + i * .08, .025, g); }
  if (kind === 'violin') {
    const body = sphere(.1, 0xa6602f, 0, -.12, 0, g); body.scale.set(1, 1.5, .38); sphere(.075, 0xa6602f, 0, .02, 0, g).scale.set(1, 1, .38);
    box(.032, .24, .026, 0x2d2118, 0, .17, .02, g); sphere(.026, 0x2d2118, 0, .31, .02, g); box(.07, .03, .03, 0x2d2118, 0, -.28, .04, g);
    for (const x of [-.012, .012]) box(.004, .38, .004, 0xd8d0b4, x, .05, .055, g);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function buildBow() { const g = new THREE.Group(); cylinder(.01, .01, .7, 0x6b4a2a, 0, 0, 0, g); cylinder(.004, .004, .66, 0xf4f1e2, .02, 0, 0, g); return g; }

/* ---------- 연습실 ---------- */
function makeRoom() {
  scene.fog = new THREE.Fog(0xeae6dc, 24, 56);
  scene.add(new THREE.HemisphereLight(0xfff3d9, 0x898575, 2.4));
  const sun = new THREE.DirectionalLight(0xffedce, 3.2); sun.position.set(-1, 12, 7); sun.target.position.set(4, 0, 0); scene.add(sun.target); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 15, bottom: -15, near: 1, far: 35 }); sun.shadow.normalBias = .035; scene.add(sun);
  mats.wood = material(0xbba07b); mats.dark = material(0x454b40); mats.wall = material(0xe1ddca);
  floor = box(20, .18, 17, 0xceba94, 0, -.12, 0); floors.push(floor);
  for (let z = -8; z <= 8; z += .65) { box(20, .006, .018, 0xbba781, 0, -.024, z); for (let x = -9; x < 10; x += 3.7) box(.015, .007, .63, 0xbba781, x + (Math.round(z / .65) % 2 ? 1.85 : 0), -.023, z + .33); }
  // 벽: 뒤·왼쪽·오른쪽(문 틈과 교사실 연결 포함). 뒤와 천장은 열어 둔 인형집 시점.
  cameraWalls.push(box(20, 6, .2, mats.wall, 0, 2.9, -8.5), box(.2, 6, 17, 0xd8d5bf, -10, 2.9, 0));
  cameraWalls.push(box(.2, 6, 3.8, 0xd8d5bf, 10, 2.9, -6.6), box(.2, 6, 11.8, 0xd8d5bf, 10, 2.9, 2.6), box(.2, 3.3, 1.4, 0xd8d5bf, 10, 4.35, DOOR.z));
  box(20, .16, .22, 0x9c916e, 0, .08, -8.3); box(.22, .16, 17, 0x9c916e, -9.8, .08, 0); box(.22, .16, 17, 0x9c916e, 9.8, .08, 0);
  for (let x = -9.6; x <= -4.6; x += .26) box(.11, 5.5, .12, 0xa99c7e, x, 2.7, -8.33);
  // 왼쪽 연단 + 십자가
  box(4.4, .32, 2.4, 0xb89b72, -7, .1, -6.9); obstacle(-7, -7.2, 4.4, 1.8); box(4.6, .12, .4, 0xc4ac87, -7, -.01, -5.6);
  box(.19, 2, .14, 0xebe0b7, -7, 3.6, -8.05); box(1.22, .18, .14, 0xebe0b7, -7, 3.95, -8.05);
  const crossLight = new THREE.PointLight(0xffdf96, 10, 7); crossLight.position.set(-7, 3.8, -7.6); scene.add(crossLight);
  sign('에셀찬양대', 3.1, .35, -7, 1.9, -8.12, 75, '#625f49', '#e1ddca');
  box(1, .8, .62, 0xa68d68, -7, .65, -7); box(1.2, .1, .75, 0xc6b28d, -7, 1.1, -7);
  // 벽걸이 TV: 베젤 + 같은 좌표의 CSS3D 유튜브 면 + 좌우 스피커 + 하단 장식장
  box(TV.w + .3, TV.w * 9 / 16 + .35, .15, 0x1d211c, TV.x, TV.y, -8.2);
  screenObject = new CSS3DObject(screenElement); screenObject.scale.setScalar(TV.w / 960); screenObject.position.set(TV.x, TV.y, TV.z); cssScene.add(screenObject);
  // 투명 '구멍': WebGL 캔버스를 CSS 위에 올리고 TV 면만 비워서, 앞에 선 아바타가 TV를 가리게 한다.
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(TV.w, TV.w * 9 / 16), new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, side: THREE.DoubleSide, blending: THREE.NoBlending, fog: false })); hole.position.set(TV.x, TV.y, TV.z); scene.add(hole);
  box(5.4, 1.05, .8, 0xb6a07c, 0, .52, -8.0); box(5.5, .08, .86, 0xc9b690, 0, 1.07, -8.0); obstacle(0, -7.9, 5.4, .8);
  sign('P R A I S E   &   P R A C T I C E', 4.6, .22, 0, .55, -7.59, 36, '#727c65', '#e1ddca');
  speaker(-4.5); speaker(4.5);
  // 스탠딩 칠판(스크린 옆)
  const bg = new THREE.Group(); bg.position.set(7.6, 0, -6.2); bg.rotation.y = -.25; scene.add(bg);
  box(2.6, 1.9, .1, 0x8a6a45, 0, 1.75, 0, bg);
  board = document.createElement('canvas'); board.width = 1024; board.height = 768; boardTex = new THREE.CanvasTexture(board); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false })); face.position.set(0, 1.75, .06); bg.add(face);
  box(2.7, .08, .22, 0x8a6a45, 0, .88, .08, bg);
  for (const x of [-1.05, 1.05]) { rod(new THREE.Vector3(x, 1.0, 0), new THREE.Vector3(x * 1.15, 0, .35), .04, 0x6e5436, bg); rod(new THREE.Vector3(x, 1.0, 0), new THREE.Vector3(x * 1.15, 0, -.5), .04, 0x6e5436, bg); }
  obstacle(7.6, -6.2, 2.6, 1.2); drawBoard();
  document.fonts?.load(`700 40px "Noto Sans KR"`).then(drawBoard).catch(() => {});
  // 그랜드 피아노 + 벤치 (반주자 자리)
  buildGrandPiano();
  // 앙상블 구석: 보면대 3개 (드럼·기타는 없앰)
  musicStand(6.2, -1.7, -.5); musicStand(7.5, -2.5, -.7); musicStand(5.6, -3.0, -.3);
  microphone(0, -1.9); microphone(2, -2.3);
  // 찬양대석: 10명씩 3줄 계단식
  TIERS.forEach((t, r) => {
    const zc = (t.z0 + t.z1) / 2; floors.push(box(TIER_HALF_W * 2, t.y, t.z1 - t.z0, 0xc4ac87, 0, t.y / 2, zc)); box(TIER_HALF_W * 2, .03, .03, 0x9c916e, 0, t.y, t.z0);
    for (let i = 0; i < 10; i++) chair(-4.95 + i * 1.1, zc + .25, Math.PI, t.y, 'choir');
  });
  // 앙상블 의자 6개: 합창석 앞 한 줄(마이크·단상 앞, 첫 단 z 0.85보다 TV 쪽). 합창석 30개 다음이라 자리 인덱스 30~35
  for (let i = 0; i < ENSEMBLE_SEATS; i++) chair(-3.75 + i * 1.5, ENSEMBLE_Z, Math.PI, 0, 'ensemble');
  buildConductorPodium();
  for (const x of [-9.3, 9.3]) { plant(x, -7.3); plant(x, 5.5); }
  // 창문과 조명
  for (const z of [-3, 1, 5]) { box(.03, 2.7, 2.6, 0xabbcaf, -9.87, 3.1, z); box(.08, 2.8, .07, 0xf0e9d8, -9.8, 3.1, z); box(.08, .08, 2.7, 0xf0e9d8, -9.8, 3.1, z); box(.35, .1, 2.9, 0xd0c8ac, -9.75, 1.75, z); box(.05, .55, .5, 0xeee2b9, 9.84, 3.5, z); const l = new THREE.PointLight(0xffd893, 4, 6); l.position.set(8.6, 3.5, z); scene.add(l); }
  const ring = new THREE.Mesh(new THREE.RingGeometry(.24, .3, 40), new THREE.MeshBasicMaterial({ color: 0x627950, side: THREE.DoubleSide, transparent: true, opacity: .8 })); ring.rotation.x = -Math.PI / 2; ring.position.y = .012; scene.add(ring); ring.visible = false; marker = ring;
  makeTeacherRoom(); makeTreasure();
}

/* ---------- 교사실 ---------- */
function makeTeacherRoom() {
  const tf = box(8, .18, 8, 0xb8a48a, 14, -.12, -4.5); floors.push(tf);
  box(7.4, .02, 6.6, 0x8d6f6a, 14, -.02, -4.6); // 러그
  cameraWalls.push(box(8, 6, .2, mats.wall, 14, 2.9, -8.5), box(.2, 6, 8, 0xd8d5bf, 18, 2.9, -4.5));
  box(8, 1.1, .12, 0xd8d5bf, 14, .55, -.5); // 앞쪽은 시야를 위해 낮은 벽
  const l = new THREE.PointLight(0xffe2b0, 14, 12); l.position.set(14, 4.5, -4.5); scene.add(l);
  // 문: 경첩 기준 회전. 교사 입장 권한이 있을 때만 열린다.
  doorPivot = new THREE.Group(); doorPivot.position.set(10, 0, DOOR.z - .7); scene.add(doorPivot);
  box(.08, 2.6, 1.4, 0xa77a4c, 0, 1.3, .7, doorPivot); sphere(.05, 0xd8c27a, .08, 1.25, 1.2, doorPivot);
  const frame = material(0x7b5a37); box(.14, 2.7, .08, frame, 10, 1.35, DOOR.z - .74); box(.14, 2.7, .08, frame, 10, 1.35, DOOR.z + .74);
  const s = sign('교사실', 1.3, .4, 9.86, 3.35, DOOR.z, 70, '#f1ecd9', '#445d48'); s.rotation.y = -Math.PI / 2;
  const s2 = sign('교사실', 1.3, .4, 10.14, 3.35, DOOR.z, 70, '#f1ecd9', '#445d48'); s2.rotation.y = Math.PI / 2;
  // 교사 책상(뒤) + 책장 + 화분
  box(2.6, .08, 1.0, 0x8a6a45, 14.4, .8, -7.3); for (const x of [13.2, 15.6]) box(.08, .8, .9, 0x6e5436, x, .4, -7.3); obstacle(14.4, -7.3, 2.6, 1.0);
  box(.5, .06, .36, 0x7a2f2f, 14.0, .87, -7.3); box(.3, .02, .22, 0xf0edda, 14.7, .85, -7.2);
  box(1.8, 2.2, .45, 0x7b5a37, 11.6, 1.1, -8.1); for (let r = 0; r < 4; r++) for (let i = 0; i < 7; i++) box(.18, .4, .3, [0x7a5f4f, 0x516a58, 0x8b6a3e, 0x4e5a73][(r + i) % 4], 10.95 + i * .22 + (r % 2) * .02, .4 + r * .5, -8.0); obstacle(11.6, -8.0, 1.8, .45);
  plant(17.2, -7.2);
  // 기부 커피 책상
  box(1.8, .08, 1.0, 0xc4ac87, TABLE.x, .85, TABLE.z); for (const dx of [-.8, .8]) for (const dz of [-.4, .4]) box(.07, .85, .07, 0x7b5a37, TABLE.x + dx, .42, TABLE.z + dz); obstacle(TABLE.x, TABLE.z, 1.8, 1.0);
  sign('☕ 나눔 커피', .9, .22, TABLE.x, .5, TABLE.z + .53, 56, '#58654d', '#f0edda');
  // 커피머신 카운터 (동쪽 벽)
  box(.8, .9, 2.4, 0xd9cfb8, 17.3, .45, -3.4); box(.86, .06, 2.46, 0x6e5436, 17.3, .92, -3.4); obstacle(17.3, -3.4, .8, 2.4);
  const m = new THREE.Group(); m.position.set(COFFEE.x, .95, COFFEE.z); scene.add(m);
  box(.42, .62, .42, 0x2d2f33, 0, .31, 0, m); box(.44, .12, .44, 0xc0382b, 0, .66, 0, m); box(.3, .06, .3, 0x1a1b1d, -.1, .12, 0, m);
  machineLed = new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, emissive: 0x000000 })); machineLed.position.set(-.22, .5, .12); m.add(machineLed);
  cylinder(.03, .03, .22, 0x888d91, -.2, .38, .1, m);
  const capsule = box(.1, .1, .1, 0xc0382b, -.05, .5, .22, m); capsule.rotation.y = .6;
  // 쓰레기통
  cylinder(.22, .18, .5, 0x4a5148, TRASH.x, .25, TRASH.z); cylinder(.24, .24, .04, 0x2d332c, TRASH.x, .52, TRASH.z); obstacle(TRASH.x, TRASH.z, .5, .5);
  // 교사 NPC
  npc = buildPerson({ color: 0x3f4a6a, hair: 0xb9b9b9, pants: 0x2f3340 }); npc.group.position.set(13.6, 0, NPC_Z); scene.add(npc.group);
  for (const x of [-.09, .09]) { const lens = new THREE.Mesh(new THREE.TorusGeometry(.055, .008, 8, 20), material(0x2e2e2e)); lens.position.set(x, .2, .236); npc.head.add(lens); }
}

/* ---------- 보물찾기 ---------- */
function makeTreasure() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xf3c243, emissive: 0xb07a10, emissiveIntensity: .8, roughness: .3, metalness: .6 });
  TREASURE_NOTES.forEach(([x, y, z], id) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.userData = { id, baseY: y }; scene.add(g);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 12), gold); head.scale.set(1.2, .9, .8); head.position.set(-.04, -.12, 0); g.add(head);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(.03, .34, .03), gold); stem.position.set(.04, .03, 0); g.add(stem);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(.14, .05, .025), gold); flag.position.set(.1, .17, 0); flag.rotation.z = -.5; g.add(flag);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(.4, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.userData.note = g; g.add(hit); noteHits.push(hit);
    g.userData.hit = hit;
  });
}
function noteGroups() { return noteHits.map((h) => h.userData.note); }
function tryCollect(g) {
  if (Math.hypot(avatar.position.x - g.position.x, avatar.position.z - g.position.z) > 3.2) { toast('반짝이는 게 보여요. 조금 더 가까이 가서 눌러 보세요 ✨'); return; }
  scene.remove(g); noteHits.splice(noteHits.indexOf(g.userData.hit), 1); state.notes.add(g.userData.id);
  updateTreasure();
  if (state.notes.size === TREASURE_NOTES.length) { toast('🎉 황금 음표를 모두 찾았어요!'); renderTreasure(true); openDialog('#treasure'); }
  else toast(`🎵 황금 음표 ${state.notes.size} / ${TREASURE_NOTES.length}`);
}
function updateTreasure() { $('#treasure-count').textContent = state.notes.size; $('#treasure-pill').classList.toggle('done', state.notes.size === TREASURE_NOTES.length); }
function renderTreasure(done = state.notes.size === TREASURE_NOTES.length) {
  $('#treasure-title').textContent = done ? '보물찾기 완료!' : '보물찾기';
  $('#treasure-msg').textContent = done ? '축하해요! 숨겨진 황금 음표 5개를 모두 찾았어요. 🎉 찬양으로 마음을 모은 모두가 보물이에요.' : `찾은 황금 음표: ${state.notes.size} / ${TREASURE_NOTES.length}`;
  $('#treasure-slots').replaceChildren(...TREASURE_NOTES.map((_, i) => { const s = document.createElement('span'); s.className = `dot${state.notes.has(i) ? ' on' : ''}`; s.textContent = state.notes.has(i) ? '🎵' : '·'; return s; }));
}

/* ---------- 아바타 ---------- */
function makeAvatar() {
  me = buildPerson({ color: parts.soprano.color }); avatar = me.group; torso = me.torso; head = me.head; leftArm = me.leftArm; rightArm = me.rightArm;
  scene.add(avatar); head.add(me.mask = buildMask()); avatar.visible = false;
}
function setEyesClosed(closed) { for (const e of me.eyesOpen) e.visible = !closed; for (const e of me.eyesClosed) e.visible = closed; }
function authorized() { return Boolean(state.profile && (state.profile.teacher || state.disguised)); }
function doorPass() { return authorized() && state.doorOpen > .5; }
function validPosition(x, z) {
  const inMain = x > -9.3 && x < 9.3 && z > -7.8 && z < 7.8;
  const inDoor = x >= 9.3 && x <= 10.6 && Math.abs(z - DOOR.z) < .65 && (x < 9.75 || doorPass());
  const inTeacher = x > 10.6 && x < 17.4 && z > -7.5 && z < -.9;
  return (inMain || inDoor || inTeacher) && !colliders.some((c) => Math.abs(x - c.x) < c.w && Math.abs(z - c.z) < c.d);
}
function move(dx, dz) { const p = avatar.position; const old = p.clone(); if (validPosition(p.x + dx, p.z)) p.x += dx; if (validPosition(p.x, p.z + dz)) p.z += dz; return p.distanceToSquared(old) > .000001; }
function benchDist() { return Math.hypot(avatar.position.x - BENCH.x, avatar.position.z - BENCH.z); }
function benchFree() { return !MP.isSeatClaimed(BENCH_SEAT); }
function chairKind() { const part = state.profile?.part; return part === 'orchestra' ? 'ensemble' : part === 'conductor' || part === 'accompanist' ? null : 'choir'; } // 지휘자(단상)·반주자(피아노 벤치)는 의자를 안 쓴다
function nearestChair() { const kind = chairKind(); return chairs.reduce((best, c, i) => { if (c.kind !== kind || MP.isSeatClaimed(i)) return best; const d = Math.hypot(avatar.position.x - c.x, avatar.position.z - c.z); return d < best.d ? { chair: c, d } : best; }, { chair: null, d: Infinity }); }
function toggleSit() {
  if (!state.entered) return;
  if (state.seated) {
    if (seatLocked()) return; // 반주자는 지휘 1분 전까지 피아노에서 못 일어난다
    const c = state.seated, dir = c.bench ? -1 : 1; dropSeat(); MP.releaseSeat(); avatar.position.x += Math.sin(c.rotation) * .9 * dir; avatar.position.z += Math.cos(c.rotation) * .9 * dir; toast('자리에서 일어났어요.'); return; // 벤치는 피아노 반대쪽(뒤)으로 일어난다
  }
  const n = nearestChair(), bd = benchFree() ? benchDist() : Infinity;
  if (bd <= 1.45 && bd <= n.d) { sitBench(); return; }
  if (n.d > 1.45) return;
  state.seated = n.chair; MP.claimSeat(chairs.indexOf(n.chair)); state.target = null; state.queue = []; stopPlaying(); avatar.position.set(n.chair.x, n.chair.y, n.chair.z); avatar.rotation.y = n.chair.rotation; toast('잠시 앉아 찬양을 준비해요.');
}
function routeTo(p) { // 문을 지나야 하면 문 앞뒤 경유점을 넣는다
  const inTeacher = avatar.position.x > 10.4, toTeacher = p.x > 10.4, q2 = [];
  if (!inTeacher && toTeacher) q2.push(new THREE.Vector3(9.2, 0, DOOR.z), new THREE.Vector3(11.2, 0, DOOR.z));
  else if (inTeacher && !toTeacher) q2.push(new THREE.Vector3(11.2, 0, DOOR.z), new THREE.Vector3(9.2, 0, DOOR.z));
  q2.push(p); state.dest = p; state.target = q2.shift(); state.queue = q2;
}
function clearTarget() { state.target = null; state.queue = []; state.dest = null; }

/* ---------- 지휘 ---------- */
const CONDUCT_BPM = 72;
function nearPodium() { return Math.hypot(avatar.position.x - PODIUM.x, avatar.position.z - PODIUM.z); }
/* 지휘 시작 흐름: (a) 모이기 → (b) 모두 자리에 서면 지휘 시작 → (c) 찬양 재생 */
const GATHER_MAX_MS = 6000, GATHER_MIN_MS = 400, GATHER_HOLD = { hold: true }; // 6초 안에 못 모여도 그 시점 자리에 있는 사람만으로 시작
let gather = null, praiseFrom = null; // gather: 내가 걸어가는 중인 자리 { chair | bench, idx }, praiseFrom: 찬송가를 틀어 준 지휘자 id
function seatPos(i) { return i === BENCH_SEAT ? BENCH : chairs[i]; }
function startGather() { // 내 파트의 자리를 정해 차지하고 걸어간다
  if (state.seated || state.conducting) return;
  stopPrayer(true);
  if (state.profile.part === 'accompanist') { // 반주자 → 피아노 벤치(남이 앉아 있으면 포기)
    if (!benchFree()) return;
    gather = { bench: true }; routeTo(new THREE.Vector3(BENCH.x, 0, BENCH.z)); return;
  }
  const n = nearestChair(); if (!n.chair) { gather = null; toast('빈 자리가 없어요. 서서 찬양해요.'); return; }
  const idx = chairs.indexOf(n.chair); MP.claimSeat(idx); gather = { chair: n.chair, idx };
  routeTo(new THREE.Vector3(n.chair.x, 0, n.chair.z));
}
function gatherToSeat() { // 지휘 'start' 신호를 받은 클라이언트(원격) 또는 1인용: 각자 자리로 간다
  if (!state.entered || state.profile.part === 'conductor' || state.conducting || state.conductWait || avatar.position.x > 10.6) return; // 지휘자는 단상 유지, 교사실은 제외
  if (state.seated) { if (state.profile.part === 'orchestra' && !state.playing) startPlaying(); return; } // 이미 차지한 자리가 있으면 그대로
  // multiplayer.js의 _onConduct가 이 핸들러 직후 `state.seated`가 비었으면 가장 가까운 아무 의자에 _autoSeat한다(파트 무시) — 같은 호출 스택 동안만 자리가 찬 것처럼 보이게 해 막고, 곧바로 내 파트 자리로 간다
  state.seated = GATHER_HOLD;
  queueMicrotask(() => { if (state.seated === GATHER_HOLD) state.seated = null; startGather(); });
}
function cancelGather() { if (!gather) return; if (gather.idx != null && !state.seated) MP.releaseSeat(); gather = null; }
function updateGather() { // 매 프레임: 도착하면 앉는다(앙상블은 악기도 든다)
  if (!gather) return;
  if (state.seated) { gather = null; return; }
  const p = gather.bench ? BENCH : gather.chair, d = Math.hypot(avatar.position.x - p.x, avatar.position.z - p.z);
  if (gather.idx != null && !MP.hasSeat()) { gather = null; startGather(); return; } // 자리 경합에서 졌다 → 다른 빈 자리로
  if (d < .5) {
    gather = null; clearTarget();
    if (p.bench) { sitBench(); return; }
    state.seated = p; avatar.position.set(p.x, p.y, p.z); avatar.rotation.y = p.rotation;
    if (state.profile.part === 'orchestra') startPlaying(); // 연주 준비: 악기를 연주 자세로
  } else if (!state.target) cancelGather(); // 이동 입력·장애물로 중단됨
}
function allSeated() { // presence로 방 안 모든 사람의 자리 확인: 자리를 차지했고(seat) 그 자리 가까이에 도착했는가
  for (const [key, arr] of MP._presence) {
    if (key === MP._id || !arr.length) continue;
    const s = arr[arr.length - 1];
    if (s.part === 'conductor' || s.x > 10.6) continue; // 다른 지휘자·교사실 인원은 기다리지 않는다
    const p = s.seat == null ? null : seatPos(s.seat);
    if (!p || Math.hypot(s.x - p.x, s.z - p.z) > .6) return false;
  }
  return true; // 혼자일 때도 true
}
function seatAllForPraise() { toast('🎼 지휘가 시작됐어요 — 모두 자리로 돌아가 찬양을 시작해요'); MP.sendConduct('start'); } // (a) 모이기 신호
function updateConductWait(now) { // (b) 지휘자 클라이언트: 모두 앉았거나 6초가 지나면 지휘 시작
  const w = state.conductWait; if (!w) return; const el = now - w;
  if (el >= GATHER_MAX_MS || (el >= GATHER_MIN_MS && allSeated())) beginConducting();
}
function beginConducting() {
  state.conductWait = 0; state.conducting = true; conductSignal('me', 'start'); startPraise();
}
function offeringNumber() { // 이번 주 헌금송 문자열('310장 아 하나님의 은혜로')에서 번호 파싱. 없거나 풀에 없으면 null
  const m = /^\s*(\d+)\s*장/.exec(currentSchedule().current?.offering || ''), n = m ? Number(m[1]) : null;
  return n && HYMNS.some((x) => x.number === n) ? n : null;
}
let mainPraiseDone = false; // 본송→헌금송 전환 중복 방지
function startPraise() { // 지휘 음악: 본송(weekly 첫 곡, TV) → 헌금송(찬송가 오디오) → 둘 다 없으면 랜덤 찬송가. 세트리스트는 쓰지 않는다.
  mainPraiseDone = false;
  const main = modeVideos('weekly')[0];
  if (main) { state.praise = 'main'; setMode('weekly'); playIndex(0, true); toast(`🎵 본송: ${main.title.replace(/\s*\(.*\)$/, '')}`); return; }
  const off = offeringNumber();
  if (off) { state.praise = 'offering'; playPraiseHymn(off, 'me'); MP.sendConduct(`hymn:${off}`); return; }
  state.praise = 'hymn';
  const h = HYMNS[Math.floor(Math.random() * HYMNS.length)];
  playPraiseHymn(h.number, 'me'); MP.sendConduct(`hymn:${h.number}`); // 지휘자가 뽑아 모두에게 알린다
}
function mainPraiseEnded() { // 본송 영상 끝(playerState 0): 지휘 중 본송일 때만, 한 번만 헌금송으로 넘어간다
  if (!state.conducting || state.praise !== 'main' || mainPraiseDone) return;
  mainPraiseDone = true;
  const off = offeringNumber(); if (!off) { state.praise = null; return; }
  state.praise = 'offering'; tvCommand('pauseVideo'); mpTv('pause');
  playPraiseHymn(off, 'me'); MP.sendConduct(`hymn:${off}`);
}
function playPraiseHymn(number, from) { // 모든 클라이언트: 같은 찬송가 재생(#hymn-audio, skip 적용)
  const h = HYMNS.find((x) => x.number === number); if (!h) return;
  praiseFrom = from; loadHymn(h);
  const a = $('#hymn-audio'); a.play().catch(() => toast('소리가 나지 않으면 화면을 한 번 눌러 주세요.'));
  toast(offeringNumber() === number ? `🎵 헌금송: ${h.number}장 ${h.title}` : `🎵 찬양이 없는 주예요 — ${h.number}장 ${h.title}을(를) 함께 불러요`);
}
function stopHymnAudio() { praiseFrom = null; const a = $('#hymn-audio'); if (a) a.pause(); }
function stopPraise() { // 지휘 종료: 본송(TV) 정지 + 찬송가 오디오 정지
  if (state.praise === 'main') { tvCommand('pauseVideo'); mpTv('pause'); }
  stopHymnAudio(); state.praise = null;
}
function startConducting() {
  if (!state.entered || state.profile.part !== 'conductor' || state.conducting || state.conductWait || nearPodium() > CONDUCT_RANGE) return;
  stopPrayer(true); stopPlaying(); state.emoteEnd = 0; state.seated = null; clearTarget();
  avatar.position.set(PODIUM.x, PODIUM.h, PODIUM.z); avatar.rotation.y = 0; // 지휘자는 이미 단상 — 이동하지 않고 +z(찬양대석) 방향
  state.savedYaw = state.yaw; state.yaw = Math.PI; state.tvFocus = false; // 카메라를 지휘자 뒤(TV 쪽)로 돌려 어깨 너머로 찬양대석을 봄
  state.conductWait = performance.now(); seatAllForPraise(); // 지휘 자세·찬양은 모두 앉은 뒤(beginConducting)
}
function stopConducting(silent = false) {
  if (!state.conducting && !state.conductWait) return; state.conducting = false; state.conductWait = 0; MP.sendConduct('stop'); conductSignal('me', 'stop'); stopPraise();
  if (state.savedYaw != null) { state.yaw = state.savedYaw; state.savedYaw = null; }
  avatar.position.set(PODIUM.x, 0, PODIUM.z + PODIUM.half + .45); // 단상 앞(찬양대석 쪽)으로 내려옴
  if (!silent) toast('지휘를 마쳤어요.');
}
function conductPose(t) { // 4박자 패턴: 내려침(1) → 안쪽(2) → 바깥쪽(3) → 올림(4)
  const beat = (t * CONDUCT_BPM / 60) % 4, i = Math.floor(beat), f = (1 - Math.cos((beat - i) * Math.PI)) / 2;
  const K = [[-.95, .1], [-1.4, -.3], [-1.4, .7], [-2.0, .2]], a = K[i], b = K[(i + 1) % 4];
  const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
  rightArm.rotation.set(x, 0, z); leftArm.rotation.set(x, 0, -z); torso.rotation.y = Math.sin(t * CONDUCT_BPM / 60 * Math.PI / 2) * .06;
}

/* ---------- 이모트 · 기도 · 연주 ---------- */
function emote(type) {
  if (!state.entered) return;
  stopPrayer(true); stopPlaying();
  state.emote = type; state.emoteEnd = performance.now() + 3000; $('#emote-bubble').textContent = { amen: '🙏', clap: '👏', raise: '✋' }[type]; $('#emote-bubble').hidden = false; MP.sendEmote(type);
}
function startPrayer() { if (!state.entered || modalOpen()) return; stopConducting(true); stopPlaying(); state.emoteEnd = 0; state.prayStart = performance.now(); $('#pray-label').textContent = '기도 마치기'; toast('🙏 기도를 시작해요. 3분 이상 기도하면 커피를 내릴 수 있어요.'); showPrayer(); }
function stopPrayer(silent = false) {
  if (!state.prayStart) return;
  hidePrayer(); const sec = (performance.now() - state.prayStart) / 1000; state.prayStart = 0; $('#pray-label').textContent = '기도하기';
  if (sec >= PRAY_COFFEE_SEC) { state.coffeeRight = true; if (!silent) toast(`🙏 ${fmtTime(sec)} 기도했어요. 교사실 커피머신에서 커피를 내릴 수 있어요 ☕`); else toast('기도를 마쳤어요. 커피 권한이 생겼어요 ☕'); }
  else if (!silent) toast(`기도를 마쳤어요 (${fmtTime(sec)}). 커피는 ${PRAY_COFFEE_SEC / 60}분 이상 기도해야 해요.`);
}
// 기도 중 친구 기도제목(prayers.json) — 내 화면에만 표시, 20초마다 교체. 로딩 실패 시 패널 없음.
function nextPrayer() {
  let i = Math.floor(Math.random() * prayers.length);
  if (prayers.length > 1 && i === lastPrayer) i = (i + 1 + Math.floor(Math.random() * (prayers.length - 1))) % prayers.length;
  lastPrayer = i; $('#prayer-text').textContent = prayers[i];
}
function showPrayer() {
  clearInterval(prayerTimer); if (!prayers.length) return;
  nextPrayer(); $('#prayer-card').hidden = false; prayerTimer = setInterval(nextPrayer, 20000);
}
function hidePrayer() { clearInterval(prayerTimer); $('#prayer-card').hidden = true; }
async function loadPrayers() {
  try { const r = await fetch('prayers.json'); const d = await r.json(); prayers = (d.prayers || []).filter((s) => typeof s === 'string' && s.trim()); } catch { prayers = []; }
}
function togglePrayer() { state.prayStart ? stopPrayer() : startPrayer(); }
function attachInstrument(mode) { // carry: 왼손에 들고 다니기 / play: 연주 위치
  if (!instrumentObj) return; const kind = state.profile.instrument;
  if (mode === 'play') {
    torso.add(instrumentObj);
    if (kind === 'flute') { instrumentObj.position.set(.2, 1.36, .27); instrumentObj.rotation.set(0, -.25, Math.PI / 2 - .08); }
    if (kind === 'clarinet') { instrumentObj.position.set(0, 1.1, .28); instrumentObj.rotation.set(.2, 0, 0); }
    if (kind === 'violin') { instrumentObj.position.set(-.16, 1.27, .17); instrumentObj.rotation.set(Math.PI / 2 - .15, 0, .35); }
  } else {
    leftArm.add(instrumentObj); instrumentObj.position.set(0, kind === 'violin' ? -.42 : -.34, .08); instrumentObj.rotation.set(kind === 'violin' ? .15 : .3, 0, 0);
  }
}
function startPlaying() { if (!instrumentObj || !state.entered) return; stopPrayer(true); state.emoteEnd = 0; state.playing = true; attachInstrument('play'); toast(`${instruments[state.profile.instrument].name}을(를) 연주해요 ♪`); }
function stopPlaying() { if (!state.playing) return; state.playing = false; attachInstrument('carry'); }
function setInstrument(kind) {
  if (instrumentObj) instrumentObj.parent?.remove(instrumentObj);
  if (bowObj) bowObj.parent?.remove(bowObj);
  instrumentObj = bowObj = null; state.playing = false;
  if (!kind) return;
  instrumentObj = buildInstrument(kind); attachInstrument('carry');
  if (kind === 'violin') { bowObj = buildBow(); rightArm.add(bowObj); bowObj.position.set(0, -.34, .04); bowObj.rotation.set(0, 0, Math.PI / 2); }
}

/* ---------- 말씀 채팅(성경 구절 1절 단위) ---------- */
function clip(text) { return text.length > VERSE_MAX ? `${text.slice(0, VERSE_MAX).trimEnd()}...` : text; }
function sayVerse(v) {
  if (!state.entered) return;
  const b = $('#verse-bubble'); b.replaceChildren(); const t = document.createElement('span'); t.textContent = clip(v.text); const r = document.createElement('small'); r.textContent = v.ref; b.append(t, r); b.hidden = false;
  clearTimeout(verseTimer); verseTimer = setTimeout(() => b.hidden = true, 7000);
  MP.sendVerse(v); const log = $('#verse-log'); if (log.firstChild?.classList.contains('muted')) log.replaceChildren();
  const li = document.createElement('li'); li.textContent = `${v.ref} — ${clip(v.text)}`; log.prepend(li); while (log.children.length > 12) log.lastChild.remove();
}
function renderVerses() {
  $('#verse-list').replaceChildren(...VERSES.map((v) => { const row = document.createElement('button'); row.className = 'verse-row'; const ref = document.createElement('b'); ref.textContent = v.ref; const text = document.createElement('span'); text.textContent = v.text; row.append(ref, text); row.onclick = () => { sayVerse(v); $('#verse').close(); }; return row; }));
}

function renderSheetVerses() {
  if (!sheetVerses.length) return;
  $('#verse-sheet-count').textContent = `(${sheetVerses.length})`;
  $('#verse-sheet-list').replaceChildren(...sheetVerses.map((v) => {
    const row = document.createElement('button'); row.className = 'verse-row sheet'; const ref = document.createElement('b'); ref.textContent = v.ref;
    const text = document.createElement('span'); text.textContent = v.text; row.append(ref, text);
    if (v.note) { const n = document.createElement('small'); n.textContent = v.note; row.append(n); }
    row.onclick = () => { sayVerse({ ref: v.ref, text: v.text }); $('#verse').close(); }; return row;
  }));
  $('#verse-sheet').hidden = false;
}
async function loadVerseSheet() {
  try { const r = await fetch('verses.json'); const d = await r.json(); sheetVerses = (d.verses || []).filter((v) => v && v.ref && v.text); } catch { sheetVerses = []; }
  renderSheetVerses();
}

/* ---------- 교사실 · 위장 · 커피 ---------- */
function expel(reason, bubble) {
  stopConducting(true); state.disguised = false; me.mask.visible = false; state.seated = null; clearTarget();
  avatar.position.set(8.6, 0, DOOR.z); avatar.rotation.y = -Math.PI / 2; state.doorOpen = 0;
  if (bubble) { const b = $('#npc-bubble'); b.textContent = bubble; b.hidden = false; clearTimeout(npcTimer); npcTimer = setTimeout(() => b.hidden = true, 2800); }
  toast(reason);
}
function toggleMask() {
  if (!state.entered || state.profile.teacher) return;
  if (state.disguised) { state.disguised = false; me.mask.visible = false; toast('가면을 벗었어요.'); return; }
  if (performance.now() < state.maskBlockedUntil) { toast('선생님이 아직 경계하고 있어요. 잠시 뒤에 다시 해 보세요.'); return; }
  state.disguised = true; me.mask.visible = true; toast('🎭 교사 선생님 가면을 썼어요. 선생님께 가까이 가면 들켜요!');
}
function openBrew() {
  if (state.brewing) return;
  if (!state.coffeeRight) { toast('커피는 3분 이상 기도한 사람만 내릴 수 있어요. 🙏 기도하기를 눌러 보세요.'); return; }
  openDialog('#coffee');
}
function brew(forMe) {
  if (forMe && state.held) { toast('이미 컵을 들고 있어요. 먼저 비우고 버려 주세요.'); return; }
  if (!forMe && tableCups.length >= TABLE_SLOTS) { toast('책상이 커피로 가득 찼어요. 누군가 가져가길 기다려요.'); return; }
  $('#coffee').close(); state.brewing = true; state.coffeeRight = false; toast('☕ 커피를 내리는 중…');
  setTimeout(() => {
    state.brewing = false;
    if (forMe) { giveCup(); toast('☕ 커피가 나왔어요. 5모금까지 마실 수 있어요.'); }
    else { placeDonatedCup(); toast('🎁 책상에 커피를 올려 두었어요. 누구나 가져가 마실 수 있어요.'); }
  }, 1800);
}
function giveCup() { state.held = true; state.sips = 0; heldCup = buildCup(); setCupLevel(heldCup, 0); rightArm.add(heldCup); heldCup.position.set(0, -.34, .1); }
function placeDonatedCup() { const i = tableCups.length; const cup = buildCup(); cup.position.set(TABLE.x - .6 + (i % 3) * .6, .95, TABLE.z - .2 + Math.floor(i / 3) * .4); scene.add(cup); tableCups.push(cup); }
function takeCup() { if (state.held) { toast('이미 컵을 들고 있어요.'); return; } const c = tableCups.pop(); if (!c) return; scene.remove(c); giveCup(); toast('☕ 커피를 가져왔어요.'); }
function drink() {
  if (!state.held) return;
  if (state.sips >= MAX_SIPS) { state.panicEnd = performance.now() + 2500; toast('앗, 컵이 비었어요! 쓰레기통에 버려 주세요.'); return; }
  stopPlaying(); state.sips++; state.sipEnd = performance.now() + 1300; setCupLevel(heldCup, state.sips);
  if (state.sips >= MAX_SIPS) { state.panicEnd = performance.now() + 3200; toast('☕ 다 마셨어요! 빈 컵이 되었어요. 앗, 허둥지둥…'); } else toast(`☕ ${state.sips} / ${MAX_SIPS} 모금`);
}
function trashCup() { if (!state.held || state.sips < MAX_SIPS) return; rightArm.remove(heldCup); heldCup = null; state.held = false; state.sips = 0; toast('🗑 빈 컵을 버렸어요.'); }

/* ---------- 프로필 ---------- */
function randomProfile() { const part = pick(Object.keys(parts)); return { nickname: pick(BIBLE_NAMES), part, instrument: part === 'orchestra' ? pick(Object.keys(instruments)) : null, teacher: false }; }
function partLabel(p) { const info = parts[p.part]; return p.part === 'orchestra' && p.instrument ? `${info.name} · ${instruments[p.instrument].name}` : info.name; }
function applyProfile(p) {
  if (state.seated === BENCH && p.part !== 'accompanist') dropSeat(); // 파트를 바꾸면 반주자 잠금도 함께 풀린다
  state.profile = p; const info = parts[p.part];
  me.body.material.color.setHex(info.color); for (const s of me.sleeves) s.material.color.setHex(info.color);
  setInstrument(p.part === 'orchestra' ? p.instrument : null);
  $('#nickname-display').textContent = p.nickname; $('#part-display').textContent = `${partLabel(p)}${p.teacher ? ' · 교사' : ''}`; $('#part-dot').style.background = `#${info.color.toString(16).padStart(6, '0')}`;
  $('#avatar-label').textContent = p.nickname; $('#avatar-label').hidden = false;
  if (p.teacher) { state.disguised = false; me.mask.visible = false; }
  try { localStorage.setItem('praise-room-profile', JSON.stringify(p)); } catch { /* 저장이 막혀도 입장은 가능 */ }
}
function enter(p) {
  const info = parts[p.part]; avatar.position.set(info.spawn[0] + (Math.random() - .5) * .6, 0, info.spawn[1]); avatar.rotation.y = Math.PI; avatar.visible = true;
  applyProfile(p); state.entered = true; MP.onEnter(); $('#entry').close(); toast(`${p.nickname}님, 환영해요. ${partLabel(p)} 자리에서 시작해요.`);
}
function showDraw() { $('#draw-icon').textContent = parts[draw.part].icon; $('#draw-name').textContent = draw.nickname; $('#draw-part').textContent = partLabel(draw); }
function readSaved() { try { const p = JSON.parse(localStorage.getItem('praise-room-profile') || 'null'); if (p && parts[p.part] && p.nickname) return { nickname: String(p.nickname).slice(0, 16), part: p.part, instrument: p.part === 'orchestra' ? (instruments[p.instrument] ? p.instrument : 'violin') : null, teacher: Boolean(p.teacher) }; } catch { /* 무시 */ } return null; }
function renderProfileForm() {
  const p = state.profile; $('#profile-name').value = p.nickname; $('#profile-teacher').checked = p.teacher;
  $('#profile-parts').replaceChildren(...Object.entries(parts).map(([k, v]) => { const l = document.createElement('label'); l.innerHTML = '<input type="radio" name="pf-part"><span></span>'; l.querySelector('input').value = k; l.querySelector('input').checked = k === p.part; l.querySelector('span').innerHTML = `${v.icon}<b>${v.name}</b>`; return l; }));
  $('#profile-instruments').replaceChildren(...Object.entries(instruments).map(([k, v]) => { const l = document.createElement('label'); l.innerHTML = '<input type="radio" name="pf-inst"><span></span>'; l.querySelector('input').value = k; l.querySelector('input').checked = k === (p.instrument || 'violin'); l.querySelector('span').innerHTML = `${v.icon}<b>${v.name}</b>`; return l; }));
  syncInstrumentField();
}
function syncInstrumentField() { $('#instrument-field').hidden = document.querySelector('input[name="pf-part"]:checked')?.value !== 'orchestra'; }
function saveProfile(event) {
  event.preventDefault(); const part = document.querySelector('input[name="pf-part"]:checked').value;
  const next = { nickname: $('#profile-name').value.trim().slice(0, 16) || state.profile.nickname, part, instrument: part === 'orchestra' ? (document.querySelector('input[name="pf-inst"]:checked')?.value || 'violin') : null, teacher: $('#profile-teacher').checked };
  applyProfile(next); $('#profile').close(); toast(`${next.nickname}님 · ${partLabel(next)}(으)로 바꿨어요.`);
}

/* ---------- 카메라 · 렌더 ---------- */
function projectAt(element, pos) { const v = pos.clone().project(camera); element.style.left = `${(v.x * .5 + .5) * innerWidth}px`; element.style.top = `${(-v.y * .5 + .5) * innerHeight}px`; element.style.visibility = (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2) ? 'hidden' : 'visible'; }
function projectLabel(element, height) { projectAt(element, avatar.position.clone().add(new THREE.Vector3(0, height, 0))); }
function updateCamera(dt) {
  const focus = state.entered && state.tvFocus;
  const target = focus ? new THREE.Vector3(0, 2.7, -8) : (state.entered ? avatar.position.clone().add(new THREE.Vector3(0, 1, 0)) : new THREE.Vector3(0, .8, -1));
  const distance = focus ? 10.5 : (state.entered ? state.distance : 20), yaw = focus ? 0 : state.yaw, pitch = focus ? .16 : state.pitch;
  const offset = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(distance);
  const desired = target.clone().add(offset); cameraProbe.set(target, offset.clone().normalize());
  const wall = cameraProbe.intersectObjects(cameraWalls)[0]; if (wall && wall.distance < distance) desired.copy(target).addScaledVector(cameraProbe.ray.direction, Math.max(1, wall.distance - .4));
  camera.position.lerp(desired, 1 - Math.exp(-dt * 6)); camera.lookAt(target);
}
function resetPose(t, moving, seated) {
  torso.position.y = seated ? -.16 : (moving ? Math.sin(t * 15) * .045 : 0); torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0); leftArm.rotation.set(0, 0, 0); rightArm.rotation.set(0, 0, 0); setEyesClosed(false);
  for (const [i, l] of me.legs.entries()) { l.rotation.x = seated ? -Math.PI / 2 : (moving ? Math.sin(t * 15 + i * Math.PI) * .5 : 0); l.position.y = seated ? .49 : .3; l.position.z = seated ? .18 : 0; }
}
function poseAvatar(t, now, moving, seated) {
  resetPose(t, moving, seated);
  const emoteOn = state.emoteEnd > now;
  if (moving) { leftArm.rotation.x = Math.sin(t * 15) * .4; rightArm.rotation.x = -leftArm.rotation.x; }
  if (instrumentObj && !state.playing) leftArm.rotation.x = -.35;
  if (state.conducting) conductPose(t);
  if (state.seated === BENCH) { const p = keyHeld.size ? Math.sin(t * 14) * .06 : 0; leftArm.rotation.x = -1.15 + p; rightArm.rotation.x = -1.15 - p; } // 피아노를 치는 팔
  if (state.held) { rightArm.rotation.x = -.9; rightArm.rotation.z = -.12; }
  if (emoteOn) {
    if (state.emote === 'raise') rightArm.rotation.z = 2.7 + Math.sin(t * 6) * .1;
    if (state.emote === 'clap') { leftArm.rotation.x = rightArm.rotation.x = -1.1; leftArm.rotation.z = .45 + Math.sin(t * 16) * .2; rightArm.rotation.z = -leftArm.rotation.z; }
    if (state.emote === 'amen') { leftArm.rotation.x = rightArm.rotation.x = -1; leftArm.rotation.z = .5; rightArm.rotation.z = -.5; }
  } else if (state.emote) { state.emote = ''; $('#emote-bubble').hidden = true; }
  if (state.sipEnd > now) { const k = Math.sin(Math.min(1, (state.sipEnd - now) / 1300) * Math.PI); rightArm.rotation.x = -.9 - 1.2 * k; rightArm.rotation.z = -.12 - .25 * k; head.rotation.x = -.18 * k; }
  if (state.playing && instrumentObj) {
    const kind = state.profile.instrument, sway = Math.sin(t * 2) * .04; torso.rotation.z = sway;
    if (kind === 'flute') { leftArm.rotation.set(-1.4, 0, .9 + Math.sin(t * 5) * .05); rightArm.rotation.set(-1.3, 0, -.35 + Math.sin(t * 5 + 1) * .05); head.rotation.y = -.2; }
    if (kind === 'clarinet') { leftArm.rotation.set(-1.25, 0, .25 + Math.sin(t * 6) * .05); rightArm.rotation.set(-1.25, 0, -.25 + Math.sin(t * 6 + 1) * .05); head.rotation.x = .05; }
    if (kind === 'violin') { leftArm.rotation.set(-1.5, 0, .3); rightArm.rotation.set(-1.1 + Math.sin(t * 3) * .12, 0, -.5 + Math.sin(t * 3) * .4); head.rotation.z = .22; }
  }
  if (state.prayStart) {
    const sec = (now - state.prayStart) / 1000; setEyesClosed(true);
    if (sec >= PRAY_SKY_SEC) { // 하늘을 향해 손을 뻗는 자세
      const sway = Math.sin(t * 1.6) * .06; leftArm.rotation.set(-.25, 0, -2.75 + sway); rightArm.rotation.set(-.25, 0, 2.75 - sway); head.rotation.x = -.3; torso.rotation.x = -.04;
    } else { // 눈을 감고 약간 고개를 숙이고 두 손을 모은 자세(엎드리지 않음)
      head.rotation.x = .38; torso.rotation.x = .06; leftArm.rotation.set(-1.25, 0, .7); rightArm.rotation.set(-1.25, 0, -.7);
    }
  }
  if (state.panicEnd > now) { // 허둥지둥
    setEyesClosed(false); leftArm.rotation.set(-.4, 0, -2.2 + Math.sin(t * 22) * .6); rightArm.rotation.set(-.4, 0, 2.2 - Math.sin(t * 22 + 1.5) * .6);
    torso.rotation.z = Math.sin(t * 16) * .1; torso.position.y = Math.abs(Math.sin(t * 14)) * .06; head.rotation.z = Math.sin(t * 18) * .15;
  }
}
function updateNpc(t) {
  const x = 13.65 + Math.sin(t * .35) * 1.85, vx = Math.cos(t * .35);
  npc.group.position.x = x; npc.group.rotation.y = vx > 0 ? Math.PI / 2 : -Math.PI / 2;
  npc.leftArm.rotation.x = Math.sin(t * 8) * .35; npc.rightArm.rotation.x = -npc.leftArm.rotation.x;
  for (const [i, l] of npc.legs.entries()) l.rotation.x = Math.sin(t * 8 + i * Math.PI) * .4;
  npc.torso.position.y = Math.sin(t * 16) * .03;
  if (state.disguised && !state.profile.teacher && avatar.position.x > 10.6 && Math.hypot(avatar.position.x - x, avatar.position.z - NPC_Z) < DETECT_RADIUS) {
    state.maskBlockedUntil = performance.now() + MASK_COOLDOWN_MS; expel('😱 교사 선생님께 들켰어요! 교사실에서 쫓겨났어요.', '누구세요?! 선생님 아닌데?!');
  }
}
function updateDoor(dt) {
  const near = Math.hypot(avatar.position.x - DOOR.x, avatar.position.z - DOOR.z) < 2.6, ok = authorized();
  state.doorOpen += ((ok && near ? 1 : 0) - state.doorOpen) * Math.min(1, dt * 6); doorPivot.rotation.y = state.doorOpen * (Math.PI / 2 - .1);
  if (!ok && Math.hypot(avatar.position.x - 9.5, avatar.position.z - DOOR.z) < 1.1 && performance.now() > state.doorWarnAt) { state.doorWarnAt = performance.now() + 5000; toast('🚪 교사실은 교사 선생님만 들어갈 수 있어요. ‘교사로 위장하기’를 눌러 볼까요?'); }
  if (!ok && avatar.position.x > 9.75) expel('교사실을 나왔어요. 교사 권한이 없어요.');
}
function updateContext(now) {
  const seated = Boolean(state.seated), near = nearestChair(), nearBench = benchFree() && benchDist() <= 1.45 && benchDist() <= near.d;
  setShown('#sit', seated || nearBench || near.d <= 1.45); { const mob = isMobile(); setText('#sit', seated ? (benchLocked() ? '🔒 일어설 수 없어요' : mob ? '일어서기' : state.seated === BENCH ? '일어서기 [Esc]' : '일어서기 [E]') : nearBench ? (mob ? '🎹 피아노 벤치에 앉기' : '🎹 피아노 벤치에 앉기 [E]') : (mob ? '의자에 앉기' : '의자에 앉기 [E]')); setShown('#play-piano', mob && state.seated === BENCH); }
  setShown('#stuck-bubble', state.stuck); // 반주자가 피아노에 잠긴 동안은 시간 제한 없이 계속 표시
  setShown('#tv-focus', Math.hypot(avatar.position.x - TV.x, avatar.position.z + 6.1) <= 6.5); setText('#tv-focus', state.tvFocus ? '↩ 시점 되돌리기' : '📺 TV 크게 보기');
  const isOrch = state.profile.part === 'orchestra' && instrumentObj;
  setShown('#perform', Boolean(isOrch)); if (isOrch) setText('#perform', state.playing ? '⏹ 연주 멈추기' : `${instruments[state.profile.instrument].icon} 연주하기`);
  const isConductor = state.profile.part === 'conductor';
  setShown('#conduct', isConductor && (state.conducting || state.conductWait || nearPodium() <= CONDUCT_RANGE)); if (isConductor) setText('#conduct', state.conducting || state.conductWait ?'⏹ 지휘 끝내기' : '🎼 지휘하기');
  setShown('#mask', !state.profile.teacher && Math.hypot(avatar.position.x - DOOR.x, avatar.position.z - DOOR.z) < 4.5); setText('#mask', state.disguised ? '🎭 가면 벗기' : '🎭 교사로 위장하기');
  setShown('#brew', avatar.position.x > 10.6 && dist(COFFEE) < 2.3 && !state.brewing);
  setShown('#take', avatar.position.x > 10.6 && dist(TABLE) < 2.2 && tableCups.length > 0 && !state.held); setText('#take', `☕ 커피 가져가기 (${tableCups.length})`);
  setShown('#drink', Boolean(state.held)); setText('#drink', state.sips >= MAX_SIPS ? '☕ 빈 컵' : `☕ 마시기 (${state.sips}/${MAX_SIPS})`);
  setShown('#trash', Boolean(state.held) && state.sips >= MAX_SIPS && avatar.position.x > 10.6 && dist(TRASH) < 1.9);
  setShown('#chip-coffee', state.coffeeRight); setShown('#chip-mask', state.disguised && !state.profile.teacher);
  const praying = state.prayStart > 0; setShown('#chip-pray', praying);
  if (praying) { const sec = (now - state.prayStart) / 1000; setText('#chip-pray', `🙏 기도 중 ${fmtTime(sec)}${sec >= PRAY_SKY_SEC ? ' · ✋ 하늘을 향해' : ''}${sec >= PRAY_COFFEE_SEC ? ' · 커피 권한 달성 ✓' : ''}`); }
  machineLed.material.emissive.setHex(state.brewing ? 0xffa030 : (state.coffeeRight ? 0x3ad06a : 0x000000));
}
function animate() {
  requestAnimationFrame(animate); const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime, now = performance.now();
  if (state.entered) {
    let moving = false, manual = false;
    if (!modalOpen() && !state.seated) {
      const conductingNow = state.conducting || state.conductWait;
      let x = joystick.x, z = joystick.y; if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      const dir = new THREE.Vector3(x, 0, z);
      if (dir.lengthSq() > .01) { manual = true; clearTarget(); dir.clampLength(0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw); }
      else if (state.target) { dir.subVectors(state.target, avatar.position); dir.y = 0; if (dir.length() < .12) { state.target = state.queue.shift() || null; if (!state.target) state.dest = null; dir.set(0, 0, 0); } else dir.normalize(); }
      if (conductingNow && dir.lengthSq() > .001) { stopConducting(); dir.set(0, 0, 0); } // 지휘 중 이동 입력 → 지휘 종료(기도·연주와 동일). 이번 프레임 이동은 건너뜀
      if (dir.lengthSq() > .001) { moving = move(dir.x * dt * 2.6, dir.z * dt * 2.6); if (moving) avatar.rotation.y = Math.atan2(dir.x, dir.z); else clearTarget(); }
    }
    if (moving) { if (state.prayStart) stopPrayer(); if (state.playing) stopPlaying(); if (state.tvFocus && manual) state.tvFocus = false; }
    marker.visible = Boolean(state.dest); if (state.dest) marker.position.set(state.dest.x, .015, state.dest.z);
    avatar.position.y = state.seated ? state.seated.y : avatar.position.y + (groundY(avatar.position.x, avatar.position.z) - avatar.position.y) * Math.min(1, dt * 14);
    updateGather(); updateConductWait(now); updateBenchLock(now); poseAvatar(t, now, moving, Boolean(state.seated)); updateDoor(dt); updateNpc(t); updateContext(now);
  }
  for (const g of noteGroups()) { g.rotation.y = t * 1.6; g.position.y = g.userData.baseY + Math.sin(t * 2 + g.userData.id) * .05; }
  updateCamera(dt); camera.updateMatrixWorld();
  if (state.entered) {
    projectLabel($('#avatar-label'), 2.05); const stuckOn = state.stuck, lift = stuckOn ? .6 : 0, emoteOn = !$('#emote-bubble').hidden;
    if (stuckOn) projectLabel($('#stuck-bubble'), 2.6); // "언제 연습하지?" — 머리 바로 위 고정, 다른 말풍선은 그 위로 밀린다
    if (emoteOn) projectLabel($('#emote-bubble'), 2.55 + lift);
    if (!$('#verse-bubble').hidden) projectLabel($('#verse-bubble'), (emoteOn ? 3.45 : 2.6) + lift);
    projectAt($('#npc-label'), npc.group.position.clone().add(new THREE.Vector3(0, 1.95, 0))); setShown('#npc-label', avatar.position.x > 7);
    if (!$('#npc-bubble').hidden) projectAt($('#npc-bubble'), npc.group.position.clone().add(new THREE.Vector3(0, 2.4, 0)));
  }
  renderer.render(scene, camera);
  screenElement.style.visibility = camera.position.clone().sub(screenObject.position).dot(new THREE.Vector3(0, 0, 1)) > 0 ? 'visible' : 'hidden'; cssRenderer.render(cssScene, camera);
}
function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); cssRenderer.setSize(innerWidth, innerHeight); applyDevice(); }

/* ---------- 입력 ---------- */
function setupInput() {
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => { if (!state.entered || modalOpen() || activePointer !== null || e.button !== 0) return; if (pianoPlayable()) { const k = pianoKeyAt(e); if (k) { pointerKeys.set(e.pointerId, k.midi); pressKey(k.midi); return; } } activePointer = e.pointerId; pointerStart = { x: e.clientX, y: e.clientY }; lastPointer = { ...pointerStart }; state.dragging = false; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== activePointer) return; const dx = e.clientX - lastPointer.x, dy = e.clientY - lastPointer.y; if (Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 6) state.dragging = true; if (state.dragging) { state.tvFocus = false; state.yaw -= dx * .006; state.pitch = THREE.MathUtils.clamp(state.pitch + dy * .004, .15, 1.25); } lastPointer = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activePointer) return; activePointer = null; if (state.dragging || modalOpen()) return;
    pointer.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const noteHit = raycaster.intersectObjects(noteHits, false)[0]; if (noteHit) { tryCollect(noteHit.object.userData.note); return; }
    const hit = raycaster.intersectObjects(floors)[0];
    if (hit && validPosition(hit.point.x, hit.point.z)) { if (seatLocked()) return; dropSeat(); state.tvFocus = false; routeTo(hit.point.clone().setY(0)); } else if (hit) toast('물건을 피해 빈 바닥을 눌러주세요.');
  });
  canvas.addEventListener('pointercancel', () => activePointer = null);
  const liftKey = (e) => { if (!pointerKeys.has(e.pointerId)) return; releaseKey(pointerKeys.get(e.pointerId)); pointerKeys.delete(e.pointerId); };
  window.addEventListener('pointerup', liftKey); window.addEventListener('pointercancel', liftKey);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); state.distance = THREE.MathUtils.clamp(state.distance + e.deltaY * .012, 4, 21); }, { passive: false });
  window.addEventListener('keydown', (e) => { if (modalOpen() || !state.entered) return; if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (pianoPlayable() && KEYBOARD_MAP[e.code] && !e.ctrlKey && !e.metaKey && !e.altKey) { if (!e.repeat) { kbDown.add(e.code); pressKey(KEYBOARD_MAP[e.code]); } return; } if (e.code === 'Escape' && state.seated && !e.repeat) { toggleSit(); return; } keys.add(e.code); if (e.code === 'KeyE' && !e.repeat) toggleSit(); }); // 벤치에 앉으면 E는 피아노 건반(D#4) — 일어서기는 버튼/Esc
  window.addEventListener('keyup', (e) => { keys.delete(e.code); if (kbDown.delete(e.code)) releaseKey(KEYBOARD_MAP[e.code]); }); window.addEventListener('blur', () => { releaseAllKeys(); keys.clear(); joystick.set(0, 0); activePointer = null; resetStick(); });
  const joy = $('#joystick'); let joyId = null;
  function resetStick() { joystick.set(0, 0); $('#stick').style.transform = ''; joyId = null; }
  function updateJoy(e) { const r = joy.getBoundingClientRect(); joystick.set((e.clientX - r.left - r.width / 2) / 30, (e.clientY - r.top - r.height / 2) / 30).clampLength(0, 1); $('#stick').style.transform = `translate(${joystick.x * 24}px,${joystick.y * 24}px)`; }
  joy.addEventListener('pointerdown', (e) => { if (modalOpen() || !state.entered || joyId !== null) return; joyId = e.pointerId; joy.setPointerCapture(e.pointerId); if (!seatLocked()) dropSeat(); updateJoy(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) updateJoy(e); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) joy.addEventListener(type, resetStick);
}

/* ---------- 곡 목록 (기존) ---------- */
/* 오늘의 찬양은 랜덤 찬송가로 변경됨(2026-11-11): pickRandomHymn()이 열릴 때마다 뽑는다. */

/* ---------- 공과 5단계 ---------- */
function renderLesson() {
  const l = state.lessonMeta, body = $('#lesson-body');
  if (!LESSON_STEPS.length) {
    $('#lesson-eyebrow').textContent = '공과'; $('#lesson-title').textContent = '공과'; body.textContent = LESSON_EMPTY; body.classList.add('empty'); body.classList.remove('img');
    $('#lesson-dots').replaceChildren(); $('#lesson-prev').disabled = true; $('#lesson-next').textContent = '닫기'; return;
  }
  const i = state.lessonStep, step = LESSON_STEPS[i], n = LESSON_STEPS.length;
  $('#lesson-eyebrow').textContent = `공과 ${l.lesson_no || ''} · ${i + 1} / ${n}`; $('#lesson-title').textContent = `${l.title || '공과'} — ${step.title}`;
  body.classList.remove('empty'); body.classList.toggle('img', 'img' in step);
  if ('img' in step) {
    const img = document.createElement('img'); img.className = 'lesson-img'; img.alt = '말씀정리';
    img.onerror = () => { body.classList.add('empty'); body.classList.remove('img'); body.textContent = '말씀정리 이미지를 불러오지 못했어요'; };
    body.replaceChildren(img); if (step.img) img.src = step.img; else img.onerror();
  } else { body.textContent = step.body || LESSON_EMPTY; body.classList.toggle('empty', !step.body); }
  $('#lesson-dots').replaceChildren(...LESSON_STEPS.map((_, k) => { const d = document.createElement('button'); d.className = `dot${k === i ? ' on' : ''}${k < i ? ' past' : ''}`; d.textContent = k + 1; d.setAttribute('aria-label', `${k + 1}단계`); d.onclick = () => { state.lessonStep = k; renderLesson(); }; return d; }));
  $('#lesson-prev').disabled = i === 0; $('#lesson-next').textContent = i === n - 1 ? '공과 마치기 ✓' : '다음 →';
}

/* ---------- TV (IFrame API 없이: iframe 직접 삽입 + src 교체 + postMessage) ---------- */
const screenElement = document.createElement('div');
screenElement.className = 'screen-dom';
screenElement.innerHTML = '<iframe id="tv-frame" title="방 안 TV" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><div class="screen-poster"><small>GRACE · WORSHIP · TOGETHER</small><strong>찬양으로 채우는 시간</strong><p id="poster-msg">여의도순복음교회 중등2부 에셀찬양대</p></div>';
const tvFrame = screenElement.querySelector('#tv-frame'), poster = screenElement.querySelector('.screen-poster');
const tv = { data: null, mode: 'past', current: null, chain: null, loaded: false, volume: 40, videoId: null };
function embedSrc(spec) {
  // 최소 임베드 (2026-11-11): rel=0, playsinline=1만 사용. enablejsapi/origin/autoplay는 공개 링크에서 플레이어를 멈추게 해 제거.
  // 재생 시작은 리모컨 ▶가 autoplay=1을 붙여 다시 로드하는 방식(playUrl)으로 한다.
  const p = new URLSearchParams({ rel: '0', playsinline: '1' });
  if (spec.kind === 'list') { p.set('listType', 'playlist'); p.set('list', spec.list); return `https://www.youtube.com/embed/${spec.id || 'videoseries'}?${p}`; }
  if (spec.queue?.length) p.set('playlist', spec.queue.join(','));
  if (spec.start > 0) p.set('start', spec.start); if (spec.end > (spec.start || 0)) p.set('end', spec.end);
  return `https://www.youtube.com/embed/${spec.id}?${p}`;
}
function playUrl(spec) { return `${embedSrc(spec)}&autoplay=1`; }
function tvCommand(func, args = []) { const w = tvFrame.contentWindow; if (!tv.loaded || !w) return false; w.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube.com'); return true; }
function mpTv(action, autoplay) { if (!MP.suppressTvBroadcast) MP.sendTv(action, autoplay); } // 원격 적용 중에는 다시 보내지 않는다
function tvStatus(text) { $('#tv-status').textContent = text; }
function watchUrl(id) { return `https://www.youtube.com/watch?v=${id}`; }
function loadTv(spec, { autoplay = false, title = '', openUrl = '' } = {}) {
  tv.current = spec; tv.loaded = false; tv.videoId = spec.id || null; poster.hidden = true;
  tvFrame.src = embedSrc(spec);
  $('#tv-title').textContent = title || (spec.kind === 'list' ? 'YouTube 재생목록' : 'YouTube 영상');
  $('#tv-open').href = openUrl || (spec.kind === 'list' ? (spec.id ? `${watchUrl(spec.id)}&list=${spec.list}` : `https://www.youtube.com/playlist?list=${spec.list}`) : watchUrl(spec.id));
  tvStatus('영상을 눌러 재생해 주세요.');
}
function clearTv(message) {
  tv.current = null; tv.loaded = false; tvFrame.src = 'about:blank'; poster.hidden = false; $('#poster-msg').textContent = message;
  $('#tv-title').textContent = '재생 대기 중'; tvStatus(message); $('#tv-open').href = 'https://www.youtube.com/';
}
function modeVideos(mode = tv.mode) { return tv.data?.modes?.[mode]?.videos || []; }
function playIndex(i, autoplay = true) {
  const vids = modeVideos(); if (!vids.length) return; const idx = ((i % vids.length) + vids.length) % vids.length, v = vids[idx];
  if (tv.mode === 'playlist') { // 선택한 곡부터 시작해 끝까지, 이어서 앞 곡들까지 연달아 재생
    const order = [...vids.slice(idx), ...vids.slice(0, idx)];
    tv.chain = order; loadTv({ kind: 'video', id: order[0].id, queue: order.slice(1).map((x) => x.id), start: order[0].start, end: order[0].end }, { autoplay, title: `${tv.data.modes.playlist.title} · ${v.title}`, openUrl: tv.data.modes.playlist.url });
  } else { tv.chain = null; loadTv({ kind: 'video', id: v.id, start: v.start, end: v.end }, { autoplay, title: v.title }); }
  tv.index = idx; renderTvList(); mpTv('load', autoplay);
}
function renderTvList() {
  const data = tv.data?.modes?.[tv.mode], vids = data?.videos || [], root = $('#tv-list');
  $('#mode-info').textContent = data ? `${data.description || ''}${tv.mode === 'playlist' ? ` (${data.title})` : ''}` : '';
  document.querySelectorAll('[data-mode]').forEach((b) => { const on = b.dataset.mode === tv.mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  if (!vids.length) { root.innerHTML = '<p class="empty-list"></p>'; root.firstChild.textContent = tv.mode === 'weekly' ? '이번 주 찬양 영상이 아직 지정되지 않았어요. 곧 올라와요.' : '목록이 비어 있어요.'; return; }
  root.replaceChildren(...vids.map((v, i) => { const b = document.createElement('button'); b.className = `tv-item${v.id === tv.videoId ? ' playing' : ''}`; const n = document.createElement('span'); n.className = 'num'; n.textContent = String(i + 1).padStart(2, '0'); const t = document.createElement('span'); t.textContent = v.title; b.append(n, t); b.onclick = () => playIndex(i, true); return b; }));
}
function setMode(mode) {
  tv.mode = mode; renderTvList(); const vids = modeVideos();
  if (!vids.length) { clearTv(mode === 'weekly' ? '이번 주 찬양 영상이 아직 지정되지 않았어요' : '재생할 영상이 없어요'); return; }
  playIndex(0, false);
}
function tvStep(delta) {
  playIndex((tv.index || 0) + delta, true);
}
function setupTv() {
  tvFrame.addEventListener('load', () => {
    if (tvFrame.src === 'about:blank' || !tvFrame.getAttribute('src')) return; tv.loaded = true;
  });
  window.addEventListener('message', (e) => { // YouTube가 보내는 상태·오류 메시지(실패해도 재생 제어에는 영향 없음)
    if (e.origin !== 'https://www.youtube.com' || e.source !== tvFrame.contentWindow) return;
    let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (d?.event === 'onError') tvStatus('이 영상은 방 안 TV에서 재생할 수 없어요(임베드 제한 등). ‘YouTube에서 열기’로 봐 주세요.');
    const info = d?.info; if (!info || typeof info !== 'object') return;
    if (info.videoData?.video_id && info.videoData.video_id !== tv.videoId) { tv.videoId = info.videoData.video_id; $('#tv-open').href = watchUrl(tv.videoId); const hit = modeVideos().find((v) => v.id === tv.videoId); if (hit && tv.mode === 'playlist') $('#tv-title').textContent = `${tv.data.modes.playlist.title} · ${hit.title}`; renderTvList(); }
    if (typeof info.playerState === 'number') tvStatus({ 1: '재생 중', 2: '일시정지', 3: '불러오는 중…', 0: '끝났어요', 5: '영상을 눌러 재생해 주세요.' }[info.playerState] ?? $('#tv-status').textContent);
    if (info.playerState === 0) mainPraiseEnded();
    clearTimeout(tv.stallTimer); if (info.playerState === 3) tv.stallTimer = setTimeout(() => tvStatus('영상을 직접 눌러 재생해 주세요.'), 8000);
  });
  $('#tv-play').onclick = () => { if (!tv.current) { toast('먼저 목록에서 영상을 골라 주세요.'); return; } tvFrame.src = playUrl(tv.current); tv.loaded = false; tvStatus('재생을 시작해요… 안 나오면 영상을 직접 눌러 주세요.'); mpTv('play', true); };
  $('#tv-pause').hidden = true; $('#tv-volume').closest('label').style.display = 'none'; /* .vol{display:flex}가 hidden을 덮어써서 style로 숨김 */ // postMessage 제어 불가 → 영상 화면을 직접 눌러 일시정지/음량 조절
  $('#tv-prev').onclick = () => tvStep(-1); $('#tv-next').onclick = () => tvStep(1);
  document.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => setMode(b.dataset.mode));
  $('#remote-toggle').onclick = () => { const c = $('#remote').classList.toggle('collapsed'); $('#remote-toggle').setAttribute('aria-expanded', String(!c)); };
}
async function initTv() {
  try { const response = await fetch('./playlist.json'); if (!response.ok) throw new Error('playlist'); tv.data = await response.json(); setMode('past'); }
  catch { clearTv('playlist.json을 읽지 못했어요. HTTP 서버와 JSON 형식을 확인해 주세요.'); }
}

/* ---------- UI 연결 ---------- */
function setupUI() {
  for (const dialog of document.querySelectorAll('dialog')) { dialog.querySelector('.close')?.addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => keys.clear()); }
  $('#entry').addEventListener('cancel', (e) => e.preventDefault());
  draw = randomProfile(); showDraw();
  $('#entry-form').addEventListener('submit', (e) => { e.preventDefault(); enter(draw); });
  const saved = readSaved(); if (saved) { $('#enter-saved').hidden = false; $('#enter-saved').onclick = () => enter(saved); }
  $('#identity').onclick = () => { if (!state.entered) return; renderProfileForm(); openDialog('#profile'); };
  $('#profile-parts').addEventListener('change', syncInstrumentField); $('#profile-form').addEventListener('submit', saveProfile);
  $('#profile-random').onclick = () => { const r = randomProfile(); $('#profile-name').value = r.nickname; const radio = document.querySelector(`input[name="pf-part"][value="${r.part}"]`); radio.checked = true; if (r.instrument) document.querySelector(`input[name="pf-inst"][value="${r.instrument}"]`).checked = true; syncInstrumentField(); };
  document.querySelectorAll('[data-emote]').forEach((b) => b.onclick = () => emote(b.dataset.emote));
  $('#pray-toggle').onclick = togglePrayer; $('#sit').onclick = toggleSit; $('#play-piano').onclick = openTouchPiano; $('#piano-keys').addEventListener('close', () => { for (const k of $('#pk-board').querySelectorAll('.down')) k.classList.remove('down'); releaseAllKeys(); }); $('#perform').onclick = () => state.playing ? stopPlaying() : startPlaying(); $('#conduct').onclick = () => state.conducting || state.conductWait ? stopConducting() : startConducting();
  $('#tv-focus').onclick = () => { state.tvFocus = !state.tvFocus; }; $('#mask').onclick = toggleMask; $('#brew').onclick = openBrew; $('#take').onclick = takeCup; $('#drink').onclick = drink; $('#trash').onclick = trashCup;
  $('#coffee-drink').onclick = () => brew(true); $('#coffee-donate').onclick = () => brew(false);
  $('#songs-open').onclick = () => { if (state.entered) { pickRandomHymn(); openDialog('#songs'); } }; $('#hymn-again').onclick = () => pickRandomHymn(); $('#hymn-sheet').onclick = () => openHymnSheet(); $('#verse-open').onclick = () => { if (state.entered) openDialog('#verse'); };
  $('#lesson-open').onclick = () => { if (!state.entered) return; refreshLesson(); renderLesson(); openDialog('#lesson'); };
  $('#lesson-prev').onclick = () => { state.lessonStep = Math.max(0, state.lessonStep - 1); renderLesson(); };
  $('#lesson-next').onclick = () => { if (state.lessonStep >= LESSON_STEPS.length - 1) { $('#lesson').close(); if (LESSON_STEPS.length) toast('📖 공과 5단계를 모두 마쳤어요. 수고했어요!'); state.lessonStep = 0; } else { state.lessonStep++; renderLesson(); } };
  $('#treasure-pill').onclick = () => { renderTreasure(); openDialog('#treasure'); };
  $('#help').onclick = () => openDialog('#guide');
  document.addEventListener('visibilitychange', () => { keys.clear(); joystick.set(0, 0); });
  renderVerses(); loadVerseSheet(); loadPrayers(); loadLessons().then(refreshLesson); renderTreasure(); setupTv(); $('#entry').showModal();
  setInterval(() => { if (board) drawBoard(); }, 60000); // 일요일 12시 경과 시 자동 교체
}
function init() {
  applyDevice(); scene = new THREE.Scene(); cssScene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, .1, 100); camera.position.set(9, 14, 23);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  cssRenderer = new CSS3DRenderer(); Object.assign(cssRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
  $('#scene').append(renderer.domElement, cssRenderer.domElement); // WebGL이 아래, CSS(TV)가 위 (CSS 레이어는 pointer-events:none, .screen-dom만 auto)
  makeRoom(); makeAvatar(); MP.attach({ scene, camera, THREE, buildPerson, parts, state, getAvatar: () => avatar, chairs, routeTo, onRemoteConduct: conductSignal, playIndex, setMode, tvStep, tvCommand, toast, getTv: () => ({ mode: tv.mode, index: tv.index ?? 0, videoId: tv.videoId }) }); scene.updateMatrixWorld(true); resize(); setupInput(); setupUI();
  $('#enter-button').disabled = false; $('#enter-button').textContent = '연습실 들어가기 →';
  window.addEventListener('resize', resize); renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); toast('3D 화면 연결이 끊겼어요. 페이지를 새로고침해 주세요.'); });
  initTv(); animate();
}
try { init(); } catch (error) { console.error(error); $('#entry')?.close(); $('#toast').hidden = false; $('#toast').textContent = '3D 연습실을 열지 못했어요. WebGL 지원 브라우저에서 새로고침해 주세요.'; }
