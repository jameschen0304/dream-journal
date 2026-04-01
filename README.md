# Dream Journal (GitHub Pages)

这是一个可直接部署到 GitHub Pages 的静态梦境日记应用（Vite + TypeScript）。

## 本地开发

1. 安装 Node.js 20+
2. 安装依赖：

```bash
npm install
```

3. 启动开发环境：

```bash
npm run dev
```

## 构建

```bash
npm run build
```

构建后会在 `dist/` 生成站点文件，并自动复制 `404.html`（用于 GitHub Pages 单页回退）。

## GitHub Pages 发布

仓库已包含工作流：`.github/workflows/pages.yml`

发布步骤：

1. 把代码推到 `main` 分支
2. 打开 GitHub 仓库 `Settings` -> `Pages`
3. 在 `Build and deployment` 里选择 `GitHub Actions`
4. 等待 `Deploy to GitHub Pages` 工作流成功

最终访问地址通常是：

`https://<你的GitHub用户名>.github.io/dream-journal/`

