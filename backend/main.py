import json
import os
import random
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI

app = FastAPI(title="AI Quiz API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_client: AsyncOpenAI | None = None

def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        key = os.environ.get("DEEPSEEK_API_KEY")
        if not key:
            raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY 未设置，请先 export DEEPSEEK_API_KEY=sk-...")
        _client = AsyncOpenAI(api_key=key, base_url="https://api.deepseek.com")
    return _client

QUESTIONS_DIR  = Path(__file__).parent / "data" / "questions"
KNOWLEDGE_DIR  = Path(__file__).parent / "data" / "knowledge"


# ── 题库端点 ──────────────────────────────────────────

@app.get("/api/questions/{module_id}")
async def get_questions(
    module_id: str,
    difficulty: Optional[str] = Query(None),
):
    """返回本地题库中指定模块的题目列表，可按难度过滤。"""
    file = QUESTIONS_DIR / f"{module_id}.json"
    if not file.exists():
        return {"questions": [], "total": 0, "module": module_id, "has_bank": False}
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
        questions = data.get("questions", [])
        if difficulty:
            questions = [q for q in questions if q.get("difficulty") == difficulty]
        return {
            "questions": questions,
            "total":     len(questions),
            "module":    module_id,
            "has_bank":  True,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/questions/{module_id}/status")
async def bank_status(module_id: str):
    """返回题库是否已生成及各难度题目数量。"""
    file = QUESTIONS_DIR / f"{module_id}.json"
    if not file.exists():
        return {"has_bank": False, "module": module_id, "counts": {}}
    data = json.loads(file.read_text(encoding="utf-8"))
    questions = data.get("questions", [])
    counts = {}
    for q in questions:
        d = q.get("difficulty", "unknown")
        counts[d] = counts.get(d, 0) + 1
    return {"has_bank": True, "module": module_id, "total": len(questions), "counts": counts}


@app.get("/api/knowledge/{module_id}")
async def get_knowledge(module_id: str):
    """返回本地速记卡片库，没有则返回 has_bank=False 由前端降级到 AI 生成。"""
    file = KNOWLEDGE_DIR / f"{module_id}.json"
    if not file.exists():
        return {"cards": [], "total": 0, "has_bank": False}
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
        return {"cards": data.get("cards", []), "total": data.get("total", 0), "has_bank": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── AI 对话端点（评分 / 自由提问 / 知识讲解等）────────

class ChatRequest(BaseModel):
    system: str
    message: str


@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        resp = await get_client().chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": req.system},
                {"role": "user",   "content": req.message},
            ],
        )
        return {"content": resp.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
