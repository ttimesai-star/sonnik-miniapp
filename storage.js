/* storage.js — dream diary storage.
 *
 * Primary: Telegram CloudStorage (Bot API 6.9+; per user, lives in Telegram, not on our server).
 * Fallback: localStorage (plain browser, old Telegram clients, or a CloudStorage error).
 * An entry that could not reach the cloud stays in localStorage and is pushed to the cloud
 * on the next list(); nothing is dropped silently.
 *
 * CloudStorage limits: key 1..128 chars [A-Za-z0-9_-], value 0..4096 chars, up to 1024 keys.
 * Hence: text is cut to MAX_TEXT, the diary to MAX_ENTRIES (leaves room for settings).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DreamStore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_TEXT = 2000;
  var MAX_ENTRIES = 900;
  var MAX_VALUE = 4000;       // below the 4096 cloud limit
  var PREFIX = "d_";          // entry keys
  var LOCAL_NS = "sonnik:";   // localStorage namespace

  function pcall(fn) { // CloudStorage callback API -> Promise
    return new Promise(function (resolve, reject) {
      try {
        fn(function (err, res) { if (err) reject(new Error(String(err))); else resolve(res); });
      } catch (e) { reject(e); }
    });
  }

  function newId(now, rnd) {
    var r = Math.floor((rnd || Math.random)() * 46656).toString(36); // 3 chars base36
    return PREFIX + now.toString(36) + "_" + r;
  }

  function pack(e) {
    var text = String(e.text || "").slice(0, MAX_TEXT);
    var v;
    for (;;) {
      v = JSON.stringify({ c: e.created, t: text, s: e.symbols || [], m: e.mood || "", l: e.lang || "ru" });
      if (v.length <= MAX_VALUE || text.length <= 100) break;
      text = text.slice(0, Math.floor(text.length * 0.8));
    }
    return v;
  }

  function unpack(id, v) {
    try {
      var o = JSON.parse(v);
      if (!o || typeof o.c !== "number") return null;
      return { id: id, created: o.c, text: String(o.t || ""), symbols: Array.isArray(o.s) ? o.s : [],
               mood: String(o.m || ""), lang: o.l === "en" ? "en" : "ru" };
    } catch (e) { return null; }
  }

  /**
   * opts.cloud  — Telegram.WebApp.CloudStorage or null
   * opts.local  — localStorage-like {getItem,setItem,removeItem,key,length} or null
   */
  function create(opts) {
    var cloud = opts.cloud || null;
    var local = opts.local || null;
    var mem = {}; // last resort when both are unavailable (private mode): lives until reload

    function lGet(k) { try { return local ? local.getItem(LOCAL_NS + k) : (k in mem ? mem[k] : null); } catch (e) { return mem[k] || null; } }
    function lSet(k, v) { try { if (local) local.setItem(LOCAL_NS + k, v); else mem[k] = v; } catch (e) { mem[k] = v; } }
    function lDel(k) { try { if (local) local.removeItem(LOCAL_NS + k); } catch (e) { /* ignore */ } delete mem[k]; }
    function lKeys() {
      var out = [];
      try {
        if (local) {
          for (var i = 0; i < local.length; i++) {
            var k = local.key(i);
            if (k && k.indexOf(LOCAL_NS + PREFIX) === 0) out.push(k.slice(LOCAL_NS.length));
          }
        }
      } catch (e) { /* ignore */ }
      Object.keys(mem).forEach(function (k) { if (k.indexOf(PREFIX) === 0 && out.indexOf(k) < 0) out.push(k); });
      return out;
    }

    function localEntries() {
      return lKeys().map(function (k) { return unpack(k, lGet(k)); }).filter(Boolean);
    }

    function cloudEntries() {
      return pcall(function (cb) { cloud.getKeys(cb); }).then(function (keys) {
        keys = (keys || []).filter(function (k) { return k.indexOf(PREFIX) === 0; });
        if (!keys.length) return [];
        var batches = [];
        for (var i = 0; i < keys.length; i += 50) batches.push(keys.slice(i, i + 50));
        return Promise.all(batches.map(function (b) {
          return pcall(function (cb) { cloud.getItems(b, cb); });
        })).then(function (parts) {
          var out = [];
          parts.forEach(function (obj) {
            Object.keys(obj || {}).forEach(function (k) {
              var e = unpack(k, obj[k]);
              if (e) out.push(e);
            });
          });
          return out;
        });
      });
    }

    function syncPending(cloudList) {
      // push entries that only exist locally (earlier cloud failure) to the cloud
      var have = {};
      cloudList.forEach(function (e) { have[e.id] = true; });
      var pending = localEntries().filter(function (e) { return !have[e.id]; });
      return Promise.all(pending.map(function (e) {
        return pcall(function (cb) { cloud.setItem(e.id, pack(e), cb); })
          .then(function () { lDel(e.id); cloudList.push(e); })
          .catch(function () { /* stays local */ });
      }));
    }

    function sortDesc(a) { return a.sort(function (x, y) { return y.created - x.created; }); }

    var api = {
      kind: cloud ? "cloud" : "local",
      MAX_ENTRIES: MAX_ENTRIES,
      MAX_TEXT: MAX_TEXT,

      /** All entries, newest first. In cloud mode also reports entries still waiting for sync. */
      list: function () {
        if (!cloud) return Promise.resolve({ entries: sortDesc(localEntries()), pending: 0, cloudError: false });
        return cloudEntries().then(function (list) {
          return syncPending(list).then(function () {
            var left = localEntries().length;
            // entries that remain local are still shown (merged by id)
            var have = {};
            list.forEach(function (e) { have[e.id] = true; });
            localEntries().forEach(function (e) { if (!have[e.id]) list.push(e); });
            return { entries: sortDesc(list), pending: left, cloudError: false };
          });
        }).catch(function () {
          return { entries: sortDesc(localEntries()), pending: localEntries().length, cloudError: true };
        });
      },

      /** Save one entry. Resolves {ok, where:'cloud'|'local', id} or {ok:false, reason}. */
      add: function (entry, count) {
        if (count != null && count >= MAX_ENTRIES) return Promise.resolve({ ok: false, reason: "full" });
        var id = newId(entry.created || Date.now());
        var e = { id: id, created: entry.created, text: entry.text, symbols: entry.symbols, mood: entry.mood, lang: entry.lang };
        var v = pack(e);
        if (!cloud) { lSet(id, v); return Promise.resolve({ ok: true, where: "local", id: id }); }
        return pcall(function (cb) { cloud.setItem(id, v, cb); })
          .then(function () { return { ok: true, where: "cloud", id: id }; })
          .catch(function () { lSet(id, v); return { ok: true, where: "local", id: id, cloudError: true }; });
      },

      remove: function (id) {
        lDel(id);
        if (!cloud) return Promise.resolve(true);
        return pcall(function (cb) { cloud.removeItem(id, cb); }).then(function () { return true; }).catch(function () { return false; });
      },

      /** Remove every diary entry. */
      clear: function (ids) {
        ids.forEach(lDel);
        if (!cloud || !ids.length) return Promise.resolve(true);
        var batches = [];
        for (var i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
        return Promise.all(batches.map(function (b) {
          return pcall(function (cb) { cloud.removeItems(b, cb); });
        })).then(function () { return true; }).catch(function () { return false; });
      },

      getSetting: function (name) {
        var k = "set_" + name;
        var fromLocal = lGet(k);
        if (!cloud) return Promise.resolve(fromLocal);
        return pcall(function (cb) { cloud.getItem(k, cb); })
          .then(function (v) { return v || fromLocal; }).catch(function () { return fromLocal; });
      },
      setSetting: function (name, value) {
        var k = "set_" + name;
        lSet(k, String(value));
        if (!cloud) return Promise.resolve(true);
        return pcall(function (cb) { cloud.setItem(k, String(value), cb); }).then(function () { return true; }).catch(function () { return false; });
      }
    };
    return api;
  }

  return { create: create, newId: newId, pack: pack, unpack: unpack, MAX_TEXT: MAX_TEXT, MAX_ENTRIES: MAX_ENTRIES, PREFIX: PREFIX };
});
