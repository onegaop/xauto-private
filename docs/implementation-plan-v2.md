# XAuto V2 计划（2026-02 更新，含最新代码基线）

## 产品方向

XAuto V2 保持**单用户**架构，从“看摘要”升级为“Detail 优先的个人研究工作台”：

1. Detail 页支持深读辅助（已上线：端侧本地增强 + 查词）。
2. 检索问答可跨历史收藏回答问题并给出引用。
3. 通过反馈闭环持续提升回答与摘要质量。

## 当前基线（已实现）

### Backend

1. Sync 频率可由 Admin 配置（`1..168` 小时）：
   - `GET /v1/admin/sync-settings`
   - `POST /v1/admin/sync-settings`
2. 内部 sync 支持 interval gating（未到执行时间返回 `SKIPPED`）。
3. Sync 插入新内容后可自动触发 daily digest（带冷却）。
4. 移动端查词接口已上线：
   - `POST /v1/mobile/vocabulary/lookup`
5. research keyword 的归一化与过滤逻辑已增强。
6. 新增测试护栏：`BLOCK_PAID_EXTERNAL_APIS`
   - 开启后会阻断需要付费外部调用的链路（sync、vocabulary lookup、X OAuth），并返回 `503`。

### iOS

1. Detail 页支持端侧本地增强模式：
   - recap
   - challenge
   - action plan
2. Detail 页查词流程已打通：
   - 从 post/summary/local insight 块提取并高亮词汇
   - 点击词汇拉起查词 sheet
   - 服务端词卡 + 本地缓存 + 系统词典兜底
3. Foundation Models 已扩展到更多端侧场景：
   - 本地增强内容生成
   - 查词高亮词汇规划（DetailVocabularyPlanner）
   - 天气叙述生成（Weather narration）
4. iOS 最低版本已提升到 `26.0`，并完成相关 API deprecation 清理。

### 工程护栏与测试（已实现）

1. iOS 离线 smoke 测试模式：
   - 测试环境变量：`XAUTO_TEST_MODE=ui_offline_smoke`
   - 默认使用本地 fixture，避免依赖真实后端、PAT、X API、AI Provider。
2. 测试计划已落地：
   - `XAutoPR.xctestplan`（PR 冒烟）
   - `XAutoFull.xctestplan`（Nightly / Release Gate）
3. GitHub Actions 保持非阻断 iOS 观察轨：
   - `.github/workflows/ios-observe.yml`
   - 产出 `xcresult` 供回归分析。

## V2 范围（重定义）

### In Scope

1. Detail AI 能力稳定性与可观测性（查词 + 本地增强）。
2. 检索问答 MVP（服务端优先生成 + 引用）。
3. 问答质量反馈闭环。
4. 工程护栏持续化（离线测试与付费 API 阻断策略纳入发布流程）。

### Out of Scope（V2）

1. 多用户/多租户架构改造。
2. 行动任务系统（移至 v2.1+）。
3. RSS/网页多源接入（后续阶段）。

## 目标架构增量

### A. Detail AI 稳定化

1. 增加遥测：
   - 查词延迟 / 错误率 / 缓存命中率
   - 本地增强成功率 / fallback 比例
   - Foundation Models 词汇规划命中率与降级比例
2. Admin 增加 Detail AI 健康面板。
3. 建立查词失败分类（provider/network/schema/timeout）。

### B. 检索问答（MVP）

1. 新增移动端接口：
   - `POST /v1/mobile/search/ask`
2. 检索策略：
   - 在现有 summary 语料上做语义召回
   - 返回 top-k 证据条目及 tweet 引用信息
3. 回答策略：
   - 服务端优先生成
   - 严格引用约束（最终回答不允许无引用断言）

### C. 反馈闭环

1. 新增移动端接口：
   - `POST /v1/mobile/search/feedback`
2. 新增 Admin 接口：
   - `GET /v1/admin/search/stats`
   - `GET /v1/admin/search/feedback`
3. 质量动作：
   - 聚合负反馈原因
   - 定向触发 `resummarize` 与 prompt 调优

### D. 发布与测试门禁

1. 将 `ui_offline_smoke` 纳入每次 PR 回归基线（本地与 CI 都可执行）。
2. 对外部依赖链路保留可切换阻断开关（`BLOCK_PAID_EXTERNAL_APIS`）用于低成本稳定验证。
3. 发布候选版本必须同时满足：
   - 离线 smoke 通过
   - iOS observe 无新增高风险失败模式
   - API 合同文档与业务图同步更新

## 里程碑（6 周）

1. 第 1-2 周：Detail AI 稳定化 + 测试门禁固化
   - 遥测埋点
   - Admin 健康面板
   - 离线 smoke 与 paid-api guard 发布流程化
   - 文档对齐（api contract、runbook、ios readme、business map）
2. 第 3-4 周：检索问答 MVP
   - `/v1/mobile/search/ask`
   - iOS Ask 入口与引用展示
   - 基础召回质量校验
3. 第 5-6 周：反馈闭环
   - `/v1/mobile/search/feedback`
   - Admin 反馈聚合
   - 质量调优与发布候选

## 成功指标

1. 查词成功率 >= 95%。
2. 查词 P95 延迟 <= 3s。
3. 本地增强 + 词汇规划的端侧可用率 >= 98%（含降级兜底）。
4. 问答 P95 延迟 <= 4s。
5. 问答结果中至少包含 1 条有效引用的比例 >= 98%。
6. 反馈写入完整率（有反馈动作即有日志）>= 99%。
7. `ui_offline_smoke` 在 PR 环境稳定通过（无新增阻断类失败）。

## 风险与缓解

1. 风险：provider 不稳定导致查词/问答波动。
   - 缓解：重试 + 结构化 fallback + 明确客户端提示。
2. 风险：问答幻觉。
   - 缓解：引用约束 + schema 校验。
3. 风险：离线测试与线上行为偏差。
   - 缓解：关键路径保留在线观察轨（ios-observe）并进行差异回放。
4. 风险：文档与实现再次漂移。
   - 缓解：将 API 契约和计划文档纳入每个里程碑交付物。
