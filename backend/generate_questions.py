#!/usr/bin/env python3
"""
改进版题库生成器
- 改一：换用深度技术内容源（论文注释/完整教程章节/带注释代码）
- 改二：按子话题分配题数，确保全面覆盖，不随机堆砌
- 改四：支持增量生成 --deep，只补充缺失子话题

用法：
  python generate_questions.py                              # 生成所有模块
  python generate_questions.py transformer rag              # 指定模块
  python generate_questions.py transformer --deep           # 只补充缺失子话题
  python generate_questions.py transformer --subtopic variants  # 只生成某子话题
"""

import json, os, re, sys, time, urllib.request
from pathlib import Path
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("DEEPSEEK_API_KEY"), base_url="https://api.deepseek.com")
DATA_DIR = Path(__file__).parent / "data" / "questions"
DATA_DIR.mkdir(parents=True, exist_ok=True)

MODULE_ZH = {
    "transformer": "Transformer架构",
    "rag":         "RAG检索增强生成",
    "langchain":   "LangChain框架",
    "langgraph":   "LangGraph",
    "agent":       "AI Agent架构",
    "pytorch":     "PyTorch深度学习",
    "nlp":         "NLP自然语言处理",
    "bert":        "BERT微调",
    "claudecode":  "Claude Code",
    "finetune":    "LLM微调与对齐",
    "deploy":      "推理与部署",
}

