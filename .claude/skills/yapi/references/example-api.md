# 接口契约（范例：免费快照报告，2026-09-28 在 YApi 项目 1070 实测通过）

## GET /api/snapshot/report 免费快照报告
模块：snapshot-report　　登录：否　　签名：否

### 请求头
| 参数 | 必填 | 示例 | 说明 |
|---|---|---|---|
| Cookie | 是 | fp_visid=@guid | 按 visid 计次，每天 3 次；YApi 每次生成新值 |

### 请求参数
| 参数 | 类型 | 必填 | 示例 | 说明 |
|---|---|---|---|---|
| kind | string | 是 | product | product / shop / creator |
| id | string | 是 | 1730826344204964304 | 数字字符串，最长 25 位；示例是 test 库真实商品 |
| ids | string | 否 | | 逗号分隔，最多 10 个 |
| sid | string | 否 | | 16 位十六进制 |

### 返回字段
| 字段 | 类型 | 必有 | 说明 |
|---|---|---|---|
| code | integer | 是 | 成功 200 |
| msg | string | 是 | |
| data.sid | string? | 是 | 没命中时为 null |
| data.quota.used | integer | 是 | |
| data.quota.limit | integer | 是 | |
| data.quota.reset_at | string | 是 | 形如 2026-09-28T00:00:00-07:00 |
| data.report | object? | 是 | 13 个固定键；没命中时为 null |
| data.report.kind | string | 是 | product / shop / creator |
| data.report.range | object | 是 | days / start / end |
| data.report.base | object | 是 | |
| data.report.summary | object | 是 | gmv / units / creators / avg_price / followers |
| data.report.chart | array | 是 | 28 天趋势 |
| data.report.chart.date | string | 是 | |
| data.report.chart.gmv | number | 是 | |
| data.report.metrics | object | 是 | |
| data.report.channels | array | 是 | |
| data.report.formats | object? | 是 | 商品类型为 null |
| data.report.top_products | object? | 是 | 商品类型为 null |
| data.report.top_creators | object | 是 | total / list |
| data.report.top_videos | object | 是 | total / list |
| data.report.top_categories | object? | 是 | 商品类型为 null |
| data.report.fans | object? | 是 | 商品类型为 null |

### 业务错误码
| code | 场景 | data |
|---|---|---|
| 400 | kind 或 id 非法 | [] |
| 429 | 当日次数用完 | 只有 quota |

### 用例
| 用例 | 参数 | 期望 code | 期望 |
|---|---|---|---|
| 正常查询 | kind=product, id=1730826344204964304 | 200 | 返回结构符合上表，report 非 null |
| id 非法 | kind=product, id=abc | 400 | |
| 次数用完 | 同一 fp_visid 第 4 次调用 | 429 | data 只有 quota |
