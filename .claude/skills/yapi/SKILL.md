---
name: yapi
description: OpenSpec 变更里的接口契约 api.md 怎么写（接口 + 用例，人读的表格）、什么时候推到 YApi、人跑测试红了怎么判。和 openspec-* 四个 skill 一起搬到别的仓库照用；跑 /opsx:propose、/opsx:apply、/opsx:archive 之前先读；用户说「推一下 YApi」「更新接口文档」「接口测试红了」时也用。
---

# yapi

约定：**一个 OpenSpec 变更目录里，除了 proposal / design / tasks，还有一个 `api.md`。**

```
openspec/changes/<变更>/
├── proposal.md
├── design.md
├── tasks.md
├── api.md              ← 接口契约 + 用例，五张表，本 skill 管这个
└── specs/<能力>/spec.md
```

`api.md` 是人读的表格，git 里唯一的事实来源；YApi 是它的投影，负责给人看、给前端 mock、跑测试。

## 搬到别的仓库

本 skill 和 `openspec-explore` / `openspec-propose` / `openspec-apply-change` / `openspec-archive-change` 一起，整个 `.claude/skills/` 拷过去就能用（三个 openspec skill 开头各挂了一行指到这里）。仓库根目录一句 `curl -fsSL https://raw.githubusercontent.com/ha1ha2hahaha/openspec-yolo/main/install.sh | bash` 就装完，不用人填任何配置。

**项目事实由 AI 维护，不让人填。** `references/project.md` 记本仓库的事实：统一返回格式、成功码、错误时 data 形状、登录态和公共请求头、test 域名、YApi 项目 id、测试数据表。第一次写 api.md 之前检查它：文件不存在或有「待填」，就自己去补，补完写进去，下次直接读：

| 事实 | 去哪找 |
|---|---|
| 统一返回格式、成功码、错误时 data 形状 | 控制器基类的 JSON 输出方法（PHP 常叫 writeJson / response，Go 常叫 Success / Fail），读代码，不猜 |
| 登录态、签名、公共请求头 | 基类的 onRequest / 中间件里读 cookie 和 header 的地方 |
| test 域名 | README、CLAUDE.md、部署配置、Apifox / Postman 导出；都没有就问一次 |
| YApi 地址 | `~/.yapi/config.toml` 的 base_url，脚本自己读，不用写 |
| YApi 项目 id | 问一次：「推到 YApi 哪个项目？项目页网址 /project/<数字>/」 |
| 测试数据（真实 id） | 问一次，或从已有单测、Apifox 用例里取；每条标来源和日期 |

只有 YApi 项目 id 和测试数据是人才知道的，一次问清写进文件；其它的从代码里读。

## 第一次在一个仓库里用：自检，不问人

读到本 skill 时先检查：`openspec schemas --json` 里没有 `api-contract`，或仓库 `openspec/config.yaml` 不是 `schema: api-contract`，就跑：

```bash
node .claude/skills/yapi/scripts/yapi.mjs init
```

