import { redirect } from "next/navigation";
import { auth } from "@/auth";
import data from "./data.json";
import "./cockpit.css";

// AI Teams 조종석 — vault 스냅샷(data.json)을 렌더한다. 스냅샷은 로컬의
// build_dashboard.py가 /daily마다 갱신·커밋한다 (이 페이지는 읽기 전용 뷰).
// /board와 같은 이유로 게이트: 주간 목표·승인 대기 건은 민감 데이터이고
// 이 URL은 고정이므로 로그인 세션을 요구한다.
export const metadata = { title: "AI Teams 조종석 · 캘린더" };

// 말풍선 겹침 방지: 카드 밖 삐짐은 안쪽으로, 이웃과 겹치면 한 층 위로 (측정 후 재배치)
const BUBBLE_JS = `
(function(){
function layout(){
 document.querySelectorAll('.ck-hg').forEach(function(card){
  var bubs=[].slice.call(card.querySelectorAll('.ck-bub'));
  if(!bubs.length) return;
  card.style.paddingTop='';bubs.forEach(function(b){b.style.marginLeft='';b.style.marginBottom='';});
  var cr=card.getBoundingClientRect(), placed=[];
  var maxLift=0;
  bubs.forEach(function(b){
   var r=b.getBoundingClientRect(), dx=0, dy=0;
   if(r.left<cr.left+4) dx=(cr.left+4)-r.left;
   if(r.right+dx>cr.right-4) dx=(cr.right-4)-r.right;
   function hit(){return placed.some(function(p){return !(r.right+dx<p.l-4||r.left+dx>p.r+4||r.bottom+dy<p.t-4||r.top+dy>p.b+4);});}
   while(hit()) dy-=r.height+6;
   b.style.marginLeft=dx+'px'; b.style.marginBottom=(-dy)+'px';
   maxLift=Math.max(maxLift,-dy);
   placed.push({l:r.left+dx,r:r.right+dx,t:r.top+dy,b:r.bottom+dy});
  });
  if(maxLift>0) card.style.paddingTop=(44+maxLift)+'px';
 });
}
window.addEventListener('load',layout);window.addEventListener('resize',layout);layout();
document.querySelectorAll('.ck-tb').forEach(function(b){b.addEventListener('click',function(){
 var i=+b.dataset.t;
 document.querySelectorAll('.ck-tb').forEach(function(x,j){x.classList.toggle('on',j==i)});
 document.querySelectorAll('.ck-tsec').forEach(function(s,j){s.classList.toggle('on',j==i)});
 if(i==0) layout();
});});
function goTab(i){document.querySelectorAll('.ck-tb').forEach(function(x,j){x.classList.toggle('on',j==i)});
document.querySelectorAll('.ck-tsec').forEach(function(s,j){s.classList.toggle('on',j==i)});}
function showPd(slug){
 var el=document.getElementById('pd-'+slug); if(!el) return;
 var tb=document.querySelector('.ck-tabbar'); if(tb) tb.style.display='none';
 document.querySelectorAll('.ck-tsec').forEach(function(s){s.classList.remove('on')});
 document.querySelectorAll('.ck-pdet').forEach(function(s){s.classList.remove('on')});
 el.classList.add('on'); window.scrollTo({top:0});
}
document.querySelectorAll('.ck-hp').forEach(function(pod){pod.addEventListener('click',function(){
 var s=pod.dataset.slug; if(s) showPd(s);
});});
document.querySelectorAll('.ck-pback').forEach(function(b){b.addEventListener('click',function(){
 document.querySelectorAll('.ck-pdet').forEach(function(s){s.classList.remove('on')});
 var tb=document.querySelector('.ck-tabbar'); if(tb) tb.style.display='';
 document.querySelectorAll('.ck-tb').forEach(function(x,j){x.classList.toggle('on',j==0)});
 document.querySelectorAll('.ck-tsec').forEach(function(s,j){s.classList.toggle('on',j==0)});
 layout();
});});
document.querySelectorAll('.ck-bub').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();
 var id=b.dataset.ask; goTab(1);
 var el=document.getElementById(id); if(!el) return;
 var d2=el.querySelector('.ck-dwrap'); if(d2){d2.classList.add('open');} var tg=el.querySelector('.ck-tgb'); if(tg) tg.textContent='세부사항 ▴';
 el.scrollIntoView({behavior:'smooth',block:'start'});
 el.classList.add('flash'); setTimeout(function(){el.classList.remove('flash')},2200);
});});
document.querySelectorAll('.ck-tgb').forEach(function(b){b.addEventListener('click',function(){
 var d=document.getElementById(b.dataset.d); d.classList.toggle('open');
 b.textContent=d.classList.contains('open')?'세부사항 ▴':'세부사항 ▾';
});});
document.querySelectorAll('.ck-cpb').forEach(function(b){b.addEventListener('click',function(){
 var tx=document.getElementById(b.dataset.c).value;
 navigator.clipboard.writeText(tx).then(function(){var o=b.textContent;b.textContent='복사됨 ✓';setTimeout(function(){b.textContent=o},1400);});
});});
})();`;

