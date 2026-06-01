import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

// ── 常量 ─────────────────────────────────────────────
const MODULES = [
  { id: 'transformer', label: 'Transformer', icon: '🔄' },
  { id: 'rag',         label: 'RAG',         icon: '🔍' },
  { id: 'langchain',   label: 'LangChain',   icon: '⛓️' },
  { id: 'langgraph',   label: 'LangGraph',   icon: '🕸️' },
  { id: 'agent',       label: 'Agent 架构',  icon: '🤖' },
  { id: 'pytorch',     label: 'PyTorch',     icon: '🔥' },
  { id: 'nlp',         label: 'NLP 基础',    icon: '📖' },
  { id: 'bert',        label: 'BERT 微调',   icon: '🎯' },
  { id: 'claudecode',  label: 'Claude Code', icon: '💻' },
  { id: 'finetune',    label: 'LLM 微调',    icon: '🎛️' },
  { id: 'deploy',      label: '推理部署',    icon: '🚀' },
]

const DIFFICULTIES = [
  { id: 'basic',    label: '基础', color: '#3fb950', desc: '核心概念与定义' },
  { id: 'medium',   label: '中等', color: '#d29922', desc: '原理理解与应用' },
  { id: 'advanced', label: '进阶', color: '#f85149', desc: '深度分析与设计' },
]

