// /api/team-locks — free-tier global counter for rivalry board, no DB yet, returns seeded distribution blended with optional write

// in-memory fallback for serverless - will reset, but gives growthy feel
// Persist via Upstash/KV later if needed

let MEMORY = {
  LAL: 234, GSW: 198, NYK: 176, CHI: 165, BOS: 154, MIA: 132, LAC: 98, PHI: 87, DAL: 76, MIL: 65, DEN: 54, PHX: 43, ATL: 32, SAS: 28, OKC: 26, MIN: 22, CLE: 20, SAC: 18, IND: 15, MEM: 12
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method === 'POST') {
    try {
      const abbr = (req.body && req.body.abbr && String(req.body.abbr).toUpperCase().slice(0,3)) || (req.query && req.query.abbr && String(req.query.abbr).toUpperCase().slice(0,3));
      if (abbr && /^[A-Z]{3}$/.test(abbr)) {
        MEMORY[abbr] = (MEMORY[abbr]||0)+1;
      }
    } catch(e){}
    // fallthrough to GET response
  }
  // Add slight jitter to feel live
  const jittered = {};
  Object.keys(MEMORY).forEach(k=>{
    const base = MEMORY[k];
    const jitter = Math.floor((Math.random()*0.12 - 0.06)*base); // +-6%
    jittered[k] = Math.max(0, base + jitter);
  });
  // sort handled client, but return object
  return res.status(200).json(jittered);
};
