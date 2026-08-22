# 🗂️ dsh-collapse-history

> DeepSeek Harness Web 对话历史折叠插件：**自动 + 手动**折叠「思考过程」与「用户问题」，最近的 N 条始终保持展开。

这是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web 的**零构建、零依赖客户端插件**。它能把历史对话里冗长的**思考（Think）过程**和**用户问题气泡**折叠起来，浏览上下文历史时不再被大段文字淹没——最近 N 条仍然完整可见。

⭐ **觉得好用就点个 Star**，帮助项目成长！

---

## ✨ 功能特性

| 功能 | 说明 |
| --- | --- |
| ⚡ **自动折叠（默认开启）** | 较早的思考过程与用户问题自动折叠，最近 N 条保持展开。 |
| 🧠 **思考过程** | 点击任意思考块一键展开/折叠（保留原生交互）；支持批量「全部折叠/全部展开」。 |
| 👤 **用户问题** | 每条问题增加折叠按钮；折叠后收成一行小胶囊，点击即可展开。 |
| 📌 **手动固定** | 你手动操作过的条目会被「钉住」，自动折叠永远不会覆盖你的选择。 |
| 🎛 **设置面板** | 分别调整思考/问题的保留条数 N、自动折叠开关、清除固定、恢复默认。 |
| 💾 **设置持久化** | 保存在 `localStorage`，刷新页面不丢失。 |
| 🌗 **原生外观** | 使用应用自带的设计令牌（`--dsw-alias-**）着色，亮色/暗色主题均适配。 |
| 🌐 **国际化** | 界面跟随浏览器语言自动切换（中文 / English）。 |
| 🧩 **零构建零依赖** | 手写客户端包，无需任何工具链与运行时依赖。 |

## 🎬 效果演示

![demo](docs/demo.gif)

*自动折叠 → 全部折叠思考 → 全部展开 → 折叠/展开问题 → 设置面板。*

## 📸 界面截图

| 自动折叠后的历史（右下角工具条） | 设置面板 |
| --- | --- |
| ![auto](docs/screenshot-auto.png) | ![settings](docs/screenshot-settings.png) |

折叠后的用户问题胶囊：

![chip](docs/screenshot-chip.png)

## 📦 安装

> 需要 DSH ≥ `0.1.1-rc.1` 与 `web` profile。

### 方式 A —— 直接从本仓库（推荐）

```bash
dsh plugin --profile web add github:hengxiangdeheng-jpg/dsh-collapse-history
```

### 方式 B —— 从 npm（发布后可用）

```bash
dsh plugin --profile web add dsh-collapse-history
```

### 方式 C —— 本地目录

```bash
dsh plugin --profile web add link:D:/path/to/dsh-collapse-history
```

然后**注册 loader 条目**，二选一：

1. 把 `dsh-collapse-history` 加进 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 列表（插件自带的 `cordis.patch.yml` 会自动注册自己）；**或**
2. 在 `~/.dsh/profiles/web/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: dsh-collapse-history
      name: 'dsh-collapse-history'
```

最后重启 web profile：

```bash
dsh web
```

## 🎮 使用说明

对话列右下角会出现一个悬浮工具条：

| 按钮 | 作用 |
| --- | --- |
| ⚡ | 切换**自动折叠**开关 |
| 🧠▾ / 🧠▴ | **全部折叠 / 全部展开**思考过程（并固定状态） |
| 👤▾ / 👤▴ | **全部折叠 / 全部展开**用户问题（并固定状态） |
| ⚙ | **设置**：思考/问题保留条数 N、清除固定、恢复默认 |

逐条操作：

- **思考过程**：点击 Think 行标题即可展开/折叠（原生交互）；手动操作过的行会自动被固定。
- **用户问题**：使用气泡旁的小 `▾` 按钮折叠，点击折叠胶囊即可展开。

## ⚙️ 配置

保存在 `localStorage`（`dsh-collapse-history:settings:v1`），可在 ⚙ 弹窗中修改：

| 键 | 默认 | 范围 | 含义 |
| --- | --- | --- | --- |
| `auto` | `true` | 布尔 | 自动折叠总开关 |
| `thinkKeep` | `2` | 0–10 | 最近多少条**思考过程**保持展开 |
| `userKeep` | `3` | 0–10 | 最近多少条**用户问题**保持展开 |

## 🛠 实现原理

- 纯 **DOM 层**客户端插件：`MutationObserver` 监听对话列（`[data-pane="conversation"]`，由 web-ui 兼容层打标，缺失时插件自己补标）。
- 思考行用稳定的 `[data-variant="think"]` 属性识别；折叠/展开复用内置 disclosure（`[data-disclosure-row="true"]`），**不触碰 React 内部状态**。
- 用户行用稳定的 CSS module 后缀 `[class$="_userRow"]` 识别。
- 自动折叠在 `requestAnimationFrame` 内执行，把 React 的一连串 DOM 变更合并成一次处理。
- 流式输出中的行（`data-state="running"`）一律不处理。

## ⚠️ 已知限制

- 固定状态跟随 DOM 元素存活：切换会话或大幅重渲染后，手动固定可能失效（自动折叠会立即重新生效）。
- 只作用于内置对话视图；详情/轨迹面板刻意不动。

## 🗺 路线图

- [ ] 整条助手消息（正文 + 工具调用）作为一个整体折叠
- [ ] 按会话记忆折叠状态
- [ ] 全局折叠快捷键
- [ ] 接入可视化设置页（`dsh-client-ui-settings`）

## 📄 许可证

[MIT](./LICENSE) © dsh-collapse-history contributors