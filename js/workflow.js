(function () {

  const WF_DATA = {
    nodes: [
      {
        id: 'input',
        step: { zh: '输入', en: 'Input' },
        title: { zh: '用户输入', en: 'User Input' },
        model: null, cls: 'wf-node-input',
        role: { zh: '接收用户以自然语言描述的视频生成需求，作为整个 Agent 工作流的起点。', en: 'Receives the user\'s natural-language video generation request — entry point of the Agent pipeline.' },
        input:  { zh: '自由格式文本', en: 'Free-form text' },
        output: { zh: '原始文本消息', en: 'Raw text message' },
      },
      {
        id: 'intent',
        step: { zh: 'Step 0', en: 'Step 0' },
        title: { zh: '意图识别', en: 'Intent Classify' },
        model: 'Qwen3-30B', cls: 'wf-node-intent wf-node-lg',
        role: { zh: '判断用户本轮输入属于"新需求"、"补充信息"还是"确认投产"，决定后续路由。', en: 'Classifies input as new_request / supplement / confirm to determine routing.' },
        input:  { zh: '当轮用户消息', en: 'Current message' },
        output: { zh: '意图标签 (new / supplement / confirm)', en: 'Intent label' },
      },
      {
        id: 'new_req',
        step: { zh: '分支 A', en: 'Branch A' },
        title: { zh: '重置记忆', en: 'Reset Memory' },
        model: null, cls: 'wf-node-sm',
        role: { zh: '检测到新需求时，清空上一轮累积记忆，以当前输入作为完整起点。', en: 'On new request: clears accumulated memory and treats current input as a clean slate.' },
        input:  { zh: '意图 = 新需求', en: 'Intent = new_request' },
        output: { zh: '清空 accumulated_query', en: 'Cleared accumulated_query' },
      },
      {
        id: 'supplement',
        step: { zh: '分支 B', en: 'Branch B' },
        title: { zh: '记忆读取·合并', en: 'Memory Merge' },
        model: 'ERNIE-4.0', cls: 'wf-node-sm',
        role: { zh: '读取历史需求，用大模型将新旧信息合并为完整描述。冲突字段以最新输入为准。', en: 'Reads prior requirements and merges old+new info. Latest input wins on conflicts.' },
        input:  { zh: 'accumulated_query + 当前补充', en: 'accumulated_query + supplement' },
        output: { zh: 'merged_query（写回记忆变量）', en: 'merged_query (written to memory)' },
      },
      {
        id: 'confirm',
        step: { zh: '分支 C', en: 'Branch C' },
        title: { zh: '确认投产·结束', en: 'Confirm · End' },
        model: null, cls: 'wf-node-end wf-node-sm',
        role: { zh: '用户明确确认投产意图时，Agent 输出"进入投产阶段"并终止预审流程。', en: 'When user confirms, Agent outputs "entering production" and terminates the workflow.' },
        input:  { zh: '意图 = 确认投产', en: 'Intent = confirm' },
        output: { zh: '投产指令 · 流程终止', en: 'Production order · End' },
      },
      {
        id: 'selector',
        step: { zh: '选择器', en: 'Selector' },
        title: { zh: '输入选择器', en: 'Input Selector' },
        model: 'Python · Code', cls: 'wf-node-router wf-node-lg',
        role: { zh: '代码节点：根据意图类型选择正确的文本输入给后续节点。', en: 'Code node: selects correct text (merged or raw) to pass to downstream nodes.' },
        input:  { zh: '意图标签 + 各分支文本', en: 'Intent label + branch texts' },
        output: { zh: '统一的 final_query 文本', en: 'Unified final_query text' },
      },
      {
        id: 'interceptor',
        step: { zh: 'Step 1', en: 'Step 1' },
        title: { zh: '智能阻断器', en: 'Interceptor' },
        model: 'DeepSeek-V3.2', cls: 'wf-node-intercept wf-node-lg',
        role: { zh: '串联合规、完整性、预算三级检查。v0.3 新增 VIP 直通：检测到分镜/时间戳时自动豁免完整性检查。', en: 'Runs compliance → completeness → budget checks. v0.3 adds VIP exemption for storyboard/timestamp input.' },
        input:  { zh: 'final_query 文本', en: 'final_query text' },
        output: { zh: 'status (PASS / NEED_EDIT / REJECT)', en: 'status (PASS / NEED_EDIT / REJECT)' },
        badges: ['pass', 'edit', 'reject'],
      },
      {
        id: 'reject_out',
        step: { zh: 'REJECT', en: 'REJECT' },
        title: { zh: '合规拦截·终止', en: 'Blocked · End' },
        model: null, cls: 'wf-node-reject-out wf-node-sm',
        role: { zh: '命中违规内容时，直接终止流程，不提供任何优化建议（防止用户绕过合规规则）。', en: 'Immediately terminates on compliance violation — no optimization hints given.' },
        input:  { zh: 'status = REJECT', en: 'status = REJECT' },
        output: { zh: '拦截通知 · 无 Prompt 输出', en: 'Block notice · No Prompt output' },
      },
      {
        id: 'edit_out',
        step: { zh: 'NEED_EDIT', en: 'NEED_EDIT' },
        title: { zh: '追问缺失字段', en: 'Ask Missing Fields' },
        model: null, cls: 'wf-node-edit-out wf-node-sm',
        role: { zh: '检测到必要字段缺失时，列出缺失项并生成针对性追问，引导用户补充。', en: 'On missing required fields, lists gaps and generates targeted follow-up questions.' },
        input:  { zh: 'status = NEED_EDIT', en: 'status = NEED_EDIT' },
        output: { zh: '结构化追问文本', en: 'Structured follow-up questions' },
      },
      {
        id: 'cost',
        step: { zh: 'Step 2.5', en: 'Step 2.5' },
        title: { zh: '成本计算器', en: 'Cost Estimator' },
        model: 'ERNIE-4.0', cls: 'wf-node-cost wf-node-lg',
        role: { zh: '从需求文本提取时长、分辨率、镜头数、人物数、复杂度，套入公式计算成本区间。v0.3 支持时间戳解析和关键词复杂度自适应。', en: 'Extracts duration, resolution, shot count, complexity and computes cost range. v0.3 adds timestamp parsing.' },
        input:  { zh: 'final_query + PASS 状态', en: 'final_query + PASS status' },
        output: { zh: '成本区间 [min, max] + 降本建议', en: 'Cost range [min, max] + reduction tips' },
      },
      {
        id: 'router',
        step: { zh: 'Step 2.6', en: 'Step 2.6' },
        title: { zh: '决策路由器', en: 'Decision Router' },
        model: 'Python · Code', cls: 'wf-node-router wf-node-lg',
        role: { zh: '纯确定性逻辑：综合合规状态和成本状态，拼接动态建议文本，输出最终决策。100% 可预测。', en: 'Purely deterministic: combines compliance and cost states, outputs APPROVE or EDIT. 100% predictable.' },
        input:  { zh: 'status + cost_estimate', en: 'status + cost_estimate' },
        output: { zh: 'decision (APPROVE/EDIT) + 建议文本', en: 'decision (APPROVE/EDIT) + suggestions' },
      },
      {
        id: 'rag',
        step: { zh: 'Step 3', en: 'Step 3' },
        title: { zh: 'Prompt 生成器', en: 'Prompt Generator' },
        model: 'ERNIE-4.0 + RAG', cls: 'wf-node-rag wf-node-lg',
        role: { zh: '检索仙侠场景知识库（中文意图→英文专业 Prompt+负向词），生成三档可复制 Prompt：省钱版、均衡版、视听双轨导演剧本版。', en: 'Retrieves xianxia scene KB, generates 3-tier prompts: Budget / Balanced / Quality.' },
        input:  { zh: 'final_query + RAG 检索结果', en: 'final_query + RAG results' },
        output: { zh: '三档 Prompt (budget / balanced / quality)', en: '3-tier prompts' },
      },
      {
        id: 'response',
        step: { zh: 'Step 4', en: 'Step 4' },
        title: { zh: 'C端回复生成', en: 'Response Gen' },
        model: 'ERNIE-Speed', cls: 'wf-node-output wf-node-lg',
        role: { zh: '将内部 JSON 数据翻译成用户友好的自然语言回复，包含：结论、成本、缺失项、三档 Prompt、下一步指引。', en: 'Translates internal JSON into user-friendly natural language reply.' },
        input:  { zh: '完整的内部 JSON 结果', en: 'Full internal JSON' },
        output: { zh: '结构化自然语言回复', en: 'Natural-language reply' },
      },
    ]
  };
  
  function getNode(id) { return WF_DATA.nodes.find(n => n.id === id); }
  
  function renderNode(id, extraClass = '') {
    const n = getNode(id);
    if (!n) return '';
    const badges = n.badges ? n.badges.map(b =>
      `<span class="wf-badge wf-badge-${b}">${b === 'edit' ? 'NEED_EDIT' : b.toUpperCase()}</span>`
    ).join('') : '';
    return `
      <div class="wf-node ${n.cls} ${extraClass}" data-node="${id}" tabindex="0" role="button">
        <div class="wf-node-step"><span class="zh">${n.step.zh}</span><span class="en">${n.step.en}</span></div>
        <div class="wf-node-title"><span class="zh">${n.title.zh}</span><span class="en">${n.title.en}</span></div>
        ${n.model ? `<div class="wf-node-model">${n.model}</div>` : ''}
        ${badges ? `<div class="wf-node-badges">${badges}</div>` : ''}
      </div>`;
  }
  
  function hArrow() {
    return `<div class="wf-connector wf-reveal"><div class="wf-connector-icon">→</div></div>`;
  }
  
  // ── RENDER DIAGRAM ───────────────────────────────────────────────────────────
  function renderDiagram() {
    const el = document.getElementById('wf-diagram');
    if (!el) return;
  
    el.innerHTML = `
    <div class="wf-track">
  
      <!-- 1. User Input -->
      <div class="wf-reveal" style="flex-shrink:0">${renderNode('input')}</div>
  
      ${hArrow()}
  
      <!-- 2. Intent -->
      <div class="wf-reveal" style="flex-shrink:0">${renderNode('intent')}</div>
  
      ${hArrow()}
  
      <!-- 3. Branches A/B/C -->
      <div class="wf-reveal wf-branch-col">
        <div class="wf-branch-v-left"></div>
        ${renderNode('new_req')}
        ${renderNode('supplement')}
        ${renderNode('confirm')}
      </div>
  
      ${hArrow()}
  
      <!-- 4. Selector -->
      <div class="wf-reveal" style="flex-shrink:0">${renderNode('selector')}</div>
  
      ${hArrow()}
  
      <!-- 5. Interceptor block: REJECT上 / interceptor中 / NEED_EDIT下 -->
      <div class="wf-reveal wf-intercept-block">
  
        <!-- REJECT 上方 -->
        <div class="wf-top-side">
          ${renderNode('reject_out')}
          <div class="wf-v-stub wf-v-stub-reject">
            <div class="wf-stub-arrow wf-stub-arrow-down-reject"></div>
          </div>
        </div>
  
        <!-- 阻断器 中间 -->
        <div class="wf-intercept-center">
          ${renderNode('interceptor')}
        </div>
  
        <!-- NEED_EDIT 下方 -->
        <div class="wf-bottom-side">
          <div class="wf-v-stub wf-v-stub-edit">
            <div class="wf-stub-arrow wf-stub-arrow-down-edit"></div>
          </div>
          ${renderNode('edit_out')}
        </div>
  
      </div>
  
      <!-- PASS 连接器 (特殊横向箭头带标签) -->
      <div class="wf-reveal wf-pass-connector">
        <div class="wf-pass-line"></div>
        <div class="wf-pass-tag">PASS</div>
        <div class="wf-pass-line"></div>
        <div class="wf-pass-arrowhead"></div>
      </div>
  
      <!-- 6. 成本计算器 2.5 -->
      <div class="wf-reveal" style="flex-shrink:0">${renderNode('cost')}</div>
  
      ${hArrow()}
  
      <!-- 7. 决策路由器 2.6 -->
      <div class="wf-reveal" style="flex-shrink:0">${renderNode('router')}</div>
  
      ${hArrow()}
  
      <!-- 8. Prompt 生成器 3 -->
      <div class="wf-reveal" style="flex-shrink:0">${renderNode('rag')}</div>
  
      ${hArrow()}
  
      <!-- 9. C端回复生成 4 -->
      <div class="wf-reveal" style="flex-shrink:0">${renderNode('response')}</div>
  
    </div>`;
  
    addRippleEffect();
    bindNodeInteractions();
    bindScrollReveal();
  }
  
  // ── RIPPLE ────────────────────────────────────────────────────────────────────
  function addRippleEffect() {
    document.querySelectorAll('.wf-node').forEach(node => {
      node.addEventListener('mousemove', (e) => {
        const r = node.getBoundingClientRect();
        node.style.setProperty('--rx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        node.style.setProperty('--ry', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      });
    });
  }
  
  // ── TOOLTIP ───────────────────────────────────────────────────────────────────
  const tooltip = document.getElementById('wf-tooltip');
  function getLang() { return document.documentElement.getAttribute('data-lang') || 'zh'; }
  
  function populateTooltip(nodeId) {
    const n = getNode(nodeId); if (!n) return;
    const lang = getLang();
    document.getElementById('tt-step').textContent   = n.step[lang];
    document.getElementById('tt-title').textContent  = n.title[lang];
    document.getElementById('tt-role').textContent   = n.role[lang];
    document.getElementById('tt-input').textContent  = n.input[lang];
    document.getElementById('tt-output').textContent = n.output[lang];
    const m = document.getElementById('tt-model');
    if (n.model) { m.textContent = n.model; m.style.display = 'inline-block'; } else { m.style.display = 'none'; }
  }
  
  function showTooltip(nodeId, e) {
    if (!tooltip || window.innerWidth <= 900) return;
    populateTooltip(nodeId); tooltip.classList.add('visible'); positionTooltip(e);
  }
  function positionTooltip(e) {
    if (!tooltip) return;
    const vw = window.innerWidth, vh = window.innerHeight, tw = 310, th = 260;
    let x = e.clientX + 18, y = e.clientY + 12;
    if (x + tw > vw - 20) x = e.clientX - tw - 18;
    if (y + th > vh - 20) y = e.clientY - th - 12;
    tooltip.style.left = x + 'px'; tooltip.style.top = y + 'px';
  }
  function hideTooltip() { if (tooltip) tooltip.classList.remove('visible'); }
  
  // ── MOBILE SHEET ──────────────────────────────────────────────────────────────
  function populateSheet(nodeId) {
    const n = getNode(nodeId); if (!n) return;
    const lang = getLang();
    document.getElementById('sheet-step').textContent   = n.step[lang];
    document.getElementById('sheet-title').textContent  = n.title[lang];
    document.getElementById('sheet-role').textContent   = n.role[lang];
    document.getElementById('sheet-input').textContent  = n.input[lang];
    document.getElementById('sheet-output').textContent = n.output[lang];
    const m = document.getElementById('sheet-model');
    if (n.model) { m.textContent = n.model; m.style.display = 'inline-block'; } else { m.style.display = 'none'; }
  }
  function openSheet(nodeId) { populateSheet(nodeId); const s = document.getElementById('wf-sheet'); if (s) s.classList.add('open'); }
  function closeSheet() {
    const s = document.getElementById('wf-sheet'); if (s) s.classList.remove('open');
    document.querySelectorAll('.wf-node.active').forEach(el => el.classList.remove('active'));
  }
  window.closeSheet = closeSheet;
  
  // ── INTERACTIONS ──────────────────────────────────────────────────────────────
  function bindNodeInteractions() {
    document.querySelectorAll('.wf-node').forEach(el => {
      const nodeId = el.dataset.node;
      el.addEventListener('mouseenter', (e) => { showTooltip(nodeId, e); el.classList.add('active'); });
      el.addEventListener('mousemove',  (e) => { positionTooltip(e); });
      el.addEventListener('mouseleave', ()  => { hideTooltip(); el.classList.remove('active'); });
      el.addEventListener('click', (e) => {
        if (window.innerWidth <= 900) {
          e.stopPropagation();
          document.querySelectorAll('.wf-node.active').forEach(n => n.classList.remove('active'));
          el.classList.add('active'); openSheet(nodeId);
        }
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(nodeId); } });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.wf-node') && !e.target.closest('#wf-sheet')) closeSheet();
    });
  }
  
  // ── SCROLL REVEAL ─────────────────────────────────────────────────────────────
  function bindScrollReveal() {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('wf-visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    document.querySelectorAll('.wf-reveal').forEach(el => obs.observe(el));
  }
  
  // ── LANG HOOK ─────────────────────────────────────────────────────────────────
  function onLangChange() {
    const active = document.querySelector('.wf-node.active'); if (!active) return;
    const nodeId = active.dataset.node;
    if (tooltip && tooltip.classList.contains('visible')) populateTooltip(nodeId);
    const sheet = document.getElementById('wf-sheet');
    if (sheet && sheet.classList.contains('open')) populateSheet(nodeId);
  }
  if (typeof window.toggleLang === 'function') {
    const _orig = window.toggleLang;
    window.toggleLang = function () { _orig(); onLangChange(); };
  }
  
  // ── INIT ──────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', renderDiagram); }
  else { renderDiagram(); }
  
  })();