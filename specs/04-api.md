# 04 · API 接口契约（API）

> **对应审查条目**：C1–C4。
> **原则**：API 不能只定义 URL，必须定义 Request / Response / Authentication / Permission / Validation / Business Rules / Error Codes / Idempotency。
> **约定**：统一返回 `Result<T>`；业务拒绝抛 `BizException`（中文 msg 直接展示）；鉴权 Sa-Token，手机号+密码登录。文件下载 `GET /files/{path}` 由 nginx 直发。

---

## C0 · 契约模板（每个端点必须定义）

每个新增/修改端点必须逐项填写下表，缺项视为规格不完整：

| 项 | 内容 |
|---|---|
| Request | method + path + 参数/请求体 + 字段类型 |
| Response | 成功结构 + 关键字段 |
| Authentication | 需要的身份（会话/令牌/公开） |
| Permission | 需要的权限码（对应 02 §A8） |
| Validation | 字段校验（必填/长度/枚举/格式） |
| Business Rules | 业务规则引用（对应 Axx / Ixx） |
| Error Codes | 可能的错误码与中文 msg |
| Idempotency | 是否幂等、幂等键、重复提交行为 |

---

## C1 · 待补端点（多商家组，`DEFERRED`）

> 全部保留，但实现状态 `DEFERRED`（B3 暂缓，见 02 §A5）。以下是完整契约规格。

### C1.1 商家组管理端点

| Method | Path | 作用 |
|---|---|---|
| GET | `/api/admin/orders/{id}/merchant-groups` | 查询商家组 |
| POST | `/api/admin/orders/{id}/merchant-groups` | 新增商家组 |
| PUT | `/api/admin/merchant-groups/{groupId}` | 修改商家组 |
| DELETE | `/api/admin/merchant-groups/{groupId}` | 删除商家组 |
| POST | `/api/admin/merchant-groups/{groupId}/pickup` | 确认取货（单组） |
| GET | `/api/admin/merchants/pending` | 查询待完善商家 |
| POST | `/api/admin/merchants/{id}/complete` | 完善商家资料 |

### C1.2 端点契约示例：`POST .../merchant-groups/{groupId}/pickup`

| 项 | 定义 |
|---|---|
| Request | `POST /api/admin/merchant-groups/{groupId}/pickup`，body: `{goodsRealFen: Long, receiptAttachmentId: Long, method: String, idempotencyKey: String}` |
| Response | `{order: OrderView, groups: [MerchantGroupView]}` |
| Authentication | 管理员会话 `X-Auth-Token` |
| Permission | `order.flow` |
| Validation | `goodsRealFen >= 0`；`0` 合法且语义为"已确认无货款"；`receiptAttachmentId` 若传必须存在且属本单 |
| Business Rules | I-1 实际货款锁定；每组独立取货；全部组取齐才进 `DELIVERING`（02 §A5）；0 元不建垫付（I-3） |
| Error Codes | 400 货款为负；409 该组已取货（不可重复）；409 非本单组；409 订单非 `PICKING`；404 凭证不存在 |
| **Idempotency** | **必须具备幂等保护**：同一取货请求因网络重试提交两次，不能生成两笔实际货款或两笔垫付。以 `(groupId, idempotencyKey)` 唯一键去重；重复请求返回首次结果，不产生新流水 |

### C1.3 其它端点幂等要求

- 新增/删除商家组：删除需校验"非最后一组、未取货"（02 §A5.1）；
- 完善商家资料：重复提交应幂等（同名/同电话合并，不重复建商家，见 ADR-0005）。

---

## C2 · 客户自助下单

### C2.1 支持自由填写商家（`PROPOSED`）

客户不应被限制只能选后台已录入商家。建议支持：
- 检索匹配已有商家（只列 `active`，pending 不进搜索）；
- 自由填写商家名称；
- 商家电话选填；
- 填写商品或服务要求；
- 上传图片或其他允许的附件；
- 提交订单。

### C2.2 `source` 区分商家来源（`PROPOSED`）

客户填写的自由商家信息**不直接获得正式商家身份**，通过 source 区分：
- `existing`：系统已有商家；
- `manual`：客户临时填写（生成 `status=pending` 待完善商家，见 ADR-0005）；
- `admin`：管理员新增。

### C2.3 附件上传流程（`PROPOSED`）

- 采用**独立上传接口**：先上传获得文件 ID，再将文件 ID 关联到订单；
- 不在下单请求里直接塞文件内容。

### C2.4 必须定义的校验（`PROPOSED`）

客户自助下单端点必须明确：
- 字段长度（商家名、商品描述等）；
- 必填规则；
- 最大附件数量；
- 单文件大小（沿用 8MB，见 C4）；
- 文件类型（白名单）；
- 客户能否修改已提交订单（建议：未接单前可改，需留痕）；
- 重复提交如何处理（幂等键）。

> 当前 `POST /api/c/orders` 已存在，但上述细粒度校验不完整（`IMPLEMENTATION_GAP`）。

---

## C3 · 服务类型 Schema 接口

### C3.1 范围（`PROPOSED`，纳入一期但限制功能）

表单设计器是动态服务类型系统的组成部分。一期实现：
- 字段新增、字段删除、字段排序；
- 字段类型、必填设置、默认值、字段标题、选项配置；
- 表单预览。

### C3.2 受限 JSON Schema（`PROPOSED`）

```
{
  "version": 1,
  "fields": [
    {
      "key": "pickup_address",
      "type": "text",
      "label": "取货地址",
      "required": true,
      "maxLength": 200
    },
    {
      "key": "remark",
      "type": "textarea",
      "label": "备注",
      "required": false,
      "maxLength": 500
    }
  ]
}
```

