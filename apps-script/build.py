"""app/index.html(앱 원본) → apps-script/index.html(Apps Script 웹 앱용) 변환.

- 내장 데이터(SEED)는 헤더만 남긴다: 로그인·공유 확인 전에는 일정이 보이지 않게.
- 데이터는 google.script.run.getData()로, 요청은 submitRequest()로 주고받는다.
- 이름·비밀번호 입력칸 제거(로그인한 구글 계정으로 기록), PWA 관련 태그 제거.

실행: python3 apps-script/build.py
"""
import json, re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
s = (root / "app" / "index.html").read_text(encoding="utf-8")

def sub(old, new, count=1):
    global s
    assert s.count(old) == count, f"찾을 수 없음: {old[:70]!r}"
    s = s.replace(old, new)

# 1) PWA/아이콘 태그 (Apps Script에서는 동작하지 않음)
for tag in ['<link rel="manifest" href="./manifest.webmanifest">\n', '<link rel="icon" href="./icon.svg" type="image/svg+xml">\n', '<link rel="apple-touch-icon" href="./icon-192.png">\n']:
    sub(tag, "")
sub("if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});", "")

# 2) SEED → 헤더만 (원본이 이미 헤더만이어도 그대로 통과)
m = re.search(r"const SEED=(\{.*?\});\n", s, re.S)
try:
    heads = {k: v[:1] for k, v in json.loads(m.group(1)).items()}
except json.JSONDecodeError:
    src = m.group(1)
    heads = {}
    for n in re.findall(r'"([^"]+)":\s*\[\s*\[', src):
        i = src.index("[", src.index(f'"{n}":')) + 1
        j = src.index("]", i) + 1
        heads[n] = [json.loads(src[i:j])]
s = s[:m.start(1)] + json.dumps(heads, ensure_ascii=False) + s[m.end(1):]
assert all(len(v) == 1 for v in heads.values()), "SEED에 데이터 행이 남음"
assert "const PLACES=[" in s and "const ICONS={" in s, "변환 중 코드가 잘림"

# 3) 데이터 동기화: gviz → google.script.run
a = s.index("function parseGviz(txt){")
b = s.index("function setSync(state){")
s = s[:a] + r'''let ME="";
const gas=(fn,...args)=>new Promise((res,rej)=>google.script.run.withSuccessHandler(res).withFailureHandler(rej)[fn](...args));
let syncing=false;
async function sync(manual){
 if(syncing)return;syncing=true;$("#syncBtn").classList.add("spin");
 try{
  const r=await gas("getData");
  for(const[n,t]of Object.entries(r.tabs||{}))if(t&&t.length)DATA[n]=t;
  ME=r.user||"";store.set("fuk5-me",ME);
  store.set("fuk5-data",DATA);store.set("fuk5-syncAt",Date.now());
  setSync("ok");if(manual)toast("최신 내용을 불러왔어요");
 }catch(e){
  const msg=String(e&&e.message||e);
  if(/권한|permission|access|찾을 수 없|not found/i.test(msg)){showDenied(msg);}
  setSync(store.get("fuk5-syncAt",0)?"cache":"seed");LAST_ERR=msg;
  $("#syncText").textContent="불러오기 실패: "+msg.slice(0,90);if(manual)toast("불러오지 못했어요");
 }
 syncing=false;$("#syncBtn").classList.remove("spin");renderAll();
}
let LAST_ERR="";
function showDenied(msg){
 try{localStorage.removeItem("fuk5-data")}catch(e){}DATA=structuredClone(SEED);
 $("#denied").hidden=false;$("#deniedMsg").textContent=msg||"";
}
''' + s[b:]
sub(':"기본 일정 표시 중";', ':"불러오는 중";')
sub('<div class="toast" id="toast"></div>', '''<div class="toast" id="toast"></div>
<div class="denied" id="denied" hidden><div><b>접근 권한이 없어요</b><p>이 여행앱은 초대받은 가족만 볼 수 있어요. 관리자에게 공유를 요청해 주세요.</p><p style="font-size:13px;color:#8a8f8c">여러 구글 계정에 로그인되어 있으면 이 화면이 뜰 수 있어요. 시크릿 창에서 초대받은 계정 하나로만 로그인해 열어 보세요.</p><p id="deniedMsg" style="font-size:12px;color:#8a8f8c;word-break:break-all"></p></div></div>''')
sub(".toast{", ".denied[hidden]{display:none}.denied{position:fixed;inset:0;z-index:100;background:var(--bg);display:grid;place-items:center;padding:24px;text-align:center}.denied b{display:block;font-size:22px;font-weight:800;letter-spacing:-.03em}.denied p{color:var(--ink2);margin:8px 0 0;font-size:15px}\n.toast{")
# 데이터가 오기 전 빈 화면 대신 안내
sub("const d=days[selDay];if(!d){$(\"#days\").innerHTML=\"\";return days}", "const d=days[selDay];if(!d){$(\"#days\").innerHTML=(typeof LAST_ERR!=='undefined'&&LAST_ERR)?'<div class=\"card\" style=\"margin-top:24px;padding:18px\"><b>일정을 불러오지 못했어요</b><p class=\"hint\" style=\"padding:6px 0 10px\">'+esc(LAST_ERR)+'</p><button class=\"btn pri\" onclick=\"sync(true)\">다시 시도</button></div>':'<p class=\"hint\" style=\"padding:40px 0;text-align:center\">일정을 불러오는 중이에요…</p>';return days}")

