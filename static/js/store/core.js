// Minimal reactive store without bundler. No external deps. Vanilla JS.
// Contract:
// - createStore(initialState, { persistKey?, persistPaths?[], ttlMs? }) -> { get, set, update, subscribe }
// - Persist only whitelisted paths; TTL if provided.
// - Global registry at window.Store.

(function(){
  const LS = typeof localStorage !== 'undefined' ? localStorage : null;
  const now = () => Date.now();

  function deepGet(obj, path) {
    return path.split('.').reduce((o,k)=> (o && typeof o==='object') ? o[k] : undefined, obj);
  }
  function deepSet(obj, path, value) {
    const parts = path.split('.');
    let o = obj;
    for (let i=0;i<parts.length-1;i++) {
      const p = parts[i];
      if (!o[p] || typeof o[p] !== 'object') {o[p] = {};}
      o = o[p];
    }
    o[parts[parts.length-1]] = value;
  }

  function pick(obj, paths) {
    const out = {};
    for (const p of paths) {
      const v = deepGet(obj, p);
      if (v !== undefined) {deepSet(out, p, v);}
    }
    return out;
  }

  function persistWrite(key, payload) {
    if (!LS) {return;}
    try { LS.setItem(key, JSON.stringify(payload)); } catch(_) {}
  }
  function persistRead(key, ttlMs) {
    if (!LS) {return null;}
    try {
      const raw = LS.getItem(key);
      if (!raw) {return null;}
      const j = JSON.parse(raw);
      if (ttlMs && j && j.__ts && (now() - j.__ts > ttlMs)) {return null;}
      return j;
    } catch(_) { return null; }
  }

  function createStore(name, initialState, options) {
    const opts = options || {};
    const subs = new Set();
    const state = Object.assign({}, initialState);

    // hydrate from LS if allowed
    const pKey = opts.persistKey;
    if (pKey) {
      const cached = persistRead(pKey, opts.ttlMs);
      if (cached && cached.data) {Object.assign(state, cached.data);}
    }

    function notify() { subs.forEach(fn => { try { fn(state); } catch(_){} }); }
    function get() { return state; }
    function set(next) {
      Object.assign(state, next);
      persistMaybe();
      notify();
    }
    function update(mutator) {
      try { mutator(state); } catch(_) {}
      persistMaybe();
      notify();
    }
    function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

    function persistMaybe() {
      if (!pKey || !opts.persistPaths || !opts.persistPaths.length) {return;}
      const data = pick(state, opts.persistPaths);
      persistWrite(pKey, { __ts: now(), data });
    }

    const api = { name, get, set, update, subscribe };
    if (!window.Store) {window.Store = { _stores: {} };}
    window.Store._stores[name] = api;
    return api;
  }

  // Public API
  window.Store = window.Store || { _stores: {} };
  window.Store.createStore = createStore;
  window.Store.getStore = function(name){ return window.Store._stores[name]; };
})();