它做三件事，幂等：把本 skill 的 `openspec-schema/` 复制到 OpenSpec 的用户级目录（Mac / Linux `~/.local/share/openspec/schemas/api-contract`，Windows `%LOCALAPPDATA%\openspec\schemas\`；每次 init 都覆盖，改了 openspec-schema 重跑一次），把仓库 `openspec/config.yaml` 切到 `schema: api-contract`，往 `.gitignore` 加 `.yapi/`。仓库的 `openspec/` 里不会多任何目录。

原因：OpenSpec 只从 `openspec/schemas/` 或用户级目录找自定义产物清单，不读 `.claude/`；接上之后 api.md 才会出现在 `openspec status` 里、缺了 blocked、propose 自动生成。

## 在 OpenSpec 五步里各做什么

| 时机 | 谁 | 做什么 |
|---|---|---|
| `/opsx:propose` | AI | 产物清单会让它在 design 之后、tasks 之前生成 `api.md`（下面的格式）。tasks.md 最后一组固定是「验收」，含一条：`- [ ] N.1 合进 test 后，人在 YApi 测试集合里对本次接口点「开始测试」，全部通过`。**不推 YApi** |
| review | 人 | tasks.md 和 api.md 一起看，改走对话 |
| `/opsx:apply` | AI | 对着 api.md 写代码，自己在开发机把用例表跑一遍。tasks 全部完成后跑 `node .claude/skills/yapi/scripts/yapi.mjs push <变更名>`：接口定义（状态 undone，mock 可打）和测试集合、用例一起推到 YApi。项目 id 从 `references/project.md` 读，要推别的项目加 `--project <id>`。报错按报错改 api.md，最多 3 轮，第 4 轮停下来把报错原样给用户 |
| 合进测试环境后 | 人 | 打开 YApi 项目 → 测试集合，对脚本建的几个集合各点一次「开始测试」（环境选 test），看通过率 |
| `/opsx:archive` | AI | 先确认 tasks.md 里「YApi 测试集合全部通过」那条已勾，没勾就停。归档后跑 `node .claude/skills/yapi/scripts/yapi.mjs archive <变更名>`：api.md 按接口合进 `openspec/specs/<模块>/api.md`，YApi 接口状态改 done。脚本会去 `changes/archive/` 里找 |

**HTTP 由 yapi CLI 代发**（npm 包 `@leeguoo/yapi-mcp`，带人的登录态，所以能建用例）。脚本不碰 token、不碰密码、不存任何凭据。CLI 没装或登录态过期（7 天）时脚本会报错并写明让用户跑哪条命令，AI 照转给用户，自己不装、不登。`--dry-run` 不需要登录。

**用例怎么到 YApi**：第五张表每行一条用例。公司 YApi 的用例脚本沙箱起不来，所以断言全靠集合「通用规则」：期望 code 相同的用例放同一个集合，规则「响应字段 code = 期望值」。集合名：`<变更名>`（正例，另开 HTTP 200 和返回 Schema 校验）、`<变更名> 期望 <code>`（反例）。集合归脚本管，用例按名更新，api.md 里删掉的也删掉，人不要手改。「连打 N 次」展开成 N 条，前 N-1 条进正例集合，最后一条进对应 code 的集合；这种用例一天只能跑一次（限额按天重置）。

## api.md 怎么写（脚本逐条检查，不过就不推）

实测通过的完整范例 `references/example-api.md`，**照它逐字写，不要发挥。** 一个接口一段，五张表：

```markdown
## GET /api/order/detail 订单详情
模块：order-detail　　登录：否　　签名：否

