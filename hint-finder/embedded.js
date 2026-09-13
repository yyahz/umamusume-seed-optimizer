// Only coordinate keyboard focus with the fixed toolbox parent; never transfer search data.
(() => {
 const notify=type=>parent.postMessage({type},'https://game.bilibili.com');
 document.addEventListener('keydown',event=>{
  const dialog=document.querySelector('dialog[open]');
  const options=document.querySelector('#skill-options');
  if(event.key==='Escape'){
   if(dialog || (options && !options.hidden))return;
   notify('uma-hints-close');
  }
  if(event.key==='Tab' && !dialog){
   const targets=[...document.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);
   if(event.shiftKey && document.activeElement===targets[0]){event.preventDefault();notify('uma-hints-focus-tab');}
   else if(!event.shiftKey && document.activeElement===targets.at(-1)){event.preventDefault();notify('uma-hints-focus-close');}
  }
 },true);
})();
