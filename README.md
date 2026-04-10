# Dream Journal

绿色系梦境日记（女生审美）+ 云端同步 + AI 解梦 + 周/月/年回顾 + AI 编故事。

## 功能

- 绿色疗愈风 UI
- 梦境记录（内容 + 最近生活关联）
- 情绪标签支持多选 + 自定义
- AI 解梦（每条记录单独生成）
- 周回顾 / 月回顾 / 年回顾（本地统计 + AI 深度回顾）
- 编故事模块（从勾选梦境生成，内置村上春树风格，限 1000 字内）
- 云端存储（Supabase 登录后跨设备同步）

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 云端存储配置（Supabase）

在 Supabase 新建项目后，直接到 SQL Editor 执行：

- `scripts/supabase.sql`

这个脚本会自动创建 `dream_entries` 表、索引和 RLS 策略（只允许用户访问自己的数据）。

然后把 Supabase 的 URL 和 Anon Key 填进页面的「账号与云端存储」卡片，使用邮箱魔法链接登录即可跨设备同步。

## AI 配置

页面内可直接填写 OpenAI 兼容接口：

- endpoint（例如 OpenRouter）
- API Key
- model

保存后即可使用 AI 解梦、AI 回顾、AI 编故事。

### GitHub Pages + OpenRouter（避免 Failed to fetch）

静态站从浏览器直连 `openrouter.ai` 常被 CORS / 扩展拦截。本项目已支持通过 **Supabase Edge Function** 转发请求（与页面同源策略无关）。

**方式 A：GitHub Actions（推荐，无需本机装 CLI）**

1. 打开 [Supabase Account → Access Tokens](https://supabase.com/dashboard/account/tokens) 新建一个 Token  
2. 打开本 GitHub 仓库 **Settings → Secrets and variables → Actions**，新建：
   - `SUPABASE_ACCESS_TOKEN`：上一步的 Token  
   - `SUPABASE_PROJECT_REF`：项目 Reference ID（与 URL 里一致，例如 `https://xxxx.supabase.co` 中的 `xxxx`）  
3. 打开 **Actions → Deploy Supabase Edge Function → Run workflow** 运行一次；或推送修改 `supabase/functions/` 后会自动部署  

部署完成后，页面里已配置的 Supabase URL + Anon Key 不变，使用 OpenRouter 时会**自动优先走代理**。

**方式 B：本机 CLI**

```bash
supabase login
supabase functions deploy openrouter-proxy --project-ref <你的项目 ref>
```

可选：在 Supabase 控制台为该函数设置环境变量 `OPENROUTER_SITE_URL`（你的站点 URL，用于 OpenRouter 的 `HTTP-Referer`）。

