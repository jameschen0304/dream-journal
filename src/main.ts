import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "./style.css";

type Dream = {
  id: string;
  user_id?: string;
  date: string;
  title: string;
  content: string;
  life_context: string;
  mood_tags: string[];
  ai_interpretation: string;
  created_at: string;
  updated_at: string;
};

type ReviewPeriod = "week" | "month" | "year";

const STORAGE_KEY = "dream-journal-v2";
const SUPABASE_KEY = "dream-journal-supabase";

const MOOD_PRESETS = ["平静", "焦虑", "愉悦", "失落", "孤独", "期待", "压力", "迷茫", "感动", "愤怒"];
const MOOD_EMOJI: Record<string, string> = {
  平静: "😌",
  焦虑: "😰",
  愉悦: "😊",
  失落: "😞",
  孤独: "🌙",
  期待: "✨",
  压力: "🫨",
  迷茫: "🌫️",
  感动: "🥹",
  愤怒: "😠",
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("missing #app");

let supabaseClient: SupabaseClient | null = null;
let cloudUserId: string | null = null;
let dreams: Dream[] = [];
let editingId: string | null = null;
let statusText = "本地模式";
let storyResult = "";
let reviewResult = "";

function escapeHtml(v: string): string {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function moodWithEmoji(tag: string): string {
  const plain = tag.trim();
  const emoji = MOOD_EMOJI[plain] ?? "🫧";
  return `${emoji} ${plain}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function getJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setJson(key: string, val: unknown): void {
  localStorage.setItem(key, JSON.stringify(val));
}

function sortDreams(list: Dream[]): Dream[] {
  return [...list].sort((a, b) => `${b.date}${b.created_at}`.localeCompare(`${a.date}${a.created_at}`));
}

function normalizeMoodTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => (typeof t === "string" ? t : String(t))).filter(Boolean);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) return normalizeMoodTags(parsed);
    } catch {
      /* ignore */
    }
    return [s];
  }
  return [];
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v;
  return null;
}

function asStringField(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

/** Supabase timestamptz 等字段在部分客户端可能不是 string */
function asIsoString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  return null;
}

function parseDreamArray(v: unknown): Dream[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const id = asNonEmptyString(o.id);
      const date = asNonEmptyString(o.date);
      const content = asNonEmptyString(o.content);
      if (!id || !date || !content) return null;
      const created = asIsoString(o.created_at);
      const updated = asIsoString(o.updated_at);
      if (!created || !updated) return null;
      const mood_tags = normalizeMoodTags(o.mood_tags);
      return {
        id,
        user_id: typeof o.user_id === "string" ? o.user_id : undefined,
        date,
        title: "",
        content,
        life_context: asStringField(o.life_context),
        mood_tags,
        ai_interpretation: asStringField(o.ai_interpretation),
        created_at: created,
        updated_at: updated,
      } satisfies Dream;
    })
    .filter((x): x is Dream => x !== null);
}

function loadLocalDreams(): Dream[] {
  return sortDreams(parseDreamArray(getJson<unknown>(STORAGE_KEY, [])));
}

function saveLocalDreams(list: Dream[]): void {
  setJson(STORAGE_KEY, sortDreams(list));
}

const SUPABASE_DEFAULTS = {
  url: "https://alesnpbcjzipocruzpcl.supabase.co",
  anonKey: "sb_publishable_txVnl9LWAcNiTrByxMqdfQ__cVfSaLf",
};

function getSupabaseConfig(): { url: string; anonKey: string } {
  const raw = localStorage.getItem(SUPABASE_KEY);
  if (raw == null) {
    return { url: SUPABASE_DEFAULTS.url, anonKey: SUPABASE_DEFAULTS.anonKey };
  }
  try {
    const saved = JSON.parse(raw) as Partial<{ url: string; anonKey: string }>;
    if (saved && typeof saved === "object") {
      return {
        url: typeof saved.url === "string" ? saved.url.trim() : "",
        anonKey: typeof saved.anonKey === "string" ? saved.anonKey.trim() : "",
      };
    }
  } catch {
    /* ignore */
  }
  return { url: SUPABASE_DEFAULTS.url, anonKey: SUPABASE_DEFAULTS.anonKey };
}

function saveSupabaseConfig(url: string, anonKey: string): void {
  setJson(SUPABASE_KEY, { url: url.trim(), anonKey: anonKey.trim() });
}

async function initSupabaseFromConfig(): Promise<void> {
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey) {
    supabaseClient = null;
    cloudUserId = null;
    statusText = "本地模式（未配置云端或已清空 URL/Key）";
    return;
  }
  try {
    supabaseClient = createClient(cfg.url, cfg.anonKey);
    const { data } = await supabaseClient.auth.getUser();
    cloudUserId = data.user?.id ?? null;
    statusText = cloudUserId ? `云端模式（${data.user?.email ?? "已登录"}）` : "云端已配置（未登录）";
  } catch {
    supabaseClient = null;
    cloudUserId = null;
    statusText = "Supabase 配置异常，已回退本地模式";
  }
}

async function loadDreams(): Promise<void> {
  if (supabaseClient && cloudUserId) {
    const { data, error } = await supabaseClient
      .from("dream_entries")
      .select("*")
      .eq("user_id", cloudUserId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (!error && Array.isArray(data)) {
      dreams = sortDreams(parseDreamArray(data));
      return;
    }
  }
  dreams = loadLocalDreams();
}

/** null = 未使用云端；true/false = 已登录时本次是否写入云端成功 */
type PersistResult = { cloudSynced: boolean | null };

async function persistDreams(): Promise<PersistResult> {
  if (!supabaseClient || !cloudUserId) {
    saveLocalDreams(dreams);
    return { cloudSynced: null };
  }
  try {
    const rows = dreams.map((d) => ({ ...d, user_id: cloudUserId }));
    const { error } = await supabaseClient.from("dream_entries").upsert(rows, { onConflict: "id" });
    if (!error) {
      saveLocalDreams(dreams);
      return { cloudSynced: true };
    }
  } catch {
    // Network / transient Supabase errors should not block local journaling.
  }
  saveLocalDreams(dreams);
  return { cloudSynced: false };
}

async function removeDreamById(id: string): Promise<void> {
  dreams = dreams.filter((d) => d.id !== id);
  if (supabaseClient && cloudUserId) {
    await supabaseClient.from("dream_entries").delete().eq("id", id).eq("user_id", cloudUserId);
  }
  saveLocalDreams(dreams);
}

function render(): void {
  const supa = getSupabaseConfig();
  const edit = editingId ? dreams.find((d) => d.id === editingId) : null;
  const defaultDate = edit?.date ?? new Date().toISOString().slice(0, 10);

  const listHtml = dreams.length
    ? dreams
        .map(
          (d) => `<article class="dream-card">
    <div class="dream-top">
      <div>
        <h3>${escapeHtml(d.date)}</h3>
        <p>${escapeHtml(d.life_context || "未填写生活关联")}</p>
      </div>
      <label><input type="checkbox" class="story-pick" data-id="${escapeHtml(d.id)}"/> 选入故事</label>
    </div>
    <div class="chips">${d.mood_tags.map((t) => `<span class="chip">${escapeHtml(moodWithEmoji(t))}</span>`).join("")}</div>
    <pre>${escapeHtml(d.content)}</pre>
    <div class="interpret-box">
      <b>手动解读：</b>
      <textarea class="manual-interpret" data-id="${escapeHtml(d.id)}" placeholder="你对这条梦的理解、感受和提醒...">${escapeHtml(d.ai_interpretation || "")}</textarea>
      <div class="row-actions">
        <button type="button" class="btn ghost" data-action="save-interpret" data-id="${escapeHtml(d.id)}">保存解读</button>
      </div>
    </div>
    <div class="row-actions">
      <button type="button" class="btn ghost" data-action="edit" data-id="${escapeHtml(d.id)}">编辑</button>
      <button type="button" class="btn danger" data-action="delete" data-id="${escapeHtml(d.id)}">删除</button>
    </div>
  </article>`,
        )
        .join("")
    : `<p class="empty">还没有梦境记录，先写下今天的梦吧。</p>`;

  app.innerHTML = `
  <header>
    <h1>梦境花园</h1>
    <p>绿色疗愈风 · 云端同步 · 手动解读 · 周/月/年回顾 · 素材整理</p>
  </header>

  <section class="panel">
    <h2>${edit ? "编辑梦境" : "记录梦境"}</h2>
    <form id="dream-form">
      <input id="dream-id" type="hidden" value="${edit ? escapeHtml(edit.id) : ""}" />
      <label>日期</label>
      <input type="date" id="dream-date" required value="${escapeHtml(defaultDate)}"/>
      <label>梦境内容</label>
      <textarea id="dream-content" required placeholder="尽量具体：场景、人物、情节、感受">${escapeHtml(edit?.content ?? "")}</textarea>
      <label>与最近生活的联系</label>
      <textarea id="dream-life" placeholder="例如：最近换工作焦虑、和家人沟通、期待旅行">${escapeHtml(edit?.life_context ?? "")}</textarea>
      <label>情绪标签（可多选）</label>
      <div class="chips editable">
        ${MOOD_PRESETS.map((t) => `<label class="chip-input"><input type="checkbox" class="mood-check" value="${escapeHtml(t)}" ${edit?.mood_tags.includes(t) ? "checked" : ""}/> ${escapeHtml(moodWithEmoji(t))}</label>`).join("")}
      </div>
      <label>自定义标签（用英文逗号分隔）</label>
      <input id="custom-tags" value="${escapeHtml((edit?.mood_tags ?? []).filter((t) => !MOOD_PRESETS.includes(t)).join(", "))}" placeholder="例如：反复梦, 父亲, 迁徙" />
      <div class="row-actions">
        <button class="btn" type="submit">${edit ? "保存修改" : "保存记录"}</button>
        <button class="btn ghost" type="button" id="new-dream">新建</button>
      </div>
    </form>
  </section>

  <section class="panel">
    <h2>周/月/年回顾</h2>
    <div class="row-actions">
      <select id="review-period">
        <option value="week">近 7 天</option>
        <option value="month">近 30 天</option>
        <option value="year">近 365 天</option>
      </select>
      <button type="button" class="btn" id="run-review">生成回顾</button>
    </div>
    <div class="output">${escapeHtml(reviewResult || "点击生成回顾")}</div>
  </section>

  <section class="panel">
    <h2>故事素材整理</h2>
    <p class="hint">先在梦境卡片勾选素材，再点「生成素材文本」，便于复制到其它工具里继续创作。</p>
    <div class="row-actions">
      <button type="button" class="btn" id="build-story">生成素材文本</button>
      <button type="button" class="btn ghost" id="copy-story">复制文本</button>
    </div>
    <div class="output">${escapeHtml(storyResult || "勾选梦境后可生成可复制的素材文本")}</div>
  </section>

  <section class="panel">
    <h2>梦境列表（${dreams.length}）</h2>
    <div class="list">${listHtml}</div>
  </section>

  <details class="panel fold">
    <summary>账号与云端存储</summary>
    <p class="hint">${escapeHtml(statusText)}</p>
    <div class="grid2">
      <div>
        <label>Supabase URL</label>
        <input id="supa-url" value="${escapeHtml(supa.url)}" placeholder="https://xxxx.supabase.co" />
      </div>
      <div>
        <label>Supabase Anon Key</label>
        <input id="supa-key" value="${escapeHtml(supa.anonKey)}" placeholder="eyJ..." />
      </div>
    </div>
    <div class="grid2">
      <div>
        <label>邮箱登录（Magic Link）</label>
        <input id="login-email" placeholder="you@email.com" />
      </div>
      <div class="inline-actions">
        <button type="button" class="btn" id="save-supa">保存配置</button>
        <button type="button" class="btn ghost" id="email-login">发送登录链接</button>
        <button type="button" class="btn ghost" id="logout">退出登录</button>
        <button type="button" class="btn ghost" id="sync-now">立即同步</button>
      </div>
    </div>
  </details>

  `;

  bindEvents();
}

function selectedTagsFromForm(): string[] {
  const checked = Array.from(document.querySelectorAll<HTMLInputElement>(".mood-check:checked")).map((el) => el.value.trim());
  const customRaw = (document.querySelector<HTMLInputElement>("#custom-tags")?.value ?? "").trim();
  const custom = customRaw ? customRaw.split(/[,，、]/).map((v) => v.trim()).filter(Boolean) : [];
  return Array.from(new Set([...checked, ...custom]));
}

function rangeDays(period: ReviewPeriod): number {
  if (period === "week") return 7;
  if (period === "month") return 30;
  return 365;
}

function makeReview(period: ReviewPeriod): string {
  const days = rangeDays(period);
  const now = Date.now();
  const target = dreams.filter((d) => now - new Date(d.date).getTime() <= days * 24 * 3600 * 1000);
  if (!target.length) return `近 ${days} 天没有记录。`;
  const freq = new Map<string, number>();
  for (const d of target) for (const t of d.mood_tags) freq.set(t, (freq.get(t) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return [
    `近 ${days} 天共记录 ${target.length} 条梦境。`,
    `最常见情绪标签：${top.map(([k, v]) => `${moodWithEmoji(k)}(${v})`).join("、") || "暂无标签"}`,
    `最近记录日期：${target.slice(0, 4).map((d) => d.date).join("、")}`,
  ].join("\n");
}

function pickedDreamsForStory(): Dream[] {
  const ids = Array.from(document.querySelectorAll<HTMLInputElement>(".story-pick:checked")).map((el) => el.dataset.id || "");
  const set = new Set(ids);
  return dreams.filter((d) => set.has(d.id));
}

function buildStoryMaterialText(picked: Dream[]): string {
  const blocks = picked.map((d, i) => {
    const tags = d.mood_tags.length ? d.mood_tags.join("、") : "无";
    return [
      `【素材 ${i + 1}】`,
      `日期：${d.date || "未知"}`,
      `情绪标签：${tags}`,
      `生活关联：${d.life_context || "（空）"}`,
      `梦境内容：${d.content || "（空）"}`,
    ].join("\n");
  });
  return [`梦境素材汇总（共 ${picked.length} 条）`, ...blocks].join("\n\n");
}

function bindEvents(): void {
  document.querySelector("#save-supa")?.addEventListener("click", async () => {
    const url = (document.querySelector<HTMLInputElement>("#supa-url")?.value ?? "").trim();
    const key = (document.querySelector<HTMLInputElement>("#supa-key")?.value ?? "").trim();
    saveSupabaseConfig(url, key);
    await initSupabaseFromConfig();
    await loadDreams();
    render();
  });

  document.querySelector("#email-login")?.addEventListener("click", async () => {
    if (!supabaseClient) return alert("请先保存 Supabase 配置");
    const email = (document.querySelector<HTMLInputElement>("#login-email")?.value ?? "").trim();
    if (!email) return alert("请输入邮箱");
    const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
    alert(error ? `发送失败：${error.message}` : "登录链接已发送到邮箱");
  });

  document.querySelector("#logout")?.addEventListener("click", async () => {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    cloudUserId = null;
    statusText = "云端已配置（未登录）";
    await loadDreams();
    render();
  });

  document.querySelector("#sync-now")?.addEventListener("click", async () => {
    await loadDreams();
    render();
    alert("同步完成");
  });

  document.querySelector("#new-dream")?.addEventListener("click", () => {
    editingId = null;
    render();
  });

  document.querySelector("#dream-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const id = (document.querySelector<HTMLInputElement>("#dream-id")?.value ?? "").trim() || crypto.randomUUID();
      const old = dreams.find((d) => d.id === id);
      const item: Dream = {
        id,
        user_id: cloudUserId ?? undefined,
        date: (document.querySelector<HTMLInputElement>("#dream-date")?.value ?? "").trim(),
        title: "",
        content: (document.querySelector<HTMLTextAreaElement>("#dream-content")?.value ?? "").trim(),
        life_context: (document.querySelector<HTMLTextAreaElement>("#dream-life")?.value ?? "").trim(),
        mood_tags: selectedTagsFromForm(),
        ai_interpretation: old?.ai_interpretation ?? "",
        created_at: old?.created_at ?? nowIso(),
        updated_at: nowIso(),
      };
      if (!item.date || !item.content) return alert("日期和梦境内容必填");
      dreams = sortDreams([...dreams.filter((d) => d.id !== item.id), item]);
      const { cloudSynced } = await persistDreams();
      editingId = null;
      render();
      if (cloudSynced === false) {
        alert("记录已保存到本机，但云端同步失败，请检查网络或权限后点「立即同步」重试。");
      } else {
        alert("记录已保存");
      }
    } catch (e) {
      alert(e instanceof Error ? `保存失败：${e.message}` : "保存失败，请重试");
    }
  });

  document.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
    el.addEventListener("click", async () => {
      const action = el.dataset.action;
      const id = el.dataset.id;
      const d = dreams.find((x) => x.id === id);
      if (!d) return;
      if (action === "edit") {
        editingId = d.id;
        render();
        return;
      }
      if (action === "delete") {
        if (!confirm("确定删除？")) return;
        await removeDreamById(d.id);
        render();
        return;
      }
      if (action === "save-interpret") {
        const input = Array.from(document.querySelectorAll<HTMLTextAreaElement>(".manual-interpret")).find(
          (el) => el.dataset.id === d.id,
        );
        d.ai_interpretation = (input?.value ?? "").trim();
        d.updated_at = nowIso();
        const { cloudSynced } = await persistDreams();
        if (cloudSynced === false) {
          alert("解读已保存到本机，但云端同步失败，请稍后点「立即同步」重试。");
        } else {
          alert("解读已保存");
        }
        render();
      }
    });
  });

  document.querySelector("#run-review")?.addEventListener("click", () => {
    const period = (document.querySelector<HTMLSelectElement>("#review-period")?.value ?? "week") as ReviewPeriod;
    reviewResult = makeReview(period);
    render();
  });

  document.querySelector("#build-story")?.addEventListener("click", () => {
    const picked = pickedDreamsForStory();
    if (!picked.length) return alert("请先勾选至少 1 条梦境");
    storyResult = buildStoryMaterialText(picked);
    render();
  });

  document.querySelector("#copy-story")?.addEventListener("click", async () => {
    if (!storyResult.trim()) return alert("请先生成素材文本");
    try {
      await navigator.clipboard.writeText(storyResult);
      alert("已复制到剪贴板");
    } catch {
      alert("复制失败，请手动全选输出文本复制");
    }
  });
}

async function bootstrap(): Promise<void> {
  localStorage.removeItem("dream-journal-ai-config");
  await initSupabaseFromConfig();
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      cloudUserId = session?.user?.id ?? null;
      statusText = cloudUserId ? `云端模式（${session?.user?.email ?? "已登录"}）` : "云端已配置（未登录）";
      // Token refresh must not reload from server: it races with in-flight upsert and can
      // briefly show stale rows (e.g. new dream with mood_tags “disappearing” after save).
      if (event === "TOKEN_REFRESHED") {
        render();
        return;
      }
      await loadDreams();
      render();
    });
  }
  await loadDreams();
  render();
}

void bootstrap();
