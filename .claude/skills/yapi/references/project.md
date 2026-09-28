# 本仓库的项目事实（换仓库只重写这一个文件）

写 api.md、推 YApi 之前读。规则和脚本在上一层 SKILL.md，不放项目专有内容。**只写事实，不写 token、密码、cookie 值。**

| 事实 | 值 |
|---|---|
| 统一返回 | `{"code":200,"data":...,"msg":"success"}`，HTTP 恒 200（按你的项目改） |
| 成功码 | `code` = `200`（不是 0）；YApi 集合规则「响应字段」配 `code` = `200` |
| 错误时 `data` | 通常 `[]` |
| 公共请求头 | 登录态 Cookie、agent 头、`lang` / `region` / `source` 之类，放 YApi 环境全局 header，不写进 api.md |
| 风控放行 | test 环境如有风控，写清楚放行方式（cookie 名、在哪设一次），**值不写在这里** |
| test 域名 | `https://api.test.example.com`（要 https；YApi 环境里也填 https） |
| YApi 地址 | `http://yapi.example.com`（和 `yapi config init --base-url` 一致） |
| YApi 项目 id | `<数字>`（项目页网址 /project/<数字>/ 里的数字；推别的项目加 `--project <id>`） |
| YApi 登录 | 用 yapi CLI 的登录态（`yapi login`，7 天一续），脚本不碰 token 和密码 |

---

## 统一返回格式（写 api.md 返回字段表前必读）

来源：`<控制器基类文件>` 的 `<输出方法>`。

| 事实 | 对 api.md 的影响 |
|---|---|
| HTTP 状态恒为 200 | 返回字段表只写 200 那一种；真正的判断靠 `body.code` |
| 成功 `code` 是 `200` | YApi 集合规则「响应字段」要配 `code` = `200` |
| 业务错误时 `data` 常是 `[]` | 错误码表 `data` 列写 `[]` |

## 鉴权

| 机制 | 说明 | 出处 |
|---|---|---|
| 登录态 | Cookie 名、header 名 | 文件:行号 |
| 登录接口 | `POST /api/xxx/login` | 文件:行号 |

## 环境

- test：`https://api.test.example.com`

---

## test 环境可用的测试数据（人维护）

写 api.md 的示例值从这里取。取不到的问用户，不猜。每条标来源和日期，失效了划掉。

| 用途 | 值 | 来源 | 日期 |
|---|---|---|---|
| 商品 id | 待补 | | |
| 店铺 id | 待补 | | |

## 已知限流

| 接口 | 规则 | 用例里怎么写 |
|---|---|---|
| `/api/xxx` | 按 cookie 每天 N 次 | 扣次数的正例 ≤ N 条；要固定 cookie 的用例不推 YApi，AI 用 curl 验 |
