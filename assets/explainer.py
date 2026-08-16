"""
Explainer — zero-deps Python stdlib — Kernel SHAP + LIME tabular + narrative
LCG 20260813→189831298 idx3820 triple[11205,19448,14209] same-link-same-stars
No pip shap/lime — pure stdlib math + random
Usage: from explainer import explain_prediction
"""
import math, random, datetime, json

RAND_A=1103515245
RAND_C=12345
_R=20260813 ^ 189831298

def _rnd():
    global _R
    _R = (_R*1103515245+12345) & 0x7fffffff
    return (_R+1)/2147483648.0

def randn():
    # Box-Muller
    u = 0.0
    while u==0:
        u=_rnd()
    v=0.0
    while v==0:
        v=_rnd()
    return math.sqrt(-2*math.log(u))*math.cos(2*math.pi*v)

def comb(n,k):
    if k<0 or k>n:
        return 0
    if k>n-k:
        k=n-k
    c=1.0
    for i in range(1,k+1):
        c=c*(n-k+i)/i
        if not math.isfinite(c):
            return 1e12
    return c

def shap_kernel(s,M):
    if s==0 or s==M:
        return 1000.0
    cv=comb(M,s)
    if cv==0:
        return 1.0
    return (M-1)/(cv * s * (M-s))

def weighted_leastsq(X,y,w,ridge=1e-6):
    N=len(X)
    D=len(X[0])
    A=[[0.0]*D for _ in range(D)]
    b=[0.0]*D
    for i in range(N):
        wi=w[i]
        xi=X[i]
        yi=y[i]
        for a in range(D):
            b[a]+=wi*xi[a]*yi
            for bb in range(D):
                A[a][bb]+=wi*xi[a]*xi[bb]
    if ridge:
        for d in range(D):
            A[d][d]+=ridge
    # augment
    Mmat=[row[:] + [bv] for row,bv in zip(A,b)]
    for col in range(D):
        prow=col
        for r in range(col,D):
            if abs(Mmat[r][col])>abs(Mmat[prow][col]):
                prow=r
        if abs(Mmat[prow][col])<1e-12:
            continue
        if prow!=col:
            Mmat[prow],Mmat[col]=Mmat[col],Mmat[prow]
        piv=Mmat[col][col]
        for j in range(col,D+1):
            Mmat[col][j]/=piv
        for r in range(D):
            if r==col:
                continue
            fac=Mmat[r][col]
            if abs(fac)<1e-12:
                continue
            for j in range(col,D+1):
                Mmat[r][j]-=fac*Mmat[col][j]
    return [r[D] for r in Mmat]

