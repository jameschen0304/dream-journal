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

