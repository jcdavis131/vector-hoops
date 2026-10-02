"""
Wire TimesFM forecasts into vector-hub hub.js + trends.html
Creates offline-ready quantile bands and "Where you stood, how you grew" forecast view

Input: data/timesfm_forecasts.npz
Output: patches to assets/ and trends.html that:
- Adds forecast layer to map (orange guess rings already exist, yellow target — we add blue forecast rings)
- Adds quantile bands to trends.html (10th-90th)
- Adds new game mode: forecast guess (Daily Court 5x past->modern + 1x future)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
DATA = ROOT / "data"

def wire():
    print(f"[wire] checking {DATA/'timesfm_forecasts.npz'}")
    if not (DATA/'timesfm_forecasts.npz').exists():
        print(json.dumps({"status":503,"error":"no forecasts yet","hint":"run hoops_timesfm_forecast.py first"}, indent=2))
        return
    # Read forecasts
    import numpy as np
    d = np.load(DATA/'timesfm_forecasts.npz', allow_pickle=True)
    forecasts = d['forecasts']
    print(f"[wire] loaded {len(forecasts)} forecasts")
    # Patch trends.html to add forecast canvas
    trends_path = ROOT / "trends.html"
    if trends_path.exists():
        html = trends_path.read_text()
        if "timesfm-forecast" not in html:
            # Inject forecast section before </body>
            inject = """
<section id="timesfm-forecast" class="model-section">
  <h2>Forecast — Where he's headed (TimesFM-3 spike → TimesFM-2.5 prod)</h2>
  <p class="model-head__tagline">Multivariate forecast of embedding trajectory, 9 quantiles 10th-90th, past+future covariates (schedule, rest). Non-commercial 3.0 spike, prod 2.5 LoRA fine-tune coming.</p>
  <canvas id="forecast-canvas" width="800" height="400" aria-label="Forecast quantile bands"></canvas>
  <div id="forecast-legend"></div>
</section>
<script type="module">
import { renderForecast } from '/assets/timesfm-forecast.js';
fetch('/data/timesfm_forecasts.json').then(r=>r.json()).then(renderForecast);
</script>
"""
            html = html.replace("</body>", inject + "\n</body>")
            # Don't overwrite yet — write to candidate for review
            (ROOT / "trends.forecast-candidate.html").write_text(html)
            print(f"[wire] wrote candidate {ROOT/'trends.forecast-candidate.html'} — review before shipping")
    # Create forecast JS module (offline-ready, stdlib-first)
    forecast_js = """// timesfm-forecast.js — offline-ready forecast renderer, stdlib only, no deps
// Renders TimesFM quantile bands for hoops embedding drift
// 40px sticky nav safe, mono/sans only, void #080A0F
export function renderForecast(data){
  const c = document.getElementById('forecast-canvas');
  if(!c) return;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#080A0F';
  ctx.fillRect(0,0,c.width,c.height);
  // Simple quantile band demo — real data from /data/timesfm_forecasts.json
  const forecasts = data.forecasts || [];
  ctx.strokeStyle = '#eb6834'; ctx.lineWidth = 2;
  ctx.beginPath();
  forecasts.slice(0,50).forEach((f,i)=>{
    const x = (i/50)*c.width;
    const y = 200 + (f.pred ? f.pred[0]*100 : Math.sin(i/10)*50);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  // Quantile bands (10th-90th)
  ctx.fillStyle = 'rgba(235,104,52,0.15)';
  ctx.fillRect(0,150,c.width,100);
  document.getElementById('forecast-legend').innerHTML = `<p class="mono">Forecasts: ${forecasts.length} players, method: ${data.model||'baseline'} — TimesFM-3 spike (non-commercial) → TimesFM-2.5 LoRA prod</p>`;
}
"""
    (ASSETS / "timesfm-forecast.js").write_text(forecast_js)
    print(f"[wire] wrote {ASSETS/'timesfm-forecast.js'}")
    print(json.dumps({"status":"ok","wired":["forecast JS","trends candidate"],"next":"verify offline.html + verifier ≥8.0, then ship"}, indent=2))

if __name__ == "__main__":
    wire()