# ── 改一：深度内容源（论文注释 / 完整章节 / 带注释代码）──────────
SOURCES = {
    "transformer": [
        # Karpathy nanoGPT —— 极简但完整的 GPT 实现，注释丰富
        "https://raw.githubusercontent.com/karpathy/nanoGPT/master/model.py",
        # HuggingFace 完整课程章节（不是简介，是正文）
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter1/4.mdx",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter1/5.mdx",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter1/6.mdx",
        # Harvard Annotated Transformer（论文逐行注释）
        "https://raw.githubusercontent.com/harvardnlp/annotated-transformer/master/AnnotatedTransformer.ipynb",
        # minGPT 模型实现
        "https://raw.githubusercontent.com/karpathy/minGPT/master/mingpt/model.py",
    ],
    "rag": [
        # LangChain RAG from scratch（系列教程 notebook）
        "https://raw.githubusercontent.com/langchain-ai/rag-from-scratch/main/rag_from_scratch_1_to_4.ipynb",
        "https://raw.githubusercontent.com/langchain-ai/rag-from-scratch/main/rag_from_scratch_5_to_9.ipynb",
        "https://raw.githubusercontent.com/langchain-ai/rag-from-scratch/main/rag_from_scratch_10_and_11.ipynb",
        # LangChain 官方 RAG 教程
        "https://raw.githubusercontent.com/langchain-ai/langchain/master/docs/docs/tutorials/rag.ipynb",
        "https://raw.githubusercontent.com/chatchat-space/Langchain-Chatchat/master/README_en.md",
    ],
    "langchain": [
        # 核心概念文档（非 README）
        "https://raw.githubusercontent.com/langchain-ai/langchain/master/docs/docs/concepts/lcel.mdx",
        "https://raw.githubusercontent.com/langchain-ai/langchain/master/docs/docs/concepts/agents.mdx",
        "https://raw.githubusercontent.com/langchain-ai/langchain/master/docs/docs/concepts/memory.mdx",
        "https://raw.githubusercontent.com/langchain-ai/langchain/master/docs/docs/concepts/tools.mdx",
        "https://raw.githubusercontent.com/gkamradt/langchain-tutorials/main/LangChain%20Cookbook%20Part%201%20-%20Fundamentals.ipynb",
    ],
    "langgraph": [
        # 完整概念文档
        "https://raw.githubusercontent.com/langchain-ai/langgraph/main/docs/docs/concepts/low_level.md",
        "https://raw.githubusercontent.com/langchain-ai/langgraph/main/docs/docs/concepts/high_level.md",
        "https://raw.githubusercontent.com/langchain-ai/langgraph/main/docs/docs/concepts/agentic_concepts.md",
        "https://raw.githubusercontent.com/langchain-ai/langgraph/main/docs/docs/concepts/multi_agent.md",
        # 入门教程 notebook
        "https://raw.githubusercontent.com/langchain-ai/langgraph/main/docs/docs/tutorials/introduction.ipynb",
    ],
    "agent": [
        # AutoGen 完整教程
        "https://raw.githubusercontent.com/microsoft/autogen/main/notebook/agentchat_two_users.ipynb",
        # CrewAI 完整文档
        "https://raw.githubusercontent.com/joaomdmoura/crewAI/main/docs/concepts/agents.mdx",
        "https://raw.githubusercontent.com/joaomdmoura/crewAI/main/docs/concepts/tasks.mdx",
        # GPT-Researcher（完整 Agent 系统实现）
        "https://raw.githubusercontent.com/assafelovic/gpt-researcher/master/README.md",
        "https://raw.githubusercontent.com/assafelovic/gpt-researcher/master/gpt_researcher/agent.py",
    ],
    "pytorch": [
        # PyTorch 官方教程正文（.rst 格式，内容完整）
        "https://raw.githubusercontent.com/pytorch/tutorials/main/beginner_source/blitz/autograd_tutorial.rst",
        "https://raw.githubusercontent.com/pytorch/tutorials/main/beginner_source/nn_tutorial.rst",
        "https://raw.githubusercontent.com/pytorch/tutorials/main/intermediate_source/char_rnn_classification_tutorial.rst",
        # Karpathy micrograd —— 自动微分引擎逐行实现
        "https://raw.githubusercontent.com/karpathy/micrograd/master/micrograd/engine.py",
        "https://raw.githubusercontent.com/karpathy/nn-zero-to-hero/master/lectures/makemore/makemore_part1_bigrams.ipynb",
    ],
    "nlp": [
        # HuggingFace 完整 NLP 课程
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter2/2.mdx",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter2/3.mdx",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter3/2.mdx",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter6/2.mdx",
        "https://raw.githubusercontent.com/graykode/nlp-tutorial/master/README.md",
    ],
    "bert": [
        # BERT 原始论文实现
        "https://raw.githubusercontent.com/google-research/bert/master/modeling.py",
        "https://raw.githubusercontent.com/google-research/bert/master/run_classifier.py",
        # HuggingFace BERT 微调完整教程
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter3/2.mdx",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter3/3.mdx",
        "https://raw.githubusercontent.com/649453932/Bert-Chinese-Text-Classification-Pytorch/master/README.md",
    ],
    "claudecode": [
        "https://raw.githubusercontent.com/anthropics/anthropic-cookbook/main/tool_use/computer_use_demo/README.md",
        "https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/README.md",
        "https://raw.githubusercontent.com/anthropics/courses/master/anthropic_api_fundamentals/04_tool_use.ipynb",
        "https://raw.githubusercontent.com/anthropics/anthropic-cookbook/main/misc/how_to_enable_json_mode.ipynb",
    ],
    "finetune": [
        # HuggingFace TRL —— SFT / RLHF / DPO 完整实现
        "https://raw.githubusercontent.com/huggingface/trl/main/README.md",
        "https://raw.githubusercontent.com/huggingface/trl/main/docs/source/sft_trainer.mdx",
        "https://raw.githubusercontent.com/huggingface/trl/main/docs/source/dpo_trainer.mdx",
        # PEFT —— LoRA / QLoRA / Adapter 官方文档
        "https://raw.githubusercontent.com/huggingface/peft/main/README.md",
        "https://raw.githubusercontent.com/huggingface/peft/main/docs/source/conceptual_guides/lora.md",
        # QLoRA 原始论文实现
        "https://raw.githubusercontent.com/artidoro/qlora/main/README.md",
        # LLaMA-Factory —— 综合微调框架，文档详尽
        "https://raw.githubusercontent.com/hiyouga/LLaMA-Factory/main/README.md",
    ],
    "deploy": [
        # vLLM —— PagedAttention / 连续批处理核心实现
        "https://raw.githubusercontent.com/vllm-project/vllm/main/README.md",
        "https://raw.githubusercontent.com/vllm-project/vllm/main/docs/source/serving/distributed_serving.rst",
        # TGI —— HuggingFace 生产推理服务
        "https://raw.githubusercontent.com/huggingface/text-generation-inference/main/README.md",
        # llama.cpp —— GGUF 量化与 CPU 推理
        "https://raw.githubusercontent.com/ggerganov/llama.cpp/master/README.md",
        # AWQ / AutoGPTQ —— 权重量化
        "https://raw.githubusercontent.com/mit-han-lab/llm-awq/main/README.md",
        "https://raw.githubusercontent.com/AutoGPTQ/AutoGPTQ/main/README.md",
    ],
}

