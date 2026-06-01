#!/usr/bin/env python3
"""
改进版速记卡生成器
- 改一：换用深度内容源（同 generate_questions.py）
- 改三：5 种卡片类型（概念/对比/公式/代码/易错）确保结构多样
- 改四：支持 --card-types 增量生成指定类型

用法：
  python generate_knowledge.py                              # 生成所有模块
  python generate_knowledge.py transformer                  # 单模块（全类型）
  python generate_knowledge.py transformer --deep           # 只补充缺失类型
  python generate_knowledge.py transformer --card-types=compare,formula,gotcha
"""

import json, os, re, sys, time, urllib.request
from pathlib import Path
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("DEEPSEEK_API_KEY"), base_url="https://api.deepseek.com")
DATA_DIR = Path(__file__).parent / "data" / "knowledge"
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

# 与 generate_questions.py 完全相同的深度内容源
SOURCES = {
    "transformer": [
        "https://raw.githubusercontent.com/karpathy/nanoGPT/master/model.py",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter1/4.mdx",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter1/5.mdx",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter1/6.mdx",
        "https://raw.githubusercontent.com/harvardnlp/annotated-transformer/master/AnnotatedTransformer.ipynb",
        "https://raw.githubusercontent.com/karpathy/minGPT/master/mingpt/model.py",
    ],
    "rag": [
        "https://raw.githubusercontent.com/langchain-ai/rag-from-scratch/main/rag_from_scratch_1_to_4.ipynb",
        "https://raw.githubusercontent.com/langchain-ai/rag-from-scratch/main/rag_from_scratch_5_to_9.ipynb",
        "https://raw.githubusercontent.com/langchain-ai/rag-from-scratch/main/rag_from_scratch_10_and_11.ipynb",
        "https://raw.githubusercontent.com/langchain-ai/langchain/master/docs/docs/tutorials/rag.ipynb",
        "https://raw.githubusercontent.com/chatchat-space/Langchain-Chatchat/master/README_en.md",
    ],
    "langchain": [
        "https://raw.githubusercontent.com/langchain-ai/langchain/master/docs/docs/concepts/lcel.mdx",
        "https://raw.githubusercontent.com/langchain-ai/langchain/master/docs/docs/concepts/agents.mdx",
        "https://raw.githubusercontent.com/langchain-ai/langchain/master/docs/docs/concepts/memory.mdx",
        "https://raw.githubusercontent.com/langchain-ai/langchain/master/docs/docs/concepts/tools.mdx",
        "https://raw.githubusercontent.com/gkamradt/langchain-tutorials/main/LangChain%20Cookbook%20Part%201%20-%20Fundamentals.ipynb",
    ],
    "langgraph": [
        "https://raw.githubusercontent.com/langchain-ai/langgraph/main/docs/docs/concepts/low_level.md",
        "https://raw.githubusercontent.com/langchain-ai/langgraph/main/docs/docs/concepts/high_level.md",
        "https://raw.githubusercontent.com/langchain-ai/langgraph/main/docs/docs/concepts/agentic_concepts.md",
        "https://raw.githubusercontent.com/langchain-ai/langgraph/main/docs/docs/concepts/multi_agent.md",
        "https://raw.githubusercontent.com/langchain-ai/langgraph/main/docs/docs/tutorials/introduction.ipynb",
    ],
    "agent": [
        "https://raw.githubusercontent.com/microsoft/autogen/main/notebook/agentchat_two_users.ipynb",
        "https://raw.githubusercontent.com/joaomdmoura/crewAI/main/docs/concepts/agents.mdx",
        "https://raw.githubusercontent.com/joaomdmoura/crewAI/main/docs/concepts/tasks.mdx",
        "https://raw.githubusercontent.com/assafelovic/gpt-researcher/master/README.md",
        "https://raw.githubusercontent.com/assafelovic/gpt-researcher/master/gpt_researcher/agent.py",
    ],
    "pytorch": [
        "https://raw.githubusercontent.com/pytorch/tutorials/main/beginner_source/blitz/autograd_tutorial.rst",
        "https://raw.githubusercontent.com/pytorch/tutorials/main/beginner_source/nn_tutorial.rst",
        "https://raw.githubusercontent.com/pytorch/tutorials/main/intermediate_source/char_rnn_classification_tutorial.rst",
        "https://raw.githubusercontent.com/karpathy/micrograd/master/micrograd/engine.py",
        "https://raw.githubusercontent.com/karpathy/nn-zero-to-hero/master/lectures/makemore/makemore_part1_bigrams.ipynb",
    ],
    "nlp": [
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter2/2.mdx",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter2/3.mdx",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter3/2.mdx",
        "https://raw.githubusercontent.com/huggingface/course/main/chapters/en/chapter6/2.mdx",
        "https://raw.githubusercontent.com/graykode/nlp-tutorial/master/README.md",
    ],
    "bert": [
        "https://raw.githubusercontent.com/google-research/bert/master/modeling.py",
        "https://raw.githubusercontent.com/google-research/bert/master/run_classifier.py",
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
        "https://raw.githubusercontent.com/huggingface/trl/main/README.md",
        "https://raw.githubusercontent.com/huggingface/trl/main/docs/source/sft_trainer.mdx",
        "https://raw.githubusercontent.com/huggingface/trl/main/docs/source/dpo_trainer.mdx",
        "https://raw.githubusercontent.com/huggingface/peft/main/README.md",
        "https://raw.githubusercontent.com/huggingface/peft/main/docs/source/conceptual_guides/lora.md",
        "https://raw.githubusercontent.com/artidoro/qlora/main/README.md",
        "https://raw.githubusercontent.com/hiyouga/LLaMA-Factory/main/README.md",
    ],
    "deploy": [
        "https://raw.githubusercontent.com/vllm-project/vllm/main/README.md",
        "https://raw.githubusercontent.com/vllm-project/vllm/main/docs/source/serving/distributed_serving.rst",
        "https://raw.githubusercontent.com/huggingface/text-generation-inference/main/README.md",
        "https://raw.githubusercontent.com/ggerganov/llama.cpp/master/README.md",
        "https://raw.githubusercontent.com/mit-han-lab/llm-awq/main/README.md",
        "https://raw.githubusercontent.com/AutoGPTQ/AutoGPTQ/main/README.md",
    ],
}

