// multiplayer.js — 멀티플레이 (실시간 Presence·Broadcast) 모듈.
// ---------------------------------------------------------------------------
// 외부 라이브러리 없이 브라우저 내장 WebSocket + JSON으로 Realtime 서버(Phoenix channels, vsn 1.0.0)에
// 직접 접속한다. 저장 데이터는 없고 presence/broadcast(휘발성)만 쓴다.
// 설정(url·anonKey)이 비어 있으면 모든 메서드가 no-op이라 1인 모드는 그대로 동작한다.
// ---------------------------------------------------------------------------

// Vercel 멀티플레이를 켜려면: url에 Realtime 프로젝트 URL(Project URL)을, anonKey에 publishable key를 넣는다.
// 두 값이 모두 비어 있으면 1인(싱글) 모드로 동작한다.
const MP_CONFIG = {
  url: 'https://fhgvaeylpeacsbfnavyt.supabase.co',
  anonKey: 'sb_publishable_115NfIgoxpPA7fTx4wQSNQ_xcLLqbMF', // 공개용 publishable key
  channel: 'ezer-choir-room', // 방 이름(채널명). 그대로 두면 된다.
};

const MP_TRACK_MS = 100;   // 내 위치·상태를 보내는 간격(초당 10번)
const MP_MAX_PEOPLE = 30;  // 정원(의자 30석)
const MP_HEARTBEAT_MS = 30000;
const MP_BACKOFF = [1000, 2000, 4000, 10000]; // 재접속 지수 백오프(최대 10초)

const EMOJI = { amen: '🙏', clap: '👏', raise: '✋' };
const _angleDelta = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const _clip = (text, max = 36) => (text.length > max ? `${text.slice(0, max).trimEnd()}...` : text);

