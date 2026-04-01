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

type AiConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
};

const STORAGE_KEY = "dream-journal-v2";
const SUPABASE_KEY = "dream-journal-supabase";
const AI_KEY = "dream-journal-ai-config";

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

function parseDreamArray(v: unknown): Dream[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Dream => {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return (
      typeof o.id === "string" &&
      typeof o.date === "string" &&
      typeof o.title === "string" &&
      typeof o.content === "string" &&
      typeof o.life_context === "string" &&
      Array.isArray(o.mood_tags) &&
      typeof o.ai_interpretation === "string" &&
      typeof o.created_at === "string" &&
      typeof o.updated_at === "string"
    );
  });
}

function loadLocalDreams(): Dream[] {
  return sortDreams(parseDreamArray(getJson<unknown>(STORAGE_KEY, [])));
}

function saveLocalDreams(list: Dream[]): void {
  setJson(STORAGE_KEY, sortDreams(list));
}

function getSupabaseConfig(): { url: string; anonKey: string } {
  return getJson(SUPABASE_KEY, {
    url: "https://alesnpbcjzipocruzpcl.supabase.co",
    anonKey: "sb_publishable_txVnl9LWAcNiTrByxMqdfQ__cVfSaLf",
  });
}

function saveSupabaseConfig(url: string, anonKey: string): void {
  setJson(SUPABASE_KEY, { url: url.trim(), anonKey: anonKey.trim() });
}

function getAiConfig(): AiConfig {
  return getJson(AI_KEY, {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: "",
    model: "qwen/qwen-2.5-72b-instruct",
  });
}

function saveAiConfig(cfg: AiConfig): void {
  setJson(AI_KEY, cfg);
}

