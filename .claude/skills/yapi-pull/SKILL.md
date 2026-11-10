---
name: yapi-pull
description: 前端拉后端接口：只要一个 YApi 项目 Token，把 YApi 上的接口拉成本地快照 .yapi/pull/api.md，再照着它写前端代码。用户输入 /yapi-pull 时使用；用户说「拉一下接口」「后端接口好了没」「从 YApi 拿接口」「这个接口返回什么」时也用。只读，不往 YApi 写任何东西。
---

# yapi-pull

给前端用的命令。前端没有后端代码，也不知道后端的变更名、分类名，**只需要一个 YApi 项目 Token**：

```
/yapi-pull <项目token>
```

用户这次给的参数：`$ARGUMENTS`

## 第 0 步：确认脚本在

```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
test -f "$ROOT/.claude/skills/yapi/scripts/yapi.mjs" && echo ok
```

不在就停下，告诉用户：本命令依赖同一个包里的 `yapi` skill，要把 openspec-yolo 的 `.claude/skills/yapi/` 和 `.claude/skills/yapi-pull/` 两个目录一起拷进仓库的 `.claude/skills/`。不要自己去网上找别的版本。

## 第 1 步：拿 Token

- 上面的参数里有 token（一长串字母数字），就用它。
- 参数是空的：看本对话里用户之前有没有给过；没有就**问用户一次**，原话：

  > 请把 YApi 项目的 Token 发我：YApi 项目页 → 设置 → Token，复制那一长串。

只问 token，**不要问地址、变更名、分类名**：地址脚本里有默认值，后两样前端本来就不知道。

禁止：猜 token、翻浏览器 cookie、从仓库或别的文件里抠 token。

**Token 能读也能写**（YApi 的设计，项目 token 也能改接口），所以：只放在命令行参数里用；不写进代码、`.env`、README、提交信息或任何文件；回复里不要原样复述。

## 第 2 步：拉

```bash
node "$ROOT/.claude/skills/yapi/scripts/yapi.mjs" pull <token>
```

在仓库根目录跑，默认拉整个项目。产物：

| 文件 | 用途 |
|---|---|
| `.yapi/pull/api.md` | 接口清单 + 每个接口的请求头、参数、请求体、返回 JSON Schema、业务错误码 |
| `.yapi/pull/api.json` | 同一份数据的原始 YApi 导出，要精确字段时读它 |

`.yapi/` 会自动加进 `.gitignore`，快照不进 git。

报错怎么办：

| 报错 | 做什么 |
|---|---|
| 需要 YApi 项目 Token | 回第 1 步问用户 |
| token 无效或已重置 | 告诉用户 token 不对，请他重新复制；不要换别的 token 试 |
| 连不上 YApi（已自动重试 3 次） | 让用户确认连着公司网络 / VPN |
| YApi 地址不对 / 返回的不是 JSON | 公司换了 YApi 地址：问用户新地址，加 `--base-url <地址>` 重跑 |

## 第 3 步：读快照，帮用户找到要的接口

读 `.yapi/pull/api.md`，回复用户：

1. 一张表：分类、方法、路径、标题、状态。状态 `undone` = 后端写完了、还没归档，可以先联调；`done` = 已归档。
2. 用户说了要做什么（「做订阅列表页」「对接切换支付渠道」），就按**标题、路径、接口说明**从清单里找出对应的接口，点名出来；找不到就如实说，并问用户是不是后端还没推。
3. 用户没说要做什么，就问他接下来要对接哪个页面或功能。

接口多的时候不用重新拉，直接在快照里找。

写前端代码时照快照来：

- 返回结构以「返回（JSON Schema）」为准，可以据此生成 TS 类型。
- **POST 请求体只有示例 JSON，不是 schema**：字段类型、是否必填看接口说明；拿不准就问后端，不要从示例值反推。
- 业务错误码在「接口说明」里，前端要处理的错误按这里列的写。
- 登录态、签名这类公共请求头不在接口里，按前端项目现有的请求封装走。

## 发现接口和预期不一致

不要改快照、不要在 YApi 上改、不要在前端「先按自己理解写」。把差异（接口、字段、你期望的 vs 快照里的）列出来，请用户找后端：后端改好重新推到 YApi 后，前端再跑一次 `/yapi-pull <token>` 就是新的。