export const MP = {
  active: false,               // 연결됨?
  configured: Boolean(MP_CONFIG.url && MP_CONFIG.anonKey),
  suppressTvBroadcast: false, // 원격 TV 이벤트를 적용 중 — 다시 보내지 않는다
  _id: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  _ctx: null,
  _ws: null,
  _topic: `realtime:${MP_CONFIG.channel}`,
  _ref: 0,
  _joinRef: null,
  _presence: new Map(), // presenceKey -> metas[] (phx_ref 포함)
  _retry: 0,
  _retryTimer: 0,
  _hbTimer: 0,
  _hbPending: null,
  _closing: false,
  _loopsStarted: false,
  _unloadBound: false,
  _announced: false,
  _connecting: false,
  _subscribed: false,
  _remotes: new Map(),  // presenceKey -> { person, label, bubble, target, state, bubbleText, bubbleUntil }
  _claims: new Map(),   // 자리 인덱스 -> presenceKey
  _mySeat: null,
  _autoSeated: false,   // 지휘 신호로 자동 앉은 상태
  _labelLayer: null,
  _countBadge: null,
  _trackTimer: 0,
  _raf: 0,
  _lastPayload: '',

  /* ---------- 연결 ---------- */
  attach(ctx) {
    this._ctx = ctx;
    if (!this.configured) { console.info('[MP] 설정 없음 — 1인 모드로 동작합니다.'); return; }
    const layer = document.createElement('div');
    layer.id = 'mp-layer';
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3;';
    document.querySelector('#scene')?.append(layer);
    this._labelLayer = layer;
    const st = document.createElement('style');
    st.textContent = '#mp-layer .mp-label{position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font-size:10px;background:#ffffffe0;padding:5px 10px;border-radius:16px;color:#4c5545}#mp-layer .mp-bubble{position:absolute;transform:translate(-50%,-100%);font-size:33px;background:#fff;border-radius:50%;padding:10px;box-shadow:0 3px 15px #0001}#mp-layer .mp-bubble.stuck{font-size:13px;font-weight:600;line-height:1.5;border-radius:14px;padding:7px 13px;white-space:nowrap;color:#8a3b25}#mp-layer .mp-bubble.verse{font-size:12px;line-height:1.5;border-radius:12px;padding:8px 12px;max-width:230px;white-space:normal;text-align:center}#mp-count{font-size:11px;background:#fff9;padding:8px 12px;border:1px solid #fff8;border-radius:24px;color:#626c60}';
    document.head.append(st);
  },

  onEnter() {
    if (!this.configured || this.active || this._connecting) return;
    this._connecting = true; this._closing = false;
    this._open();
  },

  _wsUrl() {
    const host = MP_CONFIG.url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `wss://${host}/realtime/v1/websocket?apikey=${encodeURIComponent(MP_CONFIG.anonKey)}&vsn=1.0.0`;
  },

  _open() {
    let ws;
    try { ws = new WebSocket(this._wsUrl()); } catch (e) { this._failed(e); return; }
    this._ws = ws;
    ws.onopen = () => {
      if (this._ws !== ws) return;
      this._hbTimer = setInterval(() => this._heartbeat(), MP_HEARTBEAT_MS);
      this._join();
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (this._ws === ws) this._onMessage(m);
    };
    ws.onerror = () => { /* onclose에서 처리 */ };
    ws.onclose = () => { if (this._ws === ws) this._onClosed(); };
  },

  _push(topic, event, payload, joinRef) {
    if (!this._ws || this._ws.readyState !== 1) return null;
    const ref = String(++this._ref);
    const msg = { topic, event, payload, ref };
    if (joinRef) msg.join_ref = joinRef;
    try { this._ws.send(JSON.stringify(msg)); } catch { return null; }
    return ref;
  },

  _join() {
    this._subscribed = false;
    const ref = String(++this._ref);
    this._joinRef = ref;
    const msg = {
      topic: this._topic, event: 'phx_join', ref, join_ref: ref,
      payload: { config: { broadcast: { self: true, ack: false }, presence: { key: this._id }, postgres_changes: [], private: false } },
    };
    try { this._ws.send(JSON.stringify(msg)); } catch { /* onclose가 재접속 */ }
  },

  _heartbeat() {
    if (this._hbPending) { try { this._ws?.close(); } catch { /* 무시 */ } return; } // 직전 heartbeat 무응답 → 끊고 재접속
    this._hbPending = this._push('phoenix', 'heartbeat', {});
  },

  _onMessage(m) {
    if (m.topic === 'phoenix') { if (m.event === 'phx_reply' && m.ref === this._hbPending) this._hbPending = null; return; }
    if (m.topic !== this._topic) return;
    const p = m.payload || {};
    switch (m.event) {
      case 'phx_reply':
        if (m.ref === this._joinRef) {
          if (p.status === 'ok') this._onJoined();
          else { console.warn('[MP] 입장 실패', p); try { this._ws?.close(); } catch { /* 무시 */ } }
        }
        break;
      case 'phx_error': case 'phx_close':
        try { this._ws?.close(); } catch { /* 무시 */ }
        break;
      case 'presence_state': this._presence.clear(); this._applyPresence(p, {}); this._onSync(); break;
      case 'presence_diff': this._applyPresence(p.joins || {}, p.leaves || {}); this._onSync(); break;
      case 'broadcast': this._onBroadcast(p.event, p.payload); break;
      default: break;
    }
  },

  _applyPresence(joins, leaves) {
    for (const [key, v] of Object.entries(joins)) {
      const list = this._presence.get(key) || [];
      this._presence.set(key, list.concat(v?.metas || []));
    }
    for (const [key, v] of Object.entries(leaves)) {
      const list = this._presence.get(key); if (!list) continue;
      const gone = new Set((v?.metas || []).map((x) => x.phx_ref));
      const rest = list.filter((x) => !gone.has(x.phx_ref));
      if (rest.length) this._presence.set(key, rest); else this._presence.delete(key);
    }
  },

  _onBroadcast(event, payload) {
    if (!payload) return;
    switch (event) {
      case 'emote': this._onEmote(payload); break;
      case 'verse': this._onVerse(payload); break;
      case 'tv': this._onTv(payload); break;
      case 'seat': this._onSeat(payload); break;
      case 'conduct': this._onConduct(payload); break;
      default: break;
    }
  },

  _onJoined() {
    this._retry = 0;
    this._subscribed = true;
    this._track();
    this._lastPayload = JSON.stringify(this._payload());
    if (this._mySeat != null) this._bc('seat', { id: this._id, seat: this._mySeat }); // 재접속 뒤 내 자리 재전송
    this.active = true; this._connecting = false;
    if (!this._loopsStarted) this._startLoops();
    this._showCount();
    const badge = document.querySelector('.local-badge');
    if (badge) badge.textContent = '온라인 · 함께 있는 공간';
    if (!this._announced) this._ctx.toast?.('👥 멀티플레이에 연결됐어요. 같은 방에 있는 사람들이 보여요.');
    this._announced = true;
  },

  _onClosed() {
    clearInterval(this._hbTimer); this._hbPending = null;
    this._ws = null; this._subscribed = false;
    if (this._closing) return;
    this._failed();
  },

  _failed(e) {
    if (e) console.warn('[MP] 연결 실패', e);
    if (!this._announced && this._retry === 0) this._ctx.toast?.('멀티플레이 연결에 실패했어요. 계속 다시 시도해요.');
    const wait = MP_BACKOFF[Math.min(this._retry, MP_BACKOFF.length - 1)];
    this._retry++;
    clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => { if (!this._closing) this._open(); }, wait);
  },

  _track() { return this._push(this._topic, 'presence', { type: 'presence', event: 'track', payload: this._payload() }, this._joinRef); },
  _bc(event, payload) { return this._push(this._topic, 'broadcast', { type: 'broadcast', event, payload }, this._joinRef); },

  disconnect() {
    this._closing = true;
    clearInterval(this._trackTimer); clearInterval(this._hbTimer); clearTimeout(this._retryTimer); cancelAnimationFrame(this._raf);
    this._loopsStarted = false;
    try { this._push(this._topic, 'presence', { type: 'presence', event: 'untrack' }, this._joinRef); this._ws?.close(); } catch { /* 무시 */ }
    this._ws = null;
    for (const key of [...this._remotes.keys()]) this._removeRemote(key);
    this._presence.clear();
    this._subscribed = false; this.active = false; this._connecting = false;
  },

  /* ---------- Presence(위치·상태) ---------- */
  _payload() {
    const { state, getAvatar, parts } = this._ctx;
    const p = state.profile, a = getAvatar();
    return {
      id: this._id, name: p?.nickname || '방문자', part: p?.part || 'soprano',
      color: parts[p?.part]?.color ?? 0xd0899a,
      inst: p?.instrument || null, teacher: Boolean(p?.teacher),
      x: +a.position.x.toFixed(2), y: +a.position.y.toFixed(2), z: +a.position.z.toFixed(2),
      rot: +a.rotation.y.toFixed(2),
      seat: this._mySeat, cond: state.conducting, play: state.playing,
      pray: state.prayStart > 0, disg: state.disguised, stuck: Boolean(state.stuck),
    };
  },

  _startLoops() {
    this._loopsStarted = true;
    this._trackTimer = setInterval(() => {
      if (!this._subscribed || !this._ctx.state.entered) return;
      const s = JSON.stringify(this._payload());
      if (s !== this._lastPayload) { this._lastPayload = s; this._track(); }
    }, MP_TRACK_MS);
    const loop = () => { this._raf = requestAnimationFrame(loop); this._renderRemotes(); };
    loop();
    if (!this._unloadBound) {
      this._unloadBound = true;
      window.addEventListener('beforeunload', () => { try { this._push(this._topic, 'presence', { type: 'presence', event: 'untrack' }, this._joinRef); this._ws?.close(); } catch { /* 무시 */ } });
    }
  },

  _onSync() {
    const seen = new Set();
    for (const [key, arr] of this._presence) {
      if (key === this._id || !arr.length) continue;
      const s = arr[arr.length - 1];
      seen.add(key);
      if (!this._remotes.has(key)) this._makeRemote(key, s);
      else this._updateRemote(key, s);
    }
    for (const key of [...this._remotes.keys()]) if (!seen.has(key)) this._removeRemote(key);
    for (const [seat, key] of [...this._claims.entries()]) if (key !== this._id && !seen.has(key)) this._claims.delete(seat);
    this._updateCount(seen.size + 1);
  },

  /* ---------- 다른 사람 아바타 ---------- */
  _makeRemote(key, s) {
    const { scene, buildPerson } = this._ctx;
    const person = buildPerson({ color: s.color ?? 0xd0899a, hair: 0x4a3f30, skin: 0xe1be99, pants: 0x5d6354 });
    person.group.position.set(s.x, s.y, s.z);
    person.group.rotation.y = s.rot;
    scene.add(person.group);
    const label = document.createElement('div');
    label.className = 'mp-label'; label.textContent = s.name;
    const bubble = document.createElement('div');
    bubble.className = 'mp-bubble'; bubble.hidden = true;
    const stuck = document.createElement('div'); // 피아노에 잠긴 반주자 머리 위 "언제 연습하지?" (일반 말풍선과 별개로 계속 표시)
    stuck.className = 'mp-bubble stuck'; stuck.textContent = '언제 연습하지?'; stuck.hidden = true;
    this._labelLayer.append(label, bubble, stuck);
    this._remotes.set(key, { person, label, bubble, stuck, target: { x: s.x, y: s.y, z: s.z, rot: s.rot }, state: s, bubbleText: '', bubbleUntil: 0 });
  },

  _updateRemote(key, s) {
    const r = this._remotes.get(key); if (!r) return;
    r.target = { x: s.x, y: s.y, z: s.z, rot: s.rot };
    r.state = s;
    if (r.label.textContent !== s.name) r.label.textContent = s.name;
    const seated = s.seat != null;
    for (const [i, l] of r.person.legs.entries()) { l.rotation.x = seated ? -Math.PI / 2 : 0; l.position.y = seated ? .49 : .3; l.position.z = seated ? .18 : 0; }
    r.person.torso.position.y = seated ? -.16 : 0;
    for (const e of r.person.eyesOpen) e.visible = !s.pray;
    for (const e of r.person.eyesClosed) e.visible = s.pray;
  },

  _removeRemote(key) {
    const r = this._remotes.get(key); if (!r) return;
    r.person.group.removeFromParent(); r.label.remove(); r.bubble.remove(); r.stuck.remove();
    this._remotes.delete(key);
    this._ctx.onRemoteConduct?.(key, 'stop'); // 지휘 중에 나갔다면 그 사람의 지휘 타이머도 끊는다
  },

  _renderRemotes() {
    const now = performance.now();
    for (const r of this._remotes.values()) {
      const g = r.person.group, t = r.target;
      g.position.x += (t.x - g.position.x) * .35;
      g.position.y += (t.y - g.position.y) * .35;
      g.position.z += (t.z - g.position.z) * .35;
      g.rotation.y += _angleDelta(g.rotation.y, t.rot) * .35;
      let text = '', verse = false;
      if (r.bubbleUntil > now) { text = r.bubbleText; verse = r.bubbleText.length > 4; }
      else if (r.state.pray) text = '🙏';
      else if (r.state.play) text = '🎻';
      else if (r.state.cond) text = '🎼';
      else if (r.state.disg) text = '🎭';
      r.bubble.hidden = !text;
      if (text) { r.bubble.textContent = text; r.bubble.classList.toggle('verse', verse); }
      const stuck = Boolean(r.state.stuck); r.stuck.hidden = !stuck; // 잠긴 동안 시간 제한 없이 항상 표시, 다른 말풍선은 그 위로 밀린다
      this._project(r.label, g.position.x, g.position.y + 2.05, g.position.z);
      if (stuck) this._project(r.stuck, g.position.x, g.position.y + 2.6, g.position.z);
      if (text) this._project(r.bubble, g.position.x, g.position.y + 2.6 + (stuck ? .6 : 0), g.position.z);
    }
  },

  _project(el, x, y, z) {
    const { THREE, camera } = this._ctx;
    const v = new THREE.Vector3(x, y, z).project(camera);
    el.style.left = `${(v.x * .5 + .5) * innerWidth}px`;
    el.style.top = `${(-v.y * .5 + .5) * innerHeight}px`;
    el.style.visibility = (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2) ? 'hidden' : 'visible';
  },

  _showTemp(key, text, ms) {
    const r = this._remotes.get(key); if (!r) return;
    r.bubbleText = text; r.bubbleUntil = performance.now() + ms;
  },

  /* ---------- 접속자 수 표시 ---------- */
  _showCount() {
    if (this._countBadge) return;
    const b = document.createElement('span');
    b.id = 'mp-count'; b.textContent = '👥 1명';
    document.querySelector('header')?.append(b);
    this._countBadge = b;
  },
  _updateCount(n) { if (this._countBadge) this._countBadge.textContent = `👥 ${n}명`; },

  /* ---------- 이모트 · 말씀 (한 번씩 보내는 이벤트) ---------- */
  sendEmote(type) {
    if (!this._subscribed) return;
    this._bc('emote', { id: this._id, type });
  },
  _onEmote({ id, type }) { if (id !== this._id) this._showTemp(id, EMOJI[type] || '🙏', 3000); },

  sendVerse(v) {
    if (!this._subscribed) return;
    this._bc('verse', { id: this._id, ref: v.ref, text: v.text });
  },
  _onVerse({ id, ref, text }) {
    if (id === this._id) return;
    this._showTemp(id, `${_clip(text)} — ${ref}`, 7000);
  },

  /* ---------- TV 동기화 (누가 바꾸든 다 같이 같은 영상) ---------- */
  sendTv(action, autoplay = true) {
    if (!this._subscribed) return;
    const tv = this._ctx.getTv();
    const playing = action === 'pause' ? false : action === 'play' ? true : autoplay;
    this._bc('tv', { id: this._id, action, mode: tv.mode, index: tv.index, videoId: tv.videoId, playing });
  },
  _onTv(p) {
    if (!this._ctx || p.id === this._id) return;
    const { setMode, playIndex, tvStep, tvCommand, getTv } = this._ctx;
    this.suppressTvBroadcast = true;
    try {
      if (p.action === 'load') {
        if (p.mode && p.mode !== getTv().mode) setMode(p.mode);
        playIndex(p.index ?? 0, p.playing !== false);
      } else if (p.action === 'next' || p.action === 'prev') {
        tvStep(p.action === 'next' ? 1 : -1);
      } else if (p.action === 'play') {
        if (!tvCommand('playVideo')) setTimeout(() => tvCommand('playVideo'), 1200);
      } else if (p.action === 'pause') tvCommand('pauseVideo');
    } finally { this.suppressTvBroadcast = false; }
  },

  /* ---------- 자리 차지 (선착순 · 경합은 키가 작은 쪽이 이김) ---------- */
  claimSeat(i) {
    if (i == null || i < 0) return;
    this._mySeat = i;
    this._claims.set(i, this._id);
    if (this._subscribed) this._bc('seat', { id: this._id, seat: i });
  },
  releaseSeat() {
    if (this._mySeat == null) return;
    const i = this._mySeat; this._mySeat = null; this._autoSeated = false;
    this._claims.delete(i);
    if (this._subscribed) this._bc('seat', { id: this._id, seat: null });
  },
  isSeatClaimed(i) { return this._claims.has(i); },
  hasSeat() { return this._mySeat != null; }, // 자리 경합에서 졌는지 확인용(피아노 벤치)

  _onSeat({ id, seat }) {
    if (id === this._id) return;
    for (const [s, k] of [...this._claims.entries()]) if (k === id) this._claims.delete(s);
    if (seat == null) return;
    const holder = this._claims.get(seat);
    if (holder === this._id) {
      if (id < this._id) { // 경합에서 짐 — 자리를 내주고(자동 앉음이면) 다른 자리를 찾는다
        this._claims.set(seat, id);
        const wasAuto = this._autoSeated;
        this._mySeat = null; this._autoSeated = false;
        this._ctx.toast?.('앗, 같은 자리를 먼저 차지한 사람이 있어요. 다른 자리를 찾아요.');
        if (wasAuto) this._autoSeat();
      } else { // 내가 이김 — 내 차지를 다시 알려 상대가 양보하게 한다
        this._bc('seat', { id: this._id, seat });
      }
    } else if (holder == null) this._claims.set(seat, id);
  },

  _autoSeat() {
    const { chairs, getAvatar, routeTo, THREE, state } = this._ctx;
    const a = getAvatar().position;
    let best = -1, bd = Infinity;
    chairs.forEach((c, i) => {
      if (this._claims.has(i)) return;
      const d = Math.hypot(a.x - c.x, a.z - c.z);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) { this._ctx.toast?.('빈 자리가 없어요. 서서 찬양해요.'); return; }
    this._autoSeated = true;
    this.claimSeat(best);
    const c = chairs[best];
    state.seated = null;
    routeTo(new THREE.Vector3(c.x, 0, c.z));
  },

  /* ---------- 지휘 신호 ---------- */
  sendConduct(kind) {
    if (!this._subscribed) return;
    this._bc('conduct', { id: this._id, kind });
  },
  _onConduct({ id, kind }) {
    if (id === this._id) return;
    this._ctx.onRemoteConduct?.(id, kind); // 반주자 잠금용 60초 연속 지휘 타이머(start/stop 모두 전달)
    if (kind !== 'start') return;
    this._ctx.toast?.('🎼 지휘가 시작됐어요 — 모두 자리로 돌아가 찬양을 시작해요');
    const s = this._ctx.state;
    if (s.profile?.part === 'conductor') return; // 나는 지휘자(단상 위)
    if (s.seated || s.conducting) return;        // 이미 앉아 있음
    if (this._ctx.getAvatar().position.x > 10.6) return; // 교실에 있음
    this._autoSeat();
  },
};