async function initSupabaseFromConfig(): Promise<void> {
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey) {
    supabaseClient = null;
    cloudUserId = null;
    statusText = "本地模式（未配置 Supabase）";
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

async function persistDreams(): Promise<void> {
  if (supabaseClient && cloudUserId) {
    const rows = dreams.map((d) => ({ ...d, user_id: cloudUserId }));
    const { error } = await supabaseClient.from("dream_entries").upsert(rows, { onConflict: "id" });
    if (!error) return;
  }
  saveLocalDreams(dreams);
}

async function removeDreamById(id: string): Promise<void> {
  dreams = dreams.filter((d) => d.id !== id);
  if (supabaseClient && cloudUserId) {
    await supabaseClient.from("dream_entries").delete().eq("id", id).eq("user_id", cloudUserId);
  }
  saveLocalDreams(dreams);
}

function render(): void {
  const ai = getAiConfig();
  const supa = getSupabaseConfig();
  const edit = editingId ? dreams.find((d) => d.id === editingId) : null;
  const defaultDate = edit?.date ?? new Date().toISOString().slice(0, 10);

  const listHtml = dreams.length
    ? dreams
        .map(
          (d) => `<article class="dream-card">
    <div class="dream-top">
      <div>
        <h3>${escapeHtml(d.title || "无标题")}</h3>
        <p>${escapeHtml(d.date)} · ${escapeHtml(d.life_context || "未填写生活关联")}</p>
      </div>
      <label><input type="checkbox" class="story-pick" data-id="${escapeHtml(d.id)}"/> 选入故事</label>
    </div>
    <div class="chips">${d.mood_tags.map((t) => `<span class="chip">${escapeHtml(moodWithEmoji(t))}</span>`).join("")}</div>
    <pre>${escapeHtml(d.content)}</pre>
    ${d.ai_interpretation ? `<div class="ai-box"><b>AI 解梦：</b>${escapeHtml(d.ai_interpretation)}</div>` : ""}
    <div class="row-actions">
      <button class="btn" data-action="interpret" data-id="${escapeHtml(d.id)}">AI 解梦</button>
      <button class="btn ghost" data-action="edit" data-id="${escapeHtml(d.id)}">编辑</button>
      <button class="btn danger" data-action="delete" data-id="${escapeHtml(d.id)}">删除</button>
    </div>
  </article>`,
        )
        .join("")
    : `<p class="empty">还没有梦境记录，先写下今天的梦吧。</p>`;

  app.innerHTML = `
  <header>
    <h1>梦境花园</h1>
    <p>绿色疗愈风 · 云端同步 · AI 解梦 · 周/月/年回顾 · AI 编故事</p>
  </header>

  <section class="panel">
    <h2>${edit ? "编辑梦境" : "记录梦境"}</h2>
    <form id="dream-form">
      <input id="dream-id" type="hidden" value="${edit ? escapeHtml(edit.id) : ""}" />
      <div class="grid2">
        <div><label>日期</label><input type="date" id="dream-date" required value="${escapeHtml(defaultDate)}"/></div>
        <div><label>标题</label><input id="dream-title" placeholder="例如：绿色地铁站" value="${escapeHtml(edit?.title ?? "")}"/></div>
      </div>
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
      <button class="btn" id="run-review">生成回顾</button>
      <button class="btn ghost" id="run-review-ai">AI 深度回顾</button>
    </div>
    <div class="output">${escapeHtml(reviewResult || "点击生成回顾")}</div>
  </section>

  <section class="panel">
    <h2>AI 编故事（<=1000 字）</h2>
    <p class="hint">先在梦境卡片勾选素材，再点生成。内置风格：村上春树。</p>
    <div class="row-actions">
      <button class="btn" id="build-story">生成故事（村上春树风格）</button>
    </div>
    <div class="output">${escapeHtml(storyResult || "故事会显示在这里")}</div>
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
        <button class="btn" id="save-supa">保存配置</button>
        <button class="btn ghost" id="email-login">发送登录链接</button>
        <button class="btn ghost" id="logout">退出登录</button>
        <button class="btn ghost" id="sync-now">立即同步</button>
      </div>
    </div>
  </details>

  <details class="panel fold">
    <summary>AI 设置</summary>
    <div class="grid3">
      <div><label>接口地址（OpenAI 兼容）</label><input id="ai-endpoint" value="${escapeHtml(ai.endpoint)}"/></div>
      <div><label>API Key</label><input id="ai-key" value="${escapeHtml(ai.apiKey)}" placeholder="sk-..."/></div>
      <div><label>模型</label><input id="ai-model" value="${escapeHtml(ai.model)}"/></div>
    </div>
    <div class="row-actions">
      <button class="btn ghost" id="save-ai">保存 AI 设置</button>
    </div>
  </details>
  `;

  bindEvents();
}

function selectedTagsFromForm(): string[] {
  const checked = Array.from(document.querySelectorAll<HTMLInputElement>(".mood-check:checked")).map((el) => el.value.trim());
  const customRaw = (document.querySelector<HTMLInputElement>("#custom-tags")?.value ?? "").trim();
  const custom = customRaw ? customRaw.split(",").map((v) => v.trim()).filter(Boolean) : [];
  return Array.from(new Set([...checked, ...custom]));
}

async function askAi(prompt: string): Promise<string> {
  const cfg = getAiConfig();
  if (!cfg.endpoint || !cfg.apiKey || !cfg.model) throw new Error("请先保存完整 AI 设置");
  const resp = await fetch(cfg.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.8,
      messages: [
        { role: "system", content: "你是温柔、克制、善于心理象征分析的梦境分析助手。" },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`AI 请求失败：${resp.status}`);
  const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() || "AI 未返回内容";
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
    `最近主题标题：${target.slice(0, 4).map((d) => d.title || "无标题").join(" / ")}`,
  ].join("\n");
}

function pickedDreamsForStory(): Dream[] {
  const ids = Array.from(document.querySelectorAll<HTMLInputElement>(".story-pick:checked")).map((el) => el.dataset.id || "");
  const set = new Set(ids);
  return dreams.filter((d) => set.has(d.id));
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

  document.querySelector("#save-ai")?.addEventListener("click", () => {
    saveAiConfig({
      endpoint: (document.querySelector<HTMLInputElement>("#ai-endpoint")?.value ?? "").trim(),
      apiKey: (document.querySelector<HTMLInputElement>("#ai-key")?.value ?? "").trim(),
      model: (document.querySelector<HTMLInputElement>("#ai-model")?.value ?? "").trim(),
    });
    alert("AI 设置已保存");
  });

  document.querySelector("#new-dream")?.addEventListener("click", () => {
    editingId = null;
    render();
  });

  document.querySelector("#dream-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const id = (document.querySelector<HTMLInputElement>("#dream-id")?.value ?? "").trim() || crypto.randomUUID();
    const old = dreams.find((d) => d.id === id);
    const item: Dream = {
      id,
      user_id: cloudUserId ?? undefined,
      date: (document.querySelector<HTMLInputElement>("#dream-date")?.value ?? "").trim(),
      title: (document.querySelector<HTMLInputElement>("#dream-title")?.value ?? "").trim(),
      content: (document.querySelector<HTMLTextAreaElement>("#dream-content")?.value ?? "").trim(),
      life_context: (document.querySelector<HTMLTextAreaElement>("#dream-life")?.value ?? "").trim(),
      mood_tags: selectedTagsFromForm(),
      ai_interpretation: old?.ai_interpretation ?? "",
      created_at: old?.created_at ?? nowIso(),
      updated_at: nowIso(),
    };
    if (!item.date || !item.content) return alert("日期和梦境内容必填");
    dreams = sortDreams([...dreams.filter((d) => d.id !== item.id), item]);
    await persistDreams();
    editingId = null;
    render();
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
      if (action === "interpret") {
        try {
          d.ai_interpretation = await askAi(
            `请根据以下梦境给出解读，输出结构：1)象征线索 2)与最近生活联系 3)情绪建议(3条)\n\n标题:${d.title}\n日期:${d.date}\n情绪标签:${d.mood_tags.join("、")}\n生活关联:${d.life_context}\n梦境:${d.content}`,
          );
          d.updated_at = nowIso();
          await persistDreams();
          render();
        } catch (e) {
          alert(e instanceof Error ? e.message : "AI 解梦失败");
        }
      }
    });
  });

  document.querySelector("#run-review")?.addEventListener("click", () => {
    const period = (document.querySelector<HTMLSelectElement>("#review-period")?.value ?? "week") as ReviewPeriod;
    reviewResult = makeReview(period);
    render();
  });

  document.querySelector("#run-review-ai")?.addEventListener("click", async () => {
    const period = (document.querySelector<HTMLSelectElement>("#review-period")?.value ?? "week") as ReviewPeriod;
    const days = rangeDays(period);
    const target = dreams.filter((d) => Date.now() - new Date(d.date).getTime() <= days * 24 * 3600 * 1000);
    try {
      reviewResult = await askAi(
        `请对我近${days}天的梦境做回顾，结构：1)主导情绪 2)潜在生活议题 3)自我照顾建议。\n数据：${JSON.stringify(target)}`,
      );
      render();
    } catch (e) {
      alert(e instanceof Error ? e.message : "AI 回顾失败");
    }
  });

  document.querySelector("#build-story")?.addEventListener("click", async () => {
    const picked = pickedDreamsForStory();
    if (!picked.length) return alert("请先勾选至少 1 条梦境");
    try {
      storyResult = await askAi(
        `请使用“村上春树风格”写一篇中文短篇小说（<=1000字），基于这些梦境素材。要求：叙事克制、现实与超现实交织、留白结尾。\n素材：${JSON.stringify(picked)}`,
      );
      render();
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成故事失败");
    }
  });
}

async function bootstrap(): Promise<void> {
  await initSupabaseFromConfig();
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async (_evt, session) => {
      cloudUserId = session?.user?.id ?? null;
      statusText = cloudUserId ? `云端模式（${session?.user?.email ?? "已登录"}）` : "云端已配置（未登录）";
      await loadDreams();
      render();
    });
  }
  await loadDreams();
  render();
}

void bootstrap();
