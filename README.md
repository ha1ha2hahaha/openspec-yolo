# openspec-yolo

AI Native 协作流程的 skill 包：OpenSpec 五步流程（explore → propose → apply → commit → archive）+ 接口契约 `api.md` + YApi 测试集合。

配套规范文档（飞书）：AI Coding 落地规范 v2：接口契约接入 YApi。

## 里面有什么

```
.claude/
├── commands/opsx/            /opsx:explore | propose | apply | archive | sync | update
│                             propose / apply / archive 开头各加了一行「本仓库改造：先读 yapi/SKILL.md」
└── skills/
    ├── openspec-explore / openspec-propose / openspec-apply-change / openspec-archive-change
    │                         OpenSpec 原装 skill，propose / apply-change / archive-change 挂了同样的钩子
    ├── openspec-sync-specs / openspec-update-change
    └── yapi/                 接口契约 + YApi
        ├── SKILL.md          规则：api.md 怎么写、五步里各做什么、红了怎么判
        ├── scripts/yapi.mjs  init | push <变更> | archive <变更>
        ├── openspec-schema/  OpenSpec 产物清单（多一个 api 产物）+ 模板
        └── references/
            ├── example-api.md   实测通过的 api.md 范例
            └── project.md       ← 唯一项目专有的文件，换仓库重写它
```

## 装到一个仓库里

前提：仓库已经 `openspec init` 过（有 `openspec/` 目录）。

1. 把 `.claude/` 整个拷进仓库根目录（已有 `.claude/` 的合并 `commands/opsx/` 和 `skills/` 两个目录）。
2. 重写 `.claude/skills/yapi/references/project.md`：统一返回格式、成功码、公共请求头、test 域名、YApi 地址和项目 id、测试数据表。
3. 装 yapi CLI 并登录一次（密码只用来换 cookie，不落盘，7 天一续）：

```bash
npm i -g @leeguoo/yapi-mcp
yapi config init --base-url=<YApi 地址> --auth-mode=global --email=<邮箱>
yapi login --base-url=<YApi 地址> --email=<邮箱> --password=<密码>
yapi whoami
```

4. 在仓库根目录跑一次 `node .claude/skills/yapi/scripts/yapi.mjs init`（AI 读到 skill 时也会自己跑）：把 `api` 产物接进 OpenSpec、把 `openspec/config.yaml` 切到 `schema: api-contract`、`.gitignore` 加 `.yapi/`。

之后 `/opsx:propose` 会多生成一个 `api.md`，`/opsx:apply` 做完会把接口定义和测试集合推到 YApi，人在 YApi 点「开始测试」，`/opsx:archive` 把 `api.md` 合进 `openspec/specs/<模块>/api.md`。

## 已知的 YApi 限制

- 浏览器扩展发请求时会删掉 `Cookie` 头，只带浏览器自己存的 cookie。需要 cookie 的场景（风控放行、登录态）由人在 Chrome 里对目标域名设一次；要固定 cookie 的用例脚本不推 YApi，AI 在 apply 时用 curl 验。
- 用例脚本沙箱可能起不来（服务端 cgroup 权限），所以断言靠集合「通用规则」：期望 code 相同的用例放一个集合。
- 项目 token 推不了用例（`/api/col/*` 只认登录态），所以 HTTP 走 yapi CLI。

## 不要放进来的东西

token、密码、cookie、公司内部的放行值。`project.md` 里只写事实，不写凭据。
