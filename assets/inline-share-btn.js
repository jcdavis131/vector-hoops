/* #vh-share-btn wiring, shared by taxonomy and playoff-runs (players has its own binder). Every path reports
   what actually happened: "Shared" after a real share, "Link copied" only after a real copy, "Copy failed"
   on genuine failure. One binding: the earlier file carried two and playoff-runs fired twice. */
(function(){var b=document.getElementById('vh-share-btn');if(!b)return;
function say(msg){b.textContent=msg;setTimeout(function(){b.textContent='Share';},1600);}
function legacyCopy(url){var ta=document.createElement('textarea');ta.value=url;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();var ok=false;try{ok=document.execCommand('copy');}catch(e){}ta.remove();return ok;}
b.addEventListener('click',function(){var url=location.href;var title=document.title;
if(navigator.share){navigator.share({title:title,url:url}).then(function(){say('Shared');},function(){});return;}
function copied(ok){say(ok?'Link copied':'Copy failed');}
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(function(){copied(true);},function(){copied(legacyCopy(url));});}
else{copied(legacyCopy(url));}});})();