const MODULE_ZH = {
  transformer: 'Transformer架构', rag: 'RAG检索增强生成',
  langchain: 'LangChain框架',     langgraph: 'LangGraph',
  agent: 'AI Agent架构',          pytorch: 'PyTorch深度学习',
  nlp: 'NLP自然语言处理',          bert: 'BERT微调',
  claudecode: 'Claude Code',      finetune: 'LLM微调与对齐',
  deploy: '推理与部署',
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── API ──────────────────────────────────────────────
async function apiChat(system, message) {
  const res = await fetch(`${API}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, message }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || '请求失败')
  }
  return (await res.json()).content
}

async function fetchQuestionBank(moduleId, difficulty) {
  const url = `${API}/api/questions/${moduleId}${difficulty ? `?difficulty=${difficulty}` : ''}`
  const res = await fetch(url)
  if (!res.ok) return []
  return (await res.json()).questions || []
}

// ── Prompts ──────────────────────────────────────────
const makeLearningPrompt = mod => ({
  system: `你是${MODULE_ZH[mod]}技术讲师。生成结构化知识点，严格按JSON返回：
{"concept":"<2-3句定义>","principles":["<原理1>","<原理2>","<原理3>","<原理4>"],"interview_questions":["<题1>","<题2>","<题3>"]}`,
  message: `请讲解${MODULE_ZH[mod]}核心知识点。`,
})

const makeQuestionPrompt = (mod, diff) => ({
  system: `你是${MODULE_ZH[mod]}面试官。生成一道${{ basic:'基础', medium:'中等', advanced:'进阶' }[diff] || '中等'}难度中文技术问题，只返回问题本身。`,
  message: '请出题',
})

const makeEvalPrompt = (mod, question, answer) => ({
  system: `你是${MODULE_ZH[mod]}评估专家。严格按JSON返回：
{"score":<0-100>,"feedback":"<2-3句评价>","strengths":"<好的地方>","improvements":"<待改进>"}`,
  message: `题目：${question}\n\n回答：${answer}\n\n请评分。`,
})

const makeReferencePrompt = (mod, question) => ({
  system: `你是${MODULE_ZH[mod]}专家。为以下问题提供参考答案，中文，200字以内，可用Markdown格式。`,
  message: question,
})

const makeMcqPrompt = (mod, question, correct) => ({
  system: `你是${MODULE_ZH[mod]}专家。为以下题目生成3个错误但有迷惑性的备选答案。
只返回JSON：{"options":["错误选项A","错误选项B","错误选项C"]}`,
  message: `题目：${question}\n正确答案：${correct}`,
})

const makeHintPrompt = (mod, question, level) => ({
  system: `你是${MODULE_ZH[mod]}专家。只给提示，绝不直接给出答案。`,
  message: `题目：${question}\n提示要求：${ level === 1
    ? '给一个方向性提示（15字以内，只说大方向）'
    : '列出应涵盖的3-4个关键词，不解释' }`,
})

const makeChatPrompt = mod => {
  const ctx = mod ? `当前模块是${MODULE_ZH[mod]}，优先结合该模块回答。` : ''
  return `你是AI技术专家助手。${ctx}用简洁清晰的中文回答，可用Markdown格式。`
}

// ── Helpers ───────────────────────────────────────────
const scoreColor   = s => s >= 75 ? '#3fb950' : s >= 60 ? '#d29922' : '#f85149'
const scoreVerdict = s => s >= 75 ? '✓ 已掌握' : s >= 60 ? '△ 基本掌握' : '✗ 需加强'
const fmtDate  = ts => { const d=new Date(ts); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }
const fmtIntv  = d => d<=1?'明天':d<=6?`${d}天后`:d<=13?'1周后':d<=29?`${Math.round(d/7)}周后`:'1个月后'
const todayKey = () => new Date().toISOString().slice(0,10)
const shuffle  = arr => [...arr].sort(() => Math.random() - 0.5)
function readLS(key, fb) { try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fb } catch { return fb } }
function calcStreak(log) {
  let s = 0, d = new Date()
  while (true) {
    const k = d.toISOString().slice(0,10)
    if ((log[k] || 0) > 0) { s++; d.setDate(d.getDate()-1) } else break
  }
  return s
}

// ① Markdown 渲染组件
const MD = ({ s, className = '' }) => (
  <ReactMarkdown className={`md ${className}`}>{String(s || '')}</ReactMarkdown>
)

// ── SRS ───────────────────────────────────────────────
function calcSRS(score, item) {
  const rep=item.repetitions??0, ef=item.easeFactor??2.5, iv=item.interval??1
  let r,e,i
  if (score<60) { r=0; i=1; e=Math.max(1.3,ef-0.2) }
  else if (score<75) { r=rep; i=Math.max(1,Math.round(iv*.75)); e=ef }
  else {
    const q=score>=90?5:score>=80?4:3
    e=Math.max(1.3,ef+0.1-(5-q)*(0.08+(5-q)*0.02)); r=rep+1
    i=r===1?1:r===2?3:Math.round(iv*e)
  }
  return { repetitions:r, easeFactor:Math.round(e*100)/100, interval:i,
           nextReview:Date.now()+i*86400000, lastReview:Date.now() }
}
const getDueItems = bank => bank.filter(x => !x.nextReview || x.nextReview <= Date.now())

// ── ChatBot ───────────────────────────────────────────
function ChatBot({ activeModule }) {
  const [open,setOpen]=useState(false), [msgs,setMsgs]=useState([])
  const [input,setInput]=useState(''), [loading,setLoading]=useState(false)
  const bottomRef = useRef(null)
  useEffect(() => { open && bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs,open])

  async function send() {
    const text=input.trim(); if(!text||loading) return
    setInput(''); setMsgs(m=>[...m,{role:'user',text}]); setLoading(true)
    try { const r=await apiChat(makeChatPrompt(activeModule),text); setMsgs(m=>[...m,{role:'ai',text:r}]) }
    catch(e) { setMsgs(m=>[...m,{role:'ai',text:`⚠️ ${e.message}`,err:true}]) }
    finally { setLoading(false) }
  }

  return (
    <div className={`chatbot ${open?'chatbot-open':''}`}>
      {open && (
        <div className="chatbot-panel">
          <div className="chatbot-header">
            <span>自由提问</span>
            {activeModule && <span className="chatbot-ctx">{MODULES.find(m=>m.id===activeModule)?.icon} {MODULES.find(m=>m.id===activeModule)?.label}</span>}
          </div>
          <div className="chatbot-messages">
            {msgs.length===0 && <div className="chatbot-empty">有任何问题都可以问我 ✨</div>}
            {msgs.map((msg,i) => (
              <div key={i} className={`chat-msg ${msg.role} ${msg.err?'error':''}`}>
                <div className="chat-bubble">
                  {msg.role==='ai' ? <MD s={msg.text}/> : msg.text}
                </div>
              </div>
            ))}
            {loading && <div className="chat-msg ai"><div className="chat-bubble chat-thinking"><span/><span/><span/></div></div>}
            <div ref={bottomRef}/>
          </div>
          <div className="chatbot-input-row">
            <input className="chatbot-input" value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="输入问题，Enter 发送..." disabled={loading}/>
            <button type="button" className={`chatbot-send ${(!input.trim()||loading)?'disabled':''}`} onClick={send} disabled={!input.trim()||loading}>发送</button>
          </div>
        </div>
      )}
      <button type="button" className="chatbot-toggle" onClick={()=>setOpen(o=>!o)}>
        {open?'✕':'💬'}
        {!open && msgs.filter(m=>m.role==='ai').length>0 &&
          <span className="chatbot-badge">{msgs.filter(m=>m.role==='ai').length}</span>}
      </button>
    </div>
  )
}

// ── App ───────────────────────────────────────────────
export default function App() {
  const [mod,setMod]=useState(null), [diff,setDiff]=useState(null)
  const [phase,setPhase]=useState('setup')
  const [knowledge,setKnowledge]=useState(null)
  const [question,setQuestion]=useState(''), [answer,setAnswer]=useState('')
  const [evaluation,setEvaluation]=useState(null), [reference,setReference]=useState('')
  const [skipped,setSkipped]=useState(false), [error,setError]=useState('')
  const [learnReturn,setLearnReturn]=useState('setup'), [bankItem,setBankItem]=useState(null), [retryId,setRetryId]=useState(null)
  const [kcIndex,setKcIndex]=useState(0), [kcFlipped,setKcFlipped]=useState(false), [kcVisited,setKcVisited]=useState(new Set())
  const [questionBank,setQuestionBank]=useState([]), [qIndex,setQIndex]=useState(0), [usingBank,setUsingBank]=useState(false)
  const [srsQueue,setSrsQueue]=useState([]), [srsPos,setSrsPos]=useState(0), [srsMode,setSrsMode]=useState(false), [srsNextInterval,setSrsNextInterval]=useState(null)

  // ② 模块掌握度
  const [moduleStats,setModuleStats] = useState(()=>readLS('quiz-module-stats',{}))
  // ③ 题型切换
  const [quizMode,setQuizMode] = useState('open') // 'open' | 'mcq'
  const [mcqOptions,setMcqOptions] = useState([]), [mcqCorrect,setMcqCorrect] = useState(''), [mcqPicked,setMcqPicked] = useState(null)
  // ⑤ 渐进提示
  const [hintLevel,setHintLevel] = useState(0), [hints,setHints] = useState([]), [hintLoading,setHintLoading] = useState(false)
  // ⑥ 速记卡自评 SRS
  const [kcSrs,setKcSrs] = useState(()=>readLS('quiz-kc-srs',{}))
  // ⑦ 错题本筛选
  const [bfMod,setBfMod]=useState(null), [bfDiff,setBfDiff]=useState(null), [bfStatus,setBfStatus]=useState(null)
  // ⑧ 学习日历
  const [studyLog,setStudyLog] = useState(()=>readLS('quiz-study-log',{}))

  const [stats,setStats] = useState(()=>readLS('quiz-stats',{answered:0,mastered:0,needsWork:0}))
  const [wrongBank,setWrongBank] = useState(()=>readLS('quiz-wrong-bank',[]))

  useEffect(()=>{ localStorage.setItem('quiz-stats',JSON.stringify(stats)) },[stats])
  useEffect(()=>{ localStorage.setItem('quiz-wrong-bank',JSON.stringify(wrongBank)) },[wrongBank])
  useEffect(()=>{ localStorage.setItem('quiz-module-stats',JSON.stringify(moduleStats)) },[moduleStats])
  useEffect(()=>{ localStorage.setItem('quiz-kc-srs',JSON.stringify(kcSrs)) },[kcSrs])
  useEffect(()=>{ localStorage.setItem('quiz-study-log',JSON.stringify(studyLog)) },[studyLog])

  // ⑨ 键盘快捷键
  useEffect(() => {
    const handler = e => {
      if (e.target.matches('input,textarea,button,select')) return
      if (phase==='learning' && knowledge?.cards) {
        if (e.key===' ') { e.preventDefault(); setKcFlipped(f=>!f) }
        if (e.key==='ArrowRight' && kcIndex<knowledge.cards.length-1) {
          setKcFlipped(false); setKcVisited(v=>new Set([...v,kcIndex])); setKcIndex(i=>i+1)
        }
        if (e.key==='ArrowLeft' && kcIndex>0) { setKcFlipped(false); setKcIndex(i=>i-1) }
      }
      if (e.key==='Escape') {
        if (phase==='bank-detail') setPhase('bank')
        else if (phase==='bank') setPhase('setup')
        else if (phase==='analytics') setPhase('setup')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, kcIndex, knowledge, kcFlipped])

  const activeMod  = MODULES.find(m=>m.id===mod)
  const activeDiff = DIFFICULTIES.find(d=>d.id===diff)
  const streak     = calcStreak(studyLog)

  // 错题本筛选结果
  const filteredBank = wrongBank.filter(item => {
    if (bfMod    && item.mod  !==bfMod)    return false
    if (bfDiff   && item.diff !==bfDiff)   return false
    if (bfStatus==='due'     && (!item.nextReview||item.nextReview>Date.now())) return false
    if (bfStatus==='ok'      && item.nextReview && item.nextReview<=Date.now()) return false
    return true
  })

  // ── 错题本操作 ──
  function upsertBank(entry) {
    const init={repetitions:0,easeFactor:2.5,interval:1,nextReview:Date.now()+86400000,lastReview:Date.now()}
    setWrongBank(b=>{
      const idx=b.findIndex(x=>x.question===entry.question)
      if(idx>=0){ const u=[...b]; u[idx]={...init,...u[idx],...entry,repetitions:u[idx].repetitions??0,easeFactor:u[idx].easeFactor??2.5,interval:u[idx].interval??1,nextReview:u[idx].nextReview??(Date.now()+86400000)}; return u }
      return [{...init,...entry},...b]
    })
  }
  const removeFromBank = id => setWrongBank(b=>b.filter(x=>x.id!==id))

  // 统计记录工具
  function recordAnswer(moduleId, score) {
    setStats(s=>({ answered:s.answered+1, mastered:s.mastered+(score>=75?1:0), needsWork:s.needsWork+(score<60?1:0) }))
    setModuleStats(ms=>{ const m=ms[moduleId]||{answered:0,mastered:0}; return {...ms,[moduleId]:{answered:m.answered+1,mastered:m.mastered+(score>=75?1:0)}} })
    setStudyLog(log=>{ const t=todayKey(); return {...log,[t]:(log[t]||0)+1} })
  }

  // ── 显示题目 ──
  function mountQuestion(q, idx, bank) {
    setQuestion(q.question); setReference(q.reference_answer||q.reference||'')
    setAnswer(''); setSkipped(false); setEvaluation(null); setError('')
    setHintLevel(0); setHints([]); setMcqOptions([]); setMcqPicked(null)
    setQIndex(idx)
    if (bank) { setQuestionBank(bank); setUsingBank(true) }
    setPhase('answering')
  }

  // ── 加载测验 ──
  async function loadAndStartQuiz() {
    setError(''); setPhase('loading-quiz')
    setHintLevel(0); setHints([]); setMcqOptions([]); setMcqPicked(null)
    try {
      const questions = await fetchQuestionBank(mod, diff)
      if (questions.length>0) {
        const bank = shuffle(questions)
        const q = bank[0]
        setQuestion(q.question); setAnswer(''); setSkipped(false); setEvaluation(null)
        setHintLevel(0); setHints([])
        const ref = q.reference_answer || q.reference || ''
        setReference(ref)
        if (quizMode==='mcq' && ref) {
          try {
            const p=makeMcqPrompt(mod,q.question,ref)
            const raw=await apiChat(p.system,p.message)
            const data=JSON.parse((raw.match(/\{[\s\S]*\}/)||[raw])[0])
            const opts=shuffle([ref,...(data.options||[]).slice(0,3)])
            setMcqOptions(opts); setMcqCorrect(ref)
          } catch { /* fallback to open */ }
        }
        setMcqPicked(null)
        setQuestionBank(bank); setUsingBank(true); setQIndex(0)
        setPhase('answering'); return
      }
    } catch { /* fall through */ }
    // AI fallback
    try {
      const {system,message}=makeQuestionPrompt(mod,diff)
      const q=await apiChat(system,message)
      setQuestion(q.trim()); setReference(''); setAnswer('')
      setSkipped(false); setEvaluation(null); setMcqOptions([]); setMcqPicked(null)
      setQuestionBank([]); setUsingBank(false); setPhase('answering')
    } catch(e) { setError(e.message); setPhase('learning') }
  }

  // ── 下一题 ──
  function nextQuestion() {
    setEvaluation(null); setAnswer(''); setSkipped(false); setError('')
    setSrsNextInterval(null); setHintLevel(0); setHints([]); setMcqOptions([]); setMcqPicked(null)
    if (srsMode) {
      const next=srsPos+1
      if (next>=srsQueue.length) { setSrsMode(false); setPhase('setup'); return }
      setSrsPos(next); const item=srsQueue[next]
      setMod(item.mod); setDiff(item.diff)
      setQuestion(item.question); setReference(item.reference||''); setPhase('answering'); return
    }
    if (questionBank.length>0) {
      let bank=questionBank, nextIdx=qIndex+1
      if (nextIdx>=bank.length) { bank=shuffle(bank); setQuestionBank(bank); nextIdx=0 }
      mountQuestion(bank[nextIdx],nextIdx,null)
    } else {
      setPhase('loading-quiz')
      const {system,message}=makeQuestionPrompt(mod,diff)
      apiChat(system,message).then(q=>{setQuestion(q.trim());setReference('');setPhase('answering')}).catch(e=>{setError(e.message);setPhase('result')})
    }
  }

  // ── 学习模式 ──
  async function enterLearning(moduleId=mod, returnPhase='setup') {
    if (!moduleId) return
    setMod(moduleId); setLearnReturn(returnPhase)
    setKcIndex(0); setKcFlipped(false); setKcVisited(new Set())
    setError(''); setPhase('loading-learn')
    try {
      const res=await fetch(`${API}/api/knowledge/${moduleId}`)
      const data=await res.json()
      if (data.has_bank && data.cards?.length>0) {
        // 按 KC SRS 排序：到期的排前面
        const now=Date.now()
        const sorted=[...data.cards].sort((a,b)=>{
          const aD=kcSrs[a.id], bD=kcSrs[b.id]
          const aDue=!aD||aD.nextReview<=now, bDue=!bD||bD.nextReview<=now
          if(aDue&&!bDue) return -1; if(!aDue&&bDue) return 1
          return (aD?.nextReview||0)-(bD?.nextReview||0)
        })
        setKnowledge({cards:sorted,source:'bank'}); setPhase('learning'); return
      }
    } catch { /* fall through */ }
    try {
      const {system,message}=makeLearningPrompt(moduleId)
      const raw=await apiChat(system,message)
      let kn; try { const m=raw.match(/\{[\s\S]*\}/); kn=JSON.parse(m?m[0]:raw) } catch { kn={concept:raw,principles:[],interview_questions:[]} }
      setKnowledge({...kn,source:'ai'}); setPhase('learning')
    } catch(e) { setError(e.message); setPhase(returnPhase) }
  }

  // ── SRS 复习 ──
  function startSrsReview() {
    const due=getDueItems(wrongBank); if(!due.length) return
    const q=shuffle(due)
    setSrsQueue(q); setSrsPos(0); setSrsMode(true); setSrsNextInterval(null)
    const item=q[0]; setMod(item.mod); setDiff(item.diff)
    setQuestion(item.question); setReference(item.reference||'')
    setAnswer(''); setSkipped(false); setEvaluation(null); setRetryId(null)
    setHintLevel(0); setHints([]); setMcqOptions([]); setMcqPicked(null)
    setQuestionBank([]); setUsingBank(false); setPhase('answering')
  }

  // ④ 单选答题
  function submitMcqAnswer(picked) {
    setMcqPicked(picked)
    const ok = picked===mcqCorrect
    const score = ok ? 100 : 0
    recordAnswer(mod, score)
    if (srsMode) {
      const srs=calcSRS(score,srsQueue[srsPos])
      setWrongBank(b=>b.map(x=>x.id===srsQueue[srsPos].id?{...x,score,skipped:false,...srs}:x))
      setSrsNextInterval(srs.interval)
    } else if (!ok) {
      upsertBank({id:Date.now(),mod,diff,question,reference:mcqCorrect,userAnswer:picked,score:0,skipped:false,addedAt:Date.now()})
    }
  }

  // ── 提交开放答案 ──
  async function submitAnswer() {
    if (!answer.trim()) return
    setError(''); setSkipped(false); setPhase('evaluating')
    try {
      const evalP=makeEvalPrompt(mod,question,answer)
      let evalRaw, ref=reference
      if (ref) { evalRaw=await apiChat(evalP.system,evalP.message) }
      else {
        const refP=makeReferencePrompt(mod,question)
        ;[evalRaw,ref]=await Promise.all([apiChat(evalP.system,evalP.message),apiChat(refP.system,refP.message)])
        ref=ref.trim(); setReference(ref)
      }
      let ev; try { const m=evalRaw.match(/\{[\s\S]*\}/); ev=JSON.parse(m?m[0]:evalRaw) }
      catch { ev={score:50,feedback:evalRaw,strengths:'',improvements:''} }
      setEvaluation(ev); recordAnswer(mod, ev.score)
      if (srsMode) {
        const srs=calcSRS(ev.score,srsQueue[srsPos])
        setWrongBank(b=>b.map(x=>x.id===srsQueue[srsPos].id?{...x,userAnswer:answer,score:ev.score,reference:ref,skipped:false,addedAt:Date.now(),...srs}:x))
        setSrsNextInterval(srs.interval)
      } else if (retryId) {
        ev.score>=75?removeFromBank(retryId):setWrongBank(b=>b.map(x=>x.id===retryId?{...x,userAnswer:answer,score:ev.score,reference:ref,skipped:false,addedAt:Date.now()}:x))
        setRetryId(null)
      } else if (ev.score<75) {
        upsertBank({id:Date.now(),mod,diff,question,reference:ref,userAnswer:answer,score:ev.score,skipped:false,addedAt:Date.now()})
      }
      setPhase('result')
    } catch(e) { setError(e.message); setPhase('answering') }
  }

  // ── 不知道 ──
  async function dontKnow() {
    setSkipped(true); setEvaluation(null); recordAnswer(mod, 0)
    if (reference) {
      if (srsMode) {
        const srs=calcSRS(0,srsQueue[srsPos])
        setWrongBank(b=>b.map(x=>x.id===srsQueue[srsPos].id?{...x,userAnswer:'',score:0,skipped:true,addedAt:Date.now(),...srs}:x))
        setSrsNextInterval(srs.interval)
      } else {
        const entry={id:retryId||Date.now(),mod,diff,question,reference,userAnswer:'',score:0,skipped:true,addedAt:Date.now()}
        retryId?setWrongBank(b=>b.map(x=>x.id===retryId?entry:x)):upsertBank(entry)
        setRetryId(null)
      }
      setPhase('result')
    } else {
      setPhase('evaluating')
      try {
        const refP=makeReferencePrompt(mod,question); const raw=await apiChat(refP.system,refP.message); const ref=raw.trim()
        setReference(ref)
        const entry={id:retryId||Date.now(),mod,diff,question,reference:ref,userAnswer:'',score:0,skipped:true,addedAt:Date.now()}
        retryId?setWrongBank(b=>b.map(x=>x.id===retryId?entry:x)):upsertBank(entry)
        setRetryId(null); setPhase('result')
      } catch(e) { setError(e.message); setSkipped(false); setPhase('answering') }
    }
  }

  // ⑤ 渐进提示
  async function requestHint() {
    if (hintLevel>=2) { dontKnow(); return }
    const nextLevel=hintLevel+1; setHintLevel(nextLevel); setHintLoading(true)
    try {
      const p=makeHintPrompt(mod,question,nextLevel); const h=await apiChat(p.system,p.message)
      setHints(prev=>{ const n=[...prev]; n[nextLevel-1]=h; return n })
    } catch { /* silent */ } finally { setHintLoading(false) }
  }

  // ⑥ 速记卡自评
  function rateKcCard(card, rating) {
    const current=kcSrs[card.id]||{repetitions:0,easeFactor:2.5,interval:1}
    const score=rating===2?90:rating===1?65:35
    const srs=calcSRS(score,current)
    setKcSrs(k=>({...k,[card.id]:srs}))
    const total=knowledge.cards.length
    setKcFlipped(false); setKcVisited(v=>new Set([...v,kcIndex]))
    if (kcIndex<total-1) setKcIndex(i=>i+1)
  }

  function retryFromBank(item) {
    setMod(item.mod); setDiff(item.diff); setQuestion(item.question)
    setReference(item.reference||''); setAnswer(''); setSkipped(false); setEvaluation(null); setError('')
    setRetryId(item.id); setBankItem(null); setHintLevel(0); setHints([])
    setMcqOptions([]); setMcqPicked(null); setQuestionBank([]); setUsingBank(false)
    setPhase('answering')
  }

  const isAnswering=phase==='answering'||phase==='evaluating'
  const evalColor=evaluation?scoreColor(evaluation.score):'#58a6ff'
  const qTotal=questionBank.length, qNum=qIndex+1

  // ⑩ 分析页数据
  function getModuleMastery() {
    return MODULES.map(m=>{ const s=moduleStats[m.id]||{answered:0,mastered:0}; return {...m,...s,pct:s.answered>0?Math.round(s.mastered/s.answered*100):null} }).filter(m=>m.answered>0).sort((a,b)=>(a.pct??101)-(b.pct??101))
  }
  function getLast14Days() {
    return Array.from({length:14},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-(13-i)); const k=d.toISOString().slice(0,10); return { key:k, label:k.slice(5), day:d.toLocaleDateString('zh',{weekday:'short'}), count:studyLog[k]||0 } })
  }

  // ── JSX ─────────────────────────────────────────────
  return (
    <div className="app">

      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="logo" onClick={()=>setPhase('setup')} style={{cursor:'pointer'}}>⚡ AI 知识点测验</div>
          <div className="header-right">
            {streak>0 && <div className="streak-badge">🔥{streak}</div>}
            <button className="bank-nav-btn" onClick={()=>setPhase('analytics')}>📊</button>
            <button className="bank-nav-btn" onClick={()=>setPhase('bank')}>
              📋 错题本{wrongBank.length>0&&<span className="bank-count">{wrongBank.length}</span>}
            </button>
            <div className="stats-bar">
              <div className="stat"><span className="stat-val">{stats.answered}</span><span className="stat-lbl">已答</span></div>
              <div className="stat mastered"><span className="stat-val">{stats.mastered}</span><span className="stat-lbl">已掌握</span></div>
              <div className="stat needs-work"><span className="stat-val">{stats.needsWork}</span><span className="stat-lbl">待加强</span></div>
            </div>
          </div>
        </div>
      </header>

      <main className="main">

        {/* ── Setup ── */}
        {phase==='setup' && (
          <div className="setup">
            <div className="section">
              <div className="section-title">选择模块</div>
              <div className="module-grid">
                {MODULES.map(m => {
                  const ms=moduleStats[m.id]; const pct=ms?.answered>0?Math.round(ms.mastered/ms.answered*100):null
                  return (
                    <button key={m.id} className={`module-card ${mod===m.id?'selected':''}`} onClick={()=>setMod(m.id)}>
                      <div className="module-icon">{m.icon}</div>
                      <div className="module-name">{m.label}</div>
                      {/* ② 模块掌握度 */}
                      {pct!==null && (
                        <div className="module-prog">
                          <div className="module-prog-bar"><div className="module-prog-fill" style={{width:`${pct}%`, background:pct>=75?'#3fb950':pct>=50?'#d29922':'#f85149'}}/></div>
                          <span className="module-prog-txt">{pct}%</span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="section">
              <div className="section-title">选择难度</div>
              <div className="diff-row">
                {DIFFICULTIES.map(d=>(
                  <button key={d.id} className={`diff-card ${diff===d.id?'selected':''}`} style={diff===d.id?{borderColor:d.color}:{}} onClick={()=>setDiff(d.id)}>
                    <span className="diff-name" style={diff===d.id?{color:d.color}:{}}>{d.label}</span>
                    <span className="diff-desc">{d.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ③ 题型切换 */}
            <div className="section">
              <div className="section-title">题型</div>
              <div className="mode-toggle">
                <button className={`mode-btn ${quizMode==='open'?'active':''}`} onClick={()=>setQuizMode('open')}>📝 开放问答</button>
                <button className={`mode-btn ${quizMode==='mcq'?'active':''}`} onClick={()=>setQuizMode('mcq')}>☑️ 单选模式</button>
              </div>
            </div>

            {/* SRS 今日待复习 */}
            {(()=>{ const due=getDueItems(wrongBank); return due.length>0?(
              <div className="srs-section">
                <div className="srs-info"><div className="srs-flame">🔥</div><div><div className="srs-title">今日待复习</div><div className="srs-sub">{due.length} 道错题到了复习时间</div></div></div>
                <button className="btn btn-srs" onClick={startSrsReview}>开始复习 →</button>
              </div>
            ):wrongBank.length>0?(
              <div className="srs-section srs-clear">
                <div className="srs-flame">✅</div>
                <div><div className="srs-title">今日复习已完成</div><div className="srs-sub">下次：{fmtIntv(Math.min(...wrongBank.filter(x=>x.nextReview>Date.now()).map(x=>Math.ceil((x.nextReview-Date.now())/86400000))))}</div></div>
              </div>
            ):null })()}

            {error && <div className="error-box">{error}</div>}
            <div className="setup-actions">
              <button className={`btn btn-primary btn-lg ${!mod||!diff?'btn-disabled':''}`} onClick={()=>enterLearning()} disabled={!mod||!diff}>进入学习 →</button>
              <button className="btn btn-outline btn-lg" onClick={()=>setPhase('review-select')}>📚 核心知识复习</button>
            </div>
          </div>
        )}

        {/* ── Review Select ── */}
        {phase==='review-select' && (
          <div className="review-select">
            <div className="review-select-hd"><div className="review-select-title">选择要复习的模块</div><div className="review-select-sub">查看核心知识点，无需答题</div></div>
            <div className="module-grid">
              {MODULES.map(m=>(
                <button key={m.id} className="module-card" onClick={()=>enterLearning(m.id,'review-select')}>
                  <div className="module-icon">{m.icon}</div><div className="module-name">{m.label}</div>
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={()=>setPhase('setup')}>← 返回</button>
          </div>
        )}

        {/* ── Loading ── */}
        {(phase==='loading-learn'||phase==='loading-quiz') && (
          <div className="loading-screen">
            <div className="spinner"/>
            <p className="loading-text">{phase==='loading-learn'?'正在生成知识讲解...':'加载题目...'}</p>
            <p className="loading-sub">{activeMod?.label}{activeDiff?` · ${activeDiff.label}`:''}</p>
          </div>
        )}

        {/* ── Learning ── */}
        {phase==='learning' && knowledge && (()=>{
          const isCard=knowledge.source==='bank'&&knowledge.cards?.length>0
          const cards=knowledge.cards||[], card=cards[kcIndex]||{}, total=cards.length
          const kcDue=card.id&&kcSrs[card.id]?kcSrs[card.id].nextReview<=Date.now():true
          const kcNext=card.id&&kcSrs[card.id]?Math.ceil((kcSrs[card.id].nextReview-Date.now())/86400000):null

          function goCard(idx) { setKcFlipped(false); setKcVisited(v=>new Set([...v,kcIndex])); setKcIndex(idx) }

          return (
            <div className="learn-screen">
              <div className="learn-header">
                <div className="learn-title"><span className="learn-icon">{activeMod?.icon}</span>{activeMod?.label} · {isCard?'速记卡片':'知识讲解'}</div>
                {isCard&&activeDiff&&<span className="learn-diff" style={{color:activeDiff.color}}>{activeDiff.label}</span>}
              </div>

              {isCard && (
                <>
                  <div className="kc-top">
                    <span className="kc-progress-text">第 <strong>{kcIndex+1}</strong> / {total}</span>
                    {!kcDue&&kcNext!==null&&<span className="kc-next-due">{kcNext>0?`${kcNext}天后复习`:'今日复习'}</span>}
                    <span className="kc-flip-hint">{kcFlipped?'▴ 点击收起':'▾ 点击查看详情'}</span>
                  </div>
                  <div className="kc-bar"><div className="kc-bar-fill" style={{width:`${((kcIndex+1)/total)*100}%`}}/></div>

                  <div className="kc-card" key={`${kcIndex}-${kcFlipped}`} onClick={()=>setKcFlipped(f=>!f)}>
                    {!kcFlipped ? (
                      <div className="kc-front">
                        <div className="kc-card-meta">
                          <span className="kc-card-num">#{kcIndex+1}</span>
                          {card.card_type&&<span className={`kc-type-tag kc-type-${card.card_type}`}>
                            {{'concept':'📖概念','compare':'⚖️对比','formula':'🔢公式','code':'💻代码','gotcha':'⚠️易错'}[card.card_type]||card.type_zh}
                          </span>}
                        </div>
                        <div className="kc-title">{card.title}</div>
                        <div className="kc-divider"/>
                        <div className="kc-summary">{card.summary}</div>
                      </div>
                    ) : (
                      <div className="kc-back">
                        <div className="kc-back-label">核心要点</div>
                        <ul className="kc-points">{(card.points||[]).map((p,i)=><li key={i}>{p}</li>)}</ul>
                        {card.tip&&<div className="kc-tip"><span className="kc-tip-icon">💡</span>{card.tip}</div>}
                        {/* ⑥ 速记卡自评 */}
                        <div className="kc-rating" onClick={e=>e.stopPropagation()}>
                          <span className="kc-rating-lbl">记住了吗？</span>
                          <button className="kc-rate-btn hard"  onClick={()=>rateKcCard(card,0)}>😕 没记住</button>
                          <button className="kc-rate-btn okay"  onClick={()=>rateKcCard(card,1)}>😐 模糊</button>
                          <button className="kc-rate-btn easy"  onClick={()=>rateKcCard(card,2)}>✓ 记住了</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="kc-dots-row">
                    {Array.from({length:total},(_,i)=>(
                      <span key={i} className={['kc-dot',i===kcIndex?'active':'',kcVisited.has(i)?'visited':''].join(' ')} onClick={e=>{e.stopPropagation();goCard(i)}}/>
                    ))}
                  </div>
                  <div className="kc-nav">
                    <button className="kc-nav-btn" disabled={kcIndex===0} onClick={()=>goCard(kcIndex-1)}>← 上一个</button>
                    <span className="kc-shortcut-hint">空格翻牌 · ← → 切换</span>
                    <button className={`kc-nav-btn ${kcIndex===total-1?'kc-nav-finish':''}`} onClick={()=>kcIndex<total-1?goCard(kcIndex+1):setKcVisited(v=>new Set([...v,kcIndex]))}>
                      {kcIndex===total-1?'✓ 全部完成':'下一个 →'}
                    </button>
                  </div>
                </>
              )}

              {!isCard && (
                <>
                  <div className="learn-card"><div className="learn-section-label">概念定义</div><p className="learn-concept">{knowledge.concept}</p></div>
                  {knowledge.principles?.length>0&&<div className="learn-card"><div className="learn-section-label">核心原理</div><ul className="learn-list">{knowledge.principles.map((p,i)=><li key={i}>{p}</li>)}</ul></div>}
                  {knowledge.interview_questions?.length>0&&<div className="learn-card accent"><div className="learn-section-label">常见面试题</div><ol className="learn-list learn-list-ol">{knowledge.interview_questions.map((q,i)=><li key={i}>{q}</li>)}</ol></div>}
                </>
              )}

              {error&&<div className="error-box">{error}</div>}
              <div className="btn-row">
                <button className="btn btn-ghost" onClick={()=>setPhase(learnReturn)}>
                  ← {learnReturn==='bank'?'错题本':learnReturn==='review-select'?'返回列表':'重新选择'}
                </button>
                {learnReturn!=='review-select'&&learnReturn!=='bank'&&<button className="btn btn-primary" onClick={loadAndStartQuiz}>开始测验 →</button>}
                {learnReturn==='bank'&&<button className="btn btn-primary" onClick={()=>setPhase('bank')}>回到错题本 →</button>}
              </div>
            </div>
          )
        })()}

        {/* ── Answering / Evaluating ── */}
        {isAnswering && (
          <div className="question-screen">
            <div className="q-header">
              <div className="q-tags">
                <span className="q-tag">{activeMod?.icon} {activeMod?.label}</span>
                <span className="q-tag" style={{color:activeDiff?.color}}>{activeDiff?.label}</span>
                {srsMode&&<span className="q-tag srs-tag">🔥 SRS</span>}
                {quizMode==='mcq'&&<span className="q-tag mcq-tag">☑️ 单选</span>}
                {retryId&&!srsMode&&<span className="q-tag retry-tag">↻ 重练</span>}
              </div>
              {(srsMode||qTotal>0)&&(
                <div className="q-counter">
                  <span className="q-counter-num">{srsMode?srsPos+1:qNum}</span>
                  <span className="q-counter-sep">/</span>
                  <span className="q-counter-total">{srsMode?srsQueue.length:qTotal}</span>
                </div>
              )}
            </div>
            {(srsMode||qTotal>0)&&(
              <div className="q-progress-bar">
                <div className={`q-progress-fill ${srsMode?'srs-fill':''}`} style={{width:`${((srsMode?srsPos+1:qNum)/(srsMode?srsQueue.length:qTotal))*100}%`}}/>
              </div>
            )}

            <div className="question-box">
              <div className="q-label">题目</div>
              <div className="q-text">{question}</div>
            </div>

            {/* ④ 单选模式 */}
            {quizMode==='mcq' && mcqOptions.length>0 && (
              <div className="mcq-options">
                {mcqOptions.map((opt,i)=>{
                  let cls='mcq-option'
                  if (mcqPicked!==null) {
                    cls+=' revealed'
                    if (opt===mcqCorrect) cls+=' correct'
                    else if (opt===mcqPicked) cls+=' wrong'
                  }
                  return <button key={i} className={cls} onClick={()=>mcqPicked===null&&phase==='answering'&&submitMcqAnswer(opt)}>{String.fromCharCode(65+i)}. {opt}</button>
                })}
              </div>
            )}

            {/* MCQ 答后显示参考答案 */}
            {quizMode==='mcq' && mcqPicked!==null && reference && (
              <div className="reference-card">
                <div className="reference-label">✦ {mcqPicked===mcqCorrect?'✓ 回答正确！':'✗ 答案解析'}</div>
                <div className="reference-body"><MD s={reference}/></div>
              </div>
            )}

            {/* 开放答题 + 提示系统 */}
            {quizMode==='open' && (
              <>
                {/* ⑤ 提示区 */}
                {hints.length>0 && (
                  <div className="hints-area">
                    {hints.map((h,i)=>(
                      <div key={i} className="hint-item">
                        <span className="hint-num">💡 提示{i+1}</span>
                        <span className="hint-text">{h}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="answer-label">你的回答 <span className="answer-hint">（Ctrl+Enter 提交）</span></div>
                <textarea className="answer-textarea" value={answer} onChange={e=>setAnswer(e.target.value)}
                  placeholder="在此输入你的回答..." rows={7} disabled={phase==='evaluating'}
                  onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&answer.trim()&&phase==='answering')submitAnswer()}}/>
              </>
            )}

            {phase==='evaluating'&&<div className="eval-loading"><div className="spinner-sm"/><span>{skipped?'获取参考答案...':'正在评分...'}</span></div>}
            {error&&<div className="error-box">{error}</div>}

            <div className="btn-row">
              <button className="btn btn-ghost" onClick={()=>{setRetryId(null);setPhase(retryId?'bank':'learning')}} disabled={phase==='evaluating'}>
                ← {retryId?'错题本':'讲解'}
              </button>
              {/* 单选：答后显示下一题；开放：提示+提交 */}
              {quizMode==='mcq'&&mcqPicked!==null ? (
                <button className="btn btn-success" onClick={nextQuestion}>下一题 →</button>
              ) : quizMode==='mcq' ? null : (
                <>
                  <button className="btn btn-hint" onClick={requestHint} disabled={phase==='evaluating'||hintLoading}>
                    {hintLoading?'..':hintLevel===0?'💡 提示':hintLevel===1?'💡 更多提示':'看答案'}
                  </button>
                  <button className={`btn btn-primary ${(!answer.trim()||phase==='evaluating')?'btn-disabled':''}`}
                    onClick={submitAnswer} disabled={!answer.trim()||phase==='evaluating'}>提交答案</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Result ── */}
        {phase==='result' && (
          <div className="result-screen">
            {skipped ? <div className="skipped-banner">⏭ 已跳过这道题</div>
            : evaluation && (
              <>
                <div className="score-ring" style={{'--c':evalColor}}>
                  <div className="score-num">{evaluation.score}</div><div className="score-unit">分</div>
                </div>
                <div className="score-verdict" style={{color:evalColor}}>{scoreVerdict(evaluation.score)}</div>
              </>
            )}
            {reference&&<div className="reference-card"><div className="reference-label">✦ 参考答案</div><div className="reference-body"><MD s={reference}/></div></div>}
            {srsMode&&srsNextInterval!==null&&(
              <div className={`srs-next-review ${srsNextInterval<=1?'urgent':srsNextInterval<=3?'soon':''}`}>
                <span className="srs-next-icon">{srsNextInterval<=1?'⚠️':srsNextInterval<=7?'📅':'✨'}</span>
                <div><div className="srs-next-label">下次复习</div><div className="srs-next-val">{fmtIntv(srsNextInterval)}</div></div>
                <div className="srs-next-sub">{srsPos+1}/{srsQueue.length} · 还剩{srsQueue.length-srsPos-1}题</div>
              </div>
            )}
            {!skipped&&evaluation&&(
              <div className="eval-section">
                <div className="eval-card"><div className="eval-card-title">总体评价</div><div className="eval-card-body"><MD s={evaluation.feedback}/></div></div>
                {evaluation.strengths&&<div className="eval-card good"><div className="eval-card-title">✓ 答得好的地方</div><div className="eval-card-body"><MD s={evaluation.strengths}/></div></div>}
                {evaluation.improvements&&<div className="eval-card warn"><div className="eval-card-title">△ 可以改进的地方</div><div className="eval-card-body"><MD s={evaluation.improvements}/></div></div>}
              </div>
            )}
            {answer&&<details className="review-details"><summary>查看原题与你的回答</summary>
              <div className="review-body">
                <div className="review-section"><strong>题目</strong><p>{question}</p></div>
                <div className="review-section"><strong>你的回答</strong><p>{answer}</p></div>
              </div>
            </details>}
            <div className="result-nav">
              {qTotal>0&&<div className="result-progress">{qNum<qTotal?`第 ${qNum} 题，还剩 ${qTotal-qNum} 题`:'🎉 已完成本轮'}</div>}
              <div className="btn-row">
                <button className="btn btn-ghost" onClick={()=>{setRetryId(null);setPhase('setup')}}>← 重新选择</button>
                <button className="btn btn-ghost" onClick={()=>setPhase('bank')}>📋{wrongBank.length>0&&` (${wrongBank.length})`}</button>
                <button className="btn btn-success" onClick={nextQuestion}>{qTotal>0&&qNum>=qTotal?'重新开始 ↺':'下一题 →'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Wrong Bank ── */}
        {phase==='bank' && (
          <div className="bank-screen">
            <div className="bank-hd">
              <div><div className="bank-title">📋 错题本</div><div className="bank-sub">{filteredBank.length}/{wrongBank.length} 道题</div></div>
              {wrongBank.length>0&&<button className="btn btn-ghost btn-sm" onClick={()=>{if(window.confirm('确定清空？'))setWrongBank([])}}>清空</button>}
            </div>

            {/* ⑦ 错题本筛选 */}
            {wrongBank.length>0 && (
              <div className="bank-filters">
                {MODULES.filter(m=>wrongBank.some(x=>x.mod===m.id)).map(m=>(
                  <button key={m.id} className={`filter-chip ${bfMod===m.id?'active':''}`} onClick={()=>setBfMod(bfMod===m.id?null:m.id)}>{m.icon}{m.label}</button>
                ))}
                {[{id:null,label:'全部'},{id:'due',label:'待复习'},{id:'ok',label:'未到期'}].map(s=>(
                  <button key={s.id||'all'} className={`filter-chip ${bfStatus===s.id?'active':''}`} onClick={()=>setBfStatus(bfStatus===s.id?null:s.id)}>{s.label}</button>
                ))}
              </div>
            )}

            {filteredBank.length===0 ? (
              <div className="bank-empty"><div className="bank-empty-icon">{wrongBank.length===0?'🎉':'🔍'}</div>
                <p>{wrongBank.length===0?'暂无错题记录':'没有符合筛选条件的题目'}</p>
                <p className="bank-empty-sub">{wrongBank.length===0?'答错或跳过的题目会自动收录':''}</p>
                {wrongBank.length===0&&<button className="btn btn-primary" onClick={()=>setPhase('setup')}>去答题</button>}
              </div>
            ) : (
              <div className="bank-list">
                {filteredBank.map(item=>{
                  const m=MODULES.find(x=>x.id===item.mod), d=DIFFICULTIES.find(x=>x.id===item.diff)
                  const isDue=!item.nextReview||item.nextReview<=Date.now()
                  const daysLeft=item.nextReview?Math.ceil((item.nextReview-Date.now())/86400000):null
                  return (
                    <div key={item.id} className="bank-item" onClick={()=>{setBankItem(item);setPhase('bank-detail')}}>
                      <div className="bank-item-body">
                        <div className="bank-item-meta">
                          <span>{m?.icon}</span><span className="bank-meta-mod">{m?.label}</span>
                          <span className="bank-meta-diff" style={{color:d?.color}}>{d?.label}</span>
                          <span className="bank-meta-date">{fmtDate(item.addedAt)}</span>
                        </div>
                        <div className="bank-item-q">{item.question}</div>
                      </div>
                      <div className="bank-item-right">
                        {item.skipped?<span className="badge-skip">跳过</span>:<span className="badge-score" style={{color:scoreColor(item.score),borderColor:scoreColor(item.score)}}>{item.score}</span>}
                        {isDue?<span className="srs-badge due">待复习</span>:daysLeft!==null&&<span className="srs-badge future">{daysLeft}天后</span>}
                        <span className="bank-arrow">›</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <button className="btn btn-ghost" style={{marginTop:16}} onClick={()=>setPhase('setup')}>← 返回</button>
          </div>
        )}

        {/* ── Bank Detail ── */}
        {phase==='bank-detail' && bankItem && (()=>{
          const m=MODULES.find(x=>x.id===bankItem.mod), d=DIFFICULTIES.find(x=>x.id===bankItem.diff)
          return (
            <div className="bank-detail-screen">
              <div className="q-tags">
                <span className="q-tag">{m?.icon} {m?.label}</span>
                <span className="q-tag" style={{color:d?.color}}>{d?.label}</span>
                {bankItem.skipped?<span className="q-tag" style={{color:'#8b949e'}}>已跳过</span>:<span className="q-tag" style={{color:scoreColor(bankItem.score)}}>{bankItem.score}分</span>}
              </div>
              <div className="question-box"><div className="q-label">题目</div><div className="q-text">{bankItem.question}</div></div>
              <div className="reference-card"><div className="reference-label">✦ 参考答案</div><div className="reference-body"><MD s={bankItem.reference}/></div></div>
              {bankItem.userAnswer&&<div className="eval-card"><div className="eval-card-title">你当时的回答</div><div className="eval-card-body" style={{whiteSpace:'pre-wrap'}}>{bankItem.userAnswer}</div></div>}
              <div className="bank-detail-actions">
                <button className="btn btn-ghost" onClick={()=>setPhase('bank')}>← 错题本</button>
                <button className="btn btn-ghost" onClick={()=>{setDiff(bankItem.diff);enterLearning(bankItem.mod,'bank')}}>📖 复习知识点</button>
                <button className="btn btn-primary" onClick={()=>retryFromBank(bankItem)}>↻ 重新练习</button>
              </div>
              <button className="btn-text-danger" onClick={()=>{removeFromBank(bankItem.id);setPhase('bank')}}>从错题本移除</button>
            </div>
          )
        })()}

        {/* ── Analytics ── */}
        {phase==='analytics' && (()=>{
          const mastery=getModuleMastery()
          const days14=getLast14Days()
          const maxCount=Math.max(1,...days14.map(d=>d.count))
          return (
            <div className="analytics-screen">
              <div className="analytics-hd">
                <div className="analytics-title">📊 学习统计</div>
                <button className="btn btn-ghost btn-sm" onClick={()=>setPhase('setup')}>← 返回</button>
              </div>

              {/* 连续学习 + 本日 */}
              <div className="analytics-cards">
                <div className="analytics-card"><div className="ac-val">🔥{streak}</div><div className="ac-lbl">连续学习天数</div></div>
                <div className="analytics-card"><div className="ac-val">{studyLog[todayKey()]||0}</div><div className="ac-lbl">今日答题</div></div>
                <div className="analytics-card"><div className="ac-val">{getDueItems(wrongBank).length}</div><div className="ac-lbl">今日待复习</div></div>
                <div className="analytics-card"><div className="ac-val">{stats.answered}</div><div className="ac-lbl">累计答题</div></div>
              </div>

              {/* 最近14天 */}
              <div className="analytics-section">
                <div className="analytics-subtitle">最近 14 天</div>
                <div className="study-grid">
                  {days14.map(d=>(
                    <div key={d.key} className="study-cell" title={`${d.label}: ${d.count}题`}>
                      <div className="study-cell-bar" style={{height:`${Math.round((d.count/maxCount)*100)}%`,opacity:d.count>0?Math.min(1,0.3+d.count/maxCount*0.7):1}}/>
                      <div className="study-cell-day">{d.day}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 模块掌握度 */}
              {mastery.length>0 && (
                <div className="analytics-section">
                  <div className="analytics-subtitle">模块掌握度（从低到高）</div>
                  {mastery.map(m=>(
                    <div key={m.id} className="mastery-row">
                      <div className="mastery-mod">{m.icon} {m.label}</div>
                      <div className="mastery-bar-wrap">
                        <div className="mastery-bar">
                          <div className="mastery-fill" style={{width:`${m.pct}%`,background:m.pct>=75?'#3fb950':m.pct>=50?'#d29922':'#f85149'}}/>
                        </div>
                      </div>
                      <div className="mastery-pct" style={{color:m.pct>=75?'#3fb950':m.pct>=50?'#d29922':'#f85149'}}>{m.pct}%</div>
                      <div className="mastery-sub">{m.mastered}/{m.answered}</div>
                    </div>
                  ))}
                </div>
              )}

              {mastery.length===0&&<div className="bank-empty"><div className="bank-empty-icon">📈</div><p>还没有答题记录</p><p className="bank-empty-sub">答题后这里会显示你的学习进度</p></div>}
            </div>
          )
        })()}

      </main>

      <ChatBot activeModule={mod}/>
    </div>
  )
}
