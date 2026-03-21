(function() {

    // ── I18N DATA STORE ──────────────────────────────────────────────────────────
    const WF_DATA = {
      nodes: [
        {
          id: 'input',
          step: { zh: '输入', en: 'Input' },
          title: { zh: '用户自然语言输入', en: 'User Natural Language Input' },
          model: null,
          cls: 'wf-node-input',
          role: {
            zh: '接收用户以自然语言描述的视频生成需求，作为整个 Agent 工作流的起点。',
            en: 'Receives the user\'s natural-language video generation request — the entry point of the Agent pipeline.'
          },
          input:  { zh: '自由格式文本', en: 'Free-form text message' },
          output: { zh: '原始文本消息', en: 'Raw text message' },
        },
        {
          id: 'intent',
          step: { zh: 'Step 0', en: 'Step 0' },
          title: { zh: '意图识别', en: 'Intent Classification' },
          model: 'Qwen3-30B',
          cls: 'wf-node-intent',
          role: {
            zh: '判断用户本轮输入属于"新需求"、"补充信息"还是"确认投产"，决定后续路由。',
            en: 'Classifies the current input as new_request / supplement / confirm_production to determine routing.'
          },
          input:  { zh: '当轮用户消息', en: 'Current user message' },
          output: { zh: '意图标签 (new / supplement / confirm)', en: 'Intent label (new / supplement / confirm)' },
        },
        {
          id: 'new_req',
          step: { zh: '分支 A', en: 'Branch A' },
          title: { zh: '重置记忆', en: 'Reset Memory' },
          model: null,
          cls: '',
          role: {
            zh: '检测到新需求时，清空上一轮的累积记忆，以当前输入作为完整起点。',
            en: 'On detecting a new request, clears the accumulated memory and treats the current input as a clean slate.'
          },
          input:  { zh: '意图 = 新需求', en: 'Intent = new_request' },
          output: { zh: '清空 accumulated_query', en: 'Cleared accumulated_query' },
        },
        {
          id: 'supplement',
          step: { zh: '分支 B', en: 'Branch B' },
          title: { zh: '记忆读取 · 上下文合并', en: 'Memory Read · Context Merge' },
          model: 'ERNIE-4.0-Turbo',
          cls: '',
          role: {
            zh: '读取历史需求，用大模型将新旧信息合并为一段完整描述。冲突字段以最新输入为准。',
            en: 'Reads prior requirements and uses an LLM to merge old and new info into one coherent description. Conflicts resolved by latest input.'
          },
          input:  { zh: 'accumulated_query + 当前补充', en: 'accumulated_query + current supplement' },
          output: { zh: 'merged_query（写回记忆变量）', en: 'merged_query (written back to memory variable)' },
        },
        {
          id: 'confirm',
          step: { zh: '分支 C', en: 'Branch C' },
          title: { zh: '确认投产', en: 'Confirm Production' },
          model: null,
          cls: 'wf-node-end',
          role: {
            zh: '用户明确确认投产意图时，Agent 输出"进入投产阶段"并终止预审流程。',
            en: 'When the user confirms, the Agent outputs "entering production" and terminates the pre-flight workflow.'
          },
          input:  { zh: '意图 = 确认投产', en: 'Intent = confirm_production' },
          output: { zh: '投产指令 · 流程终止', en: 'Production instruction · Workflow ends' },
        },
        {
          id: 'selector',
          step: { zh: '选择器', en: 'Selector' },
          title: { zh: '流程输入选择器', en: 'Process Input Selector' },
          model: 'Python · Code Node',
          cls: 'wf-node-router',
          role: {
            zh: '代码节点：根据意图类型选择正确的文本输入给后续节点（合并文本 or 原始输入）。',
            en: 'Code node: selects the correct text (merged or raw) to pass to downstream nodes based on intent type.'
          },
          input:  { zh: '意图标签 + 各分支文本', en: 'Intent label + branch texts' },
          output: { zh: '统一的 final_query 文本', en: 'Unified final_query text' },
        },
        {
          id: 'interceptor',
          step: { zh: 'Step 1', en: 'Step 1' },
          title: { zh: '智能阻断器 · 三级红线', en: 'Smart Interceptor · 3-tier Gates' },
          model: 'DeepSeek-V3.2',
          cls: 'wf-node-intercept',
          role: {
            zh: '串联合规、完整性、预算三级检查。输出结构化 JSON 状态，决定流程走向。v0.3 新增 VIP 直通：检测到分镜/时间戳时自动豁免完整性检查。',
            en: 'Runs compliance → completeness → budget checks in sequence. Outputs structured JSON state to route the flow. v0.3 adds VIP exemption: storyboard/timestamp input auto-bypasses completeness check.'
          },
          input:  { zh: 'final_query 文本', en: 'final_query text' },
          output: { zh: 'status (PASS / NEED_EDIT / REJECT) + missing_fields + risk_tags', en: 'status (PASS / NEED_EDIT / REJECT) + missing_fields + risk_tags' },
          badges: ['pass','edit','reject']
        },
        {
          id: 'reject_out',
          step: { zh: 'REJECT', en: 'REJECT' },
          title: { zh: '合规拦截 · 终止', en: 'Compliance Block · Terminate' },
          model: null,
          cls: 'wf-node-reject-out',
          role: {
            zh: '命中违规内容时，直接终止流程，不提供任何优化建议（防止用户绕过合规规则）。',
            en: 'Immediately terminates the workflow on compliance violation — no optimization hints given to prevent rule circumvention.'
          },
          input:  { zh: 'status = REJECT', en: 'status = REJECT' },
          output: { zh: '拦截通知 · 无 Prompt 输出', en: 'Block notice · No Prompt output' },
        },
        {
          id: 'edit_out',
          step: { zh: 'NEED_EDIT', en: 'NEED_EDIT' },
          title: { zh: '追问缺失字段', en: 'Request Missing Fields' },
          model: null,
          cls: 'wf-node-edit-out',
          role: {
            zh: '检测到必要字段缺失时（时长/预算/用途），列出缺失项并生成针对性追问，引导用户补充。',
            en: 'On missing required fields (duration/budget/purpose), lists gaps and generates targeted follow-up questions.'
          },
          input:  { zh: 'status = NEED_EDIT + missing_fields', en: 'status = NEED_EDIT + missing_fields' },
          output: { zh: '结构化追问文本', en: 'Structured follow-up questions' },
        },
        {
          id: 'cost',
          step: { zh: 'Step 2.5', en: 'Step 2.5' },
          title: { zh: '动态成本计算器', en: 'Dynamic Cost Estimator' },
          model: 'ERNIE-4.0-Turbo',
          cls: 'wf-node-cost',
          role: {
            zh: '从需求文本提取时长、分辨率、镜头数、人物数、复杂度，套入公式计算成本区间。v0.3 支持时间戳解析和关键词复杂度自适应。',
            en: 'Extracts duration, resolution, shot count, character count, complexity from text and computes cost range. v0.3 adds timestamp parsing and keyword-based complexity adaptation.'
          },
          input:  { zh: 'final_query + PASS 状态', en: 'final_query + PASS status' },
          output: { zh: '成本区间 [min, max] + 是否超预算 + 降本建议', en: 'Cost range [min, max] + over_budget flag + reduction_suggestions' },
        },
        {
          id: 'router',
          step: { zh: 'Step 2.6', en: 'Step 2.6' },
          title: { zh: '决策路由器', en: 'Decision Router' },
          model: 'Python · Code Node',
          cls: 'wf-node-router',
          role: {
            zh: '纯确定性逻辑：综合合规状态和成本状态，拼接动态建议文本，输出最终决策 APPROVE / EDIT。不用大模型，100% 可预测。',
            en: 'Purely deterministic: combines compliance and cost states, assembles dynamic suggestion text, outputs APPROVE or EDIT. No LLM — 100% predictable.'
          },
          input:  { zh: 'status + cost_estimate', en: 'status + cost_estimate' },
          output: { zh: 'decision (APPROVE/EDIT) + 建议文本', en: 'decision (APPROVE/EDIT) + suggestion text' },
        },
        {
          id: 'rag',
          step: { zh: 'Step 3', en: 'Step 3' },
          title: { zh: 'Prompt 生成器 · RAG 增强', en: 'Prompt Generator · RAG-enhanced' },
          model: 'ERNIE-4.0-Turbo + 200+ scene KB',
          cls: 'wf-node-rag',
          role: {
            zh: '检索仙侠场景知识库（中文意图 → 英文专业 Prompt + 负向词），生成三档可复制 Prompt：省钱版、均衡版、视听双轨导演剧本版。',
            en: 'Retrieves xianxia scene KB (Chinese intent → English professional prompt + negative words), generates 3 tiers: Budget / Balanced / Quality (Visual-Audio dual-track storyboard).'
          },
          input:  { zh: 'final_query + RAG 知识库检索结果', en: 'final_query + RAG retrieval results' },
          output: { zh: '三档 Prompt (budget / balanced / quality)', en: '3-tier prompts (budget / balanced / quality)' },
        },
        {
          id: 'response',
          step: { zh: 'Step 4', en: 'Step 4' },
          title: { zh: 'C端回复生成器', en: 'User Response Generator' },
          model: 'ERNIE-Speed',
          cls: 'wf-node-output',
          role: {
            zh: '将内部 JSON 数据翻译成用户友好的自然语言回复，包含：结论、成本、缺失项、三档 Prompt、下一步指引。',
            en: 'Translates internal JSON into user-friendly natural language: conclusion, cost, missing fields, 3-tier prompts, next-step guidance.'
          },
          input:  { zh: '完整的内部 JSON 结果', en: 'Full internal JSON result' },
          output: { zh: '结构化自然语言回复（供用户阅读）', en: 'Structured natural-language reply (user-readable)' },
        },
      ]
    };
    
    // ── GET NODE DATA BY ID ──────────────────────────────────────────────────────
    function getNode(id) {
      return WF_DATA.nodes.find(n => n.id === id);
    }
    
    // ── RENDER HELPER ────────────────────────────────────────────────────────────
    function renderNode(id, extra='') {
      const n = getNode(id);
      if (!n) return '';
      const badges = n.badges ? n.badges.map(b =>
        `<span class="wf-badge wf-badge-${b}">${b.toUpperCase().replace('EDIT','NEED_EDIT')}</span>`
      ).join('') : '';
      return `
        <div class="wf-node ${n.cls} ${extra}" data-node="${id}" tabindex="0" role="button"
             aria-label="${n.title.zh} / ${n.title.en}">
          <div class="wf-node-step">
            <span class="zh">${n.step.zh}</span><span class="en">${n.step.en}</span>
          </div>
          <div class="wf-node-title">
            <span class="zh">${n.title.zh}</span><span class="en">${n.title.en}</span>
          </div>
          ${n.model ? `<div class="wf-node-model">${n.model}</div>` : ''}
          ${badges ? `<div class="wf-node-badges">${badges}</div>` : ''}
        </div>`;
    }
    
    function arrow() {
      return `<div class="wf-arrow wf-reveal"><div class="wf-arrow-icon">↓</div></div>`;
    }
    
    // ── RENDER DIAGRAM ───────────────────────────────────────────────────────────
    function renderDiagram() {
      const el = document.getElementById('wf-diagram');
      if (!el) return;
    
      el.innerHTML = `
        <!-- Row 1: Input -->
        <div class="wf-row wf-row-center wf-reveal" style="max-width:320px;margin:0 auto">
          ${renderNode('input')}
        </div>
    
        ${arrow()}
    
        <!-- Row 2: Intent -->
        <div class="wf-row wf-row-center wf-reveal" style="max-width:360px;margin:0 auto">
          ${renderNode('intent')}
        </div>
    
        <!-- Branch spread lines -->
        <div class="wf-branch-spread wf-reveal">
          <div class="wf-branch-line-left"></div>
          <div class="wf-branch-line-right"></div>
        </div>
    
        <!-- Row 3: Three branches -->
        <div class="wf-row-branches wf-reveal">
          ${renderNode('new_req')}
          ${renderNode('supplement')}
          ${renderNode('confirm')}
        </div>
    
        <!-- Converge lines -->
        <div class="wf-converge wf-reveal">
          <div class="wf-converge-left"></div>
          <div class="wf-converge-right"></div>
        </div>
    
        <!-- Row 4: Selector -->
        <div class="wf-row wf-row-center wf-reveal" style="max-width:360px;margin:0 auto">
          ${renderNode('selector')}
        </div>
    
        ${arrow()}
    
        <!-- Row 5: Interceptor -->
        <div class="wf-row wf-row-center wf-reveal" style="max-width:480px;margin:0 auto">
          ${renderNode('interceptor')}
        </div>
    
        <!-- Side branches: REJECT + EDIT -->
        <div class="wf-row-side wf-reveal" style="max-width:780px;margin:8px auto;align-items:stretch">
          ${renderNode('reject_out')}
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:0 8px">
            <div style="width:1.5px;flex:1;background:linear-gradient(to bottom,rgba(155,127,255,0.4),rgba(155,127,255,0.15))"></div>
            <div class="wf-arrow-icon" style="flex-shrink:0">↓</div>
            <div style="width:1.5px;flex:1;background:linear-gradient(to bottom,rgba(155,127,255,0.15),rgba(155,127,255,0.4))"></div>
          </div>
          ${renderNode('edit_out')}
        </div>
    
        <!-- Pass label -->
        <div style="display:flex;justify-content:center;align-items:center;height:28px;margin-top:4px" class="wf-reveal">
          <span style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.1em;color:#9b7fff;background:rgba(155,127,255,0.1);border:1px solid rgba(155,127,255,0.25);padding:2px 10px;border-radius:100px">PASS ↓</span>
        </div>
    
        <!-- Row 6: Three parallel nodes -->
        <div class="wf-row-parallel wf-reveal">
          ${renderNode('cost')}
          ${renderNode('router')}
          ${renderNode('rag')}
        </div>
    
        ${arrow()}
    
        <!-- Row 7: Response -->
        <div class="wf-row wf-row-center wf-reveal" style="max-width:380px;margin:0 auto">
          ${renderNode('response')}
        </div>
      `;
    
      // Bind interactions after render
      bindNodeInteractions();
      bindScrollReveal();
    }
    
    // ── TOOLTIP LOGIC ────────────────────────────────────────────────────────────
    let currentTooltipNode = null;
    const tooltip = document.getElementById('wf-tooltip');
    
    function getLang() {
      return document.documentElement.getAttribute('data-lang') || 'zh';
    }
    
    function populateTooltip(nodeId, targetEl) {
      const n = getNode(nodeId);
      if (!n) return;
      const lang = getLang();
    
      document.getElementById('tt-step').textContent = n.step[lang];
      document.getElementById('tt-title').textContent = n.title[lang];
      document.getElementById('tt-role').textContent = n.role[lang];
      document.getElementById('tt-input').textContent = n.input[lang];
      document.getElementById('tt-output').textContent = n.output[lang];
    
      const modelEl = document.getElementById('tt-model');
      if (n.model) {
        modelEl.textContent = n.model;
        modelEl.style.display = 'inline-block';
      } else {
        modelEl.style.display = 'none';
      }
    }
    
    function showTooltip(nodeId, event) {
      if (!tooltip) return;
      populateTooltip(nodeId, event.currentTarget);
    
      const isMobile = window.innerWidth <= 900;
      if (isMobile) return; // handled by sheet
    
      tooltip.classList.add('visible');
      positionTooltip(event);
    }
    
    function positionTooltip(event) {
      if (!tooltip) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const tw = 310;
      const th = 260;
      let x = event.clientX + 18;
      let y = event.clientY + 12;
      if (x + tw > vw - 20) x = event.clientX - tw - 18;
      if (y + th > vh - 20) y = event.clientY - th - 12;
      tooltip.style.left = x + 'px';
      tooltip.style.top  = y + 'px';
    }
    
    function hideTooltip() {
      if (!tooltip) return;
      tooltip.classList.remove('visible');
    }
    
    // ── MOBILE SHEET ─────────────────────────────────────────────────────────────
    function populateSheet(nodeId) {
      const n = getNode(nodeId);
      if (!n) return;
      const lang = getLang();
    
      document.getElementById('sheet-step').textContent = n.step[lang];
      document.getElementById('sheet-title').textContent = n.title[lang];
      document.getElementById('sheet-role').textContent = n.role[lang];
      document.getElementById('sheet-input').textContent = n.input[lang];
      document.getElementById('sheet-output').textContent = n.output[lang];
    
      const modelEl = document.getElementById('sheet-model');
      if (n.model) {
        modelEl.textContent = n.model;
        modelEl.style.display = 'inline-block';
      } else {
        modelEl.style.display = 'none';
      }
    }
    
    function openSheet(nodeId) {
      populateSheet(nodeId);
      const sheet = document.getElementById('wf-sheet');
      if (sheet) sheet.classList.add('open');
    }
    
    function closeSheet() {
      const sheet = document.getElementById('wf-sheet');
      if (sheet) sheet.classList.remove('open');
      // Deactivate nodes
      document.querySelectorAll('.wf-node.active').forEach(el => el.classList.remove('active'));
    }
    
    // expose closeSheet globally
    window.closeSheet = closeSheet;
    
    // ── BIND INTERACTIONS ────────────────────────────────────────────────────────
    function bindNodeInteractions() {
      document.querySelectorAll('.wf-node').forEach(el => {
        const nodeId = el.dataset.node;
    
        // Desktop: hover
        el.addEventListener('mouseenter', (e) => {
          showTooltip(nodeId, e);
          el.classList.add('active');
        });
        el.addEventListener('mousemove', (e) => {
          positionTooltip(e);
        });
        el.addEventListener('mouseleave', () => {
          hideTooltip();
          el.classList.remove('active');
        });
    
        // Mobile: tap
        el.addEventListener('click', (e) => {
          if (window.innerWidth <= 900) {
            e.stopPropagation();
            document.querySelectorAll('.wf-node.active').forEach(n => n.classList.remove('active'));
            el.classList.add('active');
            openSheet(nodeId);
          }
        });
    
        // Keyboard accessibility
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSheet(nodeId);
          }
        });
      });
    
      // Close sheet when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.wf-node') && !e.target.closest('#wf-sheet')) {
          closeSheet();
        }
      });
    }
    
    // ── SCROLL REVEAL ─────────────────────────────────────────────────────────────
    function bindScrollReveal() {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('wf-visible');
            observer.unobserve(e.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    
      document.querySelectorAll('.wf-reveal').forEach(el => observer.observe(el));
    }
    
    // ── RE-RENDER TOOLTIP TEXT ON LANG CHANGE ───────────────────────────────────
    // Listen for lang attribute changes to update any open tooltips/sheets
    function onLangChange() {
      const activeNode = document.querySelector('.wf-node.active');
      if (!activeNode) return;
      const nodeId = activeNode.dataset.node;
      if (tooltip && tooltip.classList.contains('visible')) {
        populateTooltip(nodeId, activeNode);
      }
      const sheet = document.getElementById('wf-sheet');
      if (sheet && sheet.classList.contains('open')) {
        populateSheet(nodeId);
      }
    
      // Also update all .zh/.en spans inside diagram (they use CSS show/hide, no JS needed)
    }
    
    // Patch toggleLang to also call our hook (non-destructive)
    if (typeof window.toggleLang === 'function') {
      const _orig = window.toggleLang;
      window.toggleLang = function() { _orig(); onLangChange(); };
    }
    
    // ── INIT ─────────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderDiagram);
    } else {
      renderDiagram();
    }
    
    })();