# ── 改三：5 种卡片类型 ──────────────────────────────────────────
# (type_id, 中文名, 数量, 生成指令)
CARD_TYPES = [
    (
        "concept", "概念卡", 6,
        "每张聚焦一个核心概念。"
        "title: 概念名称（含英文原词）；"
        "summary: 一句话速记定义（≤30字，是结论而非描述）；"
        "points: 3-5个关键特征或工作原理；"
        "tip: 记忆口诀或面试常问点"
    ),
    (
        "compare", "对比卡", 4,
        "每张对比两个或多个密切相关的概念/方案。"
        "title: 'A vs B' 或 'X/Y/Z 对比' 格式；"
        "summary: 一句话说清核心区别（≤30字）；"
        "points: 逐项对比（维度:A的特点/B的特点）；"
        "tip: 选择建议——什么场景用哪个"
    ),
    (
        "formula", "公式卡", 3,
        "每张围绕一个关键公式或算法步骤。"
        "title: 公式名称，summary中直接写出公式（用文字/LaTeX均可）；"
        "summary: 公式本身 + 一句话说明它计算什么；"
        "points: 逐项解释符号含义 + 直觉理解；"
        "tip: 常见误区或推导记忆法"
    ),
    (
        "code", "代码卡", 3,
        "每张展示最能说明原理的关键代码片段（Python/PyTorch，5-10行）。"
        "title: 代码实现的功能名称；"
        "summary: 这段代码做了什么（≤30字）；"
        "points: 关键行的逐行注释解释；"
        "tip: 常见 Bug 或重要注意事项"
    ),
    (
        "gotcha", "易错卡", 2,
        "每张揭示一个常见误解、面试陷阱或易混淆点。"
        "title: 用错误的说法作为标题（如'Attention复杂度是O(n)'）；"
        "summary: 正确的理解（≤30字，直接推翻误解）；"
        "points: 为什么容易犯错 + 正确的理解方式；"
        "tip: 记住正确答案的口诀"
    ),
]
# 合计 6+4+3+3+2 = 18 张


def fetch_url(url: str, timeout: int = 15) -> str:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"    ⚠  {url.split('/')[-1]}: {type(e).__name__}")
        return ""

    if url.endswith(".ipynb"):
        try:
            nb = json.loads(raw)
            parts = ["".join(c.get("source",[])) for c in nb.get("cells",[]) if len("".join(c.get("source",[])).strip()) > 30]
            return "\n\n".join(parts)[:6000]
        except Exception:
            pass

    raw = re.sub(r'!\[.*?\]\(.*?\)', '', raw)
    raw = re.sub(r'<[^>]+>', ' ', raw)
    return raw[:6000]


def call_api(system: str, user: str) -> str:
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model="deepseek-chat",
                messages=[{"role":"system","content":system}, {"role":"user","content":user}],
                max_tokens=4096, temperature=0.5,
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            if attempt == 2: raise
            print(f"    重试 {attempt+1}/3: {e}")
            time.sleep(3)


def parse_json(raw: str) -> dict:
    m = re.search(r'\{[\s\S]*\}', raw)
    return json.loads(m.group(0) if m else raw)


