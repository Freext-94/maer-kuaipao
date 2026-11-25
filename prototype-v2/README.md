# 交互示例

此目录提供可在浏览器中打开的静态交互示例，用于直观了解订单、客户、商家、骑手和账单页面的布局。它独立于正式应用运行，不连接服务端或数据库；其中的账号、金额和订单均为虚构示例。

![交互示例品牌图](../frontend/public/brand-kit/og-cover-1200x630.png)

## 打开方式

可直接在现代浏览器中打开 `index.html`，或从本目录运行一个静态文件服务器：

```bash
python -m http.server 8899
```

然后访问 `http://127.0.0.1:8899/index.html`。示例数据保存在当前浏览器的 `localStorage` 中，可以从示例页面重置。

## 页面导航

| 页面 | 展示内容 |
|---|---|
| `dispatch.html` | 订单列表、派单和订单详情 |
| `merchant.html` | 商家订单视图 |
| `rider.html` | 骑手任务和历史记录 |
| `customer.html` | 客户下单、订单与账单 |
| `billing.html`、`debts.html` | 账单和欠款展示 |
| `users.html`、`settings.html` | 用户、权限和系统设置 |

正式服务请使用根目录 README 中介绍的 Docker 部署方式。正式页面运行在 `frontend/`，由后端 API 和 MySQL 提供业务数据。