> 这只是**结构示例**。正式 schema 还需定义：支持的字段类型集、验证规则、选项结构、兼容策略。一期字段类型沿用 8 种（`text/textarea/number/phone/date/select/multiselect/switch`，见 03 §B3.3）。

### C3.3 接口清单（`PROPOSED`）

| Method | Path | 说明 |
|---|---|---|
| GET | `/api/admin/service-types` | 列表（enabledOnly） |
| POST | `/api/admin/service-types` | 新建 |
| PUT | `/api/admin/service-types/{id}` | 修改 |
| POST | `/api/admin/service-types/{id}/icon` | 上传图标（multipart） |
| PUT | `/api/admin/service-types/{id}/schema` | 保存 schema（含 version 递增） |
| POST | `/api/admin/service-types/{id}/schema/preview` | 表单预览 |
| GET | `/api/public/service-types` | 客户端下单用（只返回 enabled） |

**校验**：服务端按 `form_schema` 校验必填/类型/选项/长度，不信任前端；订单存 `schema_snapshot + service_data`（03 §B5）。

---

## C4 · 文件上传安全

### C4.1 MIME 白名单重新审查（`PROPOSED`）

| 类型 | 处置 |
|---|---|
| PNG / JPG / GIF / BMP | 保留 |
| M4A / MP3（及其它音频） | 若有语音附件需求可保留（现状已支持） |
| **SVG** | **默认禁止上传** |

**SVG 理由**：SVG 可包含脚本和外部资源引用，未经处理直接公开访问会带来 XSS 风险。若未来确实需要 SVG，必须采用可靠清洗与安全转换机制。

> **U-05（待裁决）**：审查意见建议"SVG 默认禁止"，但用户此前明确确认"接受 SVG + WebP，SVG 必须清洗"（docs R8），且 `FileController` 已能输出 `image/svg+xml`、`ServiceTypeController` 支持图标上传。本规格倾向：**普通业务上传（小票/送达照）禁止 SVG；服务类型图标如需 SVG 必须清洗**。请用户裁决后统一。当前 `UploadService` 白名单实际不含 SVG（与"禁止"方向一致）。

### C4.2 安全规则（8 条，`PROPOSED` 强制）

1. 文件扩展名与真实文件类型**双重校验**；
2. **不信任客户端提供的 MIME**（现状只按 Content-Type 校验，是缺口）；
3. 限制单文件大小（现状 8MB，保留）；
4. 限制单订单附件数量（见 F2，需明确数字）；
5. 文件名不能直接使用用户输入（现状用随机串，符合）；
6. 文件访问必须进行权限校验；
7. 文件存储路径必须防止目录穿越（现状 `normalize()` 部分覆盖）；
8. 上传文件必须与订单、用户建立明确关联（`biz_type/biz_id` 已有）。

### C4.3 F2 九种附件上限（必须逐项明确）

> 审查意见指出："F2 中提到的九种附件上限，必须逐项明确，不能只写一个笼统的大小限制。"

当前只有"单文件 8MB"一条笼统限制。`t_attachment.biz_type` 已知类型：

| biz_type | 场景 | 含 SVG | 单文件大小 | 单订单数量上限 |
|---|---|---|---|---|
| `receipt` | 取货小票 | 否 | 8MB | 待定 |
| `delivered` | 送达照片 | 否 | 8MB | 待定 |
| `voucher` | 垫付凭证 | 否 | 8MB | 待定 |
| `order` | 订单附件 | 否 | 8MB | 待定 |
| 服务类型图标 | 后台配置 | U-05 待裁决 | ≤200KB（docs R8） | 每类型 1 个 |
| 语音附件 | 客户口述 | N/A（音频） | 8MB | 待定 |

> **待补**：每种 `biz_type` 的数量上限需用户确认后填入上表"待定"处，作为验收依据。

---

## C5 · 现有接口清单（沿用，未变更部分）

> 完整 URL 清单见旧版 `api.md`，已并入本文件；以下为分组索引，路径以 controller 实际为准。

| 分组 | 前缀 | 主要端点 |
|---|---|---|
| 认证 | `/api/auth` | login、switch-workspace、logout |
| 调度台订单 | `/api/admin/orders` | 列表/详情/录单/派单/取货/配送完成/取消/改单/调整/编辑日志 |
| 状态与健康 | `/api/admin` | statuses、health |
| 账单与欠款 | `/api/admin` | bills、debts、ledger/{id}、payment、waive、rebuild、repayment-requests |
| 用户与权限 | `/api/admin` | users、permissions、granted、merchant-categories |
| 服务类型 | `/api/admin/service-types` | 见 C3.3 |
| 商家端 | `/api/m` | poll、orders（待完成/历史，只读） |
| 骑手端 | `/api/r` | tasks、pick、complete、history、customers、orders |
| 客户端 | `/api/c` | orders、ledger、repay |
| 公共 | `/files`、`/api/admin/upload` | 文件下载、上传 |

**已取消端点**：`/api/public/customer-link/**`、`/api/admin/customers/{id}/links`、`POST /api/m/orders`（商家代下）及商家端仅服务于代下表单的 `customers/service-types/default-goods/profile` 均已移除；客户自助下单使用 `/api/c/orders` 登录态入口。商家常用商品管理（`GET /api/admin/merchants/{id}/goods`、`POST /api/admin/goods`、`GET /api/c/goods`）也已删除，商品统一由管理员在 `/api/admin/default-goods` 配置，各端下单点选默认商品。登记收款只在账单页调用 `/api/admin/ledger/{customerId}/payment`，订单抽屉不提供该动作。

**统一错误约定**：业务拒绝 → `BizException` + 中文 msg；权限不足 → 403；身份失效 → 401。前端直接展示 msg，不自行翻译错误码。
