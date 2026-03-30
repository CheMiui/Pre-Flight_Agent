# Pre-Flight_Agent
A pre-production intelligence system for the AIGC short drama industry — completing requirement checks, cost estimation, compliance screening, and professional prompt generation before a single frame is rendered.
# Pre-Flight Agent：AIGC 短剧投产前置智能系统

**[点击此处查看完整交互式复盘网页 (Live Case Study)](https://CheMiui.github.io/Pre-Flight_Agent/)**

## 项目背景与价值
在 AIGC 短剧/漫剧行业，创作者常常面临**“盲盒式投产”**的痛点：带着模糊的需求直接生成视频，往往导致预算超支、内容违规或术语解析错误（如“御剑飞行”被直译），试错成本极高。

**Pre-Flight Agent** 是一款在“正式生成视频前”介入的智能拦截与优化系统。它通过多轮对话，完成**需求补全、成本预估、合规拦截与专业 Prompt 生成**，预计可为业务降低 30%-40% 的无效投产成本。

---

## 核心工作流设计 (Workflow Design)
本系统突破了传统 Agent 的单线执行模式，设计了清晰的**时序业务流**，核心链路包含三个关键设计：

1. **分叉式多轮对话 (Step 0 - 意图识别)**
   * 系统不要求用户一次性输入所有参数。通过精准的意图识别，系统拆分出三条路径：**重置记忆**（新需求）、**读取与合并**（补充信息）、**确认投产**。
   * **价值**：支持渐进式需求引导，像真正的制片人一样与用户协同工作。

2. **状态码绑定的前置风控 (Step 1 - 智能阻断器)**
   * 风控不是事后补救，而是前置红线。设计了三个强约束出口：
     * `REJECT`：合规违规，直接拦截终止（0 Token 消耗）。
     * `NEED_EDIT`：关键信息缺失，定向追问。
     * `PASS`：安全且完整，放行主流程。

3. **按需触发的 RAG 知识库 (Step 3 - 企业级生成)**
   * RAG 模块作为“外挂智囊”独立于主链路旁。仅在触发仙侠、武侠等特定术语时唤醒，彻底解决通用大模型在垂直领域的“术语幻觉”，输出专业视听双轨分镜剧本。

---

## 多模型架构选型矩阵 (Architecture & Model Selection)
项目基于百度智能云千帆 AppBuilder 搭建。在底层选型上，本项目秉持**“术业有专攻，对的模型放在对的任务上”**的解耦哲学：

| 业务节点 | 选型方案 | 核心决策依据与淘汰逻辑 |
| :--- | :--- | :--- |
| **Step 0: 意图分类** | **Qwen3-30B (MoE)** | 意图识别是轻量级三分类任务。MoE 架构小激活参数实现了极速响应，准确率优于重型模型。 |
| **Step 1: 合规风控** | **DeepSeek-V3.2** | 风控需要深层语义理解（区分“暗黑打斗”与“血腥暴力”）。DeepSeek 的安全对齐能力与 JSON 结构化输出极其稳定。 |
| **Step 2: 成本计算** | **ERNIE-4.0 + Python Code** | **核心解耦架构**：大模型负责理解提取参数，Python 代码节点负责精确数值计算。解决了大模型做算术易产生幻觉的问题，响应时间缩短 43%。 |
| **Step 3: 剧本生成** | **DeepSeek-R1 + RAG** | 这是质量最关键的规划任务。利用 R1 的思维链 (Thinking)，先规划三镜头叙事结构，再精准填充画面与声音数据。 |

> **💡 架构沉淀**：大模型做理解，代码做计算。用混合架构替代全 LLM 链路，是兼顾响应速度与计算精度的最优解。

---

## 关于本仓库 (Frontend Implementation)
本仓库托管的是该 Agent 项目的**全景复盘展示页**（即上方 Live Demo 链接）。
* **技术栈**：HTML5 + 原生 CSS3 + Vanilla JavaScript，0 外部框架，极致轻量。
* **特性**：
  * 支持深色/浅色主题 (Dark/Light Mode) 与中英双语无缝切换。
  * **动态工作流可视化**：未使用繁重的图表库，通过纯手工内联 SVG 与 DOM 交互，实现了悬停动态解析模型节点输入/输出逻辑的流畅体验。

---
*Designed & Built by Meihui Chen (Michelle)*
