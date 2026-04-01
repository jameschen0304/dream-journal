import "./style.css";

type Dream = {
  id: string;
  date: string;
  title: string;
  mood: string;
  content: string;
  createdAt: string;
};

const STORAGE_KEY = "dream-journal-v1";

const MOODS = [
  { value: "", label: "未选" },
  { value: "calm", label: "平静" },
  { value: "anxious", label: "焦虑" },
  { value: "joy", label: "愉快" },
  { value: "fear", label: "恐惧" },
  { value: "weird", label: "离奇" },
  { value: "lucid", label: "清醒梦" },
];

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadDreams(): Dream[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDream);
  } catch {
    return [];
  }
}

function isDream(x: unknown): x is Dream {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.date === "string" &&
    typeof o.title === "string" &&
    typeof o.mood === "string" &&
    typeof o.content === "string" &&
    typeof o.createdAt === "string"
  );
}

function saveDreams(list: Dream[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function sortDreams(list: Dream[]): Dream[] {
  return [...list].sort((a, b) => {
    const da = a.date + a.createdAt;
    const db = b.date + b.createdAt;
    return db.localeCompare(da);
  });
}

function moodLabel(value: string): string {
  const hit = MOODS.find((m) => m.value === value);
  if (hit) return hit.label;
  return value.trim() ? value : "未选";
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app missing");

let dreams = sortDreams(loadDreams());
let editingId: string | null = null;
let formExpanded = dreams.length === 0;

function render(): void {
  const moodOptions = MOODS.map(
    (m) => `<option value="${escapeHtml(m.value)}">${escapeHtml(m.label)}</option>`,
  ).join("");

  const listHtml =
    dreams.length === 0
      ? `<p class="empty">还没有记录。写下一场梦吧 — 数据只保存在你的浏览器里。</p>`
      : `<div class="list">${dreams
          .map((d) => {
            const mood = d.mood
              ? `<span class="mood-pill">${escapeHtml(moodLabel(d.mood))}</span>`
              : "";
            return `
          <article class="card" data-id="${escapeHtml(d.id)}">
            <div class="card-top">
              <div>
                <h3 class="card-title">${escapeHtml(d.title || "无标题")}</h3>
                <p class="card-meta">${escapeHtml(d.date)}</p>
              </div>
              ${mood}
            </div>
            <p class="card-body">${escapeHtml(d.content)}</p>
            <div class="card-actions">
              <button type="button" class="btn-ghost btn-edit" data-id="${escapeHtml(d.id)}">编辑</button>
              <button type="button" class="btn-danger btn-del" data-id="${escapeHtml(d.id)}">删除</button>
            </div>
          </article>`;
          })
          .join("")}</div>`;

  const edit = editingId ? dreams.find((d) => d.id === editingId) : null;
  const formTitle = edit ? "编辑梦境" : "记录新梦境";
  const showForm = Boolean(editingId) || formExpanded;
  const formClass = showForm ? "" : "hidden";
  const defaultDate = edit?.date ?? new Date().toISOString().slice(0, 10);

  app.innerHTML = `
    <header>
      <h1>梦境日记</h1>
      <p class="sub">纯静态页面，可部署在 GitHub Pages。条目保存在本机 localStorage，换浏览器或清除数据会丢失，请定期导出备份。</p>
    </header>

    <div class="toolbar">
      <button type="button" class="btn-primary" id="toggle-form">${edit ? "取消编辑" : showForm ? "收起表单" : "＋ 新记录"}</button>
      <button type="button" class="btn-ghost" id="export-json">导出 JSON</button>
      <label class="btn-ghost" style="display:inline-block;margin:0;cursor:pointer;padding:0.5rem 0.9rem;border-radius:10px;border:1px solid var(--card-border);background:rgba(255,255,255,0.06);">
        导入 JSON
        <input type="file" id="import-json" accept="application/json" class="hidden" />
      </label>
    </div>

    <section class="panel ${formClass}" id="form-panel" aria-label="表单">
      <h2>${formTitle}</h2>
      <form id="dream-form">
        <input type="hidden" id="field-id" value="${edit ? escapeHtml(edit.id) : ""}" />
        <div class="row">
          <div>
            <label for="field-date">日期</label>
            <input type="date" id="field-date" required value="${escapeHtml(defaultDate)}" />
          </div>
          <div>
            <label for="field-mood">感受 / 类型</label>
            <select id="field-mood">${moodOptions}</select>
          </div>
        </div>
        <label for="field-title">标题</label>
        <input type="text" id="field-title" placeholder="简短标题" value="${edit ? escapeHtml(edit.title) : ""}" />
        <label for="field-content">梦境内容</label>
        <textarea id="field-content" placeholder="尽量在醒后立刻记录……" required>${edit ? escapeHtml(edit.content) : ""}</textarea>
        <div class="actions">
          <button type="submit" class="btn-primary">${edit ? "保存修改" : "保存"}</button>
          ${edit ? `<button type="button" class="btn-ghost" id="cancel-edit">取消</button>` : ""}
        </div>
      </form>
    </section>

    <section class="panel" aria-label="列表">
      <h2>全部记录（${dreams.length}）</h2>
      ${listHtml}
    </section>
  `;

  if (edit) {
    const moodEl = app.querySelector<HTMLSelectElement>("#field-mood");
    if (moodEl) moodEl.value = edit.mood;
  }

  bindHandlers();
}

function bindHandlers(): void {
  app.querySelector("#toggle-form")?.addEventListener("click", () => {
    if (editingId) {
      editingId = null;
      formExpanded = dreams.length === 0;
      render();
      return;
    }
    formExpanded = !formExpanded;
    render();
    if (formExpanded) {
      queueMicrotask(() => app.querySelector<HTMLInputElement>("#field-title")?.focus());
    }
  });

  app.querySelector("#cancel-edit")?.addEventListener("click", () => {
    editingId = null;
    formExpanded = dreams.length === 0;
    render();
  });

  app.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLButtonElement).dataset.id;
      if (id) {
        editingId = id;
        const panel = app.querySelector("#form-panel");
        panel?.classList.remove("hidden");
        render();
      }
    });
  });

  app.querySelectorAll(".btn-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = (btn as HTMLButtonElement).dataset.id;
      if (!id || !confirm("确定删除这条记录？")) return;
      dreams = dreams.filter((d) => d.id !== id);
      if (editingId === id) editingId = null;
      if (dreams.length === 0) formExpanded = true;
      saveDreams(dreams);
      render();
    });
  });

  app.querySelector("#dream-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const idField = app.querySelector<HTMLInputElement>("#field-id");
    const date = app.querySelector<HTMLInputElement>("#field-date")?.value ?? "";
    const title = app.querySelector<HTMLInputElement>("#field-title")?.value.trim() ?? "";
    const mood = app.querySelector<HTMLSelectElement>("#field-mood")?.value ?? "";
    const content = app.querySelector<HTMLTextAreaElement>("#field-content")?.value.trim() ?? "";
    if (!date || !content) return;

    const existingId = idField?.value;
    if (existingId) {
      dreams = dreams.map((d) =>
        d.id === existingId
          ? { ...d, date, title, mood, content, createdAt: d.createdAt }
          : d,
      );
      editingId = null;
      formExpanded = false;
    } else {
      const id = crypto.randomUUID();
      dreams = sortDreams([
        ...dreams,
        { id, date, title, mood, content, createdAt: new Date().toISOString() },
      ]);
      formExpanded = false;
    }
    saveDreams(dreams);
    render();
  });

  app.querySelector("#export-json")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(dreams, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dream-journal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  app.querySelector("#import-json")?.addEventListener("change", (ev) => {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as unknown;
        if (!Array.isArray(data)) throw new Error("格式应为数组");
        const incoming = data.filter(isDream);
        if (incoming.length === 0) throw new Error("没有有效条目");
        if (!confirm(`将合并 ${incoming.length} 条记录（按 id 去重覆盖）。继续？`)) return;
        const map = new Map(dreams.map((d) => [d.id, d]));
        for (const d of incoming) map.set(d.id, d);
        dreams = sortDreams([...map.values()]);
        saveDreams(dreams);
        editingId = null;
        formExpanded = dreams.length === 0;
        render();
      } catch (err) {
        alert(err instanceof Error ? err.message : "导入失败");
      }
    };
    reader.readAsText(file, "UTF-8");
  });
}

render();