# 4) 요청: 이름·비밀번호 입력 제거, 로그인 계정으로 전송
sub('<input id="askName" placeholder="이름" maxlength="30" autocomplete="name"><input id="askPin" type="password" inputmode="numeric" placeholder="비밀번호" autocomplete="off">', '<span class="ask-me" id="askMe"></span>')
sub(".ask-row{display:grid;grid-template-columns:1fr 1fr 84px;", ".ask-me{align-self:center;font-size:13px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ask-row{display:grid;grid-template-columns:1fr 84px;")
sub('const APPS_SCRIPT_URL=""; // 요청 접수용 Apps Script 웹앱 주소 (apps-script/Code.gs 배포 후 입력)', 'const APPS_SCRIPT_URL="gas"; // Apps Script 웹 앱: google.script.run 사용')
a = s.index("async function sendRequest(){")
b = s.index("$(\"#askSend\").onclick=sendRequest;")
s = s[:a] + r'''async function sendRequest(){
 const text=$("#askText").value.trim();
 if(!text)return toast("요청 내용을 적어 주세요");
 $("#askSend").disabled=true;
 try{
  const files=[];for(const f of askFiles)files.push(await packFile(f));
  const j=await gas("submitRequest",{text,files});
  store.set("fuk5-reqSentAt",Date.now());
  pendingLocal.unshift({text,name:ME,at:Date.now(),files:files.length});store.set("fuk5-reqLocal",pendingLocal);
  $("#askText").value="";askFiles=[];renderAskFiles();toast(j.fired==="not-configured"?"접수됐어요. 루틴 연결 전이라 처리가 늦을 수 있어요":"접수됐어요. Claude가 처리 중이에요");
  renderRequests();setTimeout(()=>sync(),8000);
 }catch(e){toast(String(e&&e.message||"보내지 못했어요").slice(0,60))}
 finally{$("#askSend").disabled=false}
}
''' + s[b:]
sub('$("#askName").value=store.get("fuk5-askName","");$("#askPin").value=store.get("fuk5-askPin","");', 'ME=store.get("fuk5-me","");')
sub(' $("#askSend").disabled=!APPS_SCRIPT_URL;', ' $("#askSend").disabled=false;$("#askMe").textContent=ME?`보내는 사람 ${ME}`:"";')
# 요청 목록의 이름: 이메일이면 앞부분만
sub('<span>${esc(pick(o,"이름"))}${when?', '<span>${esc(pick(o,"이름").split("@")[0])}${when?')

# 5) 샌드박스 iframe: 전화 링크는 top으로, 앱 내부 # 링크는 직접 스크롤
sub('${ext?\' target="_blank" rel="noopener"\':""}', '${ext?\' target="_blank" rel="noopener"\':\' target="_top"\'}')
sub('<a class="icon-btn" href="tel:${ph.href}"', '<a class="icon-btn" target="_top" href="tel:${ph.href}"')
sub("addEventListener(\"scroll\",()=>requestAnimationFrame(spy),{passive:true});", '''addEventListener("scroll",()=>requestAnimationFrame(spy),{passive:true});
document.addEventListener("click",e=>{const a=e.target.closest('a[href^="#"]');if(!a||e.defaultPrevented)return;const id=a.getAttribute("href").slice(1);const el=id==="top"?document.body:document.getElementById(id);if(!el)return;e.preventDefault();
 const y=id==="top"?0:el.getBoundingClientRect().top+scrollY-($("#segWrap").offsetHeight||0)-8;scrollTo({top:Math.max(0,y),behavior:"smooth"})});''')

(root / "apps-script" / "index.html").write_text(s, encoding="utf-8")
print("apps-script/index.html", len(s.encode()), "bytes")