### 请求头
| 参数 | 必填 | 示例 | 说明 |
### 请求参数
| 参数 | 类型 | 必填 | 示例 | 说明 |
### 返回字段
| 字段 | 类型 | 必有 | 说明 |
### 业务错误码
| code | 场景 | data |
### 用例
| 用例 | 参数 | 期望 code | 期望 |
```

| # | 约束 | 违反的后果 |
|---|---|---|
| 1 | `## ` 开头的行只能是接口标题，格式 `## METHOD /path 标题`，一个接口一段 | 脚本报错 |
| 2 | path 以 `/` 开头，只含字母数字 `-_/:.!`，不带域名、不带 `?query` | 脚本报错 |
| 3 | 标题行下一行固定写 `模块：xxx　　登录：是/否　　签名：是/否` | 缺模块行脚本报错 |
| 4 | **模块名 = `openspec/specs/` 下的能力目录名**（英文小写连字符），和 proposal 的 Capabilities 一致；YApi 分类也用它 | 不合规脚本报错；写错会建出多余分类 |
| 5 | `### ` 表名只能是 `请求头` / `请求参数` / `返回字段` / `业务错误码` / `用例`，表头逐字照范例 | 脚本报错 |
| 6 | 类型只能是 `string` `integer` `number` `boolean` `object` `array` 六个小写词；返回字段可空加 `?`，如 `string?` | 脚本报错 |
| 7 | 必填 / 必有 只能填 `是` 或 `否` | 脚本报错 |
| 8 | **必填参数的示例必须是测试环境真实存在的值**，从 `references/project.md` 的测试数据表取；取不到问用户一次，不猜 | 缺示例脚本报错；假值人跑出来全是错误码 |
| 9 | 示例值不加反引号、不加引号；单元格里要写 `\|` 时写成 `\\|` | 脚本会剥反引号，但别依赖 |
| 10 | 返回字段用点路径，`data` 下每个字段一行；列表写 `data.list`（array）再写 `data.list.id`，脚本会放进 items | 「必有」变成 JSON Schema required，没写的字段不校验 |
| 11 | `data` 下至少一个字段「必有 = 是」 | 脚本报错（否则校验形同虚设） |
| 12 | 只写成功那一种返回；业务错误写在错误码表，`data` 列写真实形状 | 成功码、错误时 data 长什么样看 `references/project.md` |
| 13 | 登录态、签名之类的公共头**不写进请求头表**，由 YApi 环境的全局 header 提供；请求头表只写这个接口特有的头 | 写了会盖住环境配置 |
| 14 | **YApi 发不了 `Cookie` 头**（浏览器扩展会删掉它，只带浏览器自己存的 cookie）。请求头表里的 `Cookie` 行只是给 curl 的人看的；风控放行、登录态这类 cookie 由人在浏览器里对 test 域名设一次（见 project.md）。用例表里要「固定 Cookie」的用例脚本不推 YApi，AI 在 apply 时用 curl 验 | 写了也不会生效，别指望它 |
| 15 | 用例表：至少 1 条正例（期望 code 等于项目成功码），错误码表每个 code 各 1 条反例；用例名不重复。参数列只能写三种东西：`k=v`（逗号分隔，GET 进 query，POST 进请求体）、`Cookie xxx`（这条用例专用的请求头，盖掉接口定义里的）、`连打 N 次` | 脚本报错 |
| 16 | 只写本次变更新增或修改的接口 | 一级知识库是「这次为什么这样定」 |

POST 接口：请求参数表照写，脚本转成 JSON 请求体示例推上去（不是 schema），YApi 导入用例时原样复制。

## 人跑红了怎么判

看 YApi 报告里每条用例的状态和提示：

| 现象 | 判断 | 做什么 |
|---|---|---|
| invalid，提示含 required / 类型 / 应当是 xx 类型 | 契约写错了，或代码返回结构变了 | 对照真实返回改 api.md 返回字段表，重 `push`；是代码错回 apply |
| invalid，`body.code` 不是成功码 | 示例值不对，或代码错 | 先确认示例值在测试库存在；是代码问题回 apply |
| error，请求发不出去或状态非 200 | 环境错 | 测试环境挂了、域名配错（要 https）、数据没了；告诉用户 |
| 用例参数是空的 | api.md 用例表参数列没写全 | 补参数列，重 `push` |
| 反例集合里 code 对了但报 Schema 不符 | 反例被放进了正例集合 | 看 api.md 那行期望 code 是不是写成了成功码 |
| 「连打」那组第 1 次就 429 | 今天已经跑过一次，限额没重置 | 明天再跑，或改 api.md 里固定的 visid 值 |

拿不准就说拿不准。不自动改代码。

## 禁止

- 不把 token、密码、cookie 写进任何文件；不替用户跑 `yapi login`
- 不在 propose 阶段推 YApi
- 不猜示例值、不猜项目事实：代码里读得到的读代码，读不到的问一次，写进 project.md
- 不在 YApi 上手改脚本建的接口定义、集合、用例（下次 push 会覆盖）；改 api.md
- 不在人跑绿之前 archive