# ── 改二：子话题分配，确保全面覆盖 ──────────────────────────────
SUBTOPICS = {
    "transformer": [
        ("attention",      "注意力机制（Self-Attention / Multi-Head / Cross-Attention）", 10),
        ("architecture",   "整体架构（Encoder/Decoder 结构、残差、LayerNorm）",            8),
        ("position_enc",   "位置编码（绝对/相对/RoPE/ALiBi）",                             6),
        ("training",       "训练细节（Warmup、Label Smoothing、Masking策略）",             6),
        ("variants",       "变体对比（BERT/GPT/T5/LLaMA 架构差异与适用场景）",            8),
        ("implementation", "代码实现（PyTorch 关键模块手写）",                              6),
        ("applications",   "应用扩展（ViT / 多模态 / 长序列优化）",                        4),
        # ── 补充缺口 ──
        ("modern_arch",    "现代LLM架构改进（GQA/MoE/SwiGLU/RMSNorm/RoPE详解）",         8),
        ("kv_inference",   "推理优化基础（KV Cache原理/FlashAttention/投机解码）",          6),
    ],  # 62
    "rag": [
        ("pipeline",       "基础流程（索引/检索/生成三阶段）",                             8),
        ("chunking",       "文档分块（策略选择、重叠、层次分块）",                         7),
        ("retrieval",      "检索策略（稠密/稀疏/混合/MMR/多路召回）",                     9),
        ("embedding",      "向量嵌入（模型选择、归一化、更新策略）",                       6),
        ("advanced_rag",   "高级RAG（HyDE/查询改写/Re-ranking/Self-RAG）",               10),
        ("evaluation",     "评估体系（RAGAS / Faithfulness / Relevance）",                6),
        ("systems",        "系统设计（延迟/成本/一致性权衡）",                             4),
    ],
    "langchain": [
        ("core",           "核心组件（LLM/Chain/Prompt/OutputParser）",                  10),
        ("lcel",           "LCEL 表达式语言（管道操作符、并行、分支）",                    8),
        ("agents",         "Agent 与工具（ReAct / OpenAI Function / Tool 定义）",         9),
        ("memory",         "记忆机制（Buffer/Summary/Vector/Window Memory）",             7),
        ("retrieval",      "检索集成（VectorStore / Retriever / MultiQuery）",            8),
        ("practical",      "实战技巧（Callbacks / 流式输出 / 错误处理）",                  8),
    ],
    "langgraph": [
        ("graph_basics",   "图基础（StateGraph / 节点类型 / 编译）",                      9),
        ("state",          "状态管理（TypedDict / Annotated / 状态合并策略）",             8),
        ("edges",          "边与路由（条件边 / 动态路由 / 循环检测）",                     8),
        ("checkpointing",  "检查点与持久化（Memory / 中断 / 时间旅行）",                   8),
        ("multi_agent",    "多Agent协作（Supervisor / Swarm / 消息传递）",                 9),
        ("patterns",       "设计模式（Map-Reduce / 反思 / 规划执行）",                     8),
    ],
    "agent": [
        ("basics",         "Agent基础（定义 / 感知-思考-行动循环）",                       8),
        ("reasoning",      "推理规划（ReAct / CoT / Tree-of-Thought / 反思）",             9),
        ("tools",          "工具调用（设计原则 / Function Calling / 错误处理）",           8),
        ("memory",         "记忆类型（工作记忆 / 情节记忆 / 语义记忆 / 程序记忆）",        7),
        ("multi_agent",    "多Agent架构（协调模式 / 角色分工 / 通信协议）",                9),
        ("evaluation",     "评估调试（基准测试 / 轨迹评估 / 失败模式分析）",               9),
    ],
    "pytorch": [
        ("tensors",        "张量操作（广播 / 内存布局 / 原地操作 / CUDA）",                8),
        ("autograd",       "自动微分（计算图 / grad_fn / detach / no_grad）",              8),
        ("nn_modules",     "神经网络模块（Module / Sequential / 参数管理）",               9),
        ("training",       "训练流程（DataLoader / 损失函数 / 反向传播 / 梯度裁剪）",      8),
        ("optimization",   "优化与调度（Adam/AdamW / LR Scheduler / 混合精度）",           8),
        ("advanced",       "进阶技巧（自定义层 / Hook / DDP / 模型保存加载）",             9),
        # ── 补充缺口 ──
        ("modern_torch",   "现代PyTorch（torch.compile/量化API/FSDP/Profiler/Triton）",  10),
    ],  # 60
    "nlp": [
        ("preprocessing",  "文本预处理（分词 / 归一化 / 词表 / OOV处理）",                 8),
        ("embeddings",     "词嵌入（Word2Vec / GloVe / FastText / 上下文嵌入对比）",       8),
        ("seq_models",     "序列模型（RNN / LSTM / GRU / 梯度消失问题）",                  8),
        ("transformers",   "Transformer在NLP的应用（分类/NER/问答/生成任务）",             8),
        ("pretrain_ft",    "预训练范式（MLM / CLM / 全量微调 / 灾难性遗忘）",              8),
        ("evaluation",     "评估指标（BLEU / ROUGE / Perplexity / F1 / BERTScore）",       8),
        # ── 补充缺口 ──
        ("peft_methods",   "参数高效微调（LoRA/QLoRA/Adapter/Prefix-Tuning/P-Tuning/IA³）", 12),
    ],  # 60
    "bert": [
        ("architecture",   "BERT架构（双向编码 / 层数配置 / CLS Token 作用）",             8),
        ("pretraining",    "预训练任务（MLM掩码策略 / NSP / 数据构建）",                   8),
        ("finetuning",     "微调策略（学习率 / 层冻结 / 任务头设计 / 灾难性遗忘）",       10),
        ("tokenization",   "分词编码（WordPiece / 特殊Token / 最大长度处理）",              6),
        ("variants",       "BERT变体（RoBERTa/ALBERT/DistilBERT/Chinese-BERT 对比）",       8),
        ("practical",      "实战技巧（长文本处理 / 低资源 / 领域适应 / 部署优化）",        10),
    ],
    "claudecode": [
        ("basics",         "基础概念（Claude模型家族 / API概述 / 定价）",                  8),
        ("api",            "API使用（Messages API / 参数配置 / 错误处理）",                8),
        ("prompting",      "提示工程（System Prompt / Few-shot / CoT / XML结构）",         10),
        ("tools",          "工具调用（Function定义 / tool_choice / 多工具协作）",           8),
        ("advanced",       "高级特性（流式输出 / 缓存 / 批处理 / Vision）",                8),
        ("best_practices", "最佳实践（安全 / 成本控制 / 评估 / Claude Code CLI）",          8),
    ],
    # ── 新增模块：系统性缺失补全 ────────────────────────────────────
    "finetune": [
        ("sft",            "监督微调SFT（数据格式 / ChatTemplate / 训练流程 / 常见坑）",   10),
        ("rlhf",           "RLHF原理（奖励模型 / PPO / 对齐税 / Goodhart定律）",           9),
        ("dpo",            "偏好优化（DPO / ORPO / SimPO / 与RLHF的本质区别）",            8),
        ("lora",           "LoRA系列（原理推导 / QLoRA / AdaLoRA / LoftQ / 秩选择）",     10),
        ("other_peft",     "其他PEFT（Adapter / Prefix-Tuning / P-Tuning v2 / IA³）",      8),
        ("data",           "训练数据（质量过滤 / 合成数据 / 去重 / 指令数据构建）",          7),
        ("practical",      "实战技巧（显存优化 / 超参选择 / 收敛判断 / 灾难性遗忘）",       8),
    ],  # 60
    "deploy": [
        ("serving",        "推理服务框架（vLLM/TGI/SGLang / PagedAttention / 连续批处理）",10),
        ("quantization",   "量化技术（GPTQ/AWQ/BnB/GGUF / 量化感知训练 / 精度权衡）",      10),
        ("inference_opt",  "推理优化（KV Cache管理 / 投机解码 / 前缀缓存 / 动态形状）",     9),
        ("distillation",   "模型压缩（知识蒸馏原理 / 剪枝 / 结构化压缩 / 蒸馏数据）",       8),
        ("production",     "生产部署（吞吐/延迟权衡 / 监控 / 成本控制 / SLA）",             8),
        ("hardware",       "硬件与框架（GPU选型 / CUDA优化 / torch.compile / Triton）",      5),
    ],  # 50
}


