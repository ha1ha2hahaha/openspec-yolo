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
            └── project.md        项目事实，每个仓库自己填 ← 唯一要改的文件
```

## 安装（一个仓库一次，约 10 分钟）

下面的命令都在**你的业务仓库根目录**执行。`<...>` 是要替换的值。

### 0. 前提

已经装好并能用：Node 18+、Claude Code、OpenSpec CLI。没装 OpenSpec 的先装：

```bash
npm install -g @fission-ai/openspec@latest
openspec init          # 在仓库根目录跑，选 Claude Code；仓库里会多一个 openspec/ 目录
```

### 1. 把 skill 包拷进仓库

```bash
git clone --depth 1 git@github.com:ha1ha2hahaha/openspec-yolo.git /tmp/openspec-yolo
cp -R /tmp/openspec-yolo/.claude/commands/opsx   .claude/commands/opsx      # 覆盖 openspec init 生成的那份
cp -R /tmp/openspec-yolo/.claude/skills/openspec-* .claude/skills/          # 覆盖原装 skill
cp -R /tmp/openspec-yolo/.claude/skills/yapi     .claude/skills/yapi
rm -rf /tmp/openspec-yolo
```

`.claude/` 已有别的 skill 的话不受影响，只会覆盖 `commands/opsx/` 和 `skills/openspec-*`、`skills/yapi/` 这几个目录。

### 2. 填项目事实

打开 `.claude/skills/yapi/references/project.md`，把表格里的占位符换成你项目的值：统一返回格式、成功码、公共请求头、test 域名、YApi 地址、YApi 项目 id（项目页网址 `/project/<数字>/` 里的数字）、测试数据表。**只写事实，不写 token、密码、cookie 值。**

### 3. 装 yapi CLI 并登录（一台电脑一次）

脚本不直接连 YApi，HTTP 由 [@leeguoo/yapi-mcp](https://github.com/leeguooooo/cross-request-master) 这个 CLI 带着你的登录态发，因为 YApi 建用例的接口只认登录态。

```bash
npm i -g @leeguoo/yapi-mcp
yapi config init --base-url=<YApi 地址> --auth-mode=global --email=<你的邮箱>
yapi login --base-url=<YApi 地址> --email=<你的邮箱> --password=<你的密码>
yapi whoami            # 打印出你的账号就是登录成功
```

密码只用来换 cookie，不落盘（config.toml 里 password 是空的）。cookie 存在 `~/.yapi-mcp/`，7 天过期，过期时脚本会报错提示你重跑 `yapi login`。不要装它附带的 Skill（`npx skills add` 那条），会和这里的 yapi skill 打架。

### 4. 接进 OpenSpec

```bash
node .claude/skills/yapi/scripts/yapi.mjs init
```

它做四件事，幂等：把 `api` 产物清单复制到 OpenSpec 的用户级目录（仓库的 `openspec/` 里不多任何东西）、把 `openspec/config.yaml` 切到 `schema: api-contract`、往 `.gitignore` 加 `.yapi/`、检查 yapi CLI 装没装登没登录。AI 读到 skill 发现没接时也会自己跑这一句。

### 5. 验证

```bash
openspec schemas                 # 应列出 api-contract（source: user）
openspec status --change <任一变更>   # 产物列表里应有 api 一项
```

### 6. 让 YApi 能打你的 test 环境（一台电脑一次）

YApi 在浏览器里发请求靠 cross-request 扩展，它**会删掉写在头里的 Cookie**，只带浏览器自己存的 cookie。如果你的 test 环境要 cookie 才能过（风控放行、登录态），用跑 YApi 的那个 Chrome 打开 test 域名，F12 → Console，`document.cookie="<名>=<值>; path=/; max-age=31536000; SameSite=None; Secure"` 设一次。YApi 环境配置里的域名要用 https。

### 7. 进 git

把 `.claude/`、`openspec/` 和 `CLAUDE.md` 一起提交。知识库进了 git 才是团队的。

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

这个仓库有改动时，在业务仓库根目录重跑（`project.md` 不在这几条里，不会被覆盖）：

```bash
git clone --depth 1 git@github.com:ha1ha2hahaha/openspec-yolo.git /tmp/openspec-yolo
cp -R /tmp/openspec-yolo/.claude/commands/opsx      .claude/commands/opsx
cp -R /tmp/openspec-yolo/.claude/skills/openspec-*  .claude/skills/
cp    /tmp/openspec-yolo/.claude/skills/yapi/SKILL.md                     .claude/skills/yapi/SKILL.md
cp -R /tmp/openspec-yolo/.claude/skills/yapi/scripts                      .claude/skills/yapi/
cp -R /tmp/openspec-yolo/.claude/skills/yapi/openspec-schema              .claude/skills/yapi/
cp    /tmp/openspec-yolo/.claude/skills/yapi/references/example-api.md    .claude/skills/yapi/references/
rm -rf /tmp/openspec-yolo
node .claude/skills/yapi/scripts/yapi.mjs init
```
