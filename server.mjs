import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {timingSafeEqual,createHash,randomUUID} from 'node:crypto';
import {seed} from './lib/seed.mjs';
import {validateRules,canContact} from './lib/rules.mjs';
import {normalizeBuilding} from './lib/csv.mjs';
import {analyzeDocument,sendSolapi} from './lib/providers.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const token=process.env.APP_ADMIN_TOKEN||'';
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3000);
if(!token&&!['127.0.0.1','localhost','::1'].includes(host))throw new Error('외부 서버에는 APP_ADMIN_TOKEN을 설정하세요.');
if(token&&token.length<24)throw new Error('APP_ADMIN_TOKEN은 최소 24자여야 합니다.');
const dataDir=resolve(process.env.DATA_DIR||resolve(root,'data'));await mkdir(dataDir,{recursive:true,mode:0o700});
const db=new DatabaseSync(resolve(dataDir,'anjin.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sms_journal (dedupe TEXT PRIMARY KEY, id TEXT NOT NULL, notice_id TEXT NOT NULL, building_id TEXT NOT NULL, status TEXT NOT NULL, provider_id TEXT, created_at TEXT NOT NULL, error TEXT);');
db.prepare('INSERT OR IGNORE INTO app_state VALUES (1,0,?)').run(JSON.stringify(seed()));
const getState=()=>{const row=db.prepare('SELECT * FROM app_state WHERE id=1').get();return {...JSON.parse(row.body),version:row.version};};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const smsReady=()=>process.env.SMS_ENABLED==='true'&&!!token&&!!process.env.SOLAPI_API_KEY&&!!process.env.SOLAPI_API_SECRET&&/^0\d{8,10}$/.test((process.env.SOLAPI_SENDER||'').replace(/-/g,''));
function authorized(req){if(!token)return true;const supplied=(req.headers.authorization||'').replace(/^Bearer /,'');const a=Buffer.from(supplied),b=Buffer.from(token);return a.length===b.length&&timingSafeEqual(a,b);}
async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>15_000_000)throw fail('요청은 최대 10MB 문서까지 허용됩니다.',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail('올바른 JSON 요청이 필요합니다.');}}
function validateState(s){
  if(!s||!Array.isArray(s.notices)||!Array.isArray(s.buildings)||s.notices.length>200||s.buildings.length>10000)throw fail('저장할 데이터 형식 또는 개수를 확인하세요.');
  if(JSON.stringify(s).length>12_000_000)throw fail('데이터 용량이 너무 큽니다.');
  const ids=new Set();for(const n of s.notices){if(typeof n.id!=='string'||ids.has(n.id)||typeof n.title!=='string'||n.title.length>200||typeof n.text!=='string'||n.text.length>80000)throw fail('공고 데이터가 올바르지 않습니다.');ids.add(n.id);if(n.approved&&validateRules(n).length)throw fail('조건 검증을 통과한 공고만 승인할 수 있습니다.');}
  const bids=new Set();const buildings=s.buildings.map(b=>{const v=normalizeBuilding(b);if(!v.id||bids.has(v.id))throw fail('건물 ID가 중복되거나 누락되었습니다.');bids.add(v.id);return v;});
  return {notices:s.notices,buildings,messages:[],activity:Array.isArray(s.activity)?s.activity.slice(0,200):[]};
}
const limits=new Map();function limit(key,max,ms){const now=Date.now(),list=(limits.get(key)||[]).filter(t=>now-t<ms);if(list.length>=max)throw fail('잠시 후 다시 시도하세요.',429);list.push(now);limits.set(key,list);}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname.startsWith('/api/')){
      if(pathname==='/api/status'&&req.method==='GET')return json(res,200,{server:true,authRequired:!!token,ai:!!token&&!!process.env.OPENAI_API_KEY,sms:smsReady(),storage:'sqlite',version:'1.0.0'});
      if(!authorized(req)){limit('auth:'+req.socket.remoteAddress,15,60000);return json(res,401,{error:'서버 연결 토큰을 확인하세요.'});}
      if(['POST','PUT','DELETE'].includes(req.method)){
        const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)throw fail('동일 출처 요청만 허용됩니다.',403);
        if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail('JSON 요청이 필요합니다.',415);
      }
      if(pathname==='/api/state'&&req.method==='GET'){
        const s=getState();s.messages=db.prepare('SELECT id,notice_id AS noticeId,building_id AS buildingId,status,provider_id AS providerId,created_at AS at,error FROM sms_journal ORDER BY created_at DESC LIMIT 500').all();return json(res,200,s);
      }
      if(pathname==='/api/state'&&req.method==='PUT'){
        const input=await body(req),state=validateState(input);
        const result=db.prepare('UPDATE app_state SET version=version+1,body=? WHERE id=1 AND version=?').run(JSON.stringify(state),Number(input.version));
        if(!result.changes)throw fail('다른 화면에서 데이터가 변경되었습니다. 새로고침한 후 다시 시도하세요.',409);
        return json(res,200,{version:Number(input.version)+1});
      }
      if(pathname==='/api/analyze'&&req.method==='POST'){
        if(!token)throw fail('실제 분석을 사용하려면 APP_ADMIN_TOKEN과 OPENAI_API_KEY를 설정하세요.',503);
        limit('analyze',10,60000);return json(res,200,await analyzeDocument(await body(req)));
      }
      if(pathname==='/api/messages/send'&&req.method==='POST'){
        if(!smsReady())throw fail('실제 발송이 비활성화되어 있습니다. 서버의 Solapi 설정을 확인하세요.',503);
        limit('sms',5,60000);const input=await body(req);
        if(input.confirmed!==true||!Array.isArray(input.buildingIds)||!input.buildingIds.length||input.buildingIds.length>20||new Set(input.buildingIds).size!==input.buildingIds.length)throw fail('발송 확인 및 수신자 1~20명이 필요합니다.');
        if(typeof input.message!=='string'||input.message.length<10||input.message.length>1500)throw fail('문자 내용은 10~1500자로 입력하세요.');
        const s=getState(),notice=s.notices.find(n=>n.id===input.noticeId);
        if(!notice||notice.demo)throw fail('실제 공고를 선택하세요.');
        const buildings=input.buildingIds.map(id=>s.buildings.find(b=>b.id===id));
        for(const b of buildings){if(!b)throw fail('수신 건물을 찾지 못했습니다.');const error=canContact(notice,b);if(error)throw fail(`${b.name}: ${error}`);}
        const jobs=buildings.map(b=>({building:b,key:createHash('sha256').update(`${notice.id}:${b.id}`).digest('hex'),id:randomUUID()}));
        db.exec('BEGIN IMMEDIATE');try{for(const j of jobs)db.prepare('INSERT INTO sms_journal(dedupe,id,notice_id,building_id,status,created_at) VALUES (?,?,?,?,?,?)').run(j.key,j.id,notice.id,j.building.id,'submitting',new Date().toISOString());db.exec('COMMIT');}catch{db.exec('ROLLBACK');throw fail('이미 발송했거나 결과 확인 중인 수신자가 있습니다. 발송 내역을 확인하세요.',409);}
        const results=[];
        for(const j of jobs){try{
          const message=input.message.replaceAll('{소유자}',j.building.ownerName||'소유자').replaceAll('{건물명}',j.building.name).replaceAll('{공고명}',notice.title).replaceAll('{마감일}',notice.deadline);
          if(message.length>1500)throw new Error('변수 치환 후 문자 길이가 초과되었습니다.');
          const result=await sendSolapi(j.building.phone,message);db.prepare('UPDATE sms_journal SET status=?,provider_id=? WHERE dedupe=?').run(result.status,result.providerId,j.key);results.push({id:j.id,buildingId:j.building.id,...result});
        }catch(e){db.prepare('UPDATE sms_journal SET status=?,error=? WHERE dedupe=?').run('unknown',e.message,j.key);results.push({id:j.id,buildingId:j.building.id,status:'unknown',error:e.message});}}
        return json(res,200,{results});
      }
      throw fail('API 경로를 찾을 수 없습니다.',404);
    }
    if(req.method!=='GET'&&req.method!=='HEAD')throw fail('허용하지 않는 요청입니다.',405);
    const allowedLib=['/lib/rules.mjs','/lib/seed.mjs','/lib/csv.mjs'];
    const relative=allowedLib.includes(pathname)?pathname.slice(1):pathname==='/'?'public/index.html':`public${decodeURIComponent(pathname)}`;
    const path=resolve(root,relative);if(!path.startsWith(resolve(root,'public')+'/')&&!allowedLib.includes(pathname))throw fail('접근할 수 없습니다.',403);
    const data=await readFile(path);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.csv':'text/csv; charset=utf-8'})[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){json(res,e.status|| (e.code==='ENOENT'?404:500),{error:e.status?e.message:e.code==='ENOENT'?'파일을 찾을 수 없습니다.':'서버 처리 중 오류가 발생했습니다.'});}
});
server.listen(port,host,()=>console.log(`안진 · http://${host}:${port} · ${token?'인증된 서버':'로컬 체험'} 모드`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
