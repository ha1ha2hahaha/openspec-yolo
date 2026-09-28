# 接口契约

<!-- 规则见 .claude/skills/yapi/SKILL.md，完整范例见 .claude/skills/yapi/references/example-api.md。
     一个接口一段。标题行写成：## GET /api/xxx/yyy 接口标题
     模块名 = openspec/specs/ 下的能力目录名（英文小写连字符）。交付前删掉本注释。 -->

## GET /api/xxx/yyy 接口标题
模块：capability-name　　登录：否　　签名：否

### 请求头
| 参数 | 必填 | 示例 | 说明 |
|---|---|---|---|

### 请求参数
| 参数 | 类型 | 必填 | 示例 | 说明 |
|---|---|---|---|---|

### 返回字段
| 字段 | 类型 | 必有 | 说明 |
|---|---|---|---|
| code | integer | 是 | 成功 200 |
| msg | string | 是 | |
| data | object | 是 | |

### 业务错误码
| code | 场景 | data |
|---|---|---|

### 用例
| 用例 | 参数 | 期望 code | 期望 |
|---|---|---|---|
