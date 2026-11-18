/* An open tab keeps its old scripts until navigation. Offer a saved, explicit update. */
const UpdateNotice=(()=>{
  let checking=false,available='',applying=false;
  const scriptVersion=doc=>doc.querySelector('script[src^="ui.js?v="]')?.getAttribute('src').split('?v=')[1]||'';
  const newer=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0);}return false;};
  function show(){
    let node=document.getElementById('updateNotice');
    if(!node){node=document.createElement('aside');node.id='updateNotice';node.setAttribute('aria-label','게임 업데이트');node.innerHTML='<span>새 버전이 있습니다</span><button data-apply-update>저장 후 적용</button>';document.body.append(node);}
  }
  async function check(){
    if(checking||document.hidden||location.protocol==='file:')return;
    checking=true;
    try{
      const response=await fetch(new URL('index.html',location.href),{cache:'no-store'});
      if(!response.ok)return;
      const remote=scriptVersion(new DOMParser().parseFromString(await response.text(),'text/html'));
      if(remote&&newer(remote,scriptVersion(document))){available=remote;show();}
    }catch{}finally{checking=false;}
  }
  async function apply(){
    if(applying||!available||!ready||storageError||restarting)return;
    applying=true;HuntWatch.stop('업데이트 준비');
    try{
      await flush();
      if(storageError)return;
      restarting=true;const target=new URL(location.href);target.searchParams.set('v',available);location.replace(target.href);
    }finally{applying=false;}
  }
  document.addEventListener('click',event=>{if(!event.target.closest('[data-apply-update]'))return;event.preventDefault();event.stopImmediatePropagation();apply();},true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  setTimeout(check,5000);setInterval(check,60000);
  return {check,version:()=>scriptVersion(document)};
})();
