/* assets/audio.js — VH Audio: zero-dependency WebAudio synth SFX.
   No audio files, no libraries: every sound is synthesized with
   oscillators + filtered noise, so the game stays fully offline-capable.
   Contract:
     VHAudio.play(name)   — 'click' 'guess' 'correct' 'wrong' 'win' 'streak' 'reveal' 'tick'
     VHAudio.toggleMuted() -> muted:boolean   (persisted to localStorage)
     VHAudio.isMuted() / VHAudio.setMuted(bool)
     VHAudio.unlock()     — resume AudioContext inside a user gesture
   Mobile: the context is created/resumed on the first pointerdown/keydown
   and on every play(), so iOS/Safari autoplay policies are satisfied. */
(function(){
  'use strict';
  var KEY='vh.audio.muted';
  var ctx=null, master=null, muted=false;
  try{ muted = localStorage.getItem(KEY)==='1'; }catch(e){}

  function ensure(){
    try{
      if(!ctx){
        var AC = window.AudioContext || window.webkitAudioContext;
        if(!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.16;           // subtle by design — game feel, not jingles
        master.connect(ctx.destination);
      }
      if(ctx.state==='suspended'){ ctx.resume().catch(function(){}); }
      return true;
    }catch(e){ return false; }
  }

  function tone(o){
    if(muted || !ensure()) return;
    try{
      var t0 = ctx.currentTime + (o.t||0);
      var osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = o.type||'sine';
      osc.frequency.setValueAtTime(o.f, t0);
      if(o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30,o.slide), t0+o.d);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.9*(o.v==null?1:o.v), t0+0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0+o.d);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0+o.d+0.05);
    }catch(e){}
  }

  function noise(o){
    if(muted || !ensure()) return;
    try{
      var t0 = ctx.currentTime + (o.t||0);
      var len = Math.max(1, (o.d*ctx.sampleRate)|0);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var ch = buf.getChannelData(0);
      for(var i=0;i<len;i++) ch[i]=(Math.random()*2-1)*(1-i/len);
      var src = ctx.createBufferSource(); src.buffer=buf;
      var flt = ctx.createBiquadFilter(); flt.type='lowpass'; flt.frequency.value=o.fc||1200;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.7*(o.v==null?0.5:o.v), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0+o.d);
      src.connect(flt); flt.connect(g); g.connect(master);
      src.start(t0); src.stop(t0+o.d+0.05);
    }catch(e){}
  }

  var SFX = {
    click:  function(){ tone({f:660, d:0.055, type:'triangle', v:0.45}); },
    tick:   function(){ tone({f:440, d:0.04,  type:'square',   v:0.22}); },
    guess:  function(){ tone({f:520, d:0.09, type:'triangle', v:0.65});
                        tone({f:780, t:0.07, d:0.08, type:'triangle', v:0.45}); },
    correct:function(){ tone({f:660, d:0.10, type:'sine', v:0.8});
                        tone({f:990, t:0.09, d:0.16, type:'sine', v:0.8}); },
    wrong:  function(){ tone({f:220, d:0.16, type:'sine', v:0.55, slide:150}); },
    reveal: function(){ tone({f:392, d:0.22, type:'sine', v:0.5, slide:523}); },
    streak: function(){ tone({f:880, d:0.12, type:'sine', v:0.65});
                        tone({f:1174.66, t:0.10, d:0.22, type:'sine', v:0.65}); },
    win:    function(){ var seq=[523.25,659.25,783.99,1046.5], i;
                        for(i=0;i<seq.length;i++) tone({f:seq[i], t:i*0.11, d:0.24, type:'triangle', v:0.8});
                        noise({t:0.42, d:0.3, v:0.28, fc:7000}); }
  };

  function unlock(){ ensure(); }
  var once=function(){ unlock();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once, {passive:true});
  window.addEventListener('keydown', once);

  window.VHAudio = {
    play: function(name){ try{ if(SFX[name]) SFX[name](); }catch(e){} },
    unlock: unlock,
    isMuted: function(){ return muted; },
    setMuted: function(m){ muted=!!m; try{ localStorage.setItem(KEY, muted?'1':'0'); }catch(e){} },
    toggleMuted: function(){ this.setMuted(!muted); return muted; }
  };
})();
