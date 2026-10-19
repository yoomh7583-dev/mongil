// Imported only by the integration test's child process. No external request occurs.
globalThis.fetch=async url=>{
  if(String(url).startsWith('https://api.solapi.com/'))return new Response(JSON.stringify({groupInfo:{groupId:'test-group-id'}}),{status:200,headers:{'Content-Type':'application/json'}});
  throw new Error('Unexpected external request in integration test');
};
