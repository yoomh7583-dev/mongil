export const fieldLabels = {region:'지역',approvalDate:'사용승인일',age:'건축물 경과 연수',floors:'지상 층수',area:'연면적',use:'주용도',structure:'구조',ownership:'소유 구분',seismic:'내진설계',priorSupport:'기지원 여부'};
export const operators = ['eq','in','gte','lte','before','after'];
const isoDate = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0,10) === x;
export function validateRules(notice) {
  const errors=[];
  if (!notice || typeof notice.text!=='string' || !notice.text.trim()) return ['공고 원문이 필요합니다.'];
  if (!isoDate(notice.referenceDate)) errors.push('유효한 기준일이 필요합니다.');
  if (!isoDate(notice.deadline)) errors.push('접수 마감일을 확인하세요.');
  if (!Array.isArray(notice.criteria) || !notice.criteria.length || notice.criteria.length>30) return [...errors,'조건은 1~30개여야 합니다.'];
  for(const c of notice.criteria){
    if(!fieldLabels[c.field] || !operators.includes(c.op)) errors.push('지원하지 않는 조건입니다.');
    if(typeof c.quote!=='string' || c.quote.length<2 || !notice.text.includes(c.quote)) errors.push(`${fieldLabels[c.field]||'조건'}의 근거가 원문에서 확인되지 않습니다.`);
    if(c.op==='in' && (!Array.isArray(c.value)||!c.value.length||c.value.some(v=>typeof v!=='string'))) errors.push('포함 조건은 텍스트 목록이어야 합니다.');
    if(['gte','lte'].includes(c.op)&&(!Number.isFinite(c.value)||c.value<0)) errors.push('수치 조건이 올바르지 않습니다.');
    if(['before','after'].includes(c.op)&&!isoDate(c.value)) errors.push('날짜 조건이 올바르지 않습니다.');
    if(['age','floors','area'].includes(c.field)&&!['gte','lte','eq'].includes(c.op)) errors.push('수치 필드의 비교 방식을 확인하세요.');
    if(['age','floors','area'].includes(c.field)&&!Number.isFinite(c.value)) errors.push('수치 조건값을 입력하세요.');
    if(['seismic','priorSupport'].includes(c.field)&&(c.op!=='eq'||typeof c.value!=='boolean')) errors.push('여부 조건에는 참/거짓 값이 필요합니다.');
    if(c.field==='approvalDate'&&!['before','after','eq'].includes(c.op)) errors.push('사용승인일 비교 방식을 확인하세요.');
    if(c.field==='approvalDate'&&!isoDate(c.value)) errors.push('사용승인일 조건값을 확인하세요.');
    if(['region','use','structure','ownership'].includes(c.field)&&!['eq','in'].includes(c.op)) errors.push('문자 필드의 비교 방식을 확인하세요.');
    if(c.op==='eq'&&!['number','string','boolean'].includes(typeof c.value)) errors.push('조건값을 확인하세요.');
  }
  if(Array.isArray(notice.unresolved)&&notice.unresolved.length) errors.push('해석되지 않은 조건을 먼저 검토하세요.');
  return [...new Set(errors)];
}
export function ageOn(date, at){
  if(!isoDate(date)||!isoDate(at)||date>at) return null;
  let age=Number(at.slice(0,4))-Number(date.slice(0,4));
  if(at.slice(5)<date.slice(5))age--;
  return age;
}
export function evaluate(notice,building,today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})){
  const invalid=validateRules(notice);
  const checks=(notice?.criteria||[]).map(c=>{
    let actual=c.field==='age'?ageOn(building.approvalDate,notice.referenceDate):building[c.field];
    let pass=null;
    if(actual!==null&&actual!==undefined&&actual!==''&&operators.includes(c.op)){
      if(['age','floors','area'].includes(c.field)&&(!Number.isFinite(actual)||actual<0)) actual=null;
      else if(c.field==='approvalDate'&&!isoDate(actual)) actual=null;
      else if(['seismic','priorSupport'].includes(c.field)&&typeof actual!=='boolean') actual=null;
      else if(c.op==='eq')pass=actual===c.value;
      else if(c.op==='in'&&Array.isArray(c.value))pass=c.value.includes(actual);
      else if(c.op==='gte')pass=typeof actual==='number'&&actual>=c.value;
      else if(c.op==='lte')pass=typeof actual==='number'&&actual<=c.value;
      else if(c.op==='before')pass=actual<=c.value;
      else if(c.op==='after')pass=actual>=c.value;
    }
    return {...c,actual,pass};
  });
  const expired=isoDate(notice?.deadline)&&notice.deadline<today;
  let status='eligible',reason='모든 검토 조건 충족';
  if(invalid.length||!notice?.approved){status='review';reason=invalid[0]||'공고 조건 승인 대기';}
  else if(expired){status='excluded';reason='접수 마감';}
  else if(checks.some(c=>c.pass===false)){status='excluded';reason='일부 지원 조건 미충족';}
  else if(checks.some(c=>c.pass===null)){status='review';reason='건축물 정보 확인 필요';}
  return {status,reason,checks};
}
export function canContact(notice,building,today){
  const result=evaluate(notice,building,today);
  if(result.status!=='eligible') return '대상 조건을 충족한 건물만 발송할 수 있습니다.';
  if(building.contactConsent!==true||!building.consentSource?.trim()||!isoDate(building.consentAt)||building.consentAt>(today||new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})))return '유효한 연락 동의와 수집 근거·동의일이 필요합니다.';
  if(!/^01[016789]\d{7,8}$/.test(String(building.phone||'').replace(/-/g,'')))return '소유자의 유효한 휴대전화 번호가 필요합니다.';
  if(building.demo)return '예제 건물에는 실제 문자를 발송할 수 없습니다.';
  return null;
}
export function valueLabel(c){return `${fieldLabels[c.field]||c.field} ${ {eq:'=',in:'포함',gte:'이상',lte:'이하',before:'이전·당일',after:'이후·당일'}[c.op]||''} ${Array.isArray(c.value)?c.value.join(', '):typeof c.value==='boolean'?(c.value?'해당':'비해당'):c.value}`;}
