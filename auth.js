// ============================================================
// 型知 KATACHI 認証（社員番号→employees直接照合方式）
// 有給ナビと同じ方式に統一
// ============================================================

const SUPABASE_URL = 'https://koxovaejdkfkbcygriuu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0Dmo_sKP8OQLAGyYkVhCAw_F9Fucktq';

let sbClient = null;
function getSb() {
  if (!sbClient && window.supabase?.createClient) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return sbClient;
}

// ログイン中のユーザーを取得
function getLoggedInUser() {
  try {
    const stored = localStorage.getItem('yukyu_employee');
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

// ログインチェック（ページ読み込み時に呼ぶ）
function checkAuth() {
  const user = getLoggedInUser();
  if (!user) {
    showLoginScreen();
    return null;
  }
  hideLoginScreen();
  return user;
}

// ログイン処理
async function handleLogin(empNum) {
  const normalized = empNum.toUpperCase().trim();
  if (!normalized) return { error: '社員番号を入力してください' };

  const sb = getSb();
  if (!sb) return { error: 'データベースに接続できません' };

  const { data: emp, error: dbErr } = await sb
    .from('employees')
    .select('id, employee_number, name, role, is_active')
    .eq('employee_number', normalized)
    .single();

  if (dbErr || !emp) return { error: 'この社員番号は登録されていません' };
  if (!emp.is_active) return { error: 'このアカウントは無効です' };

  const empData = JSON.stringify({
    id: emp.id,
    employee_number: emp.employee_number,
    name: emp.name,
    role: emp.role,
  });
  localStorage.setItem('yukyu_employee', empData);
  document.cookie = `yukyu_employee=${encodeURIComponent(empData)};path=/;max-age=${60*60*24*365};SameSite=Lax`;

  return { success: true, employee: emp };
}

// ログアウト
function handleLogout() {
  localStorage.removeItem('yukyu_employee');
  document.cookie = 'yukyu_employee=;path=/;max-age=0';
  showLoginScreen();
}

// ログイン画面の表示/非表示
function showLoginScreen() {
  let overlay = document.getElementById('auth-overlay');
  if (overlay) { overlay.style.display = 'flex'; return; }

  overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:#f9fafb;display:flex;align-items:center;justify-content:center;z-index:9999;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:32px;max-width:400px;width:90%;text-align:center;">
      <h1 style="font-size:24px;font-weight:bold;color:#0070C0;margin-bottom:4px;">型知 KATACHI</h1>
      <p style="font-size:13px;color:#999;margin-bottom:24px;">石岡組 型枠施工図</p>
      <label style="display:block;text-align:left;font-size:14px;font-weight:500;margin-bottom:4px;">社員番号</label>
      <input id="auth-empnum" type="text" maxlength="4" placeholder="例: X000"
        style="width:100%;padding:12px;border:1px solid #d1d5db;border-radius:8px;text-align:center;font-size:20px;font-family:monospace;margin-bottom:8px;box-sizing:border-box;" />
      <p style="font-size:11px;color:#aaa;margin-bottom:16px;">T=技術者 / W=作業員 / O=事務員 / X=管理者</p>
      <div id="auth-error" style="display:none;background:#fef2f2;color:#dc2626;padding:8px;border-radius:8px;font-size:13px;margin-bottom:12px;"></div>
      <button id="auth-submit" style="width:100%;padding:12px;background:#0070C0;color:white;border:none;border-radius:8px;font-size:16px;font-weight:500;cursor:pointer;">
        ログイン
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('auth-empnum');
  const btn = document.getElementById('auth-submit');
  const errDiv = document.getElementById('auth-error');

  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });

  btn.addEventListener('click', async () => {
    errDiv.style.display = 'none';
    btn.textContent = 'ログイン中…';
    btn.disabled = true;

    const result = await handleLogin(input.value);
    if (result.error) {
      errDiv.textContent = result.error;
      errDiv.style.display = 'block';
      btn.textContent = 'ログイン';
      btn.disabled = false;
    } else {
      overlay.style.display = 'none';
      location.reload();
    }
  });

  input.focus();
}

function hideLoginScreen() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ページ読み込み時に自動チェック
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});