def explain_prediction(x, feature_names, predict_fn=None, baseline=None, opts=None):
    opts=opts or {}
    M=len(x)
    names=feature_names if feature_names and len(feature_names)==M else [f"f{i}" for i in range(M)]
    base = baseline if baseline and len(baseline)==M else [0.0]*M
    num_shap=min(opts.get("numShap", max(64,2*M+24)),160)
    num_lime=min(opts.get("numLime",96),256)
    kw=opts.get("kernelWidth", math.sqrt(M)*0.75)
    sigma=opts.get("sigma",1.0)
    domain=opts.get("domain","generic")

    def pred_wrapper(vec):
        if predict_fn:
            return predict_fn(vec)
        # linear fallback avg
        return sum(vec)/M

    pred=pred_wrapper(x)
    f_base=pred_wrapper(base)

    Xsh=[]; ysh=[]; wsh=[]
    for k in range(num_shap):
        if k==0:
            mask=[0]*M
        elif k==1:
            mask=[1]*M
        else:
            # random size
            if _rnd()<0.22:
                sz=1 if _rnd()<0.5 else M-1
            else:
                sz=int(1+_rnd()*(M-1))
                if sz<1: sz=1
                if sz>=M: sz=M-1
            mask=[0]*M
            idxs=list(range(M))
            # partial shuffle
            for i in range(sz):
                j=i+int(_rnd()*(M-i))
                idxs[i],idxs[j]=idxs[j],idxs[i]
                mask[idxs[i]]=1
            if sum(mask)!=sz:
                # fallback ensure — mask already sized, but ensure not empty
                pass
        sz=sum(mask)
        w=shap_kernel(sz,M)
        z=[ x[i] if mask[i] else base[i] for i in range(M) ]
        y=pred_wrapper(z)
        row=[1]+mask
        Xsh.append(row); ysh.append(y); wsh.append(w)

    beta_sh=weighted_leastsq(Xsh,ysh,wsh,ridge=1e-6)
    intercept=beta_sh[0]
    shap_arr=beta_sh[1:]
    sum_shap=sum(shap_arr)
    exp_full=intercept+sum_shap
    fidelity=abs(pred-exp_full)/(abs(pred)+1e-6)

    # LIME
    Xli=[]; yli=[]; wli=[]
    for i in range(num_lime):
        z=[ x[j]+randn()*sigma*0.35 for j in range(M) ]
        d2=sum((z[j]-x[j])**2 for j in range(M))
        w=math.sqrt(math.exp(-d2/(kw*kw)))
        y=pred_wrapper(z)
        Xli.append([1]+z); yli.append(y); wli.append(w)

    beta_lime=weighted_leastsq(Xli,yli,wli,ridge=1.0)
    lime_intercept=beta_lime[0]
    lime_coefs=beta_lime[1:]

    shap={names[i]:shap_arr[i] for i in range(M)}
    lime={names[i]:lime_coefs[i] for i in range(M)}

    # narrative
    def topk(vals,k=3):
        iv=sorted([(abs(vals[i]),i,vals[i]) for i in range(M)], reverse=True)[:k]
        return [{"name":names[i],"val":v,"abs":a,"idx":i} for a,i,v in iv]

    tops=topk(shap_arr,3)
    lime_tops=topk(lime_coefs,3)
    def fmt(v): return f"+{v:.2f}" if v>=0 else f"{v:.2f}"
    shap_str=", ".join([f"{t['name']} (SHAP {fmt(t['val'])})" for t in tops])
    delta=pred-f_base
    lime_check = f"LIME locally {lime_tops[0]['name']} {'pushes up' if lime_tops[0]['val']>=0 else 'pulls down'} ({fmt(lime_tops[0]['val'])})" if lime_tops else ""
    pov={
        "owner": f"Ownership: projects {fmt(delta)} vs baseline because {shap_str}.",
        "player": f"Fit: {lime_check} — secondary {tops[1]['name'] if len(tops)>1 else 'stable'} {fmt(tops[1]['val']) if len(tops)>1 else ''} situational.",
        "brand": f"Story: headline driver {tops[0]['name'] if tops else 'unknown'} ({fmt(tops[0]['val']) if tops else '0'}) lifts brand when {lime_tops[0]['name'] if lime_tops else 'context'} aligns.",
        "dfs": f"DFS: exploitable if {tops[0]['name'] if tops else 'top'} {'remains mispriced' if tops and tops[0]['val']>0 else 'faded'} — SHAP sum {fmt(sum_shap)} → pred {pred:.2f} vs base {f_base:.2f}."
    }
    generic=f"This pick projects {fmt(delta)} vs baseline ({f_base:.2f}→{pred:.2f}) because {shap_str}. {lime_check}. {pov['owner']}"

    return {
        "prediction": pred,
        "baseline": {"value": f_base, "vector": base},
        "shap_values": shap,
        "shap_array": shap_arr,
        "lime_values": lime,
        "lime_array": lime_coefs,
        "intercept_shap": intercept,
        "intercept_lime": lime_intercept,
        "fidelity": {"shap_additive_error": abs(pred-exp_full), "shap_relative": fidelity, "sum_shap": sum_shap, "expected": exp_full},
        "stability": {"numShap": num_shap, "numLime": num_lime, "kernelWidth": kw},
        "feature_names": names,
        "narrative": {"owner":pov["owner"],"player":pov["player"],"brand":pov["brand"],"dfs":pov["dfs"],"generic":generic,"tops":tops,"limeTops":lime_tops,"delta":delta},
        "meta": {"M":M,"domain":domain,"timestamp": datetime.datetime.utcnow().isoformat()+"Z","lcg":"20260813→189831298 idx3820 triple[11205,19448,14209]"}
    }

if __name__=="__main__":
    # smoke test
    x=[1,2,3]
    fn=lambda v: v[0]*0.5+v[1]*1.2-v[2]*0.3
    print(json.dumps(explain_prediction(x,["a","b","c"],fn,baseline=[0,0,0],opts={"domain":"hoops"}), indent=2))
