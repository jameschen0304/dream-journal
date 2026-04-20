# Dream Journal

绿色系梦境日记 + 云端同步（Supabase）+ 手动解读 + 周/月/年统计回顾 + 故事素材整理与复制。

## 功能

- 绿色疗愈风 UI
- 梦境记录（内容 + 最近生活关联）
- 情绪标签多选 + 自定义
- 每条梦境可写「手动解读」并单独保存
- 周 / 月 / 年回顾（本地统计汇总）
- 勾选多条梦境生成可复制的素材文本
- 登录 Supabase 后跨设备同步

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

在 Supabase 新建项目后，到 SQL Editor 执行：

- `scripts/supabase.sql`

脚本会创建 `dream_entries` 表、索引与 RLS（用户只能访问自己的数据）。

在页面「账号与云端存储」中填写项目的 URL 与 Anon Key，使用邮箱魔法链接登录即可同步。

## GitHub Pages

本仓库 `vite.config.ts` 中 `base` 为 `/dream-journal/`，与 `https://<user>.github.io/dream-journal/` 路径一致。