type Ask = { face: string; who: string; slug?: string; msg: string; sub: string; path: string; detail?: string; prompt?: string };
type Goal = { goal: string; owner: string; kpi: string; personas?: string[] };
type Pod = { face: string; name: string; slug?: string; msg?: string; askIdx?: number; state: "wait" | "active" | "idle" };
type HbGroup = { group: string; members: Pod[] };
type PAgent = { num: string; name: string; intro: string; purpose: string; stance: string; model: string; tok: string; collab: { who: string; rel: string; what: string }[]; principles: string };
const REL_COLOR: Record<string, string> = { "지휘": "#141414", "동료": "#0F6B5C", "공급": "#8a6a3f", "판정": "#b45309" };
function splitPurpose(s: string): [string, string] {
  for (const sep of ["판별 질문:", "판별:"]) {
    const i = s.indexOf(sep);
    if (i >= 0) return [s.slice(0, i).trim(), s.slice(i + sep.length).trim()];
  }
  return [s, ""];
}
type Persona = { slug: string; name: string; metric: string; selfIntro?: string; teams: string[]; teamData: { team: string; agents: PAgent[] }[] };

export default async function CockpitPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/cockpit");
  const d = data as {
    generated: string; date: string; week: string; weekStatus: string;
    one: { txt: string; sub: string }; goals: Goal[]; asks: Ask[];
    alerts: string[]; heartbeat: HbGroup[]; personas?: Persona[];
  };
  return (
    <main className="ck-wrap">
      <div className="ck-bar">
        <span className="ck-ttl">AI Teams</span>
        <a className="ck-cal" href="/">📅 캘린더로</a>
        <a className="ck-cal" href="http://localhost:4747">💬 메신저</a>
        <span className="ck-date">{d.date} · {d.week}{d.weekStatus === "draft" ? " (목표 초안 대기)" : ""}</span>
      </div>
      <div className="ck-tabbar">
        <button className="ck-tb on" data-t="0">조종석</button>
        <button className="ck-tb" data-t="1">🙋 승인 대기함 <span className="cnt">{d.asks.length}</span></button>
      </div>
      <div className="ck-tsec on">
      <div className="ck-topgrid">
        <div className="ck-one">
          <div className="lab">TODAY</div>
          <div className="txt">{d.one.txt}</div>
          <div className="sub">{d.one.sub}</div>
        </div>
        <div className="ck-panel">
          <div className="ck-sec">이번 주 목표</div>
          {d.goals.length === 0 && <div className="ck-quiet">이번 주 목표 없음 — 킥오프 필요</div>}
          {d.goals.map((g) => (
            <div className="ck-goal" key={g.goal}>
              <span className="ck-gd" />
              <div className="ck-gt">{g.goal}<div className="ck-gs">{g.owner} · {g.kpi}</div></div>
              {(g.personas || []).length > 0 && (
                <span className="ck-gavs">
                  {(g.personas || []).map((s) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="ck-gav" key={s} src={`/avatars/${s}.jpg`} alt={s} />
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className={`ck-hb ${d.heartbeat.some((g) => g.members.some((p) => p.msg)) ? "hasany" : ""}`}>
        {d.heartbeat.map((g) => (
          <div className="ck-hg" key={g.group}>
            <div className="ck-hgl">{g.group}</div>
            <div className="ck-hgr">
              {g.members.map((p) => (
                <div className={`ck-hp ${p.state === "idle" ? "idle" : ""}`} key={p.name} title={p.name} data-slug={p.slug || ""}>
                  {p.msg && <div className="ck-bub" data-ask={`ask-${p.askIdx ?? 0}`}>{p.msg}</div>}
                  {p.state === "idle" && <span className="ck-zzz">💤</span>}
                  {p.state === "wait" && <span className="ck-handb">✋</span>}
                  {p.slug ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="ck-hav" src={`/avatars/${p.slug}.jpg`} alt={p.name} />
                  ) : (
                    <span className="ck-hf">{p.face}</span>
                  )}
                  <span className="ck-hn">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="ck-panel">
        <div className="ck-sec">이상 신호</div>
        {d.alerts.length === 0 && <div className="ck-quiet">결함 0 · 기한 경과 0 — 조용합니다</div>}
        {d.alerts.map((a) => (
          <div className="ck-ask alert" key={a}><div className="ck-ab"><div className="ck-am">{a}</div></div></div>
        ))}
      </div>
      </div>
      <div className="ck-tsec">
        {d.asks.length === 0 && <div className="ck-quiet">오늘 대표 결정 없음 — 잘 돌아가고 있습니다</div>}
        {d.asks.map((a, i) => (
          <div className="ck-ask big" key={a.msg} id={`ask-${i}`}>
            <div className="ck-awrap">
              {a.slug ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ck-aav" src={`/avatars/${a.slug}.jpg`} alt={a.who} />
              ) : (
                <span className="ck-af">{a.face}</span>
              )}
              <div className="ck-awho">{a.who}</div>
            </div>
            <div className="ck-ab">
              <div className="ck-am">&ldquo;{a.msg}&rdquo;</div>
              <div className="ck-asub">{a.sub}</div>
              <div className="ck-apath">{a.path}</div>
              <div className="ck-abtns">
                {a.detail && <button className="ck-tgb" data-d={`d-${i}`}>세부사항 ▾</button>}
                {a.prompt && (
                  <>
                    <button className="ck-cpb" data-c={`c-${i}`}>📋 파악 프롬프트 복사</button>
                    <textarea id={`c-${i}`} hidden readOnly value={a.prompt} />
                  </>
                )}
              </div>
              {a.detail && <div className="ck-dwrap" id={`d-${i}`}><pre className="ck-detail">{a.detail}</pre></div>}
            </div>
          </div>
        ))}
      </div>
      {(d.personas || []).map((ps) => (
        <div className="ck-pdet" id={`pd-${ps.slug}`} key={ps.slug}>
          <button className="ck-pback">← 조종석</button>
          <div className="ck-phead">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/avatars/${ps.slug}.jpg`} alt={ps.name} />
            <div>
              <div className="ck-pname">{ps.name}</div>
              <div className="ck-pmeta">소유 팀: {ps.teams.length ? ps.teams.join(" · ") : "Chief of Staff"} | 판별: {ps.metric}</div>
            </div>
          </div>
          {ps.selfIntro && <div className="ck-pself">💬 {ps.selfIntro}</div>}
          {ps.teamData.length === 0 && <div className="ck-quiet">개별 인사 파일 없이 스킬·Board로 운영되는 인물입니다</div>}
          {ps.teamData.map((td) => (
            <div className="ck-pteam" key={td.team}>
              <h3>{td.team} <span className="ck-pcnt">{td.agents.length}</span></h3>
              <div className="ck-pgrid">
                {td.agents.map((a) => (
                  <div className="ck-pcard" key={a.name}>
                    <div className="ck-pnm">#{a.num} {a.name}</div>
                    <div className="ck-pintro">💬 {a.intro}</div>
                    <div className="ck-pchips">
                      {[a.stance ? `🧭 ${a.stance}` : "", a.model ? `⚙️ ${a.model}` : "", a.tok ? `📦 ${a.tok} tok` : ""].filter(Boolean).map((c) => (
                        <span className="ck-pchip" key={c}>{c}</span>
                      ))}
                    </div>
                    <div className="ck-plab">🎯 목적</div>
                    <div className="ck-ppur">{splitPurpose(a.purpose)[0]}</div>
                    {splitPurpose(a.purpose)[1] && <div className="ck-pq">🔍 판별 — {splitPurpose(a.purpose)[1]}</div>}
                    {a.collab.length > 0 && (
                      <>
                        <div className="ck-plab">🤝 협업</div>
                        <table className="ck-ptab"><tbody>
                          <tr className="h"><td>상대</td><td>관계</td><td>주고받는 것</td></tr>
                          {a.collab.map((r, j) => (
                            <tr key={j}>
                              <td className="who">{r.who}</td>
                              <td><span className="ck-relc" style={{ color: REL_COLOR[r.rel] || "#777", borderColor: REL_COLOR[r.rel] || "#b6b6b6" }}>{r.rel}</span></td>
                              <td>{r.what}</td>
                            </tr>
                          ))}
                        </tbody></table>
                      </>
                    )}
                    {a.principles && (
                      <details className="ck-pprin"><summary>🧠 사고원칙 펼치기</summary><div>{a.principles}</div></details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      <div className="ck-foot">스냅샷 생성 {d.generated} · build_dashboard.py · 말풍선=대표 결정 대기 · 흑백💤=휴식</div>
      <script dangerouslySetInnerHTML={{ __html: BUBBLE_JS }} />
    </main>
  );
}
