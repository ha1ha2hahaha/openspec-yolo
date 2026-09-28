# openspec-yolo

AI Native 协作流程的 skill 包，装进任何一个后端仓库就能用：

- OpenSpec 五步流程：explore → propose → apply → commit → archive
- propose 时多生成一份人读的接口契约 `api.md`（接口 + 用例，五张表）
- apply 做完，脚本把接口定义和测试用例推到 YApi，人在 YApi 点「开始测试」
- archive 时 `api.md` 合进主 spec，YApi 接口状态改 done

配套规范（飞书）：AI Coding 落地规范 v2：接口契约接入 YApi。

## 目录

```
.claude/
├── commands/opsx/     /opsx:explore | propose | apply | archive | sync | update
└── skills/
    ├── openspec-*/    OpenSpec 原装 skill（propose / apply-change / archive-change 开头加了一行「先读 yapi/SKILL.md」）
    └── yapi/
        ├── SKILL.md              规则：api.md 怎么写、五步里各做什么、红了怎么判
        ├── scripts/yapi.mjs      init | push <变更名> | archive <变更名>
        ├── openspec-schema/      OpenSpec 产物清单（比默认多一个 api）+ 模板
        └── references/
            ├── example-api.md    脚本校验通过的 api.md 范例（虚构业务）
            └── project.md        项目事实，AI 第一次用时自己补，人不用填
```

## 安装

在业务仓库根目录跑一句（要先有 Node 和 npm）：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/ha1ha2hahaha/openspec-yolo/main/install.sh)
```

它只装 skill：没装 OpenSpec 就装、没有 `openspec/` 就 `openspec init`、把 `commands/opsx`、`skills/openspec-*`、`skills/yapi` 拷进 `.claude/`、把 api 产物接进 OpenSpec、自检。重复跑等于更新，不覆盖已有的 `references/project.md`。

装完把 `.claude/`、`openspec/`、`CLAUDE.md` 提交进 git。

不在脚本里做的：yapi CLI 的安装和登录、YApi 环境配置、test 环境的 cookie。这些按团队文档来。

项目事实（统一返回格式、成功码、test 域名、YApi 项目 id、测试数据）不用人填：AI 第一次跑 `/opsx:propose` 时自己读代码补进 `.claude/skills/yapi/references/project.md`，读不到的问你一次。

## 日常怎么用

| 时机 | 谁 | 做什么 |
|---|---|---|
| `/opsx:propose` | AI | 生成 proposal / design / **api.md** / tasks / spec。不推 YApi |
| review | 人 | 看 tasks.md 和 api.md，改走对话，不手改 md |
| `/opsx:apply` | AI | 照 api.md 写代码，curl 自跑全部用例；tasks 全完成后跑 `node .claude/skills/yapi/scripts/yapi.mjs push <变更名>`，接口定义和测试集合一起到 YApi |
| 合进 test 后 | 人 | YApi → 测试集合，对 `<变更名>`、`<变更名> 期望 <code>` 几个集合各点一次「开始测试」 |
| `/opsx:archive` | AI | 确认验收项已勾；归档后跑 `archive <变更名>`，api.md 合进 `openspec/specs/<模块>/api.md`，YApi 状态改 done |

`push` / `archive` 都支持 `--dry-run`（不需要登录）和 `--project <id>`（推到别的 YApi 项目）。

## 已知的 YApi 限制

- 浏览器扩展发不了 `Cookie` 头。要固定 cookie 的用例（比如连打 4 次测限流）脚本不推 YApi，AI 在 apply 时用 curl 验。
- 用例脚本沙箱可能起不来（服务端 cgroup 权限）。断言靠集合「通用规则」：期望 code 相同的用例放一个集合，所以一个变更会有几个集合。
- 项目 token 推不了用例（`/api/col/*` 只认登录态），所以走 yapi CLI。

## 更新

在业务仓库根目录再跑一次一键安装那句就是更新，`project.md` 不会被覆盖。

