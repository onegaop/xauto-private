# XAuto V2 计划（2026-02 更新）

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

### iOS

1. Detail 页支持端侧本地增强模式：
   - recap
   - challenge
   - action plan
2. Detail 页查词流程已打通：
   - 从 post/summary/local insight 块提取并高亮词汇
   - 点击词汇拉起查词 sheet
   - 服务端词卡 + 本地缓存 + 系统词典兜底
3. Detail UI 已完成一轮密集信息阅读优化。

## V2 范围（重定义）

### In Scope

1. Detail AI 能力稳定性与可观测性（查词 + 本地增强）。
2. 检索问答 MVP（服务端优先生成 + 引用）。
3. 问答质量反馈闭环。

### Out of Scope（V2）

1. 多用户/多租户架构改造。
2. 行动任务系统（移至 v2.1+）。
3. RSS/网页多源接入（后续阶段）。

## 目标架构增量

### A. Detail AI 稳定化

1. 增加遥测：
   - 查词延迟 / 错误率 / 缓存命中率
   - 本地增强成功率 / fallback 比例
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

## 里程碑（6 周）

1. 第 1-2 周：Detail AI 稳定化
   - 遥测埋点
   - Admin 健康面板
   - 文档对齐（api contract、runbook、ios readme）
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
3. 问答 P95 延迟 <= 4s。
4. 问答结果中至少包含 1 条有效引用的比例 >= 98%。
5. 反馈写入完整率（有反馈动作即有日志）>= 99%。

## 风险与缓解

1. 风险：provider 不稳定导致查词/问答波动。
   - 缓解：重试 + 结构化 fallback + 明确客户端提示。
2. 风险：问答幻觉。
   - 缓解：引用约束 + schema 校验。
3. 风险：文档与实现再次漂移。
   - 缓解：将 API 契约和计划文档纳入每个里程碑交付物。
