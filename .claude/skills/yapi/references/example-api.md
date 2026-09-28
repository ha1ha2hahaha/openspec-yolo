# 接口契约（范例，脚本校验通过；业务是虚构的，只看格式）

## GET /api/order/detail 订单详情
模块：order-detail　　登录：否　　签名：否

### 请求头
| 参数 | 必填 | 示例 | 说明 |
|---|---|---|---|
| Cookie | 是 | visitor_id=@guid | 按访客计次，每天 3 次；YApi 每次生成新值，不撞限额 |

### 请求参数
| 参数 | 类型 | 必填 | 示例 | 说明 |
|---|---|---|---|---|
| order_no | string | 是 | DEMO202609280001 | 订单号，示例必须是 test 库里真实存在的值 |
| with_items | boolean | 否 | true | 是否带明细 |
| sid | string | 否 | | 上次返回的会话 id，同一会话内切换不扣次数 |

### 返回字段
| 字段 | 类型 | 必有 | 说明 |
|---|---|---|---|
| code | integer | 是 | 成功 200 |
| msg | string | 是 | |
| data.sid | string? | 是 | 会话 id，请求没带 sid 时下发；否则为 null |
| data.quota.used | integer | 是 | 今天已用 |
| data.quota.limit | integer | 是 | 固定 3 |
| data.quota.reset_at | string | 是 | 形如 2026-09-28T00:00:00+08:00 |
| data.order | object? | 是 | 订单不存在时为 null |
| data.order.order_no | string | 是 | |
| data.order.status | string | 是 | paid / shipped / done |
| data.order.amount | number | 是 | 金额，两位小数 |
| data.order.created_at | string | 是 | |
| data.order.items | array? | 是 | with_items 为 false 时为 null |
| data.order.items.sku | string | 是 | |
| data.order.items.qty | integer | 是 | |
| data.order.items.price | number? | 否 | 未定价时 null |

### 业务错误码
| code | 场景 | data |
|---|---|---|
| 400 | order_no 为空或格式不对 | [] |
| 404 | 订单不存在 | [] |
| 429 | 当日 3 次用完 | 只有 quota |

### 用例
| 用例 | 参数 | 期望 code | 期望 |
|---|---|---|---|
| 正常查询 | order_no=DEMO202609280001 | 200 | order 非 null，items 为 null |
| 带明细 | order_no=DEMO202609280001, with_items=true | 200 | items 非空，每项有 sku 和 qty |
| 参数非法 | order_no=abc | 400 | |
| 订单不存在 | order_no=DEMO000000000000 | 404 | |
| 次数用完 | 固定 Cookie visitor_id=yapi-quota-001，order_no=DEMO202609280001 连打 4 次 | 429 | 第 4 次 data 只有 quota，used 为 3 |