def fetch_url(url: str, timeout: int = 15) -> str:
    """抓取内容，自动处理 Jupyter Notebook (.ipynb) 格式。"""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"    ⚠  {url.split('/')[-1]}: {type(e).__name__}")
        return ""

    # 处理 Jupyter Notebook：提取 markdown + code 单元格内容
    if url.endswith(".ipynb"):
        try:
            nb = json.loads(raw)
            parts = []
            for cell in nb.get("cells", []):
                src = "".join(cell.get("source", []))
                if len(src.strip()) > 30:
                    parts.append(src)
            return "\n\n".join(parts)[:6000]
        except Exception:
            pass

    # 去除图片和 HTML 标签，保留纯文本
    raw = re.sub(r'!\[.*?\]\(.*?\)', '', raw)
    raw = re.sub(r'<[^>]+>', ' ',    raw)
    return raw[:6000]


def call_api(system: str, user: str, max_tokens: int = 4096) -> str:
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=[{"role":"system","content":system},
                          {"role":"user",  "content":user}],
                max_tokens=max_tokens,
                temperature=0.7,
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            if attempt == 2: raise
            print(f"    重试 {attempt+1}/3: {e}")
            time.sleep(3)


def parse_json(raw: str) -> dict:
    m = re.search(r'\{[\s\S]*\}', raw)
    return json.loads(m.group(0) if m else raw)


