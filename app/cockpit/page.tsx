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
})();`;

type Ask = { face: string; who: string; slug?: string; msg: string; sub: string; path: string };
type Goal = { goal: string; owner: string; kpi: string };
type Pod = { face: string; name: string; slug?: string; msg?: string; state: "wait" | "active" | "idle" };
type HbGroup = { group: string; members: Pod[] };

export default async function CockpitPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/cockpit");
  const d = data as {
    generated: string; date: string; week: string; weekStatus: string;
    one: { txt: string; sub: string }; goals: Goal[]; asks: Ask[];
    alerts: string[]; heartbeat: HbGroup[];
  };
  return (
    <main className="ck-wrap">
      <div className="ck-bar">
        <span className="ck-ttl">AI Teams<span className="sl">/</span>조종석</span>
        <span className="ck-date">{d.date} · {d.week}{d.weekStatus === "draft" ? " (목표 초안 대기)" : ""}</span>
      </div>
      <div className={`ck-hb ${d.heartbeat.some((g) => g.members.some((p) => p.msg)) ? "hasany" : ""}`}>
        {d.heartbeat.map((g) => (
          <div className="ck-hg" key={g.group}>
            <div className="ck-hgl">{g.group}</div>
            <div className="ck-hgr">
              {g.members.map((p) => (
                <div className={`ck-hp ${p.state === "idle" ? "idle" : ""}`} key={p.name} title={p.name}>
                  {p.msg && <div className="ck-bub">{p.msg}</div>}
                  {p.state === "idle" && <span className="ck-zzz">💤</span>}
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
      <div className="ck-cols">
        <div>
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
              </div>
            ))}
          </div>
          <div className="ck-panel" style={{ marginTop: 12 }}>
            <div className="ck-sec">이상 신호</div>
            {d.alerts.length === 0 && <div className="ck-quiet">결함 0 · 기한 경과 0 — 조용합니다</div>}
            {d.alerts.map((a) => (
              <div className="ck-ask alert" key={a}><div className="ck-ab"><div className="ck-am">{a}</div></div></div>
            ))}
          </div>
        </div>
        <div>
          <div className="ck-panel">
            <div className="ck-sec">🙋 승인 대기함 {d.asks.length}건</div>
            {d.asks.length === 0 && <div className="ck-quiet">오늘 대표 결정 없음 — 잘 돌아가고 있습니다</div>}
            {d.asks.map((a) => (
              <div className="ck-ask" key={a.msg}>
                {a.slug ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ck-aav" src={`/avatars/${a.slug}.jpg`} alt={a.who} />
                ) : (
                  <span className="ck-af">{a.face}</span>
                )}
                <div className="ck-ab">
                  <div className="ck-am">&ldquo;{a.msg}&rdquo;</div>
                  <div className="ck-asub">{a.who} · {a.sub}</div>
                </div>
                <span className="ck-path" title={a.path}>{a.path.split("/").slice(-1)[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ck-foot">스냅샷 생성 {d.generated} · build_dashboard.py · 말풍선=대표 결정 대기 · 흑백💤=휴식</div>
      <script dangerouslySetInnerHTML={{ __html: BUBBLE_JS }} />
    </main>
  );
}
