// 모든 공고·건물·이름은 제품 체험용 가상 데이터입니다.
export function seed(){
  const text='[가상 예제] 2026년 서울특별시 건축물 안전점검 지원사업\n지역: 서울특별시 마포구\n2026년 10월 1일 기준 사용승인 후 30년 이상 경과한 민간 건축물로, 지상 5층 이하 및 연면적 1,000㎡ 이하인 단독주택, 공동주택, 제1종근린생활시설을 대상으로 합니다.\n접수기간: 2026년 10월 1일 ~ 2026년 12월 31일\n본 문서는 기능 체험용 가상 공고이며 실제 지원사업이 아닙니다.';
  const notice={id:'n-demo',title:'2026 소규모 노후 건축물 안전점검 지원',agency:'마포구청 건축과 · 가상 예제',region:'서울특별시 마포구',deadline:'2026-12-31',referenceDate:'2026-10-01',text,sourceUrl:'',approved:true,unresolved:[],demo:true,createdAt:'2026-10-19T09:00:00+09:00',criteria:[
    {field:'region',op:'eq',value:'서울특별시 마포구',quote:'지역: 서울특별시 마포구'},
    {field:'age',op:'gte',value:30,quote:'사용승인 후 30년 이상'},
    {field:'ownership',op:'eq',value:'민간',quote:'민간 건축물'},
    {field:'floors',op:'lte',value:5,quote:'지상 5층 이하'},
    {field:'area',op:'lte',value:1000,quote:'연면적 1,000㎡ 이하'},
    {field:'use',op:'in',value:['단독주택','공동주택','제1종근린생활시설'],quote:'단독주택, 공동주택, 제1종근린생활시설'}
  ]};
  const entries=[['서교빌라','서울특별시 마포구 잔다리로 00', '1991-04-12',4,624,'공동주택','조적조'],['연남주택','서울특별시 마포구 성미산로 00','1988-06-24',2,182,'단독주택','철근콘크리트조'],['합정프라자','서울특별시 마포구 독막로 00','1994-11-03',6,1280,'제1종근린생활시설','철근콘크리트조'],['망원하우스','서울특별시 마포구 월드컵로 00','1993-02-18',3,420,'공동주택','조적조'],['상수빌딩','서울특별시 마포구 와우산로 00','2008-07-16',5,820,'제1종근린생활시설','철근콘크리트조'],['성산연립','서울특별시 마포구 성산로 00',null,4,760,'공동주택','조적조'],['공덕주택','서울특별시 마포구 백범로 00','1987-12-20',2,212,'단독주택','벽돌구조'],['신수상가','서울특별시 마포구 토정로 00','1990-05-15',3,560,'제1종근린생활시설','철근콘크리트조']];
  return {version:0,notices:[notice],buildings:entries.map((x,i)=>({id:`b-demo-${i}`,name:x[0],address:x[1],region:'서울특별시 마포구',approvalDate:x[2],floors:x[3],area:x[4],use:x[5],structure:x[6],ownership:'민간',seismic:null,priorSupport:null,ownerName:['김예시','이예시','박예시','최예시','정예시','강예시','조예시','윤예시'][i],phone:'',contactConsent:false,consentSource:'',consentAt:'',demo:true,sourceText:'기능 체험용 가상 건축물대장',createdAt:'2026-10-19T09:30:00+09:00'})),messages:[],activity:[{id:'a-demo',text:'가상 공고 1건과 건축물 8동을 불러왔습니다.',at:'2026-10-19T09:30:00+09:00',type:'import'}]};
}