def generate_subtopic_batch(module_id: str, content: str,
                             subtopic_id: str, subtopic_zh: str,
                             difficulty: str, count: int,
                             id_offset: int) -> list[dict]:
    """针对特定子话题和难度，生成一批题目。"""
    diff_desc = {
        "basic":    "基础（概念定义、基本原理，能直接从文档找到答案）",
        "medium":   "中等（原理理解、实现细节、应用场景分析）",
        "advanced": "进阶（深度分析、架构权衡、对比设计、边界情况）",
    }[difficulty]

    system = (
        f"你是{MODULE_ZH[module_id]}领域专家，专注于【{subtopic_zh}】方向。"
        "严格按 JSON 格式输出，不含其他文字。"
    )
    user = (
        f"参考以下技术内容，针对【{subtopic_zh}】方向生成 {count} 道{diff_desc}中文面试题。\n\n"
        f"## 内容参考\n{content}\n\n"
        f"## 严格要求\n"
        f"- 所有题目必须与【{subtopic_zh}】直接相关，禁止跑题\n"
        f"- 题目有明确的技术考察点，不能问宽泛的'介绍一下'类型\n"
        f"- 参考答案准确完整，150字以内，直击要点\n"
        f"- 全部中文\n"
        f"- 恰好生成 {count} 道，不多不少\n\n"
        f"## 输出格式\n"
        f'{{"questions":[{{"question":"...","reference_answer":"...","tags":["tag1","tag2"]}}]}}'
    )
    raw = call_api(system, user)
    data = parse_json(raw)
    questions = data.get("questions", [])
    for i, q in enumerate(questions):
        q["id"]         = f"{module_id}_{subtopic_id}_{difficulty}_{id_offset+i+1:03d}"
        q["subtopic"]   = subtopic_id
        q["subtopic_zh"]= subtopic_zh
        q["difficulty"] = difficulty
        q.setdefault("tags", [])
    return questions[:count]


