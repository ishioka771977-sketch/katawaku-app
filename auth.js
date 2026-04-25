// ============================================================
// 型知 KATACHI 認証 Phase 2 (デバイストークン方式)
// 有給ナビのAPIを叩いてセッションを取得
// ============================================================

const APP_NAME = 'katachi';
// 有給ナビのAPIベースURL（開発: localhost:3000 / 本番: 切替）
const AUTH_API_BASE = window.ISHIOKA_AUTH_API_BASE || 'http://localhost:3000';

const SUPABASE_URL = 'https://koxovaejdkfkbcygriuu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0Dmo_sKP8OQLAGyYkVhCAw_F9Fucktq';

const DEVICE_TOKEN_KEY = 'ishioka_device_token';
const GUEST_TOKEN_KEY = 'ishioka_guest_device_token';

// Supabase クライアント（グローバル supabase は window.supabase の名前と衝突するので別名）
let sbClient = null;

function getSb() {
  if (!sbClient && window.supabase?.createClient) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return sbClient;
}

// -------------- Storage --------------
function getStoredDeviceToken() { return localStorage.getItem(DEVICE_TOKEN_KEY); }
function getStoredGuestToken() { return localStorage.getItem(GUEST_TOKEN_KEY); }
function saveDeviceToken(t) { localStorage.setItem(DEVICE_TOKEN_KEY, t); }
function saveGuestToken(t) { localStorage.setItem(GUEST_TOKEN_KEY, t); }
function clearDeviceTokens() {
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  localStorage.removeItem(GUEST_TOKEN_KEY);
}

// -------------- API Calls --------------
async function performDeviceLogin() {
  const deviceToken = getStoredDeviceToken();
  const guestToken = getStoredGuestToken();
  if (!deviceToken && !guestToken) return null;

  try {
    const res = await fetch(`${AUTH_API_BASE}/api/auth/device-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceToken, guestToken, appName: APP_NAME }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) clearDeviceTokens();
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('[auth] device-login failed', e);
    return null;
  }
}

async function performPairing(employeeNumber, code, deviceLabel) {
  const res = await fetch(`${AUTH_API_BASE}/api/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeNumber, code, deviceLabel }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error || 'pairing_failed' };
  saveDeviceToken(data.deviceToken);
  return data;
}

async function performQrPairing(qrCode, deviceLabel) {
  const res = await fetch(`${AUTH_API_BASE}/api/auth/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: qrCode, deviceLabel }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error || 'pairing_failed' };
  saveDeviceToken(data.deviceToken);
  return data;
}

async function performGuestAccess(guestAccessToken, deviceLabel) {
  const res = await fetch(`${AUTH_API_BASE}/api/auth/guest-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guestAccessToken, deviceLabel }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error || 'guest_access_failed' };
  saveGuestToken(data.deviceToken);
  return data;
}

// -------------- Public API --------------

// AuthGuard: 未認証なら /denied.html へリダイレクト。
// pair.html や guest.html は認証不要なのでチェックスキップ
async function authGuard() {
  const path = window.location.pathname;
  const name = path.split('/').pop() || '';
  // 認証不要ページ
  if (['pair.html', 'guest.html', 'denied.html', 'login.html'].includes(name)) {
    return true;
  }

  const sb = getSb();
  if (!sb) {
    console.error('[auth] Supabase SDK 未ロード');
    window.location.replace('/denied.html');
    return false;
  }

  const result = await performDeviceLogin();
  if (!result) {
    window.location.replace('/denied.html');
    return false;
  }

  // Supabaseセッションをセット
  const { error } = await sb.auth.setSession({
    access_token: result.session.access_token,
    refresh_token: result.session.refresh_token,
  });
  if (error) {
    console.error('[auth] setSession failed', error);
    clearDeviceTokens();
    window.location.replace('/denied.html');
    return false;
  }

  window.__ishiokaAuth = {
    type: result.type,
    profile: result.profile,
    userId: result.session.user.id,
  };

  return true;
}

async function authLogout() {
  clearDeviceTokens();
  const sb = getSb();
  if (sb) await sb.auth.signOut();
  window.location.replace('/denied.html');
}

// グローバル公開
window.authGuard = authGuard;
window.authLogout = authLogout;
window.authPair = performPairing;
window.authQrPair = performQrPairing;
window.authGuestAccess = performGuestAccess;
window.clearDeviceTokens = clearDeviceTokens;
window.getSb = getSb;  // knowledge-base.js から Storage 呼び出しに使用
