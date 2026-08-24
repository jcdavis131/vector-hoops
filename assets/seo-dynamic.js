/* seo-dynamic.js — dynamic per-team meta + OG for viral share (free tier, client-side)
 * Updates title, OG, description when team locked for better share previews
 * Also injects JSON-LD for puzzle — v6 Guess main + Chimera HARD
 */
(function(){
  function updateForTeam(abbr, city){
    if(!abbr) return;
    try{
      var newTitle = abbr + ' Universe — Vector Hoops · 12,966 seasons as sky';
      document.title = newTitle;
      var desc = (city||abbr) + ' fans locked — ' + abbr + ' universe lights up: 12,966 NBA seasons as embedding sky, 8 archetypes, daily Guess The Player + Chimera HARD. Free, no account.';
      var metaDesc = document.querySelector('meta[name="description"]');
      if(metaDesc) metaDesc.setAttribute('content', desc);
      var ogt = document.querySelector('meta[property="og:title"]');
      if(ogt) ogt.setAttribute('content', newTitle);
      var ogd = document.querySelector('meta[property="og:description"]');
      if(ogd) ogd.setAttribute('content', desc);
      var ogu = document.querySelector('meta[property="og:url"]');
      if(ogu) ogu.setAttribute('content', 'https://hoops.dumbmodel.com/?team='+abbr+'&utm_source=share');
      var can = document.querySelector('link[rel="canonical"]');
      if(can) can.setAttribute('href', 'https://hoops.dumbmodel.com/?team='+abbr);
    }catch(e){}
  }
  function init(){
    window.addEventListener('vh:favorite-team', function(e){
      var abbr = e.detail && e.detail.abbr;
      var city = null;
      try{
        var map = {ATL:'Atlanta',BOS:'Boston',BRK:'Brooklyn',CHI:'Chicago',CHO:'Charlotte',CLE:'Cleveland',DAL:'Dallas',DEN:'Denver',DET:'Detroit',GSW:'Golden State',HOU:'Houston',IND:'Indiana',LAC:'LA Clippers',LAL:'LA Lakers',MEM:'Memphis',MIA:'Miami',MIL:'Milwaukee',MIN:'Minnesota',NOP:'New Orleans',NYK:'New York',OKC:'Oklahoma City',ORL:'Orlando',PHI:'Philadelphia',PHX:'Phoenix',POR:'Portland',SAC:'Sacramento',SAS:'San Antonio',TOR:'Toronto',UTA:'Utah',WAS:'Washington'};
        city = map[abbr] || abbr;
      }catch(e){}
      updateForTeam(abbr, city);
    });
    try{
      var ld = {
        "@context":"https://schema.org",
        "@type":"VideoGame",
        "name":"Vector Hoops",
        "url":"https://hoops.dumbmodel.com",
        "description":"12,966 NBA seasons as embedding universe — daily Guess The Player main plus Chimera HARD plus 8 game modes, leakfree MTNN model, free no account",
        "genre":["Puzzle","Sports","Strategy"],
        "gamePlatform":["Web","PWA"],
        "isAccessibleForFree":true,
        "inLanguage":"en",
        "numberOfPlayers":"1-"
      };
      var s = document.createElement('script');
      s.type='application/ld+json';
      s.textContent=JSON.stringify(ld);
      document.head.appendChild(s);
    }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