def get_existing_counts(module_id: str) -> dict[str, int]:
    """返回已有题库中各子话题的题目数量。"""
    file = DATA_DIR / f"{module_id}.json"
    if not file.exists():
        return {}
    data = json.loads(file.read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    for q in data.get("questions", []):
        st = q.get("subtopic", "unknown")
        counts[st] = counts.get(st, 0) + 1
    return counts


def get_existing_questions(module_id: str) -> list:
    file = DATA_DIR / f"{module_id}.json"
    if not file.exists():
        return []
    return json.loads(file.read_text(encoding="utf-8")).get("questions", [])


def process_module(module_id: str, deep: bool = False,
                   only_subtopic: str | None = None) -> None:
    name = MODULE_ZH[module_id]
    subtopics = SUBTOPICS[module_id]
    print(f"\n{'─'*60}")
    print(f"  📦  {name}  {'[增量模式]' if deep else ''}")

    # ── 抓取内容 ──────────────────────────────────────
    parts = []
    for url in SOURCES.get(module_id, []):
        text = fetch_url(url)
        if text:
            parts.append(text)
            print(f"    ✓  {len(text):>5,} chars  ← .../{url.split('/')[-1]}")
    content = "\n\n---\n\n".join(parts)[:16000]
    if not content.strip():
        content = f"主题：{name}（基于专业知识生成）"
        print("    ⚠  未抓到内容，纯知识生成模式")
    else:
        print(f"    📄  合计 {len(content):,} chars 送入 AI")

    # ── 确定要生成哪些子话题 ───────────────────────────
    existing_counts = get_existing_counts(module_id) if deep else {}
    existing_qs     = get_existing_questions(module_id) if deep else []

    plan: list[tuple] = []  # (subtopic_id, subtopic_zh, difficulty, count, id_offset_base)
    for sid, szh, total in subtopics:
        if only_subtopic and sid != only_subtopic:
            continue
        have = existing_counts.get(sid, 0)
        if deep and have >= total:
            print(f"    ✅  {szh[:18]:20s} 已有 {have}/{total}，跳过")
            continue

        needed = total - have if deep else total
        # 按难度分配：40% basic, 40% medium, 20% advanced
        b = round(needed * 0.4); m = round(needed * 0.4); a = needed - b - m
        plan.append((sid, szh, "basic",    max(1, b), have))
        plan.append((sid, szh, "medium",   max(1, m), have + b))
        plan.append((sid, szh, "advanced", max(1, a), have + b + m))

    if not plan:
        print("    ✅  所有子话题已完整，无需生成")
        return

    # ── 逐批生成 ──────────────────────────────────────
    new_questions: list[dict] = []
    for sid, szh, difficulty, count, offset in plan:
        label = f"{szh[:16]:18s} [{difficulty}×{count}]"
        print(f"    🎯  {label}", end="", flush=True)
        try:
            qs = generate_subtopic_batch(
                module_id, content, sid, szh, difficulty, count,
                id_offset=len(existing_qs) + len(new_questions) + offset
            )
            new_questions.extend(qs)
            print(f"  ✓  {len(qs)} 道")
            time.sleep(0.6)
        except Exception as e:
            print(f"  ⚠  失败: {e}")

    # ── 合并保存 ───────────────────────────────────────
    all_qs = existing_qs + new_questions
    output = {
        "module":      module_id,
        "module_name": name,
        "total":       len(all_qs),
        "subtopics":   [{"id":s[0],"name_zh":s[1],"target":s[2]} for s in subtopics],
        "questions":   all_qs,
    }
    out_path = DATA_DIR / f"{module_id}.json"
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  💾  共 {len(all_qs)} 道题（新增 {len(new_questions)}）→ {out_path.name}")


def main() -> None:
    if not os.environ.get("DEEPSEEK_API_KEY"):
        print("❌  请先设置：export DEEPSEEK_API_KEY=sk-...")
        sys.exit(1)

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    deep         = "--deep" in flags
    only_subtopic = next((f.split("=")[1] for f in flags if f.startswith("--subtopic=")), None)

    targets = args or list(SOURCES.keys())
    invalid = [t for t in targets if t not in SOURCES]
    if invalid:
        print(f"❌  未知模块: {invalid}\n可用: {list(SOURCES.keys())}")
        sys.exit(1)

    mode = f"{'增量补充' if deep else '完整生成'}" + (f" [{only_subtopic}]" if only_subtopic else "")
    print(f"🚀  {mode} | 模块: {targets}")

    for module_id in targets:
        try:
            process_module(module_id, deep=deep, only_subtopic=only_subtopic)
        except KeyboardInterrupt:
            print("\n⛔  已中断")
            sys.exit(0)
        except Exception as e:
            print(f"\n❌  {module_id} 失败: {e}")

    print(f"\n✅  完成！题库保存在 {DATA_DIR}")


if __name__ == "__main__":
    main()
