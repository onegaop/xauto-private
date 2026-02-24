# XAuto iOS App

XAuto iOS 客户端（SwiftUI + WidgetKit）。

## 当前能力

1. Today 摘要页（主题、重点条目、同步书签）
2. Week 摘要页（主题、风险、行动项）
3. Detail 页（摘要阅读 + 跳转原始 X 链接）
4. Detail 端侧本地增强（recap / challenge / action plan）
5. Detail 查词（点击高亮英文词 -> AI 词卡 -> 缓存）
6. 设置页（API Base URL + PAT 配对 + 连通性测试）
7. 小组件（Small / Medium，支持 App Group 缓存回退）

## 生成工程

```bash
cd /Users/eagleone/Documents/projects/XAuto/apps/ios
xcodegen
open XAuto.xcodeproj
```

## 测试计划（离线默认）

仓库内置两个测试计划：

1. `XAutoPR.xctestplan`（PR 冒烟）
2. `XAutoFull.xctestplan`（Nightly / Release Gate）

两者都默认注入 `XAUTO_TEST_MODE=ui_offline_smoke`，走本地 fixture，不依赖真实 PAT / 后端 / X API / AI Provider。

本地运行 PR 冒烟：

```bash
cd /Users/eagleone/Documents/projects/XAuto/apps/ios
xcodebuild \
  -project XAuto.xcodeproj \
  -scheme XAutoApp \
  -testPlan XAutoPR \
  -destination "platform=iOS Simulator,name=iPhone 17,OS=26.2" \
  test
```

## Xcode 必要配置

1. 为两个 target 配置 Apple Team：
   - `XAutoApp`
   - `XAutoWidget`
2. 为两个 target 启用 App Group：`group.com.xauto.shared`
3. 在 iOS 17+ 设备或模拟器上运行。

## 首次运行

1. 打开 App 的 **Settings** 页。
2. 填写：
   - `API Base URL`（默认指向 Cloud Run 生产地址）
   - `PAT`（从 Admin 面板生成）
3. 点击 **Save & Test**。
4. 回到 Today/Week 下拉刷新。

## Detail 查词使用说明

1. 在 Detail 页打开任意条目。
2. 点击正文/摘要/本地增强区域里的高亮英文词。
3. 在底部词卡查看翻译、例句、搭配、易混辨析。
4. 可使用重试、复制、系统词典兜底等操作。