def generate_card_type(module_id: str, content: str,
                        type_id: str, type_zh: str,
                        count: int, instruction: str,
                        id_offset: int) -> list[dict]:
    """生成指定类型的卡片。"""
    system = (
        f"你是{MODULE_ZH[module_id]}领域专家，负责制作【{type_zh}】速记卡片。"
        "严格按 JSON 格式输出，不含其他文字或代码块标记。"
    )
    user = (
        f"参考以下{MODULE_ZH[module_id]}技术内容，制作 {count} 张【{type_zh}】。\n\n"
        f"## 参考内容\n{content}\n\n"
        f"## 此类型说明\n{instruction}\n\n"
        f"## 通用要求\n"
        f"- 全部中文（公式卡中的公式符号可保留英文）\n"
        f"- 覆盖该模块最重要的 {count} 个【{type_zh}】知识点\n"
        f"- summary 必须精炼（≤30字），是结论而非描述\n"
        f"- 恰好 {count} 张\n\n"
        f"## 输出格式\n"
        f'{{"cards":[{{"title":"...","summary":"...","points":["...","..."],"tip":"..."}}]}}'
    )
    raw = call_api(system, user)
    data = parse_json(raw)
    cards = data.get("cards", [])
    for i, c in enumerate(cards):
        c["id"]        = f"{module_id}_{type_id}_{id_offset+i+1:03d}"
        c["card_type"] = type_id
        c["type_zh"]   = type_zh
        c.setdefault("tip", "")
    return cards[:count]


def get_existing_type_counts(module_id: str) -> dict[str, int]:
    file = DATA_DIR / f"{module_id}.json"
    if not file.exists():
        return {}
    data = json.loads(file.read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    for c in data.get("cards", []):
        t = c.get("card_type", "unknown")
        counts[t] = counts.get(t, 0) + 1
    return counts


def get_existing_cards(module_id: str) -> list:
    file = DATA_DIR / f"{module_id}.json"
    if not file.exists():
        return []
    return json.loads(file.read_text(encoding="utf-8")).get("cards", [])


def process_module(module_id: str, deep: bool = False,
                   only_types: list[str] | None = None) -> None:
    name = MODULE_ZH[module_id]
    print(f"\n{'─'*60}")
    print(f"  📦  {name}  {'[增量模式]' if deep else ''}")

    # 抓取内容
    parts = []
    for url in SOURCES.get(module_id, []):
        text = fetch_url(url)
        if text:
            parts.append(text)
            print(f"    ✓  {len(text):>5,} chars  ← .../{url.split('/')[-1]}")
    content = "\n\n---\n\n".join(parts)[:14000]
    if not content.strip():
        content = f"主题：{name}"
        print("    ⚠  未抓到内容，纯知识生成")
    else:
        print(f"    📄  合计 {len(content):,} chars")

    existing_counts = get_existing_type_counts(module_id) if deep else {}
    existing_cards  = get_existing_cards(module_id) if deep else []

    new_cards: list[dict] = []
    for type_id, type_zh, count, instruction in CARD_TYPES:
        if only_types and type_id not in only_types:
            continue
        have = existing_counts.get(type_id, 0)
        if deep and have >= count:
            print(f"    ✅  {type_zh:5s}  已有 {have}/{count}，跳过")
            continue
        needed = count - have if deep else count
        icon   = {"concept":"📖","compare":"⚖️","formula":"🔢","code":"💻","gotcha":"⚠️"}.get(type_id,"🃏")
        print(f"    {icon}  {type_zh}  × {needed} ...", end="", flush=True)
        try:
            cards = generate_card_type(
                module_id, content, type_id, type_zh, needed, instruction,
                id_offset=len(existing_cards) + len(new_cards)
            )
            new_cards.extend(cards)
            print(f"  ✓  {len(cards)} 张")
            time.sleep(0.8)
        except Exception as e:
            print(f"  ⚠  失败: {e}")

    all_cards = existing_cards + new_cards
    output = {
        "module": module_id, "module_name": name,
        "total": len(all_cards), "cards": all_cards,
        "card_types": [{"id":t[0],"name_zh":t[1],"target":t[2]} for t in CARD_TYPES],
    }
    out_path = DATA_DIR / f"{module_id}.json"
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  💾  共 {len(all_cards)} 张（新增 {len(new_cards)}）→ {out_path.name}")


def main() -> None:
    if not os.environ.get("DEEPSEEK_API_KEY"):
        print("❌  请先设置：export DEEPSEEK_API_KEY=sk-...")
        sys.exit(1)

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    deep       = "--deep" in flags
    types_flag = next((f.split("=")[1] for f in flags if f.startswith("--card-types=")), None)
    only_types = types_flag.split(",") if types_flag else None

    targets = args or list(SOURCES.keys())
    invalid = [t for t in targets if t not in SOURCES]
    if invalid:
        print(f"❌  未知模块: {invalid}\n可用: {list(SOURCES.keys())}")
        sys.exit(1)

    mode = f"{'增量补充' if deep else '完整生成'}" + (f" [{types_flag}]" if types_flag else "")
    print(f"🚀  {mode} | 模块: {targets}")

    for module_id in targets:
        try:
            process_module(module_id, deep=deep, only_types=only_types)
        except KeyboardInterrupt:
            print("\n⛔  已中断")
            sys.exit(0)
        except Exception as e:
            print(f"\n❌  {module_id} 失败: {e}")

    print(f"\n✅  完成！卡片保存在 {DATA_DIR}")


if __name__ == "__main__":
    main()
