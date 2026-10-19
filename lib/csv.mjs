export function parseCSV(text){
  text=text.replace(/^\uFEFF/,''); const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('CSV의 따옴표가 닫히지 않았습니다.');
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  if(rows.length<2)throw new Error('CSV에 제목 행과 건축물 행이 필요합니다.');
  const headers=rows.shift().map(x=>x.trim());if(new Set(headers).size!==headers.length)throw new Error('중복된 CSV 열 이름이 있습니다.');
  if(rows.some(r=>r.length!==headers.length))throw new Error('CSV 열 개수가 일치하지 않습니다.');
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i].trim()])));
}
export function csvCell(x){let v=String(x??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';}
export function normalizeBuilding(b){
  const out={};const strings=['id','name','address','region','approvalDate','use','structure','ownership','ownerName','phone','consentSource','consentAt','sourceText','createdAt'];
  for(const k of strings)out[k]=typeof b[k]==='string'?b[k].slice(0,k==='sourceText'?80000:500):'';
  for(const k of ['floors','area']){const v=b[k];out[k]=v===''||v===null||v===undefined?null:Number(v);if(out[k]!==null&&(!Number.isFinite(out[k])||out[k]<0))throw new Error(`${k} 값이 올바르지 않습니다.`);}
  for(const k of ['seismic','priorSupport','contactConsent'])out[k]=b[k]===true||b[k]==='true'?true:b[k]===false||b[k]==='false'?false:null;
  out.demo=b.demo===true;
  if(!out.name.trim()||!out.address.trim())throw new Error('건물명과 주소가 필요합니다.');
  return out;
}
