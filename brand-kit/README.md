# 马儿快跑 · 品牌素材包

由完整 `logo.png`（1254×1254，透明底）导出的配套素材。**全部使用完整 logo**（卡通马 + 手写「马儿快跑」+ 黄色速度线），不抠字、不裁头。**没有改原图**，原图在 `source/logo.png`。

直接双击 `index.html` 可预览全部素材。

## 重新生成

```bash
python brand-kit/build_assets.py
```

脚本读项目根目录的 `logo.png`，重写 `png/` 下全部文件。换 logo 只需替换根目录 `logo.png` 后重跑，不用改代码。

## 目录

```
brand-kit/
├── build_assets.py                 生成脚本（可重跑）
├── source/logo.png                 原图，不要覆盖
├── png/
│   ├── logo-full.png               完整 logo，透明底（首选）
│   ├── logo-watermark.png          水印版，14% 透明
│   ├── logo-on-white-1200.png      白底方图
│   ├── logo-on-cream-1200.png      暖白底方图
│   ├── logo-card-transparent-1200.png  深底安全版（白卡 + 完整 logo，透明外框）
│   ├── app-icon-1024/512/192.png   App 图标（白底）
│   ├── apple-touch-icon-180.png    iOS 桌面图标
│   ├── favicon-64/32/16.png        浏览器标签
│   ├── splash-1242x2688.png        手机启动页
│   ├── login-hero-1200x800.png     登录页主视觉
│   ├── mobile-banner-1500x600.png  移动端头图
│   ├── og-cover-1200x630.png       分享封面
│   └── bill-header-1200x240.png    账单图片品牌头（后端出图兜底用）
└── svg/
    ├── service-buy/pickup/errand/transfer/driver.svg   服务图标
    ├── tab-order/bill/customer/mine.svg                底部导航图标
    └── empty-orders/bills.svg                          空状态
```

## 品牌色

| 角色 | 色值 | 用法 |
|---|---|---|
| 墨黑 | `#0D0E11` | 主背景、正文、深色导航 |
| 品牌黄 | `#F5B301` | 按钮、强调、金额重点、速度元素 |
| 暖白 | `#FFF8E6` | 页面暖底、空状态底 |
| 纯白 | `#FFFFFF` | 卡片、logo 承托卡 |
| 灰 | `#8A8A90` | 次要文字 |

不再使用旧原型的青绿 `#0F766E`。新 UI 统一黑黄。

## 怎么用

| 场景 | 用哪个 |
|---|---|
| 浅色页面 / 文档 / 合同 | `logo-full.png`（透明底）或 `logo-on-white-1200.png` |
| 暖白卡片、空状态页 | `logo-on-cream-1200.png` |
| 深色侧边栏 / 启动页 / 登录页 | `logo-card-transparent-1200.png`（白卡承载） |
| 水印、单据底纹 | `logo-watermark.png` |
| App 图标 / 桌面快捷方式 | `app-icon-1024.png`（系统自动切圆角） |
| 浏览器标签 | `favicon-32.png` / `favicon-64.png` |
| 登录页主视觉 | `login-hero-1200x800.png` |
| 启动页 | `splash-1242x2688.png` |
| 分享到微信 | `og-cover-1200x630.png` |
| 移动端顶部品牌图 | `mobile-banner-1500x600.png` |
| 账单图片顶部 | `bill-header-1200x240.png` |

## 不要做

- **不要把 `logo-full.png` 直接放黑底**：手写「马儿快跑」是黑字，放黑底会消失。深色场景一律用 `logo-card-transparent-1200.png`。
- **不要放黄底**：logo 自带黄色圆盘，黄底会让圆盘和底色融在一起、速度线糊掉。浅色场景用白底或暖白底。
- **不要重复排品牌名**：完整 logo 已含「马儿快跑」，旁边只写标语或服务类型，不要再叠一遍。
- 不要把 logo 拉宽、压扁、改色、加描边；不要单独抠字或抠马头。
- 需要小尺寸图标时整体等比缩放，不要局部裁切。
- 不要用旧青绿的示例 logo；以本包为准。

## 移动端与账单

- 移动端优先，调度台也按手机设计；详见 `../docs/改造方案-第二轮问题.md` 和 `brand-guide.md`。
- 账单「打印」改为生成 PNG 图片，不生成 PDF；图片头用 `bill-header-1200x240.png`，或在 DOM 里直接引用 `logo-on-white-1200.png`。
