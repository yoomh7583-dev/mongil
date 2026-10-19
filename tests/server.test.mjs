import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';

test('서버 인증·동시 수정 감지·실제 판정 재검증·발송 영속 중복 방지',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'anjin-test-'));const token=randomUUID(),port=31000+Math.floor(Math.random()*20000),origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['--import','./tests/provider-mock.mjs','server.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,APP_ADMIN_TOKEN:token,SMS_ENABLED:'true',SOLAPI_API_KEY:'mock',SOLAPI_API_SECRET:'mock',SOLAPI_SENDER:'0212345678'},stdio:'pipe'});
 const ready=new Promise((resolve,reject)=>{child.stdout.on('data',x=>{if(x.toString().includes('http://'))resolve();});child.on('error',reject);child.on('exit',c=>reject(new Error(`Test server exited ${c}`)));});
 try{
  await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server startup timeout')),5000))]);
  const request=(path,method='GET',data,auth=true)=>fetch(origin+path,{method,headers:{...(auth?{Authorization:`Bearer ${token}`} :{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
  assert.equal((await request('/api/state','GET',null,false)).status,401);
  let s=await (await request('/api/state')).json();const old=structuredClone(s);
  assert.equal((await request('/api/messages/send','POST',{noticeId:s.notices[0].id,buildingIds:[s.buildings[0].id],message:'지원사업 안내 테스트입니다.',confirmed:true})).status,400);
  s.notices[0].demo=false;s.notices[0].deadline='2099-12-31';
  const b=s.buildings[0];Object.assign(b,{demo:false,phone:'01012345678',contactConsent:true,consentSource:'신청서 동의',consentAt:'2026-01-01'});
  assert.equal((await request('/api/state','PUT',s)).status,200);
  assert.equal((await request('/api/state','PUT',old)).status,409);
  const input={noticeId:s.notices[0].id,buildingIds:[b.id],message:'{소유자}님 지원사업 안내 테스트입니다.',confirmed:true};
  const responses=await Promise.all([request('/api/messages/send','POST',input),request('/api/messages/send','POST',input)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const accepted=await responses.find(r=>r.status===200).json();assert.equal(accepted.results[0].status,'accepted');
  s=await (await request('/api/state')).json();assert.equal(s.messages.length,1);assert.equal(s.messages[0].providerId,'test-group-id');
  assert.equal((await request('/api/messages/send','POST',input)).status,409);
  assert.equal((await request('/api/state','PUT',s)).status,200);
  assert.equal((await request('/api/messages/send','POST',input)).status,409);
  const attack=await fetch(origin+'/api/state',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:'https://untrusted.example'},body:JSON.stringify(s)});assert.equal(attack.status,403);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>child.on('exit',resolve));await rm(dir,{recursive:true,force:true});}
});
