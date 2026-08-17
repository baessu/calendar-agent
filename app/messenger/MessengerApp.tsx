"use client";

/**
 * AI Teams 라이브 메신저 (웹) — 여러 기기의 에이전트 활동을 한 화면에서 본다.
 *
 * 데이터: GET /api/activity (기기별 blob 병합). 각 기기의 로컬 feed_sync.py가 올린다.
 * 방 = 세션(sid) 하나. cwd가 바뀌어도 방이 갈라지지 않는다.
 * 요약(방 제목·사건 한 줄·태스크 묶음)은 로컬 서버가 gemini-2.5-flash로 만들어 함께 전송한다.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import "./messenger.css";

type Ev = {
  ts: number; sid: string; proj?: string; dev?: string;
  role: "user" | "call" | "result" | "assistant";
  text?: string; desc?: string; agent?: string;
};
type Task = { title: string; turns: number[] };
type Feed = {
  events: Ev[];
  summaries: Record<string, string>;
  esum: Record<string, string>;
  tasks: Record<string, Task[]>;
  devices: { device: string; updatedAt: string; events: number }[];
};

const NAME2SLUG: Record<string, string> = {
  "커머스 팀장": "commerce", "콘텐츠 PD": "video", "아트 디렉터": "art", "정찰병": "scout",
  "광부": "miner", "CSO": "cso", "서재지기": "librarian", "채널 매니저": "channel",
  "그로스해커": "growth", "IR 매니저": "ir", "법무 담당": "legal", "퀄리티 디렉터": "quality",
  "피플 옵스 리드": "hr", "경리": "finance", "파트너십 매니저": "partner", "강의PD": "edu",
  "회고 코치": "retro", "콘텐츠 플래너": "planner", "비서": "chief",
};
const NM: Record<string, string> = Object.fromEntries(
  Object.entries(NAME2SLUG).map(([k, v]) => [v, k]),
);
const KEYWORDS: [string, string[]][] = [
  ["commerce", ["copywriting", "카피", "pdp", "상세페이지", "이메일", "landing", "랜딩"]],
  ["video", ["video", "영상", "숏폼", "틱톡", "대본", "야핑"]],
  ["art", ["design", "디자인", "썸네일", "로고", "배너", "비주얼"]],
  ["scout", ["market_research", "user_research", "시장", "리서치", "voc", "페르소나"]],
  ["miner", ["discovery", "채굴", "레퍼런스", "트렌드", "바이럴"]],
  ["cso", ["strategy", "전략", "브레인스토밍", "마인드맵"]],
  ["librarian", ["knowledge", "도서", "논문", "인사이트 카드", "krag"]],
  ["channel", ["blog", "블로그", "트윗", "스레드", "linkedin", "소셜"]],
  ["growth", ["seo", "gtm", "광고", "캠페인", "시딩", "아웃리치"]],
  ["ir", ["business_plan", "사업계획", "피치", "투자"]],
  ["legal", ["legal", "법률", "광고법", "저작권"]],
  ["quality", ["evaluation", "평가", "채점", "루브릭", "검증"]],
  ["hr", ["hr_audit", "감사", "조직 "]],
  ["finance", ["finance", "장부", "현금", "발주", "경리"]],
  ["partner", ["collab", "콜마", "외주", "협력사"]],
  ["edu", ["education", "강의", "커리큘럼"]],
  ["retro", ["reflection", "회고"]],
  ["planner", ["planning", "편성", "포맷 바이블"]],
];

function slugOf(e: Ev): string | null {
  const d = e.desc || "", s = `${d} ${e.text || ""} ${e.agent || ""}`;
  const m = d.match(/^\[([^\]]+)\]/);
  if (m && NAME2SLUG[m[1].trim()]) return NAME2SLUG[m[1].trim()];
  for (const nm of Object.keys(NAME2SLUG)) if (s.includes(nm)) return NAME2SLUG[nm];
  const lo = s.toLowerCase();
  for (const [sl, ks] of KEYWORDS) for (const k of ks) if (lo.includes(k)) return sl;
  return null;
}
function brief(s: string | undefined, n: number): string {
  if (!s) return "";
  let x = s.replace(/```[\s\S]*?```/g, " ").replace(/[#*>`|_]/g, "")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  const re = /[.!?]\s|(?:다|요|죠|까)[.!?]?\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(x)) !== null) {
    const cut = m.index + m[0].length;
    if (cut >= 14) { x = x.slice(0, cut).trim(); break; }
  }
  return x.length > n ? `${x.slice(0, n).trim()}…` : x;
}
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (ts: number) => { const d = new Date(ts * 1000); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mmdd = (ts: number) => { const d = new Date(ts * 1000); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${hhmm(ts)}`; };
const durTxt = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${Math.max(1, m)}분`;
};

export default function MessengerApp() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/activity", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setFeed((await r.json()) as Feed);
      setErr("");
    } catch {
      setErr("피드를 불러오지 못했습니다");
    }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const rooms = useMemo(() => {
    const g: Record<string, Ev[]> = {};
    for (const e of feed?.events ?? []) (g[e.sid || "?"] ||= []).push(e);
    return g;
  }, [feed]);
  const keys = useMemo(
    () => Object.keys(rooms).sort((a, b) => (rooms[b].at(-1)?.ts ?? 0) - (rooms[a].at(-1)?.ts ?? 0)),
    [rooms],
  );
  const room = cur && rooms[cur] ? cur : keys[0];
  const evs = room ? rooms[room] : [];

  const label = (k: string) => {
    const es = rooms[k] ?? [];
    const projs = [...new Set(es.map((e) => e.proj).filter(Boolean))];
    const last = es.at(-1);
    const p = projs.length > 1 ? `${last?.proj} +${projs.length - 1}` : (last?.proj ?? "?");
    return `${p} · ${k}`;
  };
  const devOf = (k: string) => rooms[k]?.at(-1)?.dev ?? "";

  // 대화: 위임은 비서가 @인물을 멘션, 보고는 그 인물이 답장
  let lastSlug: string | null = null;
  const bubbles = evs.map((e, i) => {
    const t = hhmm(e.ts);
    if (e.role === "user")
      return (
        <div className="mg-msg user" key={i}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mg-av" src="/avatars/chief.jpg" alt="스테피" />
          <div className="mg-mb"><div className="mg-mn">스테피</div>
            <div className="mg-bd">{e.text}</div><div className="mg-tm">{t}</div></div>
        </div>
      );
    if (e.role === "assistant") {
      const s = brief(e.text, 110);
      return (
        <div className="mg-msg" key={i}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mg-av" src="/avatars/chief.jpg" alt="비서" />
          <div className="mg-mb"><div className="mg-mn">비서</div>
            <div className="mg-bd">{s}
              {(e.text?.length ?? 0) > 110 && <details><summary>전문 보기</summary><pre>{e.text}</pre></details>}
            </div><div className="mg-tm">{t}</div></div>
        </div>
      );
    }
    const line = brief(e.text, 110);
    const long = (e.text?.length ?? 0) > 110;
    if (e.role === "call") {
      const sl = slugOf(e) || lastSlug; lastSlug = sl;
      const who = sl ? NM[sl] : (e.agent || "에이전트");
      return (
        <div className="mg-msg" key={i}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mg-av" src="/avatars/chief.jpg" alt="비서" />
          <div className="mg-mb"><div className="mg-mn">비서</div>
            <div className="mg-bd"><span className="mg-mention">@{who}</span>{line || "이 건 부탁해요."}
              {long && <details><summary>전문 보기</summary><pre>{e.text}</pre></details>}
            </div>
            <div className="mg-tm">{t}{e.desc ? ` · ${e.desc.replace(/^\[[^\]]+\]\s*/, "")}` : ""}</div></div>
        </div>
      );
    }
    const sl = lastSlug || slugOf(e);
    const who = sl ? NM[sl] : (e.agent || "에이전트");
    return (
      <div className="mg-msg" key={i}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mg-av" src={sl ? `/avatars/${sl}.jpg` : "/avatars/chief.jpg"} alt={who} />
        <div className="mg-mb"><div className="mg-mn">{who}</div>
          <div className="mg-bd"><span className="mg-mention">@비서</span>{line || "작업 마쳤습니다."}
            {long && <details><summary>전문 보기</summary><pre>{e.text}</pre></details>}
          </div><div className="mg-tm">{t}</div></div>
      </div>
    );
  });

  // 진행 흐름: 턴 → 태스크 묶음 → 접이식 단계
  const turns: Ev[][] = [];
  for (const e of evs) { if (e.role === "user" || !turns.length) turns.push([e]); else turns.at(-1)!.push(e); }
  let lc: string | null = null;
  const tsteps = turns.map((tn) => tn.map((e) => {
    const s = feed?.esum?.[`${e.sid}:${e.ts}`];
    const fb = (e.desc || "").replace(/^\[[^\]]+\]\s*/, "") || brief(e.text, 60);
    const txt = s || (e.role === "call" ? fb : brief(e.text, 70));
    if (e.role === "user") return { k: "요청", t: txt, w: "chief", wn: "비서", ts: e.ts };
    if (e.role === "call") { lc = slugOf(e) || lc; return { k: "위임", t: txt, w: lc, wn: lc ? NM[lc] : "에이전트", ts: e.ts }; }
    if (e.role === "result") { const rs = lc || slugOf(e); return { k: "보고", t: txt, w: rs, wn: rs ? NM[rs] : (e.agent || "에이전트"), ts: e.ts }; }
    return { k: "완료", t: txt, w: "chief", wn: "비서", ts: e.ts };
  }));
  let tasks = (feed?.tasks?.[room ?? ""] ?? [])
    .map((tk) => ({ title: tk.title, turns: (tk.turns ?? []).filter((i) => i < turns.length) }))
    .filter((tk) => tk.turns.length);
  const covered = new Set(tasks.flatMap((tk) => tk.turns));
  for (let i = 0; i < turns.length; i++) if (!covered.has(i)) tasks.push({ title: "", turns: [i] });
  tasks = tasks.sort((a, b) => a.turns[0] - b.turns[0]);

  const lastEv = evs.at(-1);
  const pending = Boolean(lastEv && (lastEv.role === "user" || lastEv.role === "call") &&
    Date.now() / 1000 - lastEv.ts < 900);
  const all = tsteps.flat();
  const people = new Set(all.map((s) => s.w).filter(Boolean));
  const t0 = evs[0]?.ts ?? 0, t1 = lastEv?.ts ?? 0;

  const members = (() => {
    const set: string[] = []; let l: string | null = null;
    for (const e of evs) {
      let sl: string | null = null;
      if (e.role === "call") { sl = slugOf(e) || l; l = sl; }
      else if (e.role === "result") sl = l || slugOf(e);
      if (sl && !set.includes(sl)) set.push(sl);
    }
    return set;
  })();

  return (
    <div className="mg-wrap">
      <div className="mg-side">
        <div className="mg-h1"><div>AI Teams<span style={{ color: "#a6a6a6", fontWeight: 300, margin: "0 5px" }}>/</span>메신저</div>
          <small>{err || `이벤트 ${feed?.events.length ?? 0}건 · 기기 ${feed?.devices.length ?? 0}대 · 5초마다 갱신`}</small></div>
        <div className="mg-rooms">
          {keys.map((k) => {
            const last = rooms[k].at(-1)?.ts ?? 0;
            const live = Date.now() / 1000 - last < 120;
            return (
              <div className={`mg-room ${k === room ? "on" : ""}`} key={k} onClick={() => setCur(k)}>
                <span className={live ? "mg-live" : "mg-live idle"} />
                <div className="mg-rtx">
                  <div className="mg-rs">{feed?.summaries?.[k] || "대기 중"}</div>
                  <div className="mg-rn">{devOf(k) ? `[${devOf(k)}] ` : ""}{label(k)}</div>
                </div>
                <span className="mg-cnt">{rooms[k].length}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mg-main">
        <div className="mg-mh">
          <div>{room ? label(room) : "세션을 선택하세요"}
            <small>메시지 {evs.length}건</small>
            {room && devOf(room) && <span className="mg-dev">{devOf(room)}</span>}</div>
          <div className="mg-mem">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mg-mav" src="/avatars/chief.jpg" alt="비서" />
            {members.map((s) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="mg-mav" key={s} src={`/avatars/${s}.jpg`} alt={NM[s]} title={NM[s]} />
            ))}
            <span className="mg-memn">{["스테피", "비서", ...members.map((s) => NM[s])].join(", ")} · {members.length + 2}명</span>
          </div>
          <a className="mg-nav" href="/cockpit">🛩️ 대시보드</a>
        </div>
        <div className="mg-chat">
          {evs.length === 0 && <div className="mg-empty">아직 수집된 활동이 없습니다.<br />각 기기에서 feed_sync.py를 실행하세요.</div>}
          {bubbles}
          {pending && (
            <div className="mg-msg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="mg-av" src="/avatars/chief.jpg" alt="비서" />
              <div className="mg-mb"><div className="mg-mn">비서</div>
                <div className="mg-tybd"><span className="mg-dot" /><span className="mg-dot" /><span className="mg-dot" /></div>
                <div className="mg-tm">입력 중…</div></div>
            </div>
          )}
        </div>
      </div>

      <div className="mg-flow">
        <div className="mg-fh">진행 흐름<small>{pending ? "진행 중" : "대기"}</small></div>
        <div className="mg-fbody">
          {evs.length === 0 ? <div className="mg-empty" style={{ marginTop: 20 }}>아직 흐름이 없습니다.</div> : (
            <>
              <div className="mg-fsum">
                <div><b>{tasks.length}</b><span>태스크</span></div>
                <div><b>{all.length}</b><span>단계</span></div>
                <div><b>{people.size}</b><span>참여</span></div>
              </div>
              <div className="mg-ftime">
                <div><span>시작</span><b>{mmdd(t0)}</b></div>
                <div><span>{pending ? "최근 활동" : "종료"}</span><b>{mmdd(t1)}</b></div>
                <div className="dur"><span>{pending ? "진행 중" : "총 소요"}</span>
                  <b>{durTxt((pending ? Date.now() / 1000 : t1) - t0)}{pending ? "째" : ""}</b></div>
              </div>
              {tasks.map((tk, ti) => {
                const steps = tk.turns.flatMap((i) => tsteps[i] ?? []);
                if (!steps.length) return null;
                const a = steps[0].ts, b = steps.at(-1)!.ts;
                const live = ti === tasks.length - 1 && pending;
                const gk = `${room}#${ti}`, isOpen = gk in open ? open[gk] : false;
                const avs = [...new Set(steps.map((s) => s.w).filter(Boolean))] as string[];
                return (
                  <div key={gk}>
                    <div className={`mg-tsec ${live ? "tlive" : ""}`} onClick={() => setOpen((o) => ({ ...o, [gk]: !(gk in o ? o[gk] : false) }))}>
                      <div className="mg-tst"><span className="mg-tcar">{isOpen ? "▾" : "▸"}</span>{tk.title || steps[0].t || "작업"}</div>
                      <div className="mg-tsm">
                        <span className="mg-tkav">{avs.map((s) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={s} src={`/avatars/${s}.jpg`} alt={NM[s]} title={NM[s]} />
                        ))}</span>
                        {steps.length}단계 · {hhmm(a)}~{hhmm(b)} · {durTxt((live ? Date.now() / 1000 : b) - a)}{live ? "째" : ""}
                      </div>
                    </div>
                    {isOpen && steps.map((s, i) => (
                      <div className={`mg-stg ${live && i === steps.length - 1 ? "now" : "done"}`} key={i}>
                        <div className="mg-sl">{s.k}</div>
                        <div className="mg-st">{s.t || "—"}</div>
                        <div className="mg-sw">{s.w && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/avatars/${s.w}.jpg`} alt={s.wn} />
                        )}{s.wn}</div>
                        <div className="mg-sd">{hhmm(s.ts)}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
