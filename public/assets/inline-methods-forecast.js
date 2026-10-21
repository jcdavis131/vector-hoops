/* --- extracted from methods.html (type=module block; import rewritten ./ -> /) (pure move; no behavior change) --- */
/* Forecast lab: the module publishes loadForecast/renderForecast as ES
   exports (it never had a window.HoopsForecast global — the old loader
   called one that doesn't exist, so the exhibit never drew). On any
   failure the research-only note below replaces the endless Loading. */
import { loadForecast, renderForecast } from '/assets/timesfm-forecast.js?v=67ee6481';
const legend = document.getElementById('forecast-lab-legend');
const canvas = document.getElementById('forecast-lab-canvas');
function honestNote(){
  if(canvas) canvas.hidden = true;
  if(legend) legend.textContent = 'The forecast is research-only and isn’t drawn on the site yet — its method and limits are documented on this page.';
}
loadForecast().then(d => {
  if(!d || !d.forecasts || !d.forecasts.length){ honestNote(); return; }
  renderForecast(d);
  const slot = document.getElementById('forecast-lab-slot');
  if(slot && d.metrics){
    slot.innerHTML = '<p class="doc-note">' + d.forecasts.length.toLocaleString('en-US') + ' player forecasts &middot; train MAE ' + d.metrics.mae_train.toFixed(4) + ' vs naive ' + d.metrics.baselines.naive_last.toFixed(4) + ' — train-split metrics, research-only.</p>';
  }
}).catch(honestNote);
