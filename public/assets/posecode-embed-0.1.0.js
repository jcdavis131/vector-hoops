"use strict";var Posecode=(()=>{var Ic=Object.defineProperty;var Uf=Object.getOwnPropertyDescriptor;var Of=Object.getOwnPropertyNames;var Ff=Object.prototype.hasOwnProperty;var lt=(i,e)=>()=>(i&&(e=i(i=0)),e);var Lc=(i,e)=>{for(var t in e)Ic(i,t,{get:e[t],enumerable:!0})},Bf=(i,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let s of Of(e))!Ff.call(i,s)&&s!==t&&Ic(i,s,{get:()=>e[s],enumerable:!(n=Uf(e,s))||n.enumerable});return i};var kf=i=>Bf(Ic({},"__esModule",{value:!0}),i);function Vf(i){let e=!1;for(let t=0;t<i.length;t++){let n=i[t];if(n==='"'&&(e=!e),!e&&(n==="#"||n==="/"&&i[t+1]==="/"))return i.slice(0,t)}return i}function Hf(i,e){let t=[],n=i;for(;n.length>0;){let s=!1;for(let r of zf){let a=r.re.exec(n);if(a){if(s=!0,n=n.slice(a[0].length),r.type==="skip")break;t.push({type:r.type,value:a[1]??a[0]});break}}if(!s)throw new Zs(e,`unexpected character: "${n[0]}"`)}return t}function Nh(i){let e=[],t=i.split(/\r?\n/);for(let n=0;n<t.length;n++){let s=t[n],r=Vf(s);if(r.trim().length===0)continue;let a=r.length-r.trimStart().length,o=Hf(r.trimStart(),n+1);o.length>0&&e.push({line:n+1,indent:a,tokens:o})}return e}var zf,Zs,Uh=lt(()=>{"use strict";zf=[{type:"skip",re:/^\s+/},{type:"str",re:/^"([^"]*)"/},{type:"dur",re:/^(\d+(?:\.\d+)?s)\b/},{type:"num",re:/^(-?\d+(?:\.\d+)?)/},{type:"word",re:/^([A-Za-z_][A-Za-z0-9_-]*)/},{type:"colon",re:/^(:)/},{type:"comma",re:/^(,)/},{type:"eq",re:/^(=)/}];Zs=class extends Error{constructor(t,n){super(n);this.line=t;this.name="TokenizeError"}}});function bi(i){return i&&i.type==="word"?i.value:null}function Oh(i){let e=[],t;try{t=Nh(i)}catch(o){if(o instanceof Zs)return{ast:null,errors:[{line:o.line,message:o.message}]};throw o}if(t.length===0)return{ast:null,errors:[{line:1,message:"empty document"}]};let n=t[0],s=n.tokens;if(bi(s[0])!=="posecode"||s[1]?.type!=="word"||s[2]?.type!=="str")return{ast:null,errors:[{line:n.line,message:'document must start with a `posecode <kind> "<name>"` header'}]};let r={kind:s[1].value,name:s[2].value,rig:"humanoid",props:[],repeat:1,steps:[]},a=null;for(let o=1;o<t.length;o++){let c=t[o],l=bi(c.tokens[0]),h=c.tokens;switch(l){case"rig":{let u=bi(h[1]);u?r.rig=u:e.push({line:c.line,message:"rig requires a name"});break}case"prop":{let u=bi(h[1]);u?r.props.push(u):e.push({line:c.line,message:"prop requires a type"});break}case"pose":{let u=h.length>0?h[h.length-1]:void 0;bi(h[1])==="start"&&u&&u.type==="word"?r.startPose=u.value:e.push({line:c.line,message:"expected `pose start = <name>`"});break}case"repeat":{h[1]?.type==="num"?r.repeat=Math.max(1,Math.round(Number(h[1].value))):e.push({line:c.line,message:"repeat requires a count"});break}case"step":{let u=h[1],d=h[2],p=bi(h[3]),g=h[4];if(u?.type!=="str"||d?.type!=="dur"||!p||g?.type!=="colon"){e.push({line:c.line,message:'expected `step "<name>" <duration> <easing>:`'}),a=null;break}a={name:u.value,durationSec:Gf(d.value),easing:p,targets:[],groundLock:[],reaches:[],pins:[],line:c.line},r.steps.push(a);break}default:{let u=Wf(c,a);u&&e.push(u)}}}return{ast:r,errors:e}}function Gf(i){return parseFloat(i.replace(/s$/,""))}function Wf(i,e){let t=i.tokens,n=bi(t[0]);if(n==="cue")return e?t[1]?.type!=="str"?{line:i.line,message:"`cue` requires a quoted string"}:(e.cue=t[1].value,null):{line:i.line,message:"`cue` outside of a step"};if(n==="ground-lock"){if(!e)return{line:i.line,message:"`ground-lock` outside of a step"};let r=t.slice(1).filter(a=>a.type==="word").map(a=>a.value);return e.groundLock=r,null}if(n==="reach"){if(!e)return{line:i.line,message:"`reach` outside of a step"};let r=t[2]?.type==="word"?t[2].value:null,a=t[3]?.type==="word"?t[3].value:null;return t[1]?.type!=="colon"||!r||!a?{line:i.line,message:"expected `reach: <effector> <target>`"}:(e.reaches.push({effector:r,target:a,line:i.line}),null)}if(n==="pin"){if(!e)return{line:i.line,message:"`pin` outside of a step"};let r=t[2]?.type==="word"?t[2].value:null,a=t[3]?.type==="word"?t[3].value:null;return t[1]?.type!=="colon"||!r||!a?{line:i.line,message:"expected `pin: <effector> <anchor>`"}:(e.pins.push({effector:r,anchor:a,line:i.line}),null)}if(n==="turn")return e?t[1]?.type!=="colon"||t[2]?.type!=="num"?{line:i.line,message:"expected `turn: <degrees>`"}:(e.turn=Number(t[2].value),null):{line:i.line,message:"`turn` outside of a step"};if(n==="travel")return e?t[1]?.type!=="colon"||t[2]?.type!=="num"||t[3]?.type!=="num"?{line:i.line,message:"expected `travel: <x> <z>`"}:(e.travel={x:Number(t[2].value),z:Number(t[3].value)},null):{line:i.line,message:"`travel` outside of a step"};if(!e)return{line:i.line,message:"joint target outside of a step"};if(n===null||t[1]?.type!=="colon"||t[2]?.type!=="word")return{line:i.line,message:"expected `<joint>: <action> [<degrees>]`"};let s=t[3];return e.targets.push({joint:n,action:t[2].value,degrees:s&&s.type==="num"?Number(s.value):null,line:i.line}),null}var Fh=lt(()=>{"use strict";Uh()});var je,Dc,ue,bn,$s=lt(()=>{(function(i){i.assertEqual=s=>{};function e(s){}i.assertIs=e;function t(s){throw new Error}i.assertNever=t,i.arrayToEnum=s=>{let r={};for(let a of s)r[a]=a;return r},i.getValidEnumValues=s=>{let r=i.objectKeys(s).filter(o=>typeof s[s[o]]!="number"),a={};for(let o of r)a[o]=s[o];return i.objectValues(a)},i.objectValues=s=>i.objectKeys(s).map(function(r){return s[r]}),i.objectKeys=typeof Object.keys=="function"?s=>Object.keys(s):s=>{let r=[];for(let a in s)Object.prototype.hasOwnProperty.call(s,a)&&r.push(a);return r},i.find=(s,r)=>{for(let a of s)if(r(a))return a},i.isInteger=typeof Number.isInteger=="function"?s=>Number.isInteger(s):s=>typeof s=="number"&&Number.isFinite(s)&&Math.floor(s)===s;function n(s,r=" | "){return s.map(a=>typeof a=="string"?`'${a}'`:a).join(r)}i.joinValues=n,i.jsonStringifyReplacer=(s,r)=>typeof r=="bigint"?r.toString():r})(je||(je={}));(function(i){i.mergeShapes=(e,t)=>({...e,...t})})(Dc||(Dc={}));ue=je.arrayToEnum(["string","nan","number","integer","float","boolean","date","bigint","symbol","function","undefined","null","array","object","unknown","promise","void","never","map","set"]),bn=i=>{switch(typeof i){case"undefined":return ue.undefined;case"string":return ue.string;case"number":return Number.isNaN(i)?ue.nan:ue.number;case"boolean":return ue.boolean;case"function":return ue.function;case"bigint":return ue.bigint;case"symbol":return ue.symbol;case"object":return Array.isArray(i)?ue.array:i===null?ue.null:i.then&&typeof i.then=="function"&&i.catch&&typeof i.catch=="function"?ue.promise:typeof Map<"u"&&i instanceof Map?ue.map:typeof Set<"u"&&i instanceof Set?ue.set:typeof Date<"u"&&i instanceof Date?ue.date:ue.object;default:return ue.unknown}}});var J,Xf,Wt,ta=lt(()=>{$s();J=je.arrayToEnum(["invalid_type","invalid_literal","custom","invalid_union","invalid_union_discriminator","invalid_enum_value","unrecognized_keys","invalid_arguments","invalid_return_type","invalid_date","invalid_string","too_small","too_big","invalid_intersection_types","not_multiple_of","not_finite"]),Xf=i=>JSON.stringify(i,null,2).replace(/"([^"]+)":/g,"$1:"),Wt=class i extends Error{get errors(){return this.issues}constructor(e){super(),this.issues=[],this.addIssue=n=>{this.issues=[...this.issues,n]},this.addIssues=(n=[])=>{this.issues=[...this.issues,...n]};let t=new.target.prototype;Object.setPrototypeOf?Object.setPrototypeOf(this,t):this.__proto__=t,this.name="ZodError",this.issues=e}format(e){let t=e||function(r){return r.message},n={_errors:[]},s=r=>{for(let a of r.issues)if(a.code==="invalid_union")a.unionErrors.map(s);else if(a.code==="invalid_return_type")s(a.returnTypeError);else if(a.code==="invalid_arguments")s(a.argumentsError);else if(a.path.length===0)n._errors.push(t(a));else{let o=n,c=0;for(;c<a.path.length;){let l=a.path[c];c===a.path.length-1?(o[l]=o[l]||{_errors:[]},o[l]._errors.push(t(a))):o[l]=o[l]||{_errors:[]},o=o[l],c++}}};return s(this),n}static assert(e){if(!(e instanceof i))throw new Error(`Not a ZodError: ${e}`)}toString(){return this.message}get message(){return JSON.stringify(this.issues,je.jsonStringifyReplacer,2)}get isEmpty(){return this.issues.length===0}flatten(e=t=>t.message){let t={},n=[];for(let s of this.issues)if(s.path.length>0){let r=s.path[0];t[r]=t[r]||[],t[r].push(e(s))}else n.push(e(s));return{formErrors:n,fieldErrors:t}}get formErrors(){return this.flatten()}};Wt.create=i=>new Wt(i)});var qf,On,Nc=lt(()=>{ta();$s();qf=(i,e)=>{let t;switch(i.code){case J.invalid_type:i.received===ue.undefined?t="Required":t=`Expected ${i.expected}, received ${i.received}`;break;case J.invalid_literal:t=`Invalid literal value, expected ${JSON.stringify(i.expected,je.jsonStringifyReplacer)}`;break;case J.unrecognized_keys:t=`Unrecognized key(s) in object: ${je.joinValues(i.keys,", ")}`;break;case J.invalid_union:t="Invalid input";break;case J.invalid_union_discriminator:t=`Invalid discriminator value. Expected ${je.joinValues(i.options)}`;break;case J.invalid_enum_value:t=`Invalid enum value. Expected ${je.joinValues(i.options)}, received '${i.received}'`;break;case J.invalid_arguments:t="Invalid function arguments";break;case J.invalid_return_type:t="Invalid function return type";break;case J.invalid_date:t="Invalid date";break;case J.invalid_string:typeof i.validation=="object"?"includes"in i.validation?(t=`Invalid input: must include "${i.validation.includes}"`,typeof i.validation.position=="number"&&(t=`${t} at one or more positions greater than or equal to ${i.validation.position}`)):"startsWith"in i.validation?t=`Invalid input: must start with "${i.validation.startsWith}"`:"endsWith"in i.validation?t=`Invalid input: must end with "${i.validation.endsWith}"`:je.assertNever(i.validation):i.validation!=="regex"?t=`Invalid ${i.validation}`:t="Invalid";break;case J.too_small:i.type==="array"?t=`Array must contain ${i.exact?"exactly":i.inclusive?"at least":"more than"} ${i.minimum} element(s)`:i.type==="string"?t=`String must contain ${i.exact?"exactly":i.inclusive?"at least":"over"} ${i.minimum} character(s)`:i.type==="number"?t=`Number must be ${i.exact?"exactly equal to ":i.inclusive?"greater than or equal to ":"greater than "}${i.minimum}`:i.type==="bigint"?t=`Number must be ${i.exact?"exactly equal to ":i.inclusive?"greater than or equal to ":"greater than "}${i.minimum}`:i.type==="date"?t=`Date must be ${i.exact?"exactly equal to ":i.inclusive?"greater than or equal to ":"greater than "}${new Date(Number(i.minimum))}`:t="Invalid input";break;case J.too_big:i.type==="array"?t=`Array must contain ${i.exact?"exactly":i.inclusive?"at most":"less than"} ${i.maximum} element(s)`:i.type==="string"?t=`String must contain ${i.exact?"exactly":i.inclusive?"at most":"under"} ${i.maximum} character(s)`:i.type==="number"?t=`Number must be ${i.exact?"exactly":i.inclusive?"less than or equal to":"less than"} ${i.maximum}`:i.type==="bigint"?t=`BigInt must be ${i.exact?"exactly":i.inclusive?"less than or equal to":"less than"} ${i.maximum}`:i.type==="date"?t=`Date must be ${i.exact?"exactly":i.inclusive?"smaller than or equal to":"smaller than"} ${new Date(Number(i.maximum))}`:t="Invalid input";break;case J.custom:t="Invalid input";break;case J.invalid_intersection_types:t="Intersection results could not be merged";break;case J.not_multiple_of:t=`Number must be a multiple of ${i.multipleOf}`;break;case J.not_finite:t="Number must be finite";break;default:t=e.defaultError,je.assertNever(i)}return{message:t}},On=qf});function Yf(i){Bh=i}function us(){return Bh}var Bh,na=lt(()=>{Nc();Bh=On});function ie(i,e){let t=us(),n=js({issueData:e,data:i.data,path:i.path,errorMaps:[i.common.contextualErrorMap,i.schemaErrorMap,t,t===On?void 0:On].filter(s=>!!s)});i.common.issues.push(n)}var js,Zf,Pt,Ce,Si,Dt,ia,sa,Qn,ds,Uc=lt(()=>{na();Nc();js=i=>{let{data:e,path:t,errorMaps:n,issueData:s}=i,r=[...t,...s.path||[]],a={...s,path:r};if(s.message!==void 0)return{...s,path:r,message:s.message};let o="",c=n.filter(l=>!!l).slice().reverse();for(let l of c)o=l(a,{data:e,defaultError:o}).message;return{...s,path:r,message:o}},Zf=[];Pt=class i{constructor(){this.value="valid"}dirty(){this.value==="valid"&&(this.value="dirty")}abort(){this.value!=="aborted"&&(this.value="aborted")}static mergeArray(e,t){let n=[];for(let s of t){if(s.status==="aborted")return Ce;s.status==="dirty"&&e.dirty(),n.push(s.value)}return{status:e.value,value:n}}static async mergeObjectAsync(e,t){let n=[];for(let s of t){let r=await s.key,a=await s.value;n.push({key:r,value:a})}return i.mergeObjectSync(e,n)}static mergeObjectSync(e,t){let n={};for(let s of t){let{key:r,value:a}=s;if(r.status==="aborted"||a.status==="aborted")return Ce;r.status==="dirty"&&e.dirty(),a.status==="dirty"&&e.dirty(),r.value!=="__proto__"&&(typeof a.value<"u"||s.alwaysSet)&&(n[r.value]=a.value)}return{status:e.value,value:n}}},Ce=Object.freeze({status:"aborted"}),Si=i=>({status:"dirty",value:i}),Dt=i=>({status:"valid",value:i}),ia=i=>i.status==="aborted",sa=i=>i.status==="dirty",Qn=i=>i.status==="valid",ds=i=>typeof Promise<"u"&&i instanceof Promise});var kh=lt(()=>{});var Me,zh=lt(()=>{(function(i){i.errToObj=e=>typeof e=="string"?{message:e}:e||{},i.toString=e=>typeof e=="string"?e:e?.message})(Me||(Me={}))});function ze(i){if(!i)return{};let{errorMap:e,invalid_type_error:t,required_error:n,description:s}=i;if(e&&(t||n))throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);return e?{errorMap:e,description:s}:{errorMap:(a,o)=>{let{message:c}=i;return a.code==="invalid_enum_value"?{message:c??o.defaultError}:typeof o.data>"u"?{message:c??n??o.defaultError}:a.code!=="invalid_type"?{message:o.defaultError}:{message:c??t??o.defaultError}},description:s}}function Wh(i){let e="[0-5]\\d";i.precision?e=`${e}\\.\\d{${i.precision}}`:i.precision==null&&(e=`${e}(\\.\\d+)?`);let t=i.precision?"+":"?";return`([01]\\d|2[0-3]):[0-5]\\d(:${e})${t}`}function up(i){return new RegExp(`^${Wh(i)}$`)}function Xh(i){let e=`${Gh}T${Wh(i)}`,t=[];return t.push(i.local?"Z?":"Z"),i.offset&&t.push("([+-]\\d{2}:?\\d{2})"),e=`${e}(${t.join("|")})`,new RegExp(`^${e}$`)}function dp(i,e){return!!((e==="v4"||!e)&&sp.test(i)||(e==="v6"||!e)&&ap.test(i))}function fp(i,e){if(!ep.test(i))return!1;try{let[t]=i.split(".");if(!t)return!1;let n=t.replace(/-/g,"+").replace(/_/g,"/").padEnd(t.length+(4-t.length%4)%4,"="),s=JSON.parse(atob(n));return!(typeof s!="object"||s===null||"typ"in s&&s?.typ!=="JWT"||!s.alg||e&&s.alg!==e)}catch{return!1}}function pp(i,e){return!!((e==="v4"||!e)&&rp.test(i)||(e==="v6"||!e)&&op.test(i))}function mp(i,e){let t=(i.toString().split(".")[1]||"").length,n=(e.toString().split(".")[1]||"").length,s=t>n?t:n,r=Number.parseInt(i.toFixed(s).replace(".","")),a=Number.parseInt(e.toFixed(s).replace(".",""));return r%a/10**s}function fs(i){if(i instanceof Xt){let e={};for(let t in i.shape){let n=i.shape[t];e[t]=sn.create(fs(n))}return new Xt({...i._def,shape:()=>e})}else return i instanceof kn?new kn({...i._def,type:fs(i.element)}):i instanceof sn?sn.create(fs(i.unwrap())):i instanceof En?En.create(fs(i.unwrap())):i instanceof Sn?Sn.create(i.items.map(e=>fs(e))):i}function Fc(i,e){let t=bn(i),n=bn(e);if(i===e)return{valid:!0,data:i};if(t===ue.object&&n===ue.object){let s=je.objectKeys(e),r=je.objectKeys(i).filter(o=>s.indexOf(o)!==-1),a={...i,...e};for(let o of r){let c=Fc(i[o],e[o]);if(!c.valid)return{valid:!1};a[o]=c.data}return{valid:!0,data:a}}else if(t===ue.array&&n===ue.array){if(i.length!==e.length)return{valid:!1};let s=[];for(let r=0;r<i.length;r++){let a=i[r],o=e[r],c=Fc(a,o);if(!c.valid)return{valid:!1};s.push(c.data)}return{valid:!0,data:s}}else return t===ue.date&&n===ue.date&&+i==+e?{valid:!0,data:i}:{valid:!1}}function qh(i,e){return new Ni({values:i,typeName:De.ZodEnum,...ze(e)})}function Hh(i,e){let t=typeof i=="function"?i(e):typeof i=="string"?{message:i}:i;return typeof t=="string"?{message:t}:t}function Yh(i,e={},t){return i?ti.create().superRefine((n,s)=>{let r=i(n);if(r instanceof Promise)return r.then(a=>{if(!a){let o=Hh(e,n),c=o.fatal??t??!0;s.addIssue({code:"custom",...o,fatal:c})}});if(!r){let a=Hh(e,n),o=a.fatal??t??!0;s.addIssue({code:"custom",...a,fatal:o})}}):ti.create()}var rn,Vh,qe,$f,jf,Jf,Kf,Qf,ep,tp,np,ip,Oc,sp,rp,ap,op,cp,lp,Gh,hp,ei,Ei,Ti,wi,Ai,ps,Ri,Ci,ti,Bn,mn,ms,kn,Xt,Pi,Fn,ra,Ii,Sn,aa,gs,_s,oa,Li,Di,Ni,Ui,ni,an,sn,En,Oi,Fi,xs,gp,Js,Ks,Bi,_p,De,xp,Zh,$h,yp,vp,jh,Mp,bp,Sp,Ep,Tp,wp,Ap,Rp,Cp,Pp,Ip,Lp,Dp,Np,Up,Op,Fp,Bp,kp,zp,Vp,Hp,Gp,Wp,Xp,qp,Yp,Zp,$p,jp,Jp,Kp,Qp,em,Jh=lt(()=>{ta();na();zh();Uc();$s();rn=class{constructor(e,t,n,s){this._cachedPath=[],this.parent=e,this.data=t,this._path=n,this._key=s}get path(){return this._cachedPath.length||(Array.isArray(this._key)?this._cachedPath.push(...this._path,...this._key):this._cachedPath.push(...this._path,this._key)),this._cachedPath}},Vh=(i,e)=>{if(Qn(e))return{success:!0,data:e.value};if(!i.common.issues.length)throw new Error("Validation failed but no issues detected.");return{success:!1,get error(){if(this._error)return this._error;let t=new Wt(i.common.issues);return this._error=t,this._error}}};qe=class{get description(){return this._def.description}_getType(e){return bn(e.data)}_getOrReturnCtx(e,t){return t||{common:e.parent.common,data:e.data,parsedType:bn(e.data),schemaErrorMap:this._def.errorMap,path:e.path,parent:e.parent}}_processInputParams(e){return{status:new Pt,ctx:{common:e.parent.common,data:e.data,parsedType:bn(e.data),schemaErrorMap:this._def.errorMap,path:e.path,parent:e.parent}}}_parseSync(e){let t=this._parse(e);if(ds(t))throw new Error("Synchronous parse encountered promise.");return t}_parseAsync(e){let t=this._parse(e);return Promise.resolve(t)}parse(e,t){let n=this.safeParse(e,t);if(n.success)return n.data;throw n.error}safeParse(e,t){let n={common:{issues:[],async:t?.async??!1,contextualErrorMap:t?.errorMap},path:t?.path||[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:bn(e)},s=this._parseSync({data:e,path:n.path,parent:n});return Vh(n,s)}"~validate"(e){let t={common:{issues:[],async:!!this["~standard"].async},path:[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:bn(e)};if(!this["~standard"].async)try{let n=this._parseSync({data:e,path:[],parent:t});return Qn(n)?{value:n.value}:{issues:t.common.issues}}catch(n){n?.message?.toLowerCase()?.includes("encountered")&&(this["~standard"].async=!0),t.common={issues:[],async:!0}}return this._parseAsync({data:e,path:[],parent:t}).then(n=>Qn(n)?{value:n.value}:{issues:t.common.issues})}async parseAsync(e,t){let n=await this.safeParseAsync(e,t);if(n.success)return n.data;throw n.error}async safeParseAsync(e,t){let n={common:{issues:[],contextualErrorMap:t?.errorMap,async:!0},path:t?.path||[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:bn(e)},s=this._parse({data:e,path:n.path,parent:n}),r=await(ds(s)?s:Promise.resolve(s));return Vh(n,r)}refine(e,t){let n=s=>typeof t=="string"||typeof t>"u"?{message:t}:typeof t=="function"?t(s):t;return this._refinement((s,r)=>{let a=e(s),o=()=>r.addIssue({code:J.custom,...n(s)});return typeof Promise<"u"&&a instanceof Promise?a.then(c=>c?!0:(o(),!1)):a?!0:(o(),!1)})}refinement(e,t){return this._refinement((n,s)=>e(n)?!0:(s.addIssue(typeof t=="function"?t(n,s):t),!1))}_refinement(e){return new an({schema:this,typeName:De.ZodEffects,effect:{type:"refinement",refinement:e}})}superRefine(e){return this._refinement(e)}constructor(e){this.spa=this.safeParseAsync,this._def=e,this.parse=this.parse.bind(this),this.safeParse=this.safeParse.bind(this),this.parseAsync=this.parseAsync.bind(this),this.safeParseAsync=this.safeParseAsync.bind(this),this.spa=this.spa.bind(this),this.refine=this.refine.bind(this),this.refinement=this.refinement.bind(this),this.superRefine=this.superRefine.bind(this),this.optional=this.optional.bind(this),this.nullable=this.nullable.bind(this),this.nullish=this.nullish.bind(this),this.array=this.array.bind(this),this.promise=this.promise.bind(this),this.or=this.or.bind(this),this.and=this.and.bind(this),this.transform=this.transform.bind(this),this.brand=this.brand.bind(this),this.default=this.default.bind(this),this.catch=this.catch.bind(this),this.describe=this.describe.bind(this),this.pipe=this.pipe.bind(this),this.readonly=this.readonly.bind(this),this.isNullable=this.isNullable.bind(this),this.isOptional=this.isOptional.bind(this),this["~standard"]={version:1,vendor:"zod",validate:t=>this["~validate"](t)}}optional(){return sn.create(this,this._def)}nullable(){return En.create(this,this._def)}nullish(){return this.nullable().optional()}array(){return kn.create(this)}promise(){return ni.create(this,this._def)}or(e){return Pi.create([this,e],this._def)}and(e){return Ii.create(this,e,this._def)}transform(e){return new an({...ze(this._def),schema:this,typeName:De.ZodEffects,effect:{type:"transform",transform:e}})}default(e){let t=typeof e=="function"?e:()=>e;return new Oi({...ze(this._def),innerType:this,defaultValue:t,typeName:De.ZodDefault})}brand(){return new Js({typeName:De.ZodBranded,type:this,...ze(this._def)})}catch(e){let t=typeof e=="function"?e:()=>e;return new Fi({...ze(this._def),innerType:this,catchValue:t,typeName:De.ZodCatch})}describe(e){let t=this.constructor;return new t({...this._def,description:e})}pipe(e){return Ks.create(this,e)}readonly(){return Bi.create(this)}isOptional(){return this.safeParse(void 0).success}isNullable(){return this.safeParse(null).success}},$f=/^c[^\s-]{8,}$/i,jf=/^[0-9a-z]+$/,Jf=/^[0-9A-HJKMNP-TV-Z]{26}$/i,Kf=/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i,Qf=/^[a-z0-9_-]{21}$/i,ep=/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,tp=/^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/,np=/^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i,ip="^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$",sp=/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,rp=/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,ap=/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/,op=/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,cp=/^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,lp=/^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,Gh="((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))",hp=new RegExp(`^${Gh}$`);ei=class i extends qe{_parse(e){if(this._def.coerce&&(e.data=String(e.data)),this._getType(e)!==ue.string){let r=this._getOrReturnCtx(e);return ie(r,{code:J.invalid_type,expected:ue.string,received:r.parsedType}),Ce}let n=new Pt,s;for(let r of this._def.checks)if(r.kind==="min")e.data.length<r.value&&(s=this._getOrReturnCtx(e,s),ie(s,{code:J.too_small,minimum:r.value,type:"string",inclusive:!0,exact:!1,message:r.message}),n.dirty());else if(r.kind==="max")e.data.length>r.value&&(s=this._getOrReturnCtx(e,s),ie(s,{code:J.too_big,maximum:r.value,type:"string",inclusive:!0,exact:!1,message:r.message}),n.dirty());else if(r.kind==="length"){let a=e.data.length>r.value,o=e.data.length<r.value;(a||o)&&(s=this._getOrReturnCtx(e,s),a?ie(s,{code:J.too_big,maximum:r.value,type:"string",inclusive:!0,exact:!0,message:r.message}):o&&ie(s,{code:J.too_small,minimum:r.value,type:"string",inclusive:!0,exact:!0,message:r.message}),n.dirty())}else if(r.kind==="email")np.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"email",code:J.invalid_string,message:r.message}),n.dirty());else if(r.kind==="emoji")Oc||(Oc=new RegExp(ip,"u")),Oc.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"emoji",code:J.invalid_string,message:r.message}),n.dirty());else if(r.kind==="uuid")Kf.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"uuid",code:J.invalid_string,message:r.message}),n.dirty());else if(r.kind==="nanoid")Qf.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"nanoid",code:J.invalid_string,message:r.message}),n.dirty());else if(r.kind==="cuid")$f.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"cuid",code:J.invalid_string,message:r.message}),n.dirty());else if(r.kind==="cuid2")jf.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"cuid2",code:J.invalid_string,message:r.message}),n.dirty());else if(r.kind==="ulid")Jf.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"ulid",code:J.invalid_string,message:r.message}),n.dirty());else if(r.kind==="url")try{new URL(e.data)}catch{s=this._getOrReturnCtx(e,s),ie(s,{validation:"url",code:J.invalid_string,message:r.message}),n.dirty()}else r.kind==="regex"?(r.regex.lastIndex=0,r.regex.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"regex",code:J.invalid_string,message:r.message}),n.dirty())):r.kind==="trim"?e.data=e.data.trim():r.kind==="includes"?e.data.includes(r.value,r.position)||(s=this._getOrReturnCtx(e,s),ie(s,{code:J.invalid_string,validation:{includes:r.value,position:r.position},message:r.message}),n.dirty()):r.kind==="toLowerCase"?e.data=e.data.toLowerCase():r.kind==="toUpperCase"?e.data=e.data.toUpperCase():r.kind==="startsWith"?e.data.startsWith(r.value)||(s=this._getOrReturnCtx(e,s),ie(s,{code:J.invalid_string,validation:{startsWith:r.value},message:r.message}),n.dirty()):r.kind==="endsWith"?e.data.endsWith(r.value)||(s=this._getOrReturnCtx(e,s),ie(s,{code:J.invalid_string,validation:{endsWith:r.value},message:r.message}),n.dirty()):r.kind==="datetime"?Xh(r).test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{code:J.invalid_string,validation:"datetime",message:r.message}),n.dirty()):r.kind==="date"?hp.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{code:J.invalid_string,validation:"date",message:r.message}),n.dirty()):r.kind==="time"?up(r).test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{code:J.invalid_string,validation:"time",message:r.message}),n.dirty()):r.kind==="duration"?tp.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"duration",code:J.invalid_string,message:r.message}),n.dirty()):r.kind==="ip"?dp(e.data,r.version)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"ip",code:J.invalid_string,message:r.message}),n.dirty()):r.kind==="jwt"?fp(e.data,r.alg)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"jwt",code:J.invalid_string,message:r.message}),n.dirty()):r.kind==="cidr"?pp(e.data,r.version)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"cidr",code:J.invalid_string,message:r.message}),n.dirty()):r.kind==="base64"?cp.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"base64",code:J.invalid_string,message:r.message}),n.dirty()):r.kind==="base64url"?lp.test(e.data)||(s=this._getOrReturnCtx(e,s),ie(s,{validation:"base64url",code:J.invalid_string,message:r.message}),n.dirty()):je.assertNever(r);return{status:n.value,value:e.data}}_regex(e,t,n){return this.refinement(s=>e.test(s),{validation:t,code:J.invalid_string,...Me.errToObj(n)})}_addCheck(e){return new i({...this._def,checks:[...this._def.checks,e]})}email(e){return this._addCheck({kind:"email",...Me.errToObj(e)})}url(e){return this._addCheck({kind:"url",...Me.errToObj(e)})}emoji(e){return this._addCheck({kind:"emoji",...Me.errToObj(e)})}uuid(e){return this._addCheck({kind:"uuid",...Me.errToObj(e)})}nanoid(e){return this._addCheck({kind:"nanoid",...Me.errToObj(e)})}cuid(e){return this._addCheck({kind:"cuid",...Me.errToObj(e)})}cuid2(e){return this._addCheck({kind:"cuid2",...Me.errToObj(e)})}ulid(e){return this._addCheck({kind:"ulid",...Me.errToObj(e)})}base64(e){return this._addCheck({kind:"base64",...Me.errToObj(e)})}base64url(e){return this._addCheck({kind:"base64url",...Me.errToObj(e)})}jwt(e){return this._addCheck({kind:"jwt",...Me.errToObj(e)})}ip(e){return this._addCheck({kind:"ip",...Me.errToObj(e)})}cidr(e){return this._addCheck({kind:"cidr",...Me.errToObj(e)})}datetime(e){return typeof e=="string"?this._addCheck({kind:"datetime",precision:null,offset:!1,local:!1,message:e}):this._addCheck({kind:"datetime",precision:typeof e?.precision>"u"?null:e?.precision,offset:e?.offset??!1,local:e?.local??!1,...Me.errToObj(e?.message)})}date(e){return this._addCheck({kind:"date",message:e})}time(e){return typeof e=="string"?this._addCheck({kind:"time",precision:null,message:e}):this._addCheck({kind:"time",precision:typeof e?.precision>"u"?null:e?.precision,...Me.errToObj(e?.message)})}duration(e){return this._addCheck({kind:"duration",...Me.errToObj(e)})}regex(e,t){return this._addCheck({kind:"regex",regex:e,...Me.errToObj(t)})}includes(e,t){return this._addCheck({kind:"includes",value:e,position:t?.position,...Me.errToObj(t?.message)})}startsWith(e,t){return this._addCheck({kind:"startsWith",value:e,...Me.errToObj(t)})}endsWith(e,t){return this._addCheck({kind:"endsWith",value:e,...Me.errToObj(t)})}min(e,t){return this._addCheck({kind:"min",value:e,...Me.errToObj(t)})}max(e,t){return this._addCheck({kind:"max",value:e,...Me.errToObj(t)})}length(e,t){return this._addCheck({kind:"length",value:e,...Me.errToObj(t)})}nonempty(e){return this.min(1,Me.errToObj(e))}trim(){return new i({...this._def,checks:[...this._def.checks,{kind:"trim"}]})}toLowerCase(){return new i({...this._def,checks:[...this._def.checks,{kind:"toLowerCase"}]})}toUpperCase(){return new i({...this._def,checks:[...this._def.checks,{kind:"toUpperCase"}]})}get isDatetime(){return!!this._def.checks.find(e=>e.kind==="datetime")}get isDate(){return!!this._def.checks.find(e=>e.kind==="date")}get isTime(){return!!this._def.checks.find(e=>e.kind==="time")}get isDuration(){return!!this._def.checks.find(e=>e.kind==="duration")}get isEmail(){return!!this._def.checks.find(e=>e.kind==="email")}get isURL(){return!!this._def.checks.find(e=>e.kind==="url")}get isEmoji(){return!!this._def.checks.find(e=>e.kind==="emoji")}get isUUID(){return!!this._def.checks.find(e=>e.kind==="uuid")}get isNANOID(){return!!this._def.checks.find(e=>e.kind==="nanoid")}get isCUID(){return!!this._def.checks.find(e=>e.kind==="cuid")}get isCUID2(){return!!this._def.checks.find(e=>e.kind==="cuid2")}get isULID(){return!!this._def.checks.find(e=>e.kind==="ulid")}get isIP(){return!!this._def.checks.find(e=>e.kind==="ip")}get isCIDR(){return!!this._def.checks.find(e=>e.kind==="cidr")}get isBase64(){return!!this._def.checks.find(e=>e.kind==="base64")}get isBase64url(){return!!this._def.checks.find(e=>e.kind==="base64url")}get minLength(){let e=null;for(let t of this._def.checks)t.kind==="min"&&(e===null||t.value>e)&&(e=t.value);return e}get maxLength(){let e=null;for(let t of this._def.checks)t.kind==="max"&&(e===null||t.value<e)&&(e=t.value);return e}};ei.create=i=>new ei({checks:[],typeName:De.ZodString,coerce:i?.coerce??!1,...ze(i)});Ei=class i extends qe{constructor(){super(...arguments),this.min=this.gte,this.max=this.lte,this.step=this.multipleOf}_parse(e){if(this._def.coerce&&(e.data=Number(e.data)),this._getType(e)!==ue.number){let r=this._getOrReturnCtx(e);return ie(r,{code:J.invalid_type,expected:ue.number,received:r.parsedType}),Ce}let n,s=new Pt;for(let r of this._def.checks)r.kind==="int"?je.isInteger(e.data)||(n=this._getOrReturnCtx(e,n),ie(n,{code:J.invalid_type,expected:"integer",received:"float",message:r.message}),s.dirty()):r.kind==="min"?(r.inclusive?e.data<r.value:e.data<=r.value)&&(n=this._getOrReturnCtx(e,n),ie(n,{code:J.too_small,minimum:r.value,type:"number",inclusive:r.inclusive,exact:!1,message:r.message}),s.dirty()):r.kind==="max"?(r.inclusive?e.data>r.value:e.data>=r.value)&&(n=this._getOrReturnCtx(e,n),ie(n,{code:J.too_big,maximum:r.value,type:"number",inclusive:r.inclusive,exact:!1,message:r.message}),s.dirty()):r.kind==="multipleOf"?mp(e.data,r.value)!==0&&(n=this._getOrReturnCtx(e,n),ie(n,{code:J.not_multiple_of,multipleOf:r.value,message:r.message}),s.dirty()):r.kind==="finite"?Number.isFinite(e.data)||(n=this._getOrReturnCtx(e,n),ie(n,{code:J.not_finite,message:r.message}),s.dirty()):je.assertNever(r);return{status:s.value,value:e.data}}gte(e,t){return this.setLimit("min",e,!0,Me.toString(t))}gt(e,t){return this.setLimit("min",e,!1,Me.toString(t))}lte(e,t){return this.setLimit("max",e,!0,Me.toString(t))}lt(e,t){return this.setLimit("max",e,!1,Me.toString(t))}setLimit(e,t,n,s){return new i({...this._def,checks:[...this._def.checks,{kind:e,value:t,inclusive:n,message:Me.toString(s)}]})}_addCheck(e){return new i({...this._def,checks:[...this._def.checks,e]})}int(e){return this._addCheck({kind:"int",message:Me.toString(e)})}positive(e){return this._addCheck({kind:"min",value:0,inclusive:!1,message:Me.toString(e)})}negative(e){return this._addCheck({kind:"max",value:0,inclusive:!1,message:Me.toString(e)})}nonpositive(e){return this._addCheck({kind:"max",value:0,inclusive:!0,message:Me.toString(e)})}nonnegative(e){return this._addCheck({kind:"min",value:0,inclusive:!0,message:Me.toString(e)})}multipleOf(e,t){return this._addCheck({kind:"multipleOf",value:e,message:Me.toString(t)})}finite(e){return this._addCheck({kind:"finite",message:Me.toString(e)})}safe(e){return this._addCheck({kind:"min",inclusive:!0,value:Number.MIN_SAFE_INTEGER,message:Me.toString(e)})._addCheck({kind:"max",inclusive:!0,value:Number.MAX_SAFE_INTEGER,message:Me.toString(e)})}get minValue(){let e=null;for(let t of this._def.checks)t.kind==="min"&&(e===null||t.value>e)&&(e=t.value);return e}get maxValue(){let e=null;for(let t of this._def.checks)t.kind==="max"&&(e===null||t.value<e)&&(e=t.value);return e}get isInt(){return!!this._def.checks.find(e=>e.kind==="int"||e.kind==="multipleOf"&&je.isInteger(e.value))}get isFinite(){let e=null,t=null;for(let n of this._def.checks){if(n.kind==="finite"||n.kind==="int"||n.kind==="multipleOf")return!0;n.kind==="min"?(t===null||n.value>t)&&(t=n.value):n.kind==="max"&&(e===null||n.value<e)&&(e=n.value)}return Number.isFinite(t)&&Number.isFinite(e)}};Ei.create=i=>new Ei({checks:[],typeName:De.ZodNumber,coerce:i?.coerce||!1,...ze(i)});Ti=class i extends qe{constructor(){super(...arguments),this.min=this.gte,this.max=this.lte}_parse(e){if(this._def.coerce)try{e.data=BigInt(e.data)}catch{return this._getInvalidInput(e)}if(this._getType(e)!==ue.bigint)return this._getInvalidInput(e);let n,s=new Pt;for(let r of this._def.checks)r.kind==="min"?(r.inclusive?e.data<r.value:e.data<=r.value)&&(n=this._getOrReturnCtx(e,n),ie(n,{code:J.too_small,type:"bigint",minimum:r.value,inclusive:r.inclusive,message:r.message}),s.dirty()):r.kind==="max"?(r.inclusive?e.data>r.value:e.data>=r.value)&&(n=this._getOrReturnCtx(e,n),ie(n,{code:J.too_big,type:"bigint",maximum:r.value,inclusive:r.inclusive,message:r.message}),s.dirty()):r.kind==="multipleOf"?e.data%r.value!==BigInt(0)&&(n=this._getOrReturnCtx(e,n),ie(n,{code:J.not_multiple_of,multipleOf:r.value,message:r.message}),s.dirty()):je.assertNever(r);return{status:s.value,value:e.data}}_getInvalidInput(e){let t=this._getOrReturnCtx(e);return ie(t,{code:J.invalid_type,expected:ue.bigint,received:t.parsedType}),Ce}gte(e,t){return this.setLimit("min",e,!0,Me.toString(t))}gt(e,t){return this.setLimit("min",e,!1,Me.toString(t))}lte(e,t){return this.setLimit("max",e,!0,Me.toString(t))}lt(e,t){return this.setLimit("max",e,!1,Me.toString(t))}setLimit(e,t,n,s){return new i({...this._def,checks:[...this._def.checks,{kind:e,value:t,inclusive:n,message:Me.toString(s)}]})}_addCheck(e){return new i({...this._def,checks:[...this._def.checks,e]})}positive(e){return this._addCheck({kind:"min",value:BigInt(0),inclusive:!1,message:Me.toString(e)})}negative(e){return this._addCheck({kind:"max",value:BigInt(0),inclusive:!1,message:Me.toString(e)})}nonpositive(e){return this._addCheck({kind:"max",value:BigInt(0),inclusive:!0,message:Me.toString(e)})}nonnegative(e){return this._addCheck({kind:"min",value:BigInt(0),inclusive:!0,message:Me.toString(e)})}multipleOf(e,t){return this._addCheck({kind:"multipleOf",value:e,message:Me.toString(t)})}get minValue(){let e=null;for(let t of this._def.checks)t.kind==="min"&&(e===null||t.value>e)&&(e=t.value);return e}get maxValue(){let e=null;for(let t of this._def.checks)t.kind==="max"&&(e===null||t.value<e)&&(e=t.value);return e}};Ti.create=i=>new Ti({checks:[],typeName:De.ZodBigInt,coerce:i?.coerce??!1,...ze(i)});wi=class extends qe{_parse(e){if(this._def.coerce&&(e.data=!!e.data),this._getType(e)!==ue.boolean){let n=this._getOrReturnCtx(e);return ie(n,{code:J.invalid_type,expected:ue.boolean,received:n.parsedType}),Ce}return Dt(e.data)}};wi.create=i=>new wi({typeName:De.ZodBoolean,coerce:i?.coerce||!1,...ze(i)});Ai=class i extends qe{_parse(e){if(this._def.coerce&&(e.data=new Date(e.data)),this._getType(e)!==ue.date){let r=this._getOrReturnCtx(e);return ie(r,{code:J.invalid_type,expected:ue.date,received:r.parsedType}),Ce}if(Number.isNaN(e.data.getTime())){let r=this._getOrReturnCtx(e);return ie(r,{code:J.invalid_date}),Ce}let n=new Pt,s;for(let r of this._def.checks)r.kind==="min"?e.data.getTime()<r.value&&(s=this._getOrReturnCtx(e,s),ie(s,{code:J.too_small,message:r.message,inclusive:!0,exact:!1,minimum:r.value,type:"date"}),n.dirty()):r.kind==="max"?e.data.getTime()>r.value&&(s=this._getOrReturnCtx(e,s),ie(s,{code:J.too_big,message:r.message,inclusive:!0,exact:!1,maximum:r.value,type:"date"}),n.dirty()):je.assertNever(r);return{status:n.value,value:new Date(e.data.getTime())}}_addCheck(e){return new i({...this._def,checks:[...this._def.checks,e]})}min(e,t){return this._addCheck({kind:"min",value:e.getTime(),message:Me.toString(t)})}max(e,t){return this._addCheck({kind:"max",value:e.getTime(),message:Me.toString(t)})}get minDate(){let e=null;for(let t of this._def.checks)t.kind==="min"&&(e===null||t.value>e)&&(e=t.value);return e!=null?new Date(e):null}get maxDate(){let e=null;for(let t of this._def.checks)t.kind==="max"&&(e===null||t.value<e)&&(e=t.value);return e!=null?new Date(e):null}};Ai.create=i=>new Ai({checks:[],coerce:i?.coerce||!1,typeName:De.ZodDate,...ze(i)});ps=class extends qe{_parse(e){if(this._getType(e)!==ue.symbol){let n=this._getOrReturnCtx(e);return ie(n,{code:J.invalid_type,expected:ue.symbol,received:n.parsedType}),Ce}return Dt(e.data)}};ps.create=i=>new ps({typeName:De.ZodSymbol,...ze(i)});Ri=class extends qe{_parse(e){if(this._getType(e)!==ue.undefined){let n=this._getOrReturnCtx(e);return ie(n,{code:J.invalid_type,expected:ue.undefined,received:n.parsedType}),Ce}return Dt(e.data)}};Ri.create=i=>new Ri({typeName:De.ZodUndefined,...ze(i)});Ci=class extends qe{_parse(e){if(this._getType(e)!==ue.null){let n=this._getOrReturnCtx(e);return ie(n,{code:J.invalid_type,expected:ue.null,received:n.parsedType}),Ce}return Dt(e.data)}};Ci.create=i=>new Ci({typeName:De.ZodNull,...ze(i)});ti=class extends qe{constructor(){super(...arguments),this._any=!0}_parse(e){return Dt(e.data)}};ti.create=i=>new ti({typeName:De.ZodAny,...ze(i)});Bn=class extends qe{constructor(){super(...arguments),this._unknown=!0}_parse(e){return Dt(e.data)}};Bn.create=i=>new Bn({typeName:De.ZodUnknown,...ze(i)});mn=class extends qe{_parse(e){let t=this._getOrReturnCtx(e);return ie(t,{code:J.invalid_type,expected:ue.never,received:t.parsedType}),Ce}};mn.create=i=>new mn({typeName:De.ZodNever,...ze(i)});ms=class extends qe{_parse(e){if(this._getType(e)!==ue.undefined){let n=this._getOrReturnCtx(e);return ie(n,{code:J.invalid_type,expected:ue.void,received:n.parsedType}),Ce}return Dt(e.data)}};ms.create=i=>new ms({typeName:De.ZodVoid,...ze(i)});kn=class i extends qe{_parse(e){let{ctx:t,status:n}=this._processInputParams(e),s=this._def;if(t.parsedType!==ue.array)return ie(t,{code:J.invalid_type,expected:ue.array,received:t.parsedType}),Ce;if(s.exactLength!==null){let a=t.data.length>s.exactLength.value,o=t.data.length<s.exactLength.value;(a||o)&&(ie(t,{code:a?J.too_big:J.too_small,minimum:o?s.exactLength.value:void 0,maximum:a?s.exactLength.value:void 0,type:"array",inclusive:!0,exact:!0,message:s.exactLength.message}),n.dirty())}if(s.minLength!==null&&t.data.length<s.minLength.value&&(ie(t,{code:J.too_small,minimum:s.minLength.value,type:"array",inclusive:!0,exact:!1,message:s.minLength.message}),n.dirty()),s.maxLength!==null&&t.data.length>s.maxLength.value&&(ie(t,{code:J.too_big,maximum:s.maxLength.value,type:"array",inclusive:!0,exact:!1,message:s.maxLength.message}),n.dirty()),t.common.async)return Promise.all([...t.data].map((a,o)=>s.type._parseAsync(new rn(t,a,t.path,o)))).then(a=>Pt.mergeArray(n,a));let r=[...t.data].map((a,o)=>s.type._parseSync(new rn(t,a,t.path,o)));return Pt.mergeArray(n,r)}get element(){return this._def.type}min(e,t){return new i({...this._def,minLength:{value:e,message:Me.toString(t)}})}max(e,t){return new i({...this._def,maxLength:{value:e,message:Me.toString(t)}})}length(e,t){return new i({...this._def,exactLength:{value:e,message:Me.toString(t)}})}nonempty(e){return this.min(1,e)}};kn.create=(i,e)=>new kn({type:i,minLength:null,maxLength:null,exactLength:null,typeName:De.ZodArray,...ze(e)});Xt=class i extends qe{constructor(){super(...arguments),this._cached=null,this.nonstrict=this.passthrough,this.augment=this.extend}_getCached(){if(this._cached!==null)return this._cached;let e=this._def.shape(),t=je.objectKeys(e);return this._cached={shape:e,keys:t},this._cached}_parse(e){if(this._getType(e)!==ue.object){let l=this._getOrReturnCtx(e);return ie(l,{code:J.invalid_type,expected:ue.object,received:l.parsedType}),Ce}let{status:n,ctx:s}=this._processInputParams(e),{shape:r,keys:a}=this._getCached(),o=[];if(!(this._def.catchall instanceof mn&&this._def.unknownKeys==="strip"))for(let l in s.data)a.includes(l)||o.push(l);let c=[];for(let l of a){let h=r[l],u=s.data[l];c.push({key:{status:"valid",value:l},value:h._parse(new rn(s,u,s.path,l)),alwaysSet:l in s.data})}if(this._def.catchall instanceof mn){let l=this._def.unknownKeys;if(l==="passthrough")for(let h of o)c.push({key:{status:"valid",value:h},value:{status:"valid",value:s.data[h]}});else if(l==="strict")o.length>0&&(ie(s,{code:J.unrecognized_keys,keys:o}),n.dirty());else if(l!=="strip")throw new Error("Internal ZodObject error: invalid unknownKeys value.")}else{let l=this._def.catchall;for(let h of o){let u=s.data[h];c.push({key:{status:"valid",value:h},value:l._parse(new rn(s,u,s.path,h)),alwaysSet:h in s.data})}}return s.common.async?Promise.resolve().then(async()=>{let l=[];for(let h of c){let u=await h.key,d=await h.value;l.push({key:u,value:d,alwaysSet:h.alwaysSet})}return l}).then(l=>Pt.mergeObjectSync(n,l)):Pt.mergeObjectSync(n,c)}get shape(){return this._def.shape()}strict(e){return Me.errToObj,new i({...this._def,unknownKeys:"strict",...e!==void 0?{errorMap:(t,n)=>{let s=this._def.errorMap?.(t,n).message??n.defaultError;return t.code==="unrecognized_keys"?{message:Me.errToObj(e).message??s}:{message:s}}}:{}})}strip(){return new i({...this._def,unknownKeys:"strip"})}passthrough(){return new i({...this._def,unknownKeys:"passthrough"})}extend(e){return new i({...this._def,shape:()=>({...this._def.shape(),...e})})}merge(e){return new i({unknownKeys:e._def.unknownKeys,catchall:e._def.catchall,shape:()=>({...this._def.shape(),...e._def.shape()}),typeName:De.ZodObject})}setKey(e,t){return this.augment({[e]:t})}catchall(e){return new i({...this._def,catchall:e})}pick(e){let t={};for(let n of je.objectKeys(e))e[n]&&this.shape[n]&&(t[n]=this.shape[n]);return new i({...this._def,shape:()=>t})}omit(e){let t={};for(let n of je.objectKeys(this.shape))e[n]||(t[n]=this.shape[n]);return new i({...this._def,shape:()=>t})}deepPartial(){return fs(this)}partial(e){let t={};for(let n of je.objectKeys(this.shape)){let s=this.shape[n];e&&!e[n]?t[n]=s:t[n]=s.optional()}return new i({...this._def,shape:()=>t})}required(e){let t={};for(let n of je.objectKeys(this.shape))if(e&&!e[n])t[n]=this.shape[n];else{let r=this.shape[n];for(;r instanceof sn;)r=r._def.innerType;t[n]=r}return new i({...this._def,shape:()=>t})}keyof(){return qh(je.objectKeys(this.shape))}};Xt.create=(i,e)=>new Xt({shape:()=>i,unknownKeys:"strip",catchall:mn.create(),typeName:De.ZodObject,...ze(e)});Xt.strictCreate=(i,e)=>new Xt({shape:()=>i,unknownKeys:"strict",catchall:mn.create(),typeName:De.ZodObject,...ze(e)});Xt.lazycreate=(i,e)=>new Xt({shape:i,unknownKeys:"strip",catchall:mn.create(),typeName:De.ZodObject,...ze(e)});Pi=class extends qe{_parse(e){let{ctx:t}=this._processInputParams(e),n=this._def.options;function s(r){for(let o of r)if(o.result.status==="valid")return o.result;for(let o of r)if(o.result.status==="dirty")return t.common.issues.push(...o.ctx.common.issues),o.result;let a=r.map(o=>new Wt(o.ctx.common.issues));return ie(t,{code:J.invalid_union,unionErrors:a}),Ce}if(t.common.async)return Promise.all(n.map(async r=>{let a={...t,common:{...t.common,issues:[]},parent:null};return{result:await r._parseAsync({data:t.data,path:t.path,parent:a}),ctx:a}})).then(s);{let r,a=[];for(let c of n){let l={...t,common:{...t.common,issues:[]},parent:null},h=c._parseSync({data:t.data,path:t.path,parent:l});if(h.status==="valid")return h;h.status==="dirty"&&!r&&(r={result:h,ctx:l}),l.common.issues.length&&a.push(l.common.issues)}if(r)return t.common.issues.push(...r.ctx.common.issues),r.result;let o=a.map(c=>new Wt(c));return ie(t,{code:J.invalid_union,unionErrors:o}),Ce}}get options(){return this._def.options}};Pi.create=(i,e)=>new Pi({options:i,typeName:De.ZodUnion,...ze(e)});Fn=i=>i instanceof Li?Fn(i.schema):i instanceof an?Fn(i.innerType()):i instanceof Di?[i.value]:i instanceof Ni?i.options:i instanceof Ui?je.objectValues(i.enum):i instanceof Oi?Fn(i._def.innerType):i instanceof Ri?[void 0]:i instanceof Ci?[null]:i instanceof sn?[void 0,...Fn(i.unwrap())]:i instanceof En?[null,...Fn(i.unwrap())]:i instanceof Js||i instanceof Bi?Fn(i.unwrap()):i instanceof Fi?Fn(i._def.innerType):[],ra=class i extends qe{_parse(e){let{ctx:t}=this._processInputParams(e);if(t.parsedType!==ue.object)return ie(t,{code:J.invalid_type,expected:ue.object,received:t.parsedType}),Ce;let n=this.discriminator,s=t.data[n],r=this.optionsMap.get(s);return r?t.common.async?r._parseAsync({data:t.data,path:t.path,parent:t}):r._parseSync({data:t.data,path:t.path,parent:t}):(ie(t,{code:J.invalid_union_discriminator,options:Array.from(this.optionsMap.keys()),path:[n]}),Ce)}get discriminator(){return this._def.discriminator}get options(){return this._def.options}get optionsMap(){return this._def.optionsMap}static create(e,t,n){let s=new Map;for(let r of t){let a=Fn(r.shape[e]);if(!a.length)throw new Error(`A discriminator value for key \`${e}\` could not be extracted from all schema options`);for(let o of a){if(s.has(o))throw new Error(`Discriminator property ${String(e)} has duplicate value ${String(o)}`);s.set(o,r)}}return new i({typeName:De.ZodDiscriminatedUnion,discriminator:e,options:t,optionsMap:s,...ze(n)})}};Ii=class extends qe{_parse(e){let{status:t,ctx:n}=this._processInputParams(e),s=(r,a)=>{if(ia(r)||ia(a))return Ce;let o=Fc(r.value,a.value);return o.valid?((sa(r)||sa(a))&&t.dirty(),{status:t.value,value:o.data}):(ie(n,{code:J.invalid_intersection_types}),Ce)};return n.common.async?Promise.all([this._def.left._parseAsync({data:n.data,path:n.path,parent:n}),this._def.right._parseAsync({data:n.data,path:n.path,parent:n})]).then(([r,a])=>s(r,a)):s(this._def.left._parseSync({data:n.data,path:n.path,parent:n}),this._def.right._parseSync({data:n.data,path:n.path,parent:n}))}};Ii.create=(i,e,t)=>new Ii({left:i,right:e,typeName:De.ZodIntersection,...ze(t)});Sn=class i extends qe{_parse(e){let{status:t,ctx:n}=this._processInputParams(e);if(n.parsedType!==ue.array)return ie(n,{code:J.invalid_type,expected:ue.array,received:n.parsedType}),Ce;if(n.data.length<this._def.items.length)return ie(n,{code:J.too_small,minimum:this._def.items.length,inclusive:!0,exact:!1,type:"array"}),Ce;!this._def.rest&&n.data.length>this._def.items.length&&(ie(n,{code:J.too_big,maximum:this._def.items.length,inclusive:!0,exact:!1,type:"array"}),t.dirty());let r=[...n.data].map((a,o)=>{let c=this._def.items[o]||this._def.rest;return c?c._parse(new rn(n,a,n.path,o)):null}).filter(a=>!!a);return n.common.async?Promise.all(r).then(a=>Pt.mergeArray(t,a)):Pt.mergeArray(t,r)}get items(){return this._def.items}rest(e){return new i({...this._def,rest:e})}};Sn.create=(i,e)=>{if(!Array.isArray(i))throw new Error("You must pass an array of schemas to z.tuple([ ... ])");return new Sn({items:i,typeName:De.ZodTuple,rest:null,...ze(e)})};aa=class i extends qe{get keySchema(){return this._def.keyType}get valueSchema(){return this._def.valueType}_parse(e){let{status:t,ctx:n}=this._processInputParams(e);if(n.parsedType!==ue.object)return ie(n,{code:J.invalid_type,expected:ue.object,received:n.parsedType}),Ce;let s=[],r=this._def.keyType,a=this._def.valueType;for(let o in n.data)s.push({key:r._parse(new rn(n,o,n.path,o)),value:a._parse(new rn(n,n.data[o],n.path,o)),alwaysSet:o in n.data});return n.common.async?Pt.mergeObjectAsync(t,s):Pt.mergeObjectSync(t,s)}get element(){return this._def.valueType}static create(e,t,n){return t instanceof qe?new i({keyType:e,valueType:t,typeName:De.ZodRecord,...ze(n)}):new i({keyType:ei.create(),valueType:e,typeName:De.ZodRecord,...ze(t)})}},gs=class extends qe{get keySchema(){return this._def.keyType}get valueSchema(){return this._def.valueType}_parse(e){let{status:t,ctx:n}=this._processInputParams(e);if(n.parsedType!==ue.map)return ie(n,{code:J.invalid_type,expected:ue.map,received:n.parsedType}),Ce;let s=this._def.keyType,r=this._def.valueType,a=[...n.data.entries()].map(([o,c],l)=>({key:s._parse(new rn(n,o,n.path,[l,"key"])),value:r._parse(new rn(n,c,n.path,[l,"value"]))}));if(n.common.async){let o=new Map;return Promise.resolve().then(async()=>{for(let c of a){let l=await c.key,h=await c.value;if(l.status==="aborted"||h.status==="aborted")return Ce;(l.status==="dirty"||h.status==="dirty")&&t.dirty(),o.set(l.value,h.value)}return{status:t.value,value:o}})}else{let o=new Map;for(let c of a){let l=c.key,h=c.value;if(l.status==="aborted"||h.status==="aborted")return Ce;(l.status==="dirty"||h.status==="dirty")&&t.dirty(),o.set(l.value,h.value)}return{status:t.value,value:o}}}};gs.create=(i,e,t)=>new gs({valueType:e,keyType:i,typeName:De.ZodMap,...ze(t)});_s=class i extends qe{_parse(e){let{status:t,ctx:n}=this._processInputParams(e);if(n.parsedType!==ue.set)return ie(n,{code:J.invalid_type,expected:ue.set,received:n.parsedType}),Ce;let s=this._def;s.minSize!==null&&n.data.size<s.minSize.value&&(ie(n,{code:J.too_small,minimum:s.minSize.value,type:"set",inclusive:!0,exact:!1,message:s.minSize.message}),t.dirty()),s.maxSize!==null&&n.data.size>s.maxSize.value&&(ie(n,{code:J.too_big,maximum:s.maxSize.value,type:"set",inclusive:!0,exact:!1,message:s.maxSize.message}),t.dirty());let r=this._def.valueType;function a(c){let l=new Set;for(let h of c){if(h.status==="aborted")return Ce;h.status==="dirty"&&t.dirty(),l.add(h.value)}return{status:t.value,value:l}}let o=[...n.data.values()].map((c,l)=>r._parse(new rn(n,c,n.path,l)));return n.common.async?Promise.all(o).then(c=>a(c)):a(o)}min(e,t){return new i({...this._def,minSize:{value:e,message:Me.toString(t)}})}max(e,t){return new i({...this._def,maxSize:{value:e,message:Me.toString(t)}})}size(e,t){return this.min(e,t).max(e,t)}nonempty(e){return this.min(1,e)}};_s.create=(i,e)=>new _s({valueType:i,minSize:null,maxSize:null,typeName:De.ZodSet,...ze(e)});oa=class i extends qe{constructor(){super(...arguments),this.validate=this.implement}_parse(e){let{ctx:t}=this._processInputParams(e);if(t.parsedType!==ue.function)return ie(t,{code:J.invalid_type,expected:ue.function,received:t.parsedType}),Ce;function n(o,c){return js({data:o,path:t.path,errorMaps:[t.common.contextualErrorMap,t.schemaErrorMap,us(),On].filter(l=>!!l),issueData:{code:J.invalid_arguments,argumentsError:c}})}function s(o,c){return js({data:o,path:t.path,errorMaps:[t.common.contextualErrorMap,t.schemaErrorMap,us(),On].filter(l=>!!l),issueData:{code:J.invalid_return_type,returnTypeError:c}})}let r={errorMap:t.common.contextualErrorMap},a=t.data;if(this._def.returns instanceof ni){let o=this;return Dt(async function(...c){let l=new Wt([]),h=await o._def.args.parseAsync(c,r).catch(p=>{throw l.addIssue(n(c,p)),l}),u=await Reflect.apply(a,this,h);return await o._def.returns._def.type.parseAsync(u,r).catch(p=>{throw l.addIssue(s(u,p)),l})})}else{let o=this;return Dt(function(...c){let l=o._def.args.safeParse(c,r);if(!l.success)throw new Wt([n(c,l.error)]);let h=Reflect.apply(a,this,l.data),u=o._def.returns.safeParse(h,r);if(!u.success)throw new Wt([s(h,u.error)]);return u.data})}}parameters(){return this._def.args}returnType(){return this._def.returns}args(...e){return new i({...this._def,args:Sn.create(e).rest(Bn.create())})}returns(e){return new i({...this._def,returns:e})}implement(e){return this.parse(e)}strictImplement(e){return this.parse(e)}static create(e,t,n){return new i({args:e||Sn.create([]).rest(Bn.create()),returns:t||Bn.create(),typeName:De.ZodFunction,...ze(n)})}},Li=class extends qe{get schema(){return this._def.getter()}_parse(e){let{ctx:t}=this._processInputParams(e);return this._def.getter()._parse({data:t.data,path:t.path,parent:t})}};Li.create=(i,e)=>new Li({getter:i,typeName:De.ZodLazy,...ze(e)});Di=class extends qe{_parse(e){if(e.data!==this._def.value){let t=this._getOrReturnCtx(e);return ie(t,{received:t.data,code:J.invalid_literal,expected:this._def.value}),Ce}return{status:"valid",value:e.data}}get value(){return this._def.value}};Di.create=(i,e)=>new Di({value:i,typeName:De.ZodLiteral,...ze(e)});Ni=class i extends qe{_parse(e){if(typeof e.data!="string"){let t=this._getOrReturnCtx(e),n=this._def.values;return ie(t,{expected:je.joinValues(n),received:t.parsedType,code:J.invalid_type}),Ce}if(this._cache||(this._cache=new Set(this._def.values)),!this._cache.has(e.data)){let t=this._getOrReturnCtx(e),n=this._def.values;return ie(t,{received:t.data,code:J.invalid_enum_value,options:n}),Ce}return Dt(e.data)}get options(){return this._def.values}get enum(){let e={};for(let t of this._def.values)e[t]=t;return e}get Values(){let e={};for(let t of this._def.values)e[t]=t;return e}get Enum(){let e={};for(let t of this._def.values)e[t]=t;return e}extract(e,t=this._def){return i.create(e,{...this._def,...t})}exclude(e,t=this._def){return i.create(this.options.filter(n=>!e.includes(n)),{...this._def,...t})}};Ni.create=qh;Ui=class extends qe{_parse(e){let t=je.getValidEnumValues(this._def.values),n=this._getOrReturnCtx(e);if(n.parsedType!==ue.string&&n.parsedType!==ue.number){let s=je.objectValues(t);return ie(n,{expected:je.joinValues(s),received:n.parsedType,code:J.invalid_type}),Ce}if(this._cache||(this._cache=new Set(je.getValidEnumValues(this._def.values))),!this._cache.has(e.data)){let s=je.objectValues(t);return ie(n,{received:n.data,code:J.invalid_enum_value,options:s}),Ce}return Dt(e.data)}get enum(){return this._def.values}};Ui.create=(i,e)=>new Ui({values:i,typeName:De.ZodNativeEnum,...ze(e)});ni=class extends qe{unwrap(){return this._def.type}_parse(e){let{ctx:t}=this._processInputParams(e);if(t.parsedType!==ue.promise&&t.common.async===!1)return ie(t,{code:J.invalid_type,expected:ue.promise,received:t.parsedType}),Ce;let n=t.parsedType===ue.promise?t.data:Promise.resolve(t.data);return Dt(n.then(s=>this._def.type.parseAsync(s,{path:t.path,errorMap:t.common.contextualErrorMap})))}};ni.create=(i,e)=>new ni({type:i,typeName:De.ZodPromise,...ze(e)});an=class extends qe{innerType(){return this._def.schema}sourceType(){return this._def.schema._def.typeName===De.ZodEffects?this._def.schema.sourceType():this._def.schema}_parse(e){let{status:t,ctx:n}=this._processInputParams(e),s=this._def.effect||null,r={addIssue:a=>{ie(n,a),a.fatal?t.abort():t.dirty()},get path(){return n.path}};if(r.addIssue=r.addIssue.bind(r),s.type==="preprocess"){let a=s.transform(n.data,r);if(n.common.async)return Promise.resolve(a).then(async o=>{if(t.value==="aborted")return Ce;let c=await this._def.schema._parseAsync({data:o,path:n.path,parent:n});return c.status==="aborted"?Ce:c.status==="dirty"?Si(c.value):t.value==="dirty"?Si(c.value):c});{if(t.value==="aborted")return Ce;let o=this._def.schema._parseSync({data:a,path:n.path,parent:n});return o.status==="aborted"?Ce:o.status==="dirty"?Si(o.value):t.value==="dirty"?Si(o.value):o}}if(s.type==="refinement"){let a=o=>{let c=s.refinement(o,r);if(n.common.async)return Promise.resolve(c);if(c instanceof Promise)throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");return o};if(n.common.async===!1){let o=this._def.schema._parseSync({data:n.data,path:n.path,parent:n});return o.status==="aborted"?Ce:(o.status==="dirty"&&t.dirty(),a(o.value),{status:t.value,value:o.value})}else return this._def.schema._parseAsync({data:n.data,path:n.path,parent:n}).then(o=>o.status==="aborted"?Ce:(o.status==="dirty"&&t.dirty(),a(o.value).then(()=>({status:t.value,value:o.value}))))}if(s.type==="transform")if(n.common.async===!1){let a=this._def.schema._parseSync({data:n.data,path:n.path,parent:n});if(!Qn(a))return Ce;let o=s.transform(a.value,r);if(o instanceof Promise)throw new Error("Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.");return{status:t.value,value:o}}else return this._def.schema._parseAsync({data:n.data,path:n.path,parent:n}).then(a=>Qn(a)?Promise.resolve(s.transform(a.value,r)).then(o=>({status:t.value,value:o})):Ce);je.assertNever(s)}};an.create=(i,e,t)=>new an({schema:i,typeName:De.ZodEffects,effect:e,...ze(t)});an.createWithPreprocess=(i,e,t)=>new an({schema:e,effect:{type:"preprocess",transform:i},typeName:De.ZodEffects,...ze(t)});sn=class extends qe{_parse(e){return this._getType(e)===ue.undefined?Dt(void 0):this._def.innerType._parse(e)}unwrap(){return this._def.innerType}};sn.create=(i,e)=>new sn({innerType:i,typeName:De.ZodOptional,...ze(e)});En=class extends qe{_parse(e){return this._getType(e)===ue.null?Dt(null):this._def.innerType._parse(e)}unwrap(){return this._def.innerType}};En.create=(i,e)=>new En({innerType:i,typeName:De.ZodNullable,...ze(e)});Oi=class extends qe{_parse(e){let{ctx:t}=this._processInputParams(e),n=t.data;return t.parsedType===ue.undefined&&(n=this._def.defaultValue()),this._def.innerType._parse({data:n,path:t.path,parent:t})}removeDefault(){return this._def.innerType}};Oi.create=(i,e)=>new Oi({innerType:i,typeName:De.ZodDefault,defaultValue:typeof e.default=="function"?e.default:()=>e.default,...ze(e)});Fi=class extends qe{_parse(e){let{ctx:t}=this._processInputParams(e),n={...t,common:{...t.common,issues:[]}},s=this._def.innerType._parse({data:n.data,path:n.path,parent:{...n}});return ds(s)?s.then(r=>({status:"valid",value:r.status==="valid"?r.value:this._def.catchValue({get error(){return new Wt(n.common.issues)},input:n.data})})):{status:"valid",value:s.status==="valid"?s.value:this._def.catchValue({get error(){return new Wt(n.common.issues)},input:n.data})}}removeCatch(){return this._def.innerType}};Fi.create=(i,e)=>new Fi({innerType:i,typeName:De.ZodCatch,catchValue:typeof e.catch=="function"?e.catch:()=>e.catch,...ze(e)});xs=class extends qe{_parse(e){if(this._getType(e)!==ue.nan){let n=this._getOrReturnCtx(e);return ie(n,{code:J.invalid_type,expected:ue.nan,received:n.parsedType}),Ce}return{status:"valid",value:e.data}}};xs.create=i=>new xs({typeName:De.ZodNaN,...ze(i)});gp=Symbol("zod_brand"),Js=class extends qe{_parse(e){let{ctx:t}=this._processInputParams(e),n=t.data;return this._def.type._parse({data:n,path:t.path,parent:t})}unwrap(){return this._def.type}},Ks=class i extends qe{_parse(e){let{status:t,ctx:n}=this._processInputParams(e);if(n.common.async)return(async()=>{let r=await this._def.in._parseAsync({data:n.data,path:n.path,parent:n});return r.status==="aborted"?Ce:r.status==="dirty"?(t.dirty(),Si(r.value)):this._def.out._parseAsync({data:r.value,path:n.path,parent:n})})();{let s=this._def.in._parseSync({data:n.data,path:n.path,parent:n});return s.status==="aborted"?Ce:s.status==="dirty"?(t.dirty(),{status:"dirty",value:s.value}):this._def.out._parseSync({data:s.value,path:n.path,parent:n})}}static create(e,t){return new i({in:e,out:t,typeName:De.ZodPipeline})}},Bi=class extends qe{_parse(e){let t=this._def.innerType._parse(e),n=s=>(Qn(s)&&(s.value=Object.freeze(s.value)),s);return ds(t)?t.then(s=>n(s)):n(t)}unwrap(){return this._def.innerType}};Bi.create=(i,e)=>new Bi({innerType:i,typeName:De.ZodReadonly,...ze(e)});_p={object:Xt.lazycreate};(function(i){i.ZodString="ZodString",i.ZodNumber="ZodNumber",i.ZodNaN="ZodNaN",i.ZodBigInt="ZodBigInt",i.ZodBoolean="ZodBoolean",i.ZodDate="ZodDate",i.ZodSymbol="ZodSymbol",i.ZodUndefined="ZodUndefined",i.ZodNull="ZodNull",i.ZodAny="ZodAny",i.ZodUnknown="ZodUnknown",i.ZodNever="ZodNever",i.ZodVoid="ZodVoid",i.ZodArray="ZodArray",i.ZodObject="ZodObject",i.ZodUnion="ZodUnion",i.ZodDiscriminatedUnion="ZodDiscriminatedUnion",i.ZodIntersection="ZodIntersection",i.ZodTuple="ZodTuple",i.ZodRecord="ZodRecord",i.ZodMap="ZodMap",i.ZodSet="ZodSet",i.ZodFunction="ZodFunction",i.ZodLazy="ZodLazy",i.ZodLiteral="ZodLiteral",i.ZodEnum="ZodEnum",i.ZodEffects="ZodEffects",i.ZodNativeEnum="ZodNativeEnum",i.ZodOptional="ZodOptional",i.ZodNullable="ZodNullable",i.ZodDefault="ZodDefault",i.ZodCatch="ZodCatch",i.ZodPromise="ZodPromise",i.ZodBranded="ZodBranded",i.ZodPipeline="ZodPipeline",i.ZodReadonly="ZodReadonly"})(De||(De={}));xp=(i,e={message:`Input not instance of ${i.name}`})=>Yh(t=>t instanceof i,e),Zh=ei.create,$h=Ei.create,yp=xs.create,vp=Ti.create,jh=wi.create,Mp=Ai.create,bp=ps.create,Sp=Ri.create,Ep=Ci.create,Tp=ti.create,wp=Bn.create,Ap=mn.create,Rp=ms.create,Cp=kn.create,Pp=Xt.create,Ip=Xt.strictCreate,Lp=Pi.create,Dp=ra.create,Np=Ii.create,Up=Sn.create,Op=aa.create,Fp=gs.create,Bp=_s.create,kp=oa.create,zp=Li.create,Vp=Di.create,Hp=Ni.create,Gp=Ui.create,Wp=ni.create,Xp=an.create,qp=sn.create,Yp=En.create,Zp=an.createWithPreprocess,$p=Ks.create,jp=()=>Zh().optional(),Jp=()=>$h().optional(),Kp=()=>jh().optional(),Qp={string:i=>ei.create({...i,coerce:!0}),number:i=>Ei.create({...i,coerce:!0}),boolean:i=>wi.create({...i,coerce:!0}),bigint:i=>Ti.create({...i,coerce:!0}),date:i=>Ai.create({...i,coerce:!0})},em=Ce});var Ye={};Lc(Ye,{BRAND:()=>gp,DIRTY:()=>Si,EMPTY_PATH:()=>Zf,INVALID:()=>Ce,NEVER:()=>em,OK:()=>Dt,ParseStatus:()=>Pt,Schema:()=>qe,ZodAny:()=>ti,ZodArray:()=>kn,ZodBigInt:()=>Ti,ZodBoolean:()=>wi,ZodBranded:()=>Js,ZodCatch:()=>Fi,ZodDate:()=>Ai,ZodDefault:()=>Oi,ZodDiscriminatedUnion:()=>ra,ZodEffects:()=>an,ZodEnum:()=>Ni,ZodError:()=>Wt,ZodFirstPartyTypeKind:()=>De,ZodFunction:()=>oa,ZodIntersection:()=>Ii,ZodIssueCode:()=>J,ZodLazy:()=>Li,ZodLiteral:()=>Di,ZodMap:()=>gs,ZodNaN:()=>xs,ZodNativeEnum:()=>Ui,ZodNever:()=>mn,ZodNull:()=>Ci,ZodNullable:()=>En,ZodNumber:()=>Ei,ZodObject:()=>Xt,ZodOptional:()=>sn,ZodParsedType:()=>ue,ZodPipeline:()=>Ks,ZodPromise:()=>ni,ZodReadonly:()=>Bi,ZodRecord:()=>aa,ZodSchema:()=>qe,ZodSet:()=>_s,ZodString:()=>ei,ZodSymbol:()=>ps,ZodTransformer:()=>an,ZodTuple:()=>Sn,ZodType:()=>qe,ZodUndefined:()=>Ri,ZodUnion:()=>Pi,ZodUnknown:()=>Bn,ZodVoid:()=>ms,addIssueToContext:()=>ie,any:()=>Tp,array:()=>Cp,bigint:()=>vp,boolean:()=>jh,coerce:()=>Qp,custom:()=>Yh,date:()=>Mp,datetimeRegex:()=>Xh,defaultErrorMap:()=>On,discriminatedUnion:()=>Dp,effect:()=>Xp,enum:()=>Hp,function:()=>kp,getErrorMap:()=>us,getParsedType:()=>bn,instanceof:()=>xp,intersection:()=>Np,isAborted:()=>ia,isAsync:()=>ds,isDirty:()=>sa,isValid:()=>Qn,late:()=>_p,lazy:()=>zp,literal:()=>Vp,makeIssue:()=>js,map:()=>Fp,nan:()=>yp,nativeEnum:()=>Gp,never:()=>Ap,null:()=>Ep,nullable:()=>Yp,number:()=>$h,object:()=>Pp,objectUtil:()=>Dc,oboolean:()=>Kp,onumber:()=>Jp,optional:()=>qp,ostring:()=>jp,pipeline:()=>$p,preprocess:()=>Zp,promise:()=>Wp,quotelessJson:()=>Xf,record:()=>Op,set:()=>Bp,setErrorMap:()=>Yf,strictObject:()=>Ip,string:()=>Zh,symbol:()=>bp,transformer:()=>Xp,tuple:()=>Up,undefined:()=>Sp,union:()=>Lp,unknown:()=>wp,util:()=>je,void:()=>Rp});var Bc=lt(()=>{na();Uc();kh();$s();Jh();ta()});var Kh=lt(()=>{Bc();Bc()});function eu(i){let e=rm.safeParse(i);return e.success?[]:e.error.issues.map(t=>({line:am(i,t.path),message:`${t.path.join(".")}: ${t.message}`}))}function am(i,e){return e[0]==="steps"&&typeof e[1]=="number"?i.steps[e[1]]?.line??1:1}var Qh,tm,nm,im,sm,rm,kc=lt(()=>{"use strict";Kh();Qh=["linear","ease-in","ease-out","ease-in-out"],tm=Ye.object({joint:Ye.string().min(1),action:Ye.string().min(1),degrees:Ye.number().nullable(),line:Ye.number()}),nm=Ye.object({effector:Ye.string().min(1),target:Ye.string().min(1),line:Ye.number()}),im=Ye.object({effector:Ye.string().min(1),anchor:Ye.string().min(1),line:Ye.number()}),sm=Ye.object({name:Ye.string(),durationSec:Ye.number().positive(),easing:Ye.enum(Qh),targets:Ye.array(tm),groundLock:Ye.array(Ye.string()),reaches:Ye.array(nm),pins:Ye.array(im),turn:Ye.number().optional(),travel:Ye.object({x:Ye.number(),z:Ye.number()}).optional(),cue:Ye.string().optional(),line:Ye.number()}),rm=Ye.object({kind:Ye.string().min(1),name:Ye.string().min(1),rig:Ye.string().min(1),startPose:Ye.string().optional(),props:Ye.array(Ye.string()),repeat:Ye.number().int().positive(),steps:Ye.array(sm)})});var zc,Vc=lt(()=>{"use strict";zc="0.1"});function Gc(i){let e=iu[i];return e?[...e]:om.has(i)?[i]:[]}function ca(i){let e=au[i];return e?[...e]:hm.has(i)?[i]:[]}function Qs(i){return ou[i]??null}function la(i){return dm[i]??-1}function ki(i){return i.replace(/_(left|right)$/,"")}function ha(i){return i.endsWith("_left")}var Hc,om,tu,nu,iu,su,cm,ru,au,lm,hm,ou,um,dm,ua=lt(()=>{"use strict";Hc=["pelvis","spine","chest","neck","head","shoulder_left","shoulder_right","elbow_left","elbow_right","wrist_left","wrist_right","hip_left","hip_right","knee_left","knee_right","ankle_left","ankle_right","thumb_left","index_left","middle_left","ring_left","pinky_left","thumb_right","index_right","middle_right","ring_right","pinky_right"],om=new Set(Hc),tu=["thumb_left","index_left","middle_left","ring_left","pinky_left"],nu=["thumb_right","index_right","middle_right","ring_right","pinky_right"],iu={shoulders:["shoulder_left","shoulder_right"],elbows:["elbow_left","elbow_right"],wrists:["wrist_left","wrist_right"],hips:["hip_left","hip_right"],knees:["knee_left","knee_right"],ankles:["ankle_left","ankle_right"],fingers_left:tu,fingers_right:nu,fingers:[...tu,...nu]},su=Object.keys(iu),cm=[...su,...Hc];ru=["hand_left","hand_right","foot_left","foot_right"],au={hands:["hand_left","hand_right"],feet:["foot_left","foot_right"]},lm=[...Object.keys(au),...ru],hm=new Set(ru);ou={flex:{axis:"x",sign:1},extend:{axis:"x",sign:-1},abduct:{axis:"z",sign:-1},adduct:{axis:"z",sign:1},"rotate-in":{axis:"y",sign:1},"rotate-out":{axis:"y",sign:-1},supinate:{axis:"y",sign:1},pronate:{axis:"y",sign:-1},dorsiflex:{axis:"x",sign:-1},plantarflex:{axis:"x",sign:1},hinge:{axis:"x",sign:1}},um=Object.keys(ou);dm={knee:1,spine:1,chest:1,neck:1,head:1}});function da(i,e){let t=cu[ki(i)];return t?t[e]??null:null}function Wc(i){let e=cu[ki(i)];if(!e)return null;let t={x:{min:0,max:0},y:{min:0,max:0},z:{min:0,max:0}};for(let[n,s]of Object.entries(e)){let r=Qs(n);if(!r)continue;let a=n==="flex"||n==="extend"?la(ki(i)):1,o=ha(i)&&r.axis!=="x"?-1:1,c=r.sign*a*o,l=t[r.axis];l.min=Math.min(l.min,c*s.min,c*s.max),l.max=Math.max(l.max,c*s.min,c*s.max)}return t}function Xc(i,e,t){let n=da(i,e);return n?Math.min(n.max,Math.max(n.min,t)):t}var cu,qc=lt(()=>{"use strict";ua();cu={shoulder:{flex:{min:0,max:180},extend:{min:0,max:60},abduct:{min:0,max:180},adduct:{min:0,max:50},"rotate-in":{min:0,max:70},"rotate-out":{min:0,max:90}},elbow:{flex:{min:0,max:154},extend:{min:0,max:10},supinate:{min:0,max:92},pronate:{min:0,max:84}},wrist:{flex:{min:0,max:80},extend:{min:0,max:70}},hip:{flex:{min:0,max:135},extend:{min:0,max:20},abduct:{min:0,max:45},adduct:{min:0,max:30},"rotate-in":{min:0,max:40},"rotate-out":{min:0,max:45}},knee:{flex:{min:0,max:144},extend:{min:0,max:5}},ankle:{dorsiflex:{min:0,max:15},plantarflex:{min:0,max:50}},pelvis:{hinge:{min:0,max:120}},spine:{flex:{min:0,max:90},extend:{min:0,max:30},abduct:{min:0,max:35},adduct:{min:0,max:35},"rotate-in":{min:0,max:45},"rotate-out":{min:0,max:45}},chest:{flex:{min:0,max:30},extend:{min:0,max:20},"rotate-in":{min:0,max:35},"rotate-out":{min:0,max:35}},neck:{flex:{min:0,max:50},extend:{min:0,max:60},abduct:{min:0,max:45},adduct:{min:0,max:45},"rotate-in":{min:0,max:80},"rotate-out":{min:0,max:80}},index:{flex:{min:0,max:100},extend:{min:0,max:20}},middle:{flex:{min:0,max:100},extend:{min:0,max:20}},ring:{flex:{min:0,max:100},extend:{min:0,max:20}},pinky:{flex:{min:0,max:100},extend:{min:0,max:20}},thumb:{flex:{min:0,max:80},extend:{min:0,max:20},abduct:{min:0,max:50},adduct:{min:0,max:30}}}});function uu(i){let e=[],t=[],n=i.steps.map(r=>pm(r,e,t));return{ir:{version:zc,kind:i.kind,name:i.name,rig:i.rig,...i.startPose?{startPose:i.startPose}:{},props:i.props,repeat:i.repeat,phases:n},warnings:e,errors:t}}function pm(i,e,t){let n=new Map;for(let c of i.targets){let l=Gc(c.joint);if(l.length===0){t.push({line:c.line,message:`unknown joint: "${c.joint}"`});continue}if(c.action==="hold"){for(let u of l)hu(n,u);continue}let h=Qs(c.action);if(!h){t.push({line:c.line,message:`unknown action: "${c.action}"`});continue}if(c.degrees===null){t.push({line:c.line,message:`action "${c.action}" requires an angle`});continue}for(let u of l){let d=Xc(u,c.action,c.degrees);if(d!==c.degrees){let f=da(u,c.action);e.push({line:c.line,phase:i.name,joint:u,action:c.action,requested:c.degrees,clamped:d,limit:f})}let p=c.action==="flex"||c.action==="extend"?la(ki(u)):1,g=ha(u)&&h.axis!=="x"?-1:1,_=h.sign*p*g,m=hu(n,u);m[h.axis]=_*d}}let s=[...n.entries()].map(([c,l])=>({boneId:c,euler:l})),r=[];for(let c of i.reaches){let l=ca(c.effector);if(l.length===0){t.push({line:c.line,message:`unknown reach effector: "${c.effector}"`});continue}for(let h of l)r.push({effector:h,target:c.target})}let a=[];for(let c of i.pins){let l=ca(c.effector);if(l.length===0){t.push({line:c.line,message:`unknown pin effector: "${c.effector}"`});continue}for(let h of l)a.push({effector:h,anchor:c.anchor})}let o=i.travel?{x:lu(i.travel.x,-fa,fa),z:lu(i.travel.z,-fa,fa)}:void 0;return{name:i.name,durationSec:i.durationSec,easing:i.easing,targets:s,groundLock:i.groundLock,reaches:r,pins:a,...i.turn!==void 0?{turnDeg:i.turn}:{},...o?{travel:o}:{},...i.cue?{cue:i.cue}:{}}}function lu(i,e,t){return Math.min(t,Math.max(e,i))}function hu(i,e){let t=i.get(e);return t||(t={...fm},i.set(e,t)),t}var fm,fa,du=lt(()=>{"use strict";Vc();ua();qc();fm={x:0,y:0,z:0};fa=3});function fu(i){let{ast:e,errors:t}=Oh(i);if(!e)return{ir:null,warnings:[],errors:t};let n=eu(e),s=[...t,...n];if(s.length>0)return{ir:null,warnings:[],errors:s};let{ir:r,warnings:a,errors:o}=uu(e);return o.length>0?{ir:null,warnings:a,errors:o}:{ir:r,warnings:a,errors:[]}}var Yc=lt(()=>{"use strict";Fh();kc();du();Vc();ua();qc();kc()});function zs(){let i=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Nt[i&255]+Nt[i>>8&255]+Nt[i>>16&255]+Nt[i>>24&255]+"-"+Nt[e&255]+Nt[e>>8&255]+"-"+Nt[e>>16&15|64]+Nt[e>>24&255]+"-"+Nt[t&63|128]+Nt[t>>8&255]+"-"+Nt[t>>16&255]+Nt[t>>24&255]+Nt[n&255]+Nt[n>>8&255]+Nt[n>>16&255]+Nt[n>>24&255]).toLowerCase()}function Ge(i,e,t){return Math.max(e,Math.min(t,i))}function Yl(i,e){return(i%e+e)%e}function Tm(i,e,t,n,s){return n+(i-e)*(s-n)/(t-e)}function wm(i,e,t){return i!==e?(t-i)/(e-i):0}function or(i,e,t){return(1-t)*i+t*e}function Am(i,e,t,n){return or(i,e,1-Math.exp(-t*n))}function Rm(i,e=1){return e-Math.abs(Yl(i,e*2)-e)}function Cm(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*(3-2*i))}function Pm(i,e,t){return i<=e?0:i>=t?1:(i=(i-e)/(t-e),i*i*i*(i*(i*6-15)+10))}function Im(i,e){return i+Math.floor(Math.random()*(e-i+1))}function Lm(i,e){return i+Math.random()*(e-i)}function Dm(i){return i*(.5-Math.random())}function Nm(i){i!==void 0&&(xu=i);let e=xu+=1831565813;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}function Um(i){return i*ar}function Om(i){return i*Ds}function Fm(i){return(i&i-1)===0&&i!==0}function Bm(i){return Math.pow(2,Math.ceil(Math.log(i)/Math.LN2))}function km(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function zm(i,e,t,n,s){let r=Math.cos,a=Math.sin,o=r(t/2),c=a(t/2),l=r((e+n)/2),h=a((e+n)/2),u=r((e-n)/2),d=a((e-n)/2),p=r((n-e)/2),g=a((n-e)/2);switch(s){case"XYX":i.set(o*h,c*u,c*d,o*l);break;case"YZY":i.set(c*d,o*h,c*u,o*l);break;case"ZXZ":i.set(c*u,c*d,o*h,o*l);break;case"XZX":i.set(o*h,c*g,c*p,o*l);break;case"YXY":i.set(c*p,o*h,c*g,o*l);break;case"ZYZ":i.set(c*g,c*p,o*h,o*l);break;default:console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function Is(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("Invalid component type.")}}function zt(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("Invalid component type.")}}function Zl(i){for(let e=i.length-1;e>=0;--e)if(i[e]>=65535)return!0;return!1}function fr(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function Cd(){let i=fr("canvas");return i.style.display="block",i}function ss(i){i in yu||(yu[i]=!0,console.warn(i))}function Pd(i,e,t){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(e,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,t);break;default:n()}}setTimeout(r,t)})}function Id(i){let e=i.elements;e[2]=.5*e[2]+.5*e[3],e[6]=.5*e[6]+.5*e[7],e[10]=.5*e[10]+.5*e[11],e[14]=.5*e[14]+.5*e[15]}function Ld(i){let e=i.elements;e[11]===-1?(e[10]=-e[10]-1,e[14]=-e[14]):(e[10]=-e[10],e[14]=-e[14]+1)}function Vm(){let i={enabled:!0,workingColorSpace:ji,spaces:{},convert:function(s,r,a){return this.enabled===!1||r===a||!r||!a||(this.spaces[r].transfer===ct&&(s.r=Xn(s.r),s.g=Xn(s.g),s.b=Xn(s.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===ct&&(s.r=Ls(s.r),s.g=Ls(s.g),s.b=Ls(s.b))),s},fromWorkingColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},toWorkingColorSpace:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===Jn?ur:this.spaces[s].transfer},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,a){return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[ji]:{primaries:e,whitePoint:n,transfer:ur,toXYZ:vu,fromXYZ:Mu,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:Vt},outputColorSpaceConfig:{drawingBufferColorSpace:Vt}},[Vt]:{primaries:e,whitePoint:n,transfer:ct,toXYZ:vu,fromXYZ:Mu,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:Vt}}}),i}function Xn(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Ls(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}function $c(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?Wa.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}function Jc(i,e,t,n,s){for(let r=0,a=i.length-3;r<=a;r+=3){Hi.fromArray(i,r);let o=s.x*Math.abs(Hi.x)+s.y*Math.abs(Hi.y)+s.z*Math.abs(Hi.z),c=e.dot(Hi),l=t.dot(Hi),h=n.dot(Hi);if(Math.max(-Math.max(c,l,h),Math.min(c,l,h))>o)return!1}return!0}function hl(i,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?i+(e-i)*6*t:t<1/2?e:t<2/3?i+(e-i)*6*(2/3-t):i}function Qm(i,e,t,n,s,r,a,o){let c;if(e.side===Ht?c=n.intersectTriangle(a,r,s,!0,o):c=n.intersectTriangle(s,r,a,e.side===qn,o),c===null)return null;Ia.copy(o),Ia.applyMatrix4(i.matrixWorld);let l=t.ray.origin.distanceTo(Ia);return l<t.near||l>t.far?null:{distance:l,point:Ia.clone(),object:i}}function La(i,e,t,n,s,r,a,o,c,l){i.getVertexPosition(o,Aa),i.getVertexPosition(c,Ra),i.getVertexPosition(l,Ca);let h=Qm(i,e,t,n,Aa,Ra,Ca,Du);if(h){let u=new A;li.getBarycoord(Du,Aa,Ra,Ca,u),s&&(h.uv=li.getInterpolatedAttribute(s,o,c,l,u,new oe)),r&&(h.uv1=li.getInterpolatedAttribute(r,o,c,l,u,new oe)),a&&(h.normal=li.getInterpolatedAttribute(a,o,c,l,u,new A),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let d={a:o,b:c,c:l,normal:new A,materialIndex:0};li.getNormal(Aa,Ra,Ca,d.normal),h.face=d,h.barycoord=u}return h}function rs(i){let e={};for(let t in i){e[t]={};for(let n in i[t]){let s=i[t][n];s&&(s.isColor||s.isMatrix3||s.isMatrix4||s.isVector2||s.isVector3||s.isVector4||s.isTexture||s.isQuaternion)?s.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=s.clone():Array.isArray(s)?e[t][n]=s.slice():e[t][n]=s}}return e}function Bt(i){let e={};for(let t=0;t<i.length;t++){let n=rs(i[t]);for(let s in n)e[s]=n[s]}return e}function eg(i){let e=[];for(let t=0;t<i.length;t++)e.push(i[t].clone());return e}function $l(i){let e=i.getRenderTarget();return e===null?i.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:nt.workingColorSpace}function Ua(i,e,t,n,s,r){let a=i.geometry.attributes.position;if($a.fromBufferAttribute(a,s),ja.fromBufferAttribute(a,r),t.distanceSqToSegment($a,ja,pl,Fu)>n)return;pl.applyMatrix4(i.matrixWorld);let c=e.ray.origin.distanceTo(pl);if(!(c<e.near||c>e.far))return{distance:c,point:Fu.clone().applyMatrix4(i.matrixWorld),index:s,face:null,faceIndex:null,barycoord:null,object:i}}function jl(){let i=0,e=0,t=0,n=0;function s(r,a,o,c){i=r,e=o,t=-3*r+3*a-2*o-c,n=2*r-2*a+o+c}return{initCatmullRom:function(r,a,o,c,l){s(a,o,l*(o-r),l*(c-a))},initNonuniformCatmullRom:function(r,a,o,c,l,h,u){let d=(a-r)/l-(o-r)/(l+h)+(o-a)/h,p=(o-a)/h-(c-a)/(h+u)+(c-o)/u;d*=h,p*=h,s(a,o,d,p)},calc:function(r){let a=r*r,o=a*r;return i+e*r+t*a+n*o}}}function zu(i,e,t,n,s){let r=(n-e)*.5,a=(s-t)*.5,o=i*i,c=i*o;return(2*t-2*n+r+a)*c+(-3*t+3*n-2*r-a)*o+r*i+t}function rg(i,e){let t=1-i;return t*t*e}function ag(i,e){return 2*(1-i)*i*e}function og(i,e){return i*i*e}function cr(i,e,t,n){return rg(i,e)+ag(i,t)+og(i,n)}function cg(i,e){let t=1-i;return t*t*t*e}function lg(i,e){let t=1-i;return 3*t*t*i*e}function hg(i,e){return 3*(1-i)*i*i*e}function ug(i,e){return i*i*i*e}function lr(i,e,t,n,s){return cg(i,e)+lg(i,t)+hg(i,n)+ug(i,s)}function Fa(i,e,t){return!i||!t&&i.constructor===e?i:typeof e.BYTES_PER_ELEMENT=="number"?new e(i):Array.prototype.slice.call(i)}function dg(i){return ArrayBuffer.isView(i)&&!(i instanceof DataView)}function Ql(i,e,t,n){let s=Mg(n);switch(t){case Fl:return i*e;case kl:return i*e;case zl:return i*e*2;case Vl:return i*e/s.components*s.byteLength;case Oo:return i*e/s.components*s.byteLength;case Hl:return i*e*2/s.components*s.byteLength;case Fo:return i*e*2/s.components*s.byteLength;case Bl:return i*e*3/s.components*s.byteLength;case dn:return i*e*4/s.components*s.byteLength;case Bo:return i*e*4/s.components*s.byteLength;case Hr:case Gr:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case Wr:case Xr:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case zo:case Ho:return Math.max(i,16)*Math.max(e,8)/4;case ko:case Vo:return Math.max(i,8)*Math.max(e,8)/2;case Go:case Wo:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case Xo:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case qo:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case Yo:return Math.floor((i+4)/5)*Math.floor((e+3)/4)*16;case Zo:return Math.floor((i+4)/5)*Math.floor((e+4)/5)*16;case $o:return Math.floor((i+5)/6)*Math.floor((e+4)/5)*16;case jo:return Math.floor((i+5)/6)*Math.floor((e+5)/6)*16;case Jo:return Math.floor((i+7)/8)*Math.floor((e+4)/5)*16;case Ko:return Math.floor((i+7)/8)*Math.floor((e+5)/6)*16;case Qo:return Math.floor((i+7)/8)*Math.floor((e+7)/8)*16;case ec:return Math.floor((i+9)/10)*Math.floor((e+4)/5)*16;case tc:return Math.floor((i+9)/10)*Math.floor((e+5)/6)*16;case nc:return Math.floor((i+9)/10)*Math.floor((e+7)/8)*16;case ic:return Math.floor((i+9)/10)*Math.floor((e+9)/10)*16;case sc:return Math.floor((i+11)/12)*Math.floor((e+9)/10)*16;case rc:return Math.floor((i+11)/12)*Math.floor((e+11)/12)*16;case qr:case ac:case oc:return Math.ceil(i/4)*Math.ceil(e/4)*16;case Gl:case cc:return Math.ceil(i/4)*Math.ceil(e/4)*8;case lc:case hc:return Math.ceil(i/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Mg(i){switch(i){case In:case Nl:return{byteLength:1,components:1};case Bs:case Ul:case ks:return{byteLength:2,components:1};case No:case Uo:return{byteLength:2,components:4};case _i:case Do:case Ln:return{byteLength:4,components:1};case Ol:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${i}.`)}var vo,pi,mi,Wu,Al,Xu,Rl,Mo,Cn,qn,Ht,Pn,$n,Yi,Cl,Pl,Il,qu,ui,Yu,Zu,$u,ju,Ju,Ku,Qu,ed,ka,za,td,nd,id,sd,rd,ad,od,cd,ld,bo,So,Eo,Zi,To,wo,Ao,Ro,Ll,hd,ud,jn,dd,fd,pd,Co,md,gd,_d,Dl,ts,ns,Po,Io,zr,Va,hi,Ha,ln,xd,Vr,yn,Lo,gi,In,Nl,Ul,Bs,Do,_i,Ln,ks,No,Uo,is,Ol,Fl,Bl,dn,kl,zl,qi,$i,Vl,Oo,Hl,Fo,Bo,Hr,Gr,Wr,Xr,ko,zo,Vo,Ho,Go,Wo,Xo,qo,Yo,Zo,$o,jo,Jo,Ko,Qo,ec,tc,nc,ic,sc,rc,qr,ac,oc,Gl,cc,lc,hc,hr,Ga,Ba,yl,vl,Ml,yd,vd,Wl,Md,Jn,Vt,ji,ur,ct,Xi,bl,bd,Sd,Ed,Xl,Td,wd,Ad,Rd,Sl,ql,Tn,dr,wn,Nt,xu,ar,Ds,Yt,oe,Ve,Zc,yu,vu,Mu,nt,ys,Wa,Hm,pr,Gm,Qt,yt,Xa,An,mr,qa,xt,A,jc,bu,Ft,zn,gn,_a,vs,Ms,bs,ii,si,Vi,tr,xa,ya,Hi,Wm,nr,Kc,Ji,Vn,Qc,va,ri,el,Ma,tl,Ki,_t,Ss,_n,Xm,qm,ai,ba,jt,Su,Eu,It,gr,Ym,Tu,Es,Hn,Sa,ir,Zm,$m,wu,Au,Ru,Cu,jm,Ts,nl,Et,xn,Gn,il,Wn,ws,As,Pu,sl,rl,al,ol,cl,ll,li,Dd,oi,Ea,We,Ut,Jm,Yn,_r,St,Ta,Kt,xr,yr,pt,Km,on,ul,Rs,Jt,sr,Rt,qt,Iu,Gi,wa,Lu,Aa,Ra,Ca,dl,Pa,Du,Ia,ut,vn,Nd,tg,ng,Mn,vr,ci,Nu,Uu,Ot,Cs,Ps,Ya,Mr,Za,br,Sr,fl,ig,sg,cn,Wi,Da,Ns,Er,$a,ja,Ou,rr,Na,pl,Fu,Ja,Bu,ku,Ka,hn,Tr,en,Us,Qa,Oa,ml,gl,_l,eo,wr,to,Ar,no,Rr,io,Cr,Vu,so,ro,ao,Pr,Ir,Zn,Lr,Dr,Os,Rn,oo,co,Qi,lo,ho,uo,un,di,fo,po,mo,Nr,fi,go,_o,Ud,xo,Ur,Or,xl,Hu,Gu,El,Fr,Tl,es,yo,Jl,fg,Kl,pg,mg,gg,_g,xg,yg,vg,wl,mt,AM,Fs,Br,kr,eh=lt(()=>{vo="171",pi={LEFT:0,MIDDLE:1,RIGHT:2,ROTATE:0,DOLLY:1,PAN:2},mi={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},Wu=0,Al=1,Xu=2,Rl=1,Mo=2,Cn=3,qn=0,Ht=1,Pn=2,$n=0,Yi=1,Cl=2,Pl=3,Il=4,qu=5,ui=100,Yu=101,Zu=102,$u=103,ju=104,Ju=200,Ku=201,Qu=202,ed=203,ka=204,za=205,td=206,nd=207,id=208,sd=209,rd=210,ad=211,od=212,cd=213,ld=214,bo=0,So=1,Eo=2,Zi=3,To=4,wo=5,Ao=6,Ro=7,Ll=0,hd=1,ud=2,jn=0,dd=1,fd=2,pd=3,Co=4,md=5,gd=6,_d=7,Dl=300,ts=301,ns=302,Po=303,Io=304,zr=306,Va=1e3,hi=1001,Ha=1002,ln=1003,xd=1004,Vr=1005,yn=1006,Lo=1007,gi=1008,In=1009,Nl=1010,Ul=1011,Bs=1012,Do=1013,_i=1014,Ln=1015,ks=1016,No=1017,Uo=1018,is=1020,Ol=35902,Fl=1021,Bl=1022,dn=1023,kl=1024,zl=1025,qi=1026,$i=1027,Vl=1028,Oo=1029,Hl=1030,Fo=1031,Bo=1033,Hr=33776,Gr=33777,Wr=33778,Xr=33779,ko=35840,zo=35841,Vo=35842,Ho=35843,Go=36196,Wo=37492,Xo=37496,qo=37808,Yo=37809,Zo=37810,$o=37811,jo=37812,Jo=37813,Ko=37814,Qo=37815,ec=37816,tc=37817,nc=37818,ic=37819,sc=37820,rc=37821,qr=36492,ac=36494,oc=36495,Gl=36283,cc=36284,lc=36285,hc=36286,hr=2300,Ga=2301,Ba=2302,yl=2400,vl=2401,Ml=2402,yd=3200,vd=3201,Wl=0,Md=1,Jn="",Vt="srgb",ji="srgb-linear",ur="linear",ct="srgb",Xi=7680,bl=519,bd=512,Sd=513,Ed=514,Xl=515,Td=516,wd=517,Ad=518,Rd=519,Sl=35044,ql="300 es",Tn=2e3,dr=2001,wn=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){if(this._listeners===void 0)return!1;let n=this._listeners;return n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){if(this._listeners===void 0)return;let s=this._listeners[e];if(s!==void 0){let r=s.indexOf(t);r!==-1&&s.splice(r,1)}}dispatchEvent(e){if(this._listeners===void 0)return;let n=this._listeners[e.type];if(n!==void 0){e.target=this;let s=n.slice(0);for(let r=0,a=s.length;r<a;r++)s[r].call(this,e);e.target=null}}},Nt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],xu=1234567,ar=Math.PI/180,Ds=180/Math.PI;Yt={DEG2RAD:ar,RAD2DEG:Ds,generateUUID:zs,clamp:Ge,euclideanModulo:Yl,mapLinear:Tm,inverseLerp:wm,lerp:or,damp:Am,pingpong:Rm,smoothstep:Cm,smootherstep:Pm,randInt:Im,randFloat:Lm,randFloatSpread:Dm,seededRandom:Nm,degToRad:Um,radToDeg:Om,isPowerOfTwo:Fm,ceilPowerOfTwo:Bm,floorPowerOfTwo:km,setQuaternionFromProperEuler:zm,normalize:zt,denormalize:Is},oe=class i{constructor(e=0,t=0){i.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,s=e.elements;return this.x=s[0]*t+s[3]*n+s[6],this.y=s[1]*t+s[4]*n+s[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Ge(this.x,e.x,t.x),this.y=Ge(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=Ge(this.x,e,t),this.y=Ge(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Ge(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(Ge(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),s=Math.sin(t),r=this.x-e.x,a=this.y-e.y;return this.x=r*n-a*s+e.x,this.y=r*s+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},Ve=class i{constructor(e,t,n,s,r,a,o,c,l){i.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,a,o,c,l)}set(e,t,n,s,r,a,o,c,l){let h=this.elements;return h[0]=e,h[1]=s,h[2]=o,h[3]=t,h[4]=r,h[5]=c,h[6]=n,h[7]=a,h[8]=l,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,s=t.elements,r=this.elements,a=n[0],o=n[3],c=n[6],l=n[1],h=n[4],u=n[7],d=n[2],p=n[5],g=n[8],_=s[0],m=s[3],f=s[6],T=s[1],E=s[4],b=s[7],P=s[2],R=s[5],C=s[8];return r[0]=a*_+o*T+c*P,r[3]=a*m+o*E+c*R,r[6]=a*f+o*b+c*C,r[1]=l*_+h*T+u*P,r[4]=l*m+h*E+u*R,r[7]=l*f+h*b+u*C,r[2]=d*_+p*T+g*P,r[5]=d*m+p*E+g*R,r[8]=d*f+p*b+g*C,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],c=e[6],l=e[7],h=e[8];return t*a*h-t*o*l-n*r*h+n*o*c+s*r*l-s*a*c}invert(){let e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],c=e[6],l=e[7],h=e[8],u=h*a-o*l,d=o*c-h*r,p=l*r-a*c,g=t*u+n*d+s*p;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let _=1/g;return e[0]=u*_,e[1]=(s*l-h*n)*_,e[2]=(o*n-s*a)*_,e[3]=d*_,e[4]=(h*t-s*c)*_,e[5]=(s*r-o*t)*_,e[6]=p*_,e[7]=(n*c-l*t)*_,e[8]=(a*t-n*r)*_,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,s,r,a,o){let c=Math.cos(r),l=Math.sin(r);return this.set(n*c,n*l,-n*(c*a+l*o)+a+e,-s*l,s*c,-s*(-l*a+c*o)+o+t,0,0,1),this}scale(e,t){return this.premultiply(Zc.makeScale(e,t)),this}rotate(e){return this.premultiply(Zc.makeRotation(-e)),this}translate(e,t){return this.premultiply(Zc.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let s=0;s<9;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Zc=new Ve;yu={};vu=new Ve().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Mu=new Ve().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);nt=Vm();Wa=class{static getDataURL(e){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let t;if(e instanceof HTMLCanvasElement)t=e;else{ys===void 0&&(ys=fr("canvas")),ys.width=e.width,ys.height=e.height;let n=ys.getContext("2d");e instanceof ImageData?n.putImageData(e,0,0):n.drawImage(e,0,0,e.width,e.height),t=ys}return t.width>2048||t.height>2048?(console.warn("THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons",e),t.toDataURL("image/jpeg",.6)):t.toDataURL("image/png")}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=fr("canvas");t.width=e.width,t.height=e.height;let n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);let s=n.getImageData(0,0,e.width,e.height),r=s.data;for(let a=0;a<r.length;a++)r[a]=Xn(r[a]/255)*255;return n.putImageData(s,0,0),t}else if(e.data){let t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(Xn(t[n]/255)*255):t[n]=Xn(t[n]);return{data:t,width:e.width,height:e.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}},Hm=0,pr=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Hm++}),this.uuid=zs(),this.data=e,this.dataReady=!0,this.version=0}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let a=0,o=s.length;a<o;a++)s[a].isDataTexture?r.push($c(s[a].image)):r.push($c(s[a]))}else r=$c(s);n.url=r}return t||(e.images[this.uuid]=n),n}};Gm=0,Qt=class i extends wn{constructor(e=i.DEFAULT_IMAGE,t=i.DEFAULT_MAPPING,n=hi,s=hi,r=yn,a=gi,o=dn,c=In,l=i.DEFAULT_ANISOTROPY,h=Jn){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Gm++}),this.uuid=zs(),this.name="",this.source=new pr(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=a,this.anisotropy=l,this.format=o,this.internalFormat=null,this.type=c,this.offset=new oe(0,0),this.repeat=new oe(1,1),this.center=new oe(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Ve,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.version=0,this.onUpdate=null,this.isRenderTargetTexture=!1,this.pmremVersion=0}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.6,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Dl)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case Va:e.x=e.x-Math.floor(e.x);break;case hi:e.x=e.x<0?0:1;break;case Ha:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case Va:e.y=e.y-Math.floor(e.y);break;case hi:e.y=e.y<0?0:1;break;case Ha:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};Qt.DEFAULT_IMAGE=null;Qt.DEFAULT_MAPPING=Dl;Qt.DEFAULT_ANISOTROPY=1;yt=class i{constructor(e=0,t=0,n=0,s=1){i.prototype.isVector4=!0,this.x=e,this.y=t,this.z=n,this.w=s}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,s){return this.x=e,this.y=t,this.z=n,this.w=s,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,s=this.z,r=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*s+a[12]*r,this.y=a[1]*t+a[5]*n+a[9]*s+a[13]*r,this.z=a[2]*t+a[6]*n+a[10]*s+a[14]*r,this.w=a[3]*t+a[7]*n+a[11]*s+a[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,s,r,c=e.elements,l=c[0],h=c[4],u=c[8],d=c[1],p=c[5],g=c[9],_=c[2],m=c[6],f=c[10];if(Math.abs(h-d)<.01&&Math.abs(u-_)<.01&&Math.abs(g-m)<.01){if(Math.abs(h+d)<.1&&Math.abs(u+_)<.1&&Math.abs(g+m)<.1&&Math.abs(l+p+f-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;let E=(l+1)/2,b=(p+1)/2,P=(f+1)/2,R=(h+d)/4,C=(u+_)/4,L=(g+m)/4;return E>b&&E>P?E<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(E),s=R/n,r=C/n):b>P?b<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(b),n=R/s,r=L/s):P<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(P),n=C/r,s=L/r),this.set(n,s,r,t),this}let T=Math.sqrt((m-g)*(m-g)+(u-_)*(u-_)+(d-h)*(d-h));return Math.abs(T)<.001&&(T=1),this.x=(m-g)/T,this.y=(u-_)/T,this.z=(d-h)/T,this.w=Math.acos((l+p+f-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Ge(this.x,e.x,t.x),this.y=Ge(this.y,e.y,t.y),this.z=Ge(this.z,e.z,t.z),this.w=Ge(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=Ge(this.x,e,t),this.y=Ge(this.y,e,t),this.z=Ge(this.z,e,t),this.w=Ge(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Ge(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},Xa=class extends wn{constructor(e=1,t=1,n={}){super(),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=1,this.scissor=new yt(0,0,e,t),this.scissorTest=!1,this.viewport=new yt(0,0,e,t);let s={width:e,height:t,depth:1};n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:yn,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1},n);let r=new Qt(s,n.mapping,n.wrapS,n.wrapT,n.magFilter,n.minFilter,n.format,n.type,n.anisotropy,n.colorSpace);r.flipY=!1,r.generateMipmaps=n.generateMipmaps,r.internalFormat=n.internalFormat,this.textures=[];let a=n.count;for(let o=0;o<a;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0;this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.depthTexture=n.depthTexture,this.samples=n.samples}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=e,this.textures[s].image.height=t,this.textures[s].image.depth=n;this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let n=0,s=e.textures.length;n<s;n++)this.textures[n]=e.textures[n].clone(),this.textures[n].isRenderTargetTexture=!0;let t=Object.assign({},e.texture.image);return this.texture.source=new pr(t),this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}},An=class extends Xa{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},mr=class extends Qt{constructor(e=null,t=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=ln,this.minFilter=ln,this.wrapR=hi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}},qa=class extends Qt{constructor(e=null,t=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=ln,this.minFilter=ln,this.wrapR=hi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},xt=class{constructor(e=0,t=0,n=0,s=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=s}static slerpFlat(e,t,n,s,r,a,o){let c=n[s+0],l=n[s+1],h=n[s+2],u=n[s+3],d=r[a+0],p=r[a+1],g=r[a+2],_=r[a+3];if(o===0){e[t+0]=c,e[t+1]=l,e[t+2]=h,e[t+3]=u;return}if(o===1){e[t+0]=d,e[t+1]=p,e[t+2]=g,e[t+3]=_;return}if(u!==_||c!==d||l!==p||h!==g){let m=1-o,f=c*d+l*p+h*g+u*_,T=f>=0?1:-1,E=1-f*f;if(E>Number.EPSILON){let P=Math.sqrt(E),R=Math.atan2(P,f*T);m=Math.sin(m*R)/P,o=Math.sin(o*R)/P}let b=o*T;if(c=c*m+d*b,l=l*m+p*b,h=h*m+g*b,u=u*m+_*b,m===1-o){let P=1/Math.sqrt(c*c+l*l+h*h+u*u);c*=P,l*=P,h*=P,u*=P}}e[t]=c,e[t+1]=l,e[t+2]=h,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,s,r,a){let o=n[s],c=n[s+1],l=n[s+2],h=n[s+3],u=r[a],d=r[a+1],p=r[a+2],g=r[a+3];return e[t]=o*g+h*u+c*p-l*d,e[t+1]=c*g+h*d+l*u-o*p,e[t+2]=l*g+h*p+o*d-c*u,e[t+3]=h*g-o*u-c*d-l*p,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,s){return this._x=e,this._y=t,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,s=e._y,r=e._z,a=e._order,o=Math.cos,c=Math.sin,l=o(n/2),h=o(s/2),u=o(r/2),d=c(n/2),p=c(s/2),g=c(r/2);switch(a){case"XYZ":this._x=d*h*u+l*p*g,this._y=l*p*u-d*h*g,this._z=l*h*g+d*p*u,this._w=l*h*u-d*p*g;break;case"YXZ":this._x=d*h*u+l*p*g,this._y=l*p*u-d*h*g,this._z=l*h*g-d*p*u,this._w=l*h*u+d*p*g;break;case"ZXY":this._x=d*h*u-l*p*g,this._y=l*p*u+d*h*g,this._z=l*h*g+d*p*u,this._w=l*h*u-d*p*g;break;case"ZYX":this._x=d*h*u-l*p*g,this._y=l*p*u+d*h*g,this._z=l*h*g-d*p*u,this._w=l*h*u+d*p*g;break;case"YZX":this._x=d*h*u+l*p*g,this._y=l*p*u+d*h*g,this._z=l*h*g-d*p*u,this._w=l*h*u-d*p*g;break;case"XZY":this._x=d*h*u-l*p*g,this._y=l*p*u-d*h*g,this._z=l*h*g+d*p*u,this._w=l*h*u+d*p*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,s=Math.sin(n);return this._x=e.x*s,this._y=e.y*s,this._z=e.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],s=t[4],r=t[8],a=t[1],o=t[5],c=t[9],l=t[2],h=t[6],u=t[10],d=n+o+u;if(d>0){let p=.5/Math.sqrt(d+1);this._w=.25/p,this._x=(h-c)*p,this._y=(r-l)*p,this._z=(a-s)*p}else if(n>o&&n>u){let p=2*Math.sqrt(1+n-o-u);this._w=(h-c)/p,this._x=.25*p,this._y=(s+a)/p,this._z=(r+l)/p}else if(o>u){let p=2*Math.sqrt(1+o-n-u);this._w=(r-l)/p,this._x=(s+a)/p,this._y=.25*p,this._z=(c+h)/p}else{let p=2*Math.sqrt(1+u-n-o);this._w=(a-s)/p,this._x=(r+l)/p,this._y=(c+h)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<Number.EPSILON?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Ge(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let s=Math.min(1,t/n);return this.slerp(e,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,s=e._y,r=e._z,a=e._w,o=t._x,c=t._y,l=t._z,h=t._w;return this._x=n*h+a*o+s*l-r*c,this._y=s*h+a*c+r*o-n*l,this._z=r*h+a*l+n*c-s*o,this._w=a*h-n*o-s*c-r*l,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);let n=this._x,s=this._y,r=this._z,a=this._w,o=a*e._w+n*e._x+s*e._y+r*e._z;if(o<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,o=-o):this.copy(e),o>=1)return this._w=a,this._x=n,this._y=s,this._z=r,this;let c=1-o*o;if(c<=Number.EPSILON){let p=1-t;return this._w=p*a+t*this._w,this._x=p*n+t*this._x,this._y=p*s+t*this._y,this._z=p*r+t*this._z,this.normalize(),this}let l=Math.sqrt(c),h=Math.atan2(l,o),u=Math.sin((1-t)*h)/l,d=Math.sin(t*h)/l;return this._w=a*u+this._w*d,this._x=n*u+this._x*d,this._y=s*u+this._y*d,this._z=r*u+this._z*d,this._onChangeCallback(),this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(e),s*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},A=class i{constructor(e=0,t=0,n=0){i.prototype.isVector3=!0,this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(bu.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(bu.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*s,this.y=r[1]*t+r[4]*n+r[7]*s,this.z=r[2]*t+r[5]*n+r[8]*s,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,s=this.z,r=e.elements,a=1/(r[3]*t+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*s+r[12])*a,this.y=(r[1]*t+r[5]*n+r[9]*s+r[13])*a,this.z=(r[2]*t+r[6]*n+r[10]*s+r[14])*a,this}applyQuaternion(e){let t=this.x,n=this.y,s=this.z,r=e.x,a=e.y,o=e.z,c=e.w,l=2*(a*s-o*n),h=2*(o*t-r*s),u=2*(r*n-a*t);return this.x=t+c*l+a*u-o*h,this.y=n+c*h+o*l-r*u,this.z=s+c*u+r*h-a*l,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*s,this.y=r[1]*t+r[5]*n+r[9]*s,this.z=r[2]*t+r[6]*n+r[10]*s,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Ge(this.x,e.x,t.x),this.y=Ge(this.y,e.y,t.y),this.z=Ge(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=Ge(this.x,e,t),this.y=Ge(this.y,e,t),this.z=Ge(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Ge(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,s=e.y,r=e.z,a=t.x,o=t.y,c=t.z;return this.x=s*c-r*o,this.y=r*a-n*c,this.z=n*o-s*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return jc.copy(this).projectOnVector(e),this.sub(jc)}reflect(e){return this.sub(jc.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(Ge(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,s=this.z-e.z;return t*t+n*n+s*s}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let s=Math.sin(t)*e;return this.x=s*Math.sin(n),this.y=Math.cos(t)*e,this.z=s*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),s=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=s,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},jc=new A,bu=new xt,Ft=class{constructor(e=new A(1/0,1/0,1/0),t=new A(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(gn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(gn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=gn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let a=0,o=r.count;a<o;a++)e.isMesh===!0?e.getVertexPosition(a,gn):gn.fromBufferAttribute(r,a),gn.applyMatrix4(e.matrixWorld),this.expandByPoint(gn);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),_a.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),_a.copy(n.boundingBox)),_a.applyMatrix4(e.matrixWorld),this.union(_a)}let s=e.children;for(let r=0,a=s.length;r<a;r++)this.expandByObject(s[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,gn),gn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(tr),xa.subVectors(this.max,tr),vs.subVectors(e.a,tr),Ms.subVectors(e.b,tr),bs.subVectors(e.c,tr),ii.subVectors(Ms,vs),si.subVectors(bs,Ms),Vi.subVectors(vs,bs);let t=[0,-ii.z,ii.y,0,-si.z,si.y,0,-Vi.z,Vi.y,ii.z,0,-ii.x,si.z,0,-si.x,Vi.z,0,-Vi.x,-ii.y,ii.x,0,-si.y,si.x,0,-Vi.y,Vi.x,0];return!Jc(t,vs,Ms,bs,xa)||(t=[1,0,0,0,1,0,0,0,1],!Jc(t,vs,Ms,bs,xa))?!1:(ya.crossVectors(ii,si),t=[ya.x,ya.y,ya.z],Jc(t,vs,Ms,bs,xa))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,gn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(gn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(zn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),zn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),zn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),zn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),zn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),zn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),zn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),zn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(zn),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}},zn=[new A,new A,new A,new A,new A,new A,new A,new A],gn=new A,_a=new Ft,vs=new A,Ms=new A,bs=new A,ii=new A,si=new A,Vi=new A,tr=new A,xa=new A,ya=new A,Hi=new A;Wm=new Ft,nr=new A,Kc=new A,Ji=class{constructor(e=new A,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t!==void 0?n.copy(t):Wm.setFromPoints(e).getCenter(n);let s=0;for(let r=0,a=e.length;r<a;r++)s=Math.max(s,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(s),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;nr.subVectors(e,this.center);let t=nr.lengthSq();if(t>this.radius*this.radius){let n=Math.sqrt(t),s=(n-this.radius)*.5;this.center.addScaledVector(nr,s/n),this.radius+=s}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Kc.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(nr.copy(e.center).add(Kc)),this.expandByPoint(nr.copy(e.center).sub(Kc))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}},Vn=new A,Qc=new A,va=new A,ri=new A,el=new A,Ma=new A,tl=new A,Ki=class{constructor(e=new A,t=new A(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Vn)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=Vn.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Vn.copy(this.origin).addScaledVector(this.direction,t),Vn.distanceToSquared(e))}distanceSqToSegment(e,t,n,s){Qc.copy(e).add(t).multiplyScalar(.5),va.copy(t).sub(e).normalize(),ri.copy(this.origin).sub(Qc);let r=e.distanceTo(t)*.5,a=-this.direction.dot(va),o=ri.dot(this.direction),c=-ri.dot(va),l=ri.lengthSq(),h=Math.abs(1-a*a),u,d,p,g;if(h>0)if(u=a*c-o,d=a*o-c,g=r*h,u>=0)if(d>=-g)if(d<=g){let _=1/h;u*=_,d*=_,p=u*(u+a*d+2*o)+d*(a*u+d+2*c)+l}else d=r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*c)+l;else d=-r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*c)+l;else d<=-g?(u=Math.max(0,-(-a*r+o)),d=u>0?-r:Math.min(Math.max(-r,-c),r),p=-u*u+d*(d+2*c)+l):d<=g?(u=0,d=Math.min(Math.max(-r,-c),r),p=d*(d+2*c)+l):(u=Math.max(0,-(a*r+o)),d=u>0?r:Math.min(Math.max(-r,-c),r),p=-u*u+d*(d+2*c)+l);else d=a>0?-r:r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*c)+l;return n&&n.copy(this.origin).addScaledVector(this.direction,u),s&&s.copy(Qc).addScaledVector(va,d),p}intersectSphere(e,t){Vn.subVectors(e.center,this.origin);let n=Vn.dot(this.direction),s=Vn.dot(Vn)-n*n,r=e.radius*e.radius;if(s>r)return null;let a=Math.sqrt(r-s),o=n-a,c=n+a;return c<0?null:o<0?this.at(c,t):this.at(o,t)}intersectsSphere(e){return this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,s,r,a,o,c,l=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,d=this.origin;return l>=0?(n=(e.min.x-d.x)*l,s=(e.max.x-d.x)*l):(n=(e.max.x-d.x)*l,s=(e.min.x-d.x)*l),h>=0?(r=(e.min.y-d.y)*h,a=(e.max.y-d.y)*h):(r=(e.max.y-d.y)*h,a=(e.min.y-d.y)*h),n>a||r>s||((r>n||isNaN(n))&&(n=r),(a<s||isNaN(s))&&(s=a),u>=0?(o=(e.min.z-d.z)*u,c=(e.max.z-d.z)*u):(o=(e.max.z-d.z)*u,c=(e.min.z-d.z)*u),n>c||o>s)||((o>n||n!==n)&&(n=o),(c<s||s!==s)&&(s=c),s<0)?null:this.at(n>=0?n:s,t)}intersectsBox(e){return this.intersectBox(e,Vn)!==null}intersectTriangle(e,t,n,s,r){el.subVectors(t,e),Ma.subVectors(n,e),tl.crossVectors(el,Ma);let a=this.direction.dot(tl),o;if(a>0){if(s)return null;o=1}else if(a<0)o=-1,a=-a;else return null;ri.subVectors(this.origin,e);let c=o*this.direction.dot(Ma.crossVectors(ri,Ma));if(c<0)return null;let l=o*this.direction.dot(el.cross(ri));if(l<0||c+l>a)return null;let h=-o*ri.dot(tl);return h<0?null:this.at(h/a,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},_t=class i{constructor(e,t,n,s,r,a,o,c,l,h,u,d,p,g,_,m){i.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,a,o,c,l,h,u,d,p,g,_,m)}set(e,t,n,s,r,a,o,c,l,h,u,d,p,g,_,m){let f=this.elements;return f[0]=e,f[4]=t,f[8]=n,f[12]=s,f[1]=r,f[5]=a,f[9]=o,f[13]=c,f[2]=l,f[6]=h,f[10]=u,f[14]=d,f[3]=p,f[7]=g,f[11]=_,f[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new i().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){let t=this.elements,n=e.elements,s=1/Ss.setFromMatrixColumn(e,0).length(),r=1/Ss.setFromMatrixColumn(e,1).length(),a=1/Ss.setFromMatrixColumn(e,2).length();return t[0]=n[0]*s,t[1]=n[1]*s,t[2]=n[2]*s,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,s=e.y,r=e.z,a=Math.cos(n),o=Math.sin(n),c=Math.cos(s),l=Math.sin(s),h=Math.cos(r),u=Math.sin(r);if(e.order==="XYZ"){let d=a*h,p=a*u,g=o*h,_=o*u;t[0]=c*h,t[4]=-c*u,t[8]=l,t[1]=p+g*l,t[5]=d-_*l,t[9]=-o*c,t[2]=_-d*l,t[6]=g+p*l,t[10]=a*c}else if(e.order==="YXZ"){let d=c*h,p=c*u,g=l*h,_=l*u;t[0]=d+_*o,t[4]=g*o-p,t[8]=a*l,t[1]=a*u,t[5]=a*h,t[9]=-o,t[2]=p*o-g,t[6]=_+d*o,t[10]=a*c}else if(e.order==="ZXY"){let d=c*h,p=c*u,g=l*h,_=l*u;t[0]=d-_*o,t[4]=-a*u,t[8]=g+p*o,t[1]=p+g*o,t[5]=a*h,t[9]=_-d*o,t[2]=-a*l,t[6]=o,t[10]=a*c}else if(e.order==="ZYX"){let d=a*h,p=a*u,g=o*h,_=o*u;t[0]=c*h,t[4]=g*l-p,t[8]=d*l+_,t[1]=c*u,t[5]=_*l+d,t[9]=p*l-g,t[2]=-l,t[6]=o*c,t[10]=a*c}else if(e.order==="YZX"){let d=a*c,p=a*l,g=o*c,_=o*l;t[0]=c*h,t[4]=_-d*u,t[8]=g*u+p,t[1]=u,t[5]=a*h,t[9]=-o*h,t[2]=-l*h,t[6]=p*u+g,t[10]=d-_*u}else if(e.order==="XZY"){let d=a*c,p=a*l,g=o*c,_=o*l;t[0]=c*h,t[4]=-u,t[8]=l*h,t[1]=d*u+_,t[5]=a*h,t[9]=p*u-g,t[2]=g*u-p,t[6]=o*h,t[10]=_*u+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Xm,e,qm)}lookAt(e,t,n){let s=this.elements;return jt.subVectors(e,t),jt.lengthSq()===0&&(jt.z=1),jt.normalize(),ai.crossVectors(n,jt),ai.lengthSq()===0&&(Math.abs(n.z)===1?jt.x+=1e-4:jt.z+=1e-4,jt.normalize(),ai.crossVectors(n,jt)),ai.normalize(),ba.crossVectors(jt,ai),s[0]=ai.x,s[4]=ba.x,s[8]=jt.x,s[1]=ai.y,s[5]=ba.y,s[9]=jt.y,s[2]=ai.z,s[6]=ba.z,s[10]=jt.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,s=t.elements,r=this.elements,a=n[0],o=n[4],c=n[8],l=n[12],h=n[1],u=n[5],d=n[9],p=n[13],g=n[2],_=n[6],m=n[10],f=n[14],T=n[3],E=n[7],b=n[11],P=n[15],R=s[0],C=s[4],L=s[8],M=s[12],v=s[1],I=s[5],z=s[9],F=s[13],G=s[2],$=s[6],W=s[10],ee=s[14],V=s[3],re=s[7],pe=s[11],Se=s[15];return r[0]=a*R+o*v+c*G+l*V,r[4]=a*C+o*I+c*$+l*re,r[8]=a*L+o*z+c*W+l*pe,r[12]=a*M+o*F+c*ee+l*Se,r[1]=h*R+u*v+d*G+p*V,r[5]=h*C+u*I+d*$+p*re,r[9]=h*L+u*z+d*W+p*pe,r[13]=h*M+u*F+d*ee+p*Se,r[2]=g*R+_*v+m*G+f*V,r[6]=g*C+_*I+m*$+f*re,r[10]=g*L+_*z+m*W+f*pe,r[14]=g*M+_*F+m*ee+f*Se,r[3]=T*R+E*v+b*G+P*V,r[7]=T*C+E*I+b*$+P*re,r[11]=T*L+E*z+b*W+P*pe,r[15]=T*M+E*F+b*ee+P*Se,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],s=e[8],r=e[12],a=e[1],o=e[5],c=e[9],l=e[13],h=e[2],u=e[6],d=e[10],p=e[14],g=e[3],_=e[7],m=e[11],f=e[15];return g*(+r*c*u-s*l*u-r*o*d+n*l*d+s*o*p-n*c*p)+_*(+t*c*p-t*l*d+r*a*d-s*a*p+s*l*h-r*c*h)+m*(+t*l*u-t*o*p-r*a*u+n*a*p+r*o*h-n*l*h)+f*(-s*o*h-t*c*u+t*o*d+s*a*u-n*a*d+n*c*h)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let s=this.elements;return e.isVector3?(s[12]=e.x,s[13]=e.y,s[14]=e.z):(s[12]=e,s[13]=t,s[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],c=e[6],l=e[7],h=e[8],u=e[9],d=e[10],p=e[11],g=e[12],_=e[13],m=e[14],f=e[15],T=u*m*l-_*d*l+_*c*p-o*m*p-u*c*f+o*d*f,E=g*d*l-h*m*l-g*c*p+a*m*p+h*c*f-a*d*f,b=h*_*l-g*u*l+g*o*p-a*_*p-h*o*f+a*u*f,P=g*u*c-h*_*c-g*o*d+a*_*d+h*o*m-a*u*m,R=t*T+n*E+s*b+r*P;if(R===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let C=1/R;return e[0]=T*C,e[1]=(_*d*r-u*m*r-_*s*p+n*m*p+u*s*f-n*d*f)*C,e[2]=(o*m*r-_*c*r+_*s*l-n*m*l-o*s*f+n*c*f)*C,e[3]=(u*c*r-o*d*r-u*s*l+n*d*l+o*s*p-n*c*p)*C,e[4]=E*C,e[5]=(h*m*r-g*d*r+g*s*p-t*m*p-h*s*f+t*d*f)*C,e[6]=(g*c*r-a*m*r-g*s*l+t*m*l+a*s*f-t*c*f)*C,e[7]=(a*d*r-h*c*r+h*s*l-t*d*l-a*s*p+t*c*p)*C,e[8]=b*C,e[9]=(g*u*r-h*_*r-g*n*p+t*_*p+h*n*f-t*u*f)*C,e[10]=(a*_*r-g*o*r+g*n*l-t*_*l-a*n*f+t*o*f)*C,e[11]=(h*o*r-a*u*r-h*n*l+t*u*l+a*n*p-t*o*p)*C,e[12]=P*C,e[13]=(h*_*s-g*u*s+g*n*d-t*_*d-h*n*m+t*u*m)*C,e[14]=(g*o*s-a*_*s-g*n*c+t*_*c+a*n*m-t*o*m)*C,e[15]=(a*u*s-h*o*s+h*n*c-t*u*c-a*n*d+t*o*d)*C,this}scale(e){let t=this.elements,n=e.x,s=e.y,r=e.z;return t[0]*=n,t[4]*=s,t[8]*=r,t[1]*=n,t[5]*=s,t[9]*=r,t[2]*=n,t[6]*=s,t[10]*=r,t[3]*=n,t[7]*=s,t[11]*=r,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],s=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,s))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),s=Math.sin(t),r=1-n,a=e.x,o=e.y,c=e.z,l=r*a,h=r*o;return this.set(l*a+n,l*o-s*c,l*c+s*o,0,l*o+s*c,h*o+n,h*c-s*a,0,l*c-s*o,h*c+s*a,r*c*c+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,s,r,a){return this.set(1,n,r,0,e,1,a,0,t,s,1,0,0,0,0,1),this}compose(e,t,n){let s=this.elements,r=t._x,a=t._y,o=t._z,c=t._w,l=r+r,h=a+a,u=o+o,d=r*l,p=r*h,g=r*u,_=a*h,m=a*u,f=o*u,T=c*l,E=c*h,b=c*u,P=n.x,R=n.y,C=n.z;return s[0]=(1-(_+f))*P,s[1]=(p+b)*P,s[2]=(g-E)*P,s[3]=0,s[4]=(p-b)*R,s[5]=(1-(d+f))*R,s[6]=(m+T)*R,s[7]=0,s[8]=(g+E)*C,s[9]=(m-T)*C,s[10]=(1-(d+_))*C,s[11]=0,s[12]=e.x,s[13]=e.y,s[14]=e.z,s[15]=1,this}decompose(e,t,n){let s=this.elements,r=Ss.set(s[0],s[1],s[2]).length(),a=Ss.set(s[4],s[5],s[6]).length(),o=Ss.set(s[8],s[9],s[10]).length();this.determinant()<0&&(r=-r),e.x=s[12],e.y=s[13],e.z=s[14],_n.copy(this);let l=1/r,h=1/a,u=1/o;return _n.elements[0]*=l,_n.elements[1]*=l,_n.elements[2]*=l,_n.elements[4]*=h,_n.elements[5]*=h,_n.elements[6]*=h,_n.elements[8]*=u,_n.elements[9]*=u,_n.elements[10]*=u,t.setFromRotationMatrix(_n),n.x=r,n.y=a,n.z=o,this}makePerspective(e,t,n,s,r,a,o=Tn){let c=this.elements,l=2*r/(t-e),h=2*r/(n-s),u=(t+e)/(t-e),d=(n+s)/(n-s),p,g;if(o===Tn)p=-(a+r)/(a-r),g=-2*a*r/(a-r);else if(o===dr)p=-a/(a-r),g=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=l,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=h,c[9]=d,c[13]=0,c[2]=0,c[6]=0,c[10]=p,c[14]=g,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,s,r,a,o=Tn){let c=this.elements,l=1/(t-e),h=1/(n-s),u=1/(a-r),d=(t+e)*l,p=(n+s)*h,g,_;if(o===Tn)g=(a+r)*u,_=-2*u;else if(o===dr)g=r*u,_=-1*u;else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=2*l,c[4]=0,c[8]=0,c[12]=-d,c[1]=0,c[5]=2*h,c[9]=0,c[13]=-p,c[2]=0,c[6]=0,c[10]=_,c[14]=-g,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let s=0;s<16;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},Ss=new A,_n=new _t,Xm=new A(0,0,0),qm=new A(1,1,1),ai=new A,ba=new A,jt=new A,Su=new _t,Eu=new xt,It=class i{constructor(e=0,t=0,n=0,s=i.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=s}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,s=this._order){return this._x=e,this._y=t,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let s=e.elements,r=s[0],a=s[4],o=s[8],c=s[1],l=s[5],h=s[9],u=s[2],d=s[6],p=s[10];switch(t){case"XYZ":this._y=Math.asin(Ge(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,p),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(d,l),this._z=0);break;case"YXZ":this._x=Math.asin(-Ge(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,p),this._z=Math.atan2(c,l)):(this._y=Math.atan2(-u,r),this._z=0);break;case"ZXY":this._x=Math.asin(Ge(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,p),this._z=Math.atan2(-a,l)):(this._y=0,this._z=Math.atan2(c,r));break;case"ZYX":this._y=Math.asin(-Ge(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,p),this._z=Math.atan2(c,r)):(this._x=0,this._z=Math.atan2(-a,l));break;case"YZX":this._z=Math.asin(Ge(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-h,l),this._y=Math.atan2(-u,r)):(this._x=0,this._y=Math.atan2(o,p));break;case"XZY":this._z=Math.asin(-Ge(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,l),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-h,p),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return Su.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Su,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return Eu.setFromEuler(this),this.setFromQuaternion(Eu,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};It.DEFAULT_ORDER="XYZ";gr=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}},Ym=0,Tu=new A,Es=new xt,Hn=new _t,Sa=new A,ir=new A,Zm=new A,$m=new xt,wu=new A(1,0,0),Au=new A(0,1,0),Ru=new A(0,0,1),Cu={type:"added"},jm={type:"removed"},Ts={type:"childadded",child:null},nl={type:"childremoved",child:null},Et=class i extends wn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Ym++}),this.uuid=zs(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=i.DEFAULT_UP.clone();let e=new A,t=new It,n=new xt,s=new A(1,1,1);function r(){n.setFromEuler(t,!1)}function a(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new _t},normalMatrix:{value:new Ve}}),this.matrix=new _t,this.matrixWorld=new _t,this.matrixAutoUpdate=i.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=i.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new gr,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Es.setFromAxisAngle(e,t),this.quaternion.multiply(Es),this}rotateOnWorldAxis(e,t){return Es.setFromAxisAngle(e,t),this.quaternion.premultiply(Es),this}rotateX(e){return this.rotateOnAxis(wu,e)}rotateY(e){return this.rotateOnAxis(Au,e)}rotateZ(e){return this.rotateOnAxis(Ru,e)}translateOnAxis(e,t){return Tu.copy(e).applyQuaternion(this.quaternion),this.position.add(Tu.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(wu,e)}translateY(e){return this.translateOnAxis(Au,e)}translateZ(e){return this.translateOnAxis(Ru,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Hn.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?Sa.copy(e):Sa.set(e,t,n);let s=this.parent;this.updateWorldMatrix(!0,!1),ir.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Hn.lookAt(ir,Sa,this.up):Hn.lookAt(Sa,ir,this.up),this.quaternion.setFromRotationMatrix(Hn),s&&(Hn.extractRotation(s.matrixWorld),Es.setFromRotationMatrix(Hn),this.quaternion.premultiply(Es.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(Cu),Ts.child=e,this.dispatchEvent(Ts),Ts.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(jm),nl.child=e,this.dispatchEvent(nl),nl.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),Hn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Hn.multiply(e.parent.matrixWorld)),e.applyMatrix4(Hn),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(Cu),Ts.child=e,this.dispatchEvent(Ts),Ts.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,s=this.children.length;n<s;n++){let a=this.children[n].getObjectByProperty(e,t);if(a!==void 0)return a}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let s=this.children;for(let r=0,a=s.length;r<a;r++)s[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ir,e,Zm),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(ir,$m,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t){let n=this.parent;if(e===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){let s=this.children;for(let r=0,a=s.length;r<a;r++)s[r].updateWorldMatrix(!1,!0)}}toJSON(e){let t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.6,type:"Object",generator:"Object3D.toJSON"});let s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.visibility=this._visibility,s.active=this._active,s.bounds=this._bounds.map(o=>({boxInitialized:o.boxInitialized,boxMin:o.box.min.toArray(),boxMax:o.box.max.toArray(),sphereInitialized:o.sphereInitialized,sphereRadius:o.sphere.radius,sphereCenter:o.sphere.center.toArray()})),s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.geometryCount=this._geometryCount,s.matricesTexture=this._matricesTexture.toJSON(e),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(s.boundingSphere={center:s.boundingSphere.center.toArray(),radius:s.boundingSphere.radius}),this.boundingBox!==null&&(s.boundingBox={min:s.boundingBox.min.toArray(),max:s.boundingBox.max.toArray()}));function r(o,c){return o[c.uuid]===void 0&&(o[c.uuid]=c.toJSON(e)),c.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(e.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let c=o.shapes;if(Array.isArray(c))for(let l=0,h=c.length;l<h;l++){let u=c[l];r(e.shapes,u)}else r(e.shapes,c)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let c=0,l=this.material.length;c<l;c++)o.push(r(e.materials,this.material[c]));s.material=o}else s.material=r(e.materials,this.material);if(this.children.length>0){s.children=[];for(let o=0;o<this.children.length;o++)s.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){s.animations=[];for(let o=0;o<this.animations.length;o++){let c=this.animations[o];s.animations.push(r(e.animations,c))}}if(t){let o=a(e.geometries),c=a(e.materials),l=a(e.textures),h=a(e.images),u=a(e.shapes),d=a(e.skeletons),p=a(e.animations),g=a(e.nodes);o.length>0&&(n.geometries=o),c.length>0&&(n.materials=c),l.length>0&&(n.textures=l),h.length>0&&(n.images=h),u.length>0&&(n.shapes=u),d.length>0&&(n.skeletons=d),p.length>0&&(n.animations=p),g.length>0&&(n.nodes=g)}return n.object=s,n;function a(o){let c=[];for(let l in o){let h=o[l];delete h.metadata,c.push(h)}return c}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){let s=e.children[n];this.add(s.clone())}return this}};Et.DEFAULT_UP=new A(0,1,0);Et.DEFAULT_MATRIX_AUTO_UPDATE=!0;Et.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;xn=new A,Gn=new A,il=new A,Wn=new A,ws=new A,As=new A,Pu=new A,sl=new A,rl=new A,al=new A,ol=new yt,cl=new yt,ll=new yt,li=class i{constructor(e=new A,t=new A,n=new A){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,s){s.subVectors(n,t),xn.subVectors(e,t),s.cross(xn);let r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(e,t,n,s,r){xn.subVectors(s,t),Gn.subVectors(n,t),il.subVectors(e,t);let a=xn.dot(xn),o=xn.dot(Gn),c=xn.dot(il),l=Gn.dot(Gn),h=Gn.dot(il),u=a*l-o*o;if(u===0)return r.set(0,0,0),null;let d=1/u,p=(l*c-o*h)*d,g=(a*h-o*c)*d;return r.set(1-p-g,g,p)}static containsPoint(e,t,n,s){return this.getBarycoord(e,t,n,s,Wn)===null?!1:Wn.x>=0&&Wn.y>=0&&Wn.x+Wn.y<=1}static getInterpolation(e,t,n,s,r,a,o,c){return this.getBarycoord(e,t,n,s,Wn)===null?(c.x=0,c.y=0,"z"in c&&(c.z=0),"w"in c&&(c.w=0),null):(c.setScalar(0),c.addScaledVector(r,Wn.x),c.addScaledVector(a,Wn.y),c.addScaledVector(o,Wn.z),c)}static getInterpolatedAttribute(e,t,n,s,r,a){return ol.setScalar(0),cl.setScalar(0),ll.setScalar(0),ol.fromBufferAttribute(e,t),cl.fromBufferAttribute(e,n),ll.fromBufferAttribute(e,s),a.setScalar(0),a.addScaledVector(ol,r.x),a.addScaledVector(cl,r.y),a.addScaledVector(ll,r.z),a}static isFrontFacing(e,t,n,s){return xn.subVectors(n,t),Gn.subVectors(e,t),xn.cross(Gn).dot(s)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,s){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[s]),this}setFromAttributeAndIndices(e,t,n,s){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,s),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return xn.subVectors(this.c,this.b),Gn.subVectors(this.a,this.b),xn.cross(Gn).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return i.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return i.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,s,r){return i.getInterpolation(e,this.a,this.b,this.c,t,n,s,r)}containsPoint(e){return i.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return i.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,s=this.b,r=this.c,a,o;ws.subVectors(s,n),As.subVectors(r,n),sl.subVectors(e,n);let c=ws.dot(sl),l=As.dot(sl);if(c<=0&&l<=0)return t.copy(n);rl.subVectors(e,s);let h=ws.dot(rl),u=As.dot(rl);if(h>=0&&u<=h)return t.copy(s);let d=c*u-h*l;if(d<=0&&c>=0&&h<=0)return a=c/(c-h),t.copy(n).addScaledVector(ws,a);al.subVectors(e,r);let p=ws.dot(al),g=As.dot(al);if(g>=0&&p<=g)return t.copy(r);let _=p*l-c*g;if(_<=0&&l>=0&&g<=0)return o=l/(l-g),t.copy(n).addScaledVector(As,o);let m=h*g-p*u;if(m<=0&&u-h>=0&&p-g>=0)return Pu.subVectors(r,s),o=(u-h)/(u-h+(p-g)),t.copy(s).addScaledVector(Pu,o);let f=1/(m+_+d);return a=_*f,o=d*f,t.copy(n).addScaledVector(ws,a).addScaledVector(As,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},Dd={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},oi={h:0,s:0,l:0},Ea={h:0,s:0,l:0};We=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let s=e;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=Vt){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,nt.toWorkingColorSpace(this,t),this}setRGB(e,t,n,s=nt.workingColorSpace){return this.r=e,this.g=t,this.b=n,nt.toWorkingColorSpace(this,s),this}setHSL(e,t,n,s=nt.workingColorSpace){if(e=Yl(e,1),t=Ge(t,0,1),n=Ge(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,a=2*n-r;this.r=hl(a,r,e+1/3),this.g=hl(a,r,e),this.b=hl(a,r,e-1/3)}return nt.toWorkingColorSpace(this,s),this}setStyle(e,t=Vt){function n(r){r!==void 0&&parseFloat(r)<1&&console.warn("THREE.Color: Alpha component of "+e+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(e)){let r,a=s[1],o=s[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:console.warn("THREE.Color: Unknown color model "+e)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(e)){let r=s[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(a===6)return this.setHex(parseInt(r,16),t);console.warn("THREE.Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=Vt){let n=Dd[e.toLowerCase()];return n!==void 0?this.setHex(n,t):console.warn("THREE.Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Xn(e.r),this.g=Xn(e.g),this.b=Xn(e.b),this}copyLinearToSRGB(e){return this.r=Ls(e.r),this.g=Ls(e.g),this.b=Ls(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=Vt){return nt.fromWorkingColorSpace(Ut.copy(this),e),Math.round(Ge(Ut.r*255,0,255))*65536+Math.round(Ge(Ut.g*255,0,255))*256+Math.round(Ge(Ut.b*255,0,255))}getHexString(e=Vt){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=nt.workingColorSpace){nt.fromWorkingColorSpace(Ut.copy(this),t);let n=Ut.r,s=Ut.g,r=Ut.b,a=Math.max(n,s,r),o=Math.min(n,s,r),c,l,h=(o+a)/2;if(o===a)c=0,l=0;else{let u=a-o;switch(l=h<=.5?u/(a+o):u/(2-a-o),a){case n:c=(s-r)/u+(s<r?6:0);break;case s:c=(r-n)/u+2;break;case r:c=(n-s)/u+4;break}c/=6}return e.h=c,e.s=l,e.l=h,e}getRGB(e,t=nt.workingColorSpace){return nt.fromWorkingColorSpace(Ut.copy(this),t),e.r=Ut.r,e.g=Ut.g,e.b=Ut.b,e}getStyle(e=Vt){nt.fromWorkingColorSpace(Ut.copy(this),e);let t=Ut.r,n=Ut.g,s=Ut.b;return e!==Vt?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(e,t,n){return this.getHSL(oi),this.setHSL(oi.h+e,oi.s+t,oi.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(oi),e.getHSL(Ea);let n=or(oi.h,Ea.h,t),s=or(oi.s,Ea.s,t),r=or(oi.l,Ea.l,t);return this.setHSL(n,s,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,s=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*s,this.g=r[1]*t+r[4]*n+r[7]*s,this.b=r[2]*t+r[5]*n+r[8]*s,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Ut=new We;We.NAMES=Dd;Jm=0,Yn=class extends wn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Jm++}),this.uuid=zs(),this.name="",this.type="Material",this.blending=Yi,this.side=qn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=ka,this.blendDst=za,this.blendEquation=ui,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new We(0,0,0),this.blendAlpha=0,this.depthFunc=Zi,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=bl,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Xi,this.stencilZFail=Xi,this.stencilZPass=Xi,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){console.warn(`THREE.Material: parameter '${t}' has value of undefined.`);continue}let s=this[t];if(s===void 0){console.warn(`THREE.Material: '${t}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});let n={metadata:{version:4.6,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==Yi&&(n.blending=this.blending),this.side!==qn&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==ka&&(n.blendSrc=this.blendSrc),this.blendDst!==za&&(n.blendDst=this.blendDst),this.blendEquation!==ui&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==Zi&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==bl&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==Xi&&(n.stencilFail=this.stencilFail),this.stencilZFail!==Xi&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==Xi&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){let a=[];for(let o in r){let c=r[o];delete c.metadata,a.push(c)}return a}if(t){let r=s(e.textures),a=s(e.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let s=t.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}onBuild(){console.warn("Material: onBuild() has been removed.")}},_r=class extends Yn{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new We(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new It,this.combine=Ll,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},St=new A,Ta=new oe,Kt=class{constructor(e,t,n=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=Sl,this.updateRanges=[],this.gpuType=Ln,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[e+s]=t.array[n+s];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)Ta.fromBufferAttribute(this,t),Ta.applyMatrix3(e),this.setXY(t,Ta.x,Ta.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)St.fromBufferAttribute(this,t),St.applyMatrix3(e),this.setXYZ(t,St.x,St.y,St.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)St.fromBufferAttribute(this,t),St.applyMatrix4(e),this.setXYZ(t,St.x,St.y,St.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)St.fromBufferAttribute(this,t),St.applyNormalMatrix(e),this.setXYZ(t,St.x,St.y,St.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)St.fromBufferAttribute(this,t),St.transformDirection(e),this.setXYZ(t,St.x,St.y,St.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=Is(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=zt(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Is(t,this.array)),t}setX(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Is(t,this.array)),t}setY(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Is(t,this.array)),t}setZ(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Is(t,this.array)),t}setW(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=zt(t,this.array),n=zt(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,s){return e*=this.itemSize,this.normalized&&(t=zt(t,this.array),n=zt(n,this.array),s=zt(s,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this}setXYZW(e,t,n,s,r){return e*=this.itemSize,this.normalized&&(t=zt(t,this.array),n=zt(n,this.array),s=zt(s,this.array),r=zt(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==Sl&&(e.usage=this.usage),e}},xr=class extends Kt{constructor(e,t,n){super(new Uint16Array(e),t,n)}},yr=class extends Kt{constructor(e,t,n){super(new Uint32Array(e),t,n)}},pt=class extends Kt{constructor(e,t,n){super(new Float32Array(e),t,n)}},Km=0,on=new _t,ul=new Et,Rs=new A,Jt=new Ft,sr=new Ft,Rt=new A,qt=class i extends wn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Km++}),this.uuid=zs(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(Zl(e)?yr:xr)(e,1):this.index=e,this}setIndirect(e){return this.indirect=e,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new Ve().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}let s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(e),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return on.makeRotationFromQuaternion(e),this.applyMatrix4(on),this}rotateX(e){return on.makeRotationX(e),this.applyMatrix4(on),this}rotateY(e){return on.makeRotationY(e),this.applyMatrix4(on),this}rotateZ(e){return on.makeRotationZ(e),this.applyMatrix4(on),this}translate(e,t,n){return on.makeTranslation(e,t,n),this.applyMatrix4(on),this}scale(e,t,n){return on.makeScale(e,t,n),this.applyMatrix4(on),this}lookAt(e){return ul.lookAt(e),ul.updateMatrix(),this.applyMatrix4(ul.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Rs).negate(),this.translate(Rs.x,Rs.y,Rs.z),this}setFromPoints(e){let t=this.getAttribute("position");if(t===void 0){let n=[];for(let s=0,r=e.length;s<r;s++){let a=e[s];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new pt(n,3))}else{let n=Math.min(e.length,t.count);for(let s=0;s<n;s++){let r=e[s];t.setXYZ(s,r.x,r.y,r.z||0)}e.length>t.count&&console.warn("THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Ft);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new A(-1/0,-1/0,-1/0),new A(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,s=t.length;n<s;n++){let r=t[n];Jt.setFromBufferAttribute(r),this.morphTargetsRelative?(Rt.addVectors(this.boundingBox.min,Jt.min),this.boundingBox.expandByPoint(Rt),Rt.addVectors(this.boundingBox.max,Jt.max),this.boundingBox.expandByPoint(Rt)):(this.boundingBox.expandByPoint(Jt.min),this.boundingBox.expandByPoint(Jt.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Ji);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new A,1/0);return}if(e){let n=this.boundingSphere.center;if(Jt.setFromBufferAttribute(e),t)for(let r=0,a=t.length;r<a;r++){let o=t[r];sr.setFromBufferAttribute(o),this.morphTargetsRelative?(Rt.addVectors(Jt.min,sr.min),Jt.expandByPoint(Rt),Rt.addVectors(Jt.max,sr.max),Jt.expandByPoint(Rt)):(Jt.expandByPoint(sr.min),Jt.expandByPoint(sr.max))}Jt.getCenter(n);let s=0;for(let r=0,a=e.count;r<a;r++)Rt.fromBufferAttribute(e,r),s=Math.max(s,n.distanceToSquared(Rt));if(t)for(let r=0,a=t.length;r<a;r++){let o=t[r],c=this.morphTargetsRelative;for(let l=0,h=o.count;l<h;l++)Rt.fromBufferAttribute(o,l),c&&(Rs.fromBufferAttribute(e,l),Rt.add(Rs)),s=Math.max(s,n.distanceToSquared(Rt))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=t.position,s=t.normal,r=t.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Kt(new Float32Array(4*n.count),4));let a=this.getAttribute("tangent"),o=[],c=[];for(let L=0;L<n.count;L++)o[L]=new A,c[L]=new A;let l=new A,h=new A,u=new A,d=new oe,p=new oe,g=new oe,_=new A,m=new A;function f(L,M,v){l.fromBufferAttribute(n,L),h.fromBufferAttribute(n,M),u.fromBufferAttribute(n,v),d.fromBufferAttribute(r,L),p.fromBufferAttribute(r,M),g.fromBufferAttribute(r,v),h.sub(l),u.sub(l),p.sub(d),g.sub(d);let I=1/(p.x*g.y-g.x*p.y);isFinite(I)&&(_.copy(h).multiplyScalar(g.y).addScaledVector(u,-p.y).multiplyScalar(I),m.copy(u).multiplyScalar(p.x).addScaledVector(h,-g.x).multiplyScalar(I),o[L].add(_),o[M].add(_),o[v].add(_),c[L].add(m),c[M].add(m),c[v].add(m))}let T=this.groups;T.length===0&&(T=[{start:0,count:e.count}]);for(let L=0,M=T.length;L<M;++L){let v=T[L],I=v.start,z=v.count;for(let F=I,G=I+z;F<G;F+=3)f(e.getX(F+0),e.getX(F+1),e.getX(F+2))}let E=new A,b=new A,P=new A,R=new A;function C(L){P.fromBufferAttribute(s,L),R.copy(P);let M=o[L];E.copy(M),E.sub(P.multiplyScalar(P.dot(M))).normalize(),b.crossVectors(R,M);let I=b.dot(c[L])<0?-1:1;a.setXYZW(L,E.x,E.y,E.z,I)}for(let L=0,M=T.length;L<M;++L){let v=T[L],I=v.start,z=v.count;for(let F=I,G=I+z;F<G;F+=3)C(e.getX(F+0)),C(e.getX(F+1)),C(e.getX(F+2))}}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new Kt(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let d=0,p=n.count;d<p;d++)n.setXYZ(d,0,0,0);let s=new A,r=new A,a=new A,o=new A,c=new A,l=new A,h=new A,u=new A;if(e)for(let d=0,p=e.count;d<p;d+=3){let g=e.getX(d+0),_=e.getX(d+1),m=e.getX(d+2);s.fromBufferAttribute(t,g),r.fromBufferAttribute(t,_),a.fromBufferAttribute(t,m),h.subVectors(a,r),u.subVectors(s,r),h.cross(u),o.fromBufferAttribute(n,g),c.fromBufferAttribute(n,_),l.fromBufferAttribute(n,m),o.add(h),c.add(h),l.add(h),n.setXYZ(g,o.x,o.y,o.z),n.setXYZ(_,c.x,c.y,c.z),n.setXYZ(m,l.x,l.y,l.z)}else for(let d=0,p=t.count;d<p;d+=3)s.fromBufferAttribute(t,d+0),r.fromBufferAttribute(t,d+1),a.fromBufferAttribute(t,d+2),h.subVectors(a,r),u.subVectors(s,r),h.cross(u),n.setXYZ(d+0,h.x,h.y,h.z),n.setXYZ(d+1,h.x,h.y,h.z),n.setXYZ(d+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Rt.fromBufferAttribute(e,t),Rt.normalize(),e.setXYZ(t,Rt.x,Rt.y,Rt.z)}toNonIndexed(){function e(o,c){let l=o.array,h=o.itemSize,u=o.normalized,d=new l.constructor(c.length*h),p=0,g=0;for(let _=0,m=c.length;_<m;_++){o.isInterleavedBufferAttribute?p=c[_]*o.data.stride+o.offset:p=c[_]*h;for(let f=0;f<h;f++)d[g++]=l[p++]}return new Kt(d,h,u)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new i,n=this.index.array,s=this.attributes;for(let o in s){let c=s[o],l=e(c,n);t.setAttribute(o,l)}let r=this.morphAttributes;for(let o in r){let c=[],l=r[o];for(let h=0,u=l.length;h<u;h++){let d=l[h],p=e(d,n);c.push(p)}t.morphAttributes[o]=c}t.morphTargetsRelative=this.morphTargetsRelative;let a=this.groups;for(let o=0,c=a.length;o<c;o++){let l=a[o];t.addGroup(l.start,l.count,l.materialIndex)}return t}toJSON(){let e={metadata:{version:4.6,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){let c=this.parameters;for(let l in c)c[l]!==void 0&&(e[l]=c[l]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let c in n){let l=n[c];e.data.attributes[c]=l.toJSON(e.data)}let s={},r=!1;for(let c in this.morphAttributes){let l=this.morphAttributes[c],h=[];for(let u=0,d=l.length;u<d;u++){let p=l[u];h.push(p.toJSON(e.data))}h.length>0&&(s[c]=h,r=!0)}r&&(e.data.morphAttributes=s,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere={center:o.center.toArray(),radius:o.radius}),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone(t));let s=e.attributes;for(let l in s){let h=s[l];this.setAttribute(l,h.clone(t))}let r=e.morphAttributes;for(let l in r){let h=[],u=r[l];for(let d=0,p=u.length;d<p;d++)h.push(u[d].clone(t));this.morphAttributes[l]=h}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let l=0,h=a.length;l<h;l++){let u=a[l];this.addGroup(u.start,u.count,u.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let c=e.boundingSphere;return c!==null&&(this.boundingSphere=c.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}},Iu=new _t,Gi=new Ki,wa=new Ji,Lu=new A,Aa=new A,Ra=new A,Ca=new A,dl=new A,Pa=new A,Du=new A,Ia=new A,ut=class extends Et{constructor(e=new qt,t=new _r){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){let o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(e,t){let n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(s,e);let o=this.morphTargetInfluences;if(r&&o){Pa.set(0,0,0);for(let c=0,l=r.length;c<l;c++){let h=o[c],u=r[c];h!==0&&(dl.fromBufferAttribute(u,e),a?Pa.addScaledVector(dl,h):Pa.addScaledVector(dl.sub(t),h))}t.add(Pa)}return t}raycast(e,t){let n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),wa.copy(n.boundingSphere),wa.applyMatrix4(r),Gi.copy(e.ray).recast(e.near),!(wa.containsPoint(Gi.origin)===!1&&(Gi.intersectSphere(wa,Lu)===null||Gi.origin.distanceToSquared(Lu)>(e.far-e.near)**2))&&(Iu.copy(r).invert(),Gi.copy(e.ray).applyMatrix4(Iu),!(n.boundingBox!==null&&Gi.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,Gi)))}_computeIntersections(e,t,n){let s,r=this.geometry,a=this.material,o=r.index,c=r.attributes.position,l=r.attributes.uv,h=r.attributes.uv1,u=r.attributes.normal,d=r.groups,p=r.drawRange;if(o!==null)if(Array.isArray(a))for(let g=0,_=d.length;g<_;g++){let m=d[g],f=a[m.materialIndex],T=Math.max(m.start,p.start),E=Math.min(o.count,Math.min(m.start+m.count,p.start+p.count));for(let b=T,P=E;b<P;b+=3){let R=o.getX(b),C=o.getX(b+1),L=o.getX(b+2);s=La(this,f,e,n,l,h,u,R,C,L),s&&(s.faceIndex=Math.floor(b/3),s.face.materialIndex=m.materialIndex,t.push(s))}}else{let g=Math.max(0,p.start),_=Math.min(o.count,p.start+p.count);for(let m=g,f=_;m<f;m+=3){let T=o.getX(m),E=o.getX(m+1),b=o.getX(m+2);s=La(this,a,e,n,l,h,u,T,E,b),s&&(s.faceIndex=Math.floor(m/3),t.push(s))}}else if(c!==void 0)if(Array.isArray(a))for(let g=0,_=d.length;g<_;g++){let m=d[g],f=a[m.materialIndex],T=Math.max(m.start,p.start),E=Math.min(c.count,Math.min(m.start+m.count,p.start+p.count));for(let b=T,P=E;b<P;b+=3){let R=b,C=b+1,L=b+2;s=La(this,f,e,n,l,h,u,R,C,L),s&&(s.faceIndex=Math.floor(b/3),s.face.materialIndex=m.materialIndex,t.push(s))}}else{let g=Math.max(0,p.start),_=Math.min(c.count,p.start+p.count);for(let m=g,f=_;m<f;m+=3){let T=m,E=m+1,b=m+2;s=La(this,a,e,n,l,h,u,T,E,b),s&&(s.faceIndex=Math.floor(m/3),t.push(s))}}}};vn=class i extends qt{constructor(e=1,t=1,n=1,s=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:s,heightSegments:r,depthSegments:a};let o=this;s=Math.floor(s),r=Math.floor(r),a=Math.floor(a);let c=[],l=[],h=[],u=[],d=0,p=0;g("z","y","x",-1,-1,n,t,e,a,r,0),g("z","y","x",1,-1,n,t,-e,a,r,1),g("x","z","y",1,1,e,n,t,s,a,2),g("x","z","y",1,-1,e,n,-t,s,a,3),g("x","y","z",1,-1,e,t,n,s,r,4),g("x","y","z",-1,-1,e,t,-n,s,r,5),this.setIndex(c),this.setAttribute("position",new pt(l,3)),this.setAttribute("normal",new pt(h,3)),this.setAttribute("uv",new pt(u,2));function g(_,m,f,T,E,b,P,R,C,L,M){let v=b/C,I=P/L,z=b/2,F=P/2,G=R/2,$=C+1,W=L+1,ee=0,V=0,re=new A;for(let pe=0;pe<W;pe++){let Se=pe*I-F;for(let $e=0;$e<$;$e++){let st=$e*v-z;re[_]=st*T,re[m]=Se*E,re[f]=G,l.push(re.x,re.y,re.z),re[_]=0,re[m]=0,re[f]=R>0?1:-1,h.push(re.x,re.y,re.z),u.push($e/C),u.push(1-pe/L),ee+=1}}for(let pe=0;pe<L;pe++)for(let Se=0;Se<C;Se++){let $e=d+Se+$*pe,st=d+Se+$*(pe+1),X=d+(Se+1)+$*(pe+1),te=d+(Se+1)+$*pe;c.push($e,st,te),c.push(st,X,te),V+=6}o.addGroup(p,V,M),p+=V,d+=ee}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}};Nd={clone:rs,merge:Bt},tg=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,ng=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,Mn=class extends Yn{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=tg,this.fragmentShader=ng,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=rs(e.uniforms),this.uniformsGroups=eg(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let s in this.uniforms){let a=this.uniforms[s].value;a&&a.isTexture?t.uniforms[s]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[s]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[s]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[s]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[s]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[s]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[s]={type:"m4",value:a.toArray()}:t.uniforms[s]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}},vr=class extends Et{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new _t,this.projectionMatrix=new _t,this.projectionMatrixInverse=new _t,this.coordinateSystem=Tn}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}},ci=new A,Nu=new oe,Uu=new oe,Ot=class extends vr{constructor(e=50,t=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=Ds*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(ar*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Ds*2*Math.atan(Math.tan(ar*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){ci.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(ci.x,ci.y).multiplyScalar(-e/ci.z),ci.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(ci.x,ci.y).multiplyScalar(-e/ci.z)}getViewSize(e,t){return this.getViewBounds(e,Nu,Uu),t.subVectors(Uu,Nu)}setViewOffset(e,t,n,s,r,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(ar*.5*this.fov)/this.zoom,n=2*t,s=this.aspect*n,r=-.5*s,a=this.view;if(this.view!==null&&this.view.enabled){let c=a.fullWidth,l=a.fullHeight;r+=a.offsetX*s/c,t-=a.offsetY*n/l,s*=a.width/c,n*=a.height/l}let o=this.filmOffset;o!==0&&(r+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,t,t-n,e,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},Cs=-90,Ps=1,Ya=class extends Et{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let s=new Ot(Cs,Ps,e,t);s.layers=this.layers,this.add(s);let r=new Ot(Cs,Ps,e,t);r.layers=this.layers,this.add(r);let a=new Ot(Cs,Ps,e,t);a.layers=this.layers,this.add(a);let o=new Ot(Cs,Ps,e,t);o.layers=this.layers,this.add(o);let c=new Ot(Cs,Ps,e,t);c.layers=this.layers,this.add(c);let l=new Ot(Cs,Ps,e,t);l.layers=this.layers,this.add(l)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,s,r,a,o,c]=t;for(let l of t)this.remove(l);if(e===Tn)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),c.up.set(0,1,0),c.lookAt(0,0,-1);else if(e===dr)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),c.up.set(0,-1,0),c.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let l of t)this.add(l),l.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[r,a,o,c,l,h]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),p=e.getActiveMipmapLevel(),g=e.xr.enabled;e.xr.enabled=!1;let _=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,e.setRenderTarget(n,0,s),e.render(t,r),e.setRenderTarget(n,1,s),e.render(t,a),e.setRenderTarget(n,2,s),e.render(t,o),e.setRenderTarget(n,3,s),e.render(t,c),e.setRenderTarget(n,4,s),e.render(t,l),n.texture.generateMipmaps=_,e.setRenderTarget(n,5,s),e.render(t,h),e.setRenderTarget(u,d,p),e.xr.enabled=g,n.texture.needsPMREMUpdate=!0}},Mr=class extends Qt{constructor(e,t,n,s,r,a,o,c,l,h){e=e!==void 0?e:[],t=t!==void 0?t:ts,super(e,t,n,s,r,a,o,c,l,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},Za=class extends An{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},s=[n,n,n,n,n,n];this.texture=new Mr(s,t.mapping,t.wrapS,t.wrapT,t.magFilter,t.minFilter,t.format,t.type,t.anisotropy,t.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.generateMipmaps=t.generateMipmaps!==void 0?t.generateMipmaps:!1,this.texture.minFilter=t.minFilter!==void 0?t.minFilter:yn}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new vn(5,5,5),r=new Mn({name:"CubemapFromEquirect",uniforms:rs(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Ht,blending:$n});r.uniforms.tEquirect.value=t;let a=new ut(s,r),o=t.minFilter;return t.minFilter===gi&&(t.minFilter=yn),new Ya(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t,n,s){let r=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,n,s);e.setRenderTarget(r)}},br=class i{constructor(e,t=1,n=1e3){this.isFog=!0,this.name="",this.color=new We(e),this.near=t,this.far=n}clone(){return new i(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}},Sr=class extends Et{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new It,this.environmentIntensity=1,this.environmentRotation=new It,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}},fl=new A,ig=new A,sg=new Ve,cn=class{constructor(e=new A(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,s){return this.normal.set(e,t,n),this.constant=s,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let s=fl.subVectors(n,t).cross(ig.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(s,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){let n=e.delta(fl),s=this.normal.dot(n);if(s===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let r=-(e.start.dot(this.normal)+this.constant)/s;return r<0||r>1?null:t.copy(e.start).addScaledVector(n,r)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||sg.getNormalMatrix(e),s=this.coplanarPoint(fl).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},Wi=new Ji,Da=new A,Ns=class{constructor(e=new cn,t=new cn,n=new cn,s=new cn,r=new cn,a=new cn){this.planes=[e,t,n,s,r,a]}set(e,t,n,s,r,a){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(s),o[4].copy(r),o[5].copy(a),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=Tn){let n=this.planes,s=e.elements,r=s[0],a=s[1],o=s[2],c=s[3],l=s[4],h=s[5],u=s[6],d=s[7],p=s[8],g=s[9],_=s[10],m=s[11],f=s[12],T=s[13],E=s[14],b=s[15];if(n[0].setComponents(c-r,d-l,m-p,b-f).normalize(),n[1].setComponents(c+r,d+l,m+p,b+f).normalize(),n[2].setComponents(c+a,d+h,m+g,b+T).normalize(),n[3].setComponents(c-a,d-h,m-g,b-T).normalize(),n[4].setComponents(c-o,d-u,m-_,b-E).normalize(),t===Tn)n[5].setComponents(c+o,d+u,m+_,b+E).normalize();else if(t===dr)n[5].setComponents(o,u,_,E).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Wi.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Wi.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Wi)}intersectsSprite(e){return Wi.center.set(0,0,0),Wi.radius=.7071067811865476,Wi.applyMatrix4(e.matrixWorld),this.intersectsSphere(Wi)}intersectsSphere(e){let t=this.planes,n=e.center,s=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let s=t[n];if(Da.x=s.normal.x>0?e.max.x:e.min.x,Da.y=s.normal.y>0?e.max.y:e.min.y,Da.z=s.normal.z>0?e.max.z:e.min.z,s.distanceToPoint(Da)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},Er=class extends Yn{constructor(e){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new We(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}},$a=new A,ja=new A,Ou=new _t,rr=new Ki,Na=new Ji,pl=new A,Fu=new A,Ja=class extends Et{constructor(e=new qt,t=new Er){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[0];for(let s=1,r=t.count;s<r;s++)$a.fromBufferAttribute(t,s-1),ja.fromBufferAttribute(t,s),n[s]=n[s-1],n[s]+=$a.distanceTo(ja);e.setAttribute("lineDistance",new pt(n,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(e,t){let n=this.geometry,s=this.matrixWorld,r=e.params.Line.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Na.copy(n.boundingSphere),Na.applyMatrix4(s),Na.radius+=r,e.ray.intersectsSphere(Na)===!1)return;Ou.copy(s).invert(),rr.copy(e.ray).applyMatrix4(Ou);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=o*o,l=this.isLineSegments?2:1,h=n.index,d=n.attributes.position;if(h!==null){let p=Math.max(0,a.start),g=Math.min(h.count,a.start+a.count);for(let _=p,m=g-1;_<m;_+=l){let f=h.getX(_),T=h.getX(_+1),E=Ua(this,e,rr,c,f,T);E&&t.push(E)}if(this.isLineLoop){let _=h.getX(g-1),m=h.getX(p),f=Ua(this,e,rr,c,_,m);f&&t.push(f)}}else{let p=Math.max(0,a.start),g=Math.min(d.count,a.start+a.count);for(let _=p,m=g-1;_<m;_+=l){let f=Ua(this,e,rr,c,_,_+1);f&&t.push(f)}if(this.isLineLoop){let _=Ua(this,e,rr,c,g-1,p);_&&t.push(_)}}}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){let o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}};Bu=new A,ku=new A,Ka=class extends Ja{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[];for(let s=0,r=t.count;s<r;s+=2)Bu.fromBufferAttribute(t,s),ku.fromBufferAttribute(t,s+1),n[s]=s===0?0:n[s-1],n[s+1]=n[s]+Bu.distanceTo(ku);e.setAttribute("lineDistance",new pt(n,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}},hn=class extends Et{constructor(){super(),this.isGroup=!0,this.type="Group"}},Tr=class extends Qt{constructor(e,t,n,s,r,a,o,c,l,h=qi){if(h!==qi&&h!==$i)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");n===void 0&&h===qi&&(n=_i),n===void 0&&h===$i&&(n=is),super(null,s,r,a,o,c,h,n,l),this.isDepthTexture=!0,this.image={width:e,height:t},this.magFilter=o!==void 0?o:ln,this.minFilter=c!==void 0?c:ln,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}},en=class{constructor(){this.type="Curve",this.arcLengthDivisions=200}getPoint(){return console.warn("THREE.Curve: .getPoint() not implemented."),null}getPointAt(e,t){let n=this.getUtoTmapping(e);return this.getPoint(n,t)}getPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return t}getSpacedPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPointAt(n/e));return t}getLength(){let e=this.getLengths();return e[e.length-1]}getLengths(e=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===e+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;let t=[],n,s=this.getPoint(0),r=0;t.push(0);for(let a=1;a<=e;a++)n=this.getPoint(a/e),r+=n.distanceTo(s),t.push(r),s=n;return this.cacheArcLengths=t,t}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(e,t){let n=this.getLengths(),s=0,r=n.length,a;t?a=t:a=e*n[r-1];let o=0,c=r-1,l;for(;o<=c;)if(s=Math.floor(o+(c-o)/2),l=n[s]-a,l<0)o=s+1;else if(l>0)c=s-1;else{c=s;break}if(s=c,n[s]===a)return s/(r-1);let h=n[s],d=n[s+1]-h,p=(a-h)/d;return(s+p)/(r-1)}getTangent(e,t){let s=e-1e-4,r=e+1e-4;s<0&&(s=0),r>1&&(r=1);let a=this.getPoint(s),o=this.getPoint(r),c=t||(a.isVector2?new oe:new A);return c.copy(o).sub(a).normalize(),c}getTangentAt(e,t){let n=this.getUtoTmapping(e);return this.getTangent(n,t)}computeFrenetFrames(e,t){let n=new A,s=[],r=[],a=[],o=new A,c=new _t;for(let p=0;p<=e;p++){let g=p/e;s[p]=this.getTangentAt(g,new A)}r[0]=new A,a[0]=new A;let l=Number.MAX_VALUE,h=Math.abs(s[0].x),u=Math.abs(s[0].y),d=Math.abs(s[0].z);h<=l&&(l=h,n.set(1,0,0)),u<=l&&(l=u,n.set(0,1,0)),d<=l&&n.set(0,0,1),o.crossVectors(s[0],n).normalize(),r[0].crossVectors(s[0],o),a[0].crossVectors(s[0],r[0]);for(let p=1;p<=e;p++){if(r[p]=r[p-1].clone(),a[p]=a[p-1].clone(),o.crossVectors(s[p-1],s[p]),o.length()>Number.EPSILON){o.normalize();let g=Math.acos(Ge(s[p-1].dot(s[p]),-1,1));r[p].applyMatrix4(c.makeRotationAxis(o,g))}a[p].crossVectors(s[p],r[p])}if(t===!0){let p=Math.acos(Ge(r[0].dot(r[e]),-1,1));p/=e,s[0].dot(o.crossVectors(r[0],r[e]))>0&&(p=-p);for(let g=1;g<=e;g++)r[g].applyMatrix4(c.makeRotationAxis(s[g],p*g)),a[g].crossVectors(s[g],r[g])}return{tangents:s,normals:r,binormals:a}}clone(){return new this.constructor().copy(this)}copy(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}toJSON(){let e={metadata:{version:4.6,type:"Curve",generator:"Curve.toJSON"}};return e.arcLengthDivisions=this.arcLengthDivisions,e.type=this.type,e}fromJSON(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}},Us=class extends en{constructor(e=0,t=0,n=1,s=1,r=0,a=Math.PI*2,o=!1,c=0){super(),this.isEllipseCurve=!0,this.type="EllipseCurve",this.aX=e,this.aY=t,this.xRadius=n,this.yRadius=s,this.aStartAngle=r,this.aEndAngle=a,this.aClockwise=o,this.aRotation=c}getPoint(e,t=new oe){let n=t,s=Math.PI*2,r=this.aEndAngle-this.aStartAngle,a=Math.abs(r)<Number.EPSILON;for(;r<0;)r+=s;for(;r>s;)r-=s;r<Number.EPSILON&&(a?r=0:r=s),this.aClockwise===!0&&!a&&(r===s?r=-s:r=r-s);let o=this.aStartAngle+e*r,c=this.aX+this.xRadius*Math.cos(o),l=this.aY+this.yRadius*Math.sin(o);if(this.aRotation!==0){let h=Math.cos(this.aRotation),u=Math.sin(this.aRotation),d=c-this.aX,p=l-this.aY;c=d*h-p*u+this.aX,l=d*u+p*h+this.aY}return n.set(c,l)}copy(e){return super.copy(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}toJSON(){let e=super.toJSON();return e.aX=this.aX,e.aY=this.aY,e.xRadius=this.xRadius,e.yRadius=this.yRadius,e.aStartAngle=this.aStartAngle,e.aEndAngle=this.aEndAngle,e.aClockwise=this.aClockwise,e.aRotation=this.aRotation,e}fromJSON(e){return super.fromJSON(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}},Qa=class extends Us{constructor(e,t,n,s,r,a){super(e,t,n,n,s,r,a),this.isArcCurve=!0,this.type="ArcCurve"}};Oa=new A,ml=new jl,gl=new jl,_l=new jl,eo=class extends en{constructor(e=[],t=!1,n="centripetal",s=.5){super(),this.isCatmullRomCurve3=!0,this.type="CatmullRomCurve3",this.points=e,this.closed=t,this.curveType=n,this.tension=s}getPoint(e,t=new A){let n=t,s=this.points,r=s.length,a=(r-(this.closed?0:1))*e,o=Math.floor(a),c=a-o;this.closed?o+=o>0?0:(Math.floor(Math.abs(o)/r)+1)*r:c===0&&o===r-1&&(o=r-2,c=1);let l,h;this.closed||o>0?l=s[(o-1)%r]:(Oa.subVectors(s[0],s[1]).add(s[0]),l=Oa);let u=s[o%r],d=s[(o+1)%r];if(this.closed||o+2<r?h=s[(o+2)%r]:(Oa.subVectors(s[r-1],s[r-2]).add(s[r-1]),h=Oa),this.curveType==="centripetal"||this.curveType==="chordal"){let p=this.curveType==="chordal"?.5:.25,g=Math.pow(l.distanceToSquared(u),p),_=Math.pow(u.distanceToSquared(d),p),m=Math.pow(d.distanceToSquared(h),p);_<1e-4&&(_=1),g<1e-4&&(g=_),m<1e-4&&(m=_),ml.initNonuniformCatmullRom(l.x,u.x,d.x,h.x,g,_,m),gl.initNonuniformCatmullRom(l.y,u.y,d.y,h.y,g,_,m),_l.initNonuniformCatmullRom(l.z,u.z,d.z,h.z,g,_,m)}else this.curveType==="catmullrom"&&(ml.initCatmullRom(l.x,u.x,d.x,h.x,this.tension),gl.initCatmullRom(l.y,u.y,d.y,h.y,this.tension),_l.initCatmullRom(l.z,u.z,d.z,h.z,this.tension));return n.set(ml.calc(c),gl.calc(c),_l.calc(c)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let s=e.points[t];this.points.push(s.clone())}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let s=this.points[t];e.points.push(s.toArray())}return e.closed=this.closed,e.curveType=this.curveType,e.tension=this.tension,e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let s=e.points[t];this.points.push(new A().fromArray(s))}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}};wr=class extends en{constructor(e=new oe,t=new oe,n=new oe,s=new oe){super(),this.isCubicBezierCurve=!0,this.type="CubicBezierCurve",this.v0=e,this.v1=t,this.v2=n,this.v3=s}getPoint(e,t=new oe){let n=t,s=this.v0,r=this.v1,a=this.v2,o=this.v3;return n.set(lr(e,s.x,r.x,a.x,o.x),lr(e,s.y,r.y,a.y,o.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}},to=class extends en{constructor(e=new A,t=new A,n=new A,s=new A){super(),this.isCubicBezierCurve3=!0,this.type="CubicBezierCurve3",this.v0=e,this.v1=t,this.v2=n,this.v3=s}getPoint(e,t=new A){let n=t,s=this.v0,r=this.v1,a=this.v2,o=this.v3;return n.set(lr(e,s.x,r.x,a.x,o.x),lr(e,s.y,r.y,a.y,o.y),lr(e,s.z,r.z,a.z,o.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}},Ar=class extends en{constructor(e=new oe,t=new oe){super(),this.isLineCurve=!0,this.type="LineCurve",this.v1=e,this.v2=t}getPoint(e,t=new oe){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new oe){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},no=class extends en{constructor(e=new A,t=new A){super(),this.isLineCurve3=!0,this.type="LineCurve3",this.v1=e,this.v2=t}getPoint(e,t=new A){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t=new A){return t.subVectors(this.v2,this.v1).normalize()}getTangentAt(e,t){return this.getTangent(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},Rr=class extends en{constructor(e=new oe,t=new oe,n=new oe){super(),this.isQuadraticBezierCurve=!0,this.type="QuadraticBezierCurve",this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new oe){let n=t,s=this.v0,r=this.v1,a=this.v2;return n.set(cr(e,s.x,r.x,a.x),cr(e,s.y,r.y,a.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},io=class extends en{constructor(e=new A,t=new A,n=new A){super(),this.isQuadraticBezierCurve3=!0,this.type="QuadraticBezierCurve3",this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new A){let n=t,s=this.v0,r=this.v1,a=this.v2;return n.set(cr(e,s.x,r.x,a.x),cr(e,s.y,r.y,a.y),cr(e,s.z,r.z,a.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},Cr=class extends en{constructor(e=[]){super(),this.isSplineCurve=!0,this.type="SplineCurve",this.points=e}getPoint(e,t=new oe){let n=t,s=this.points,r=(s.length-1)*e,a=Math.floor(r),o=r-a,c=s[a===0?a:a-1],l=s[a],h=s[a>s.length-2?s.length-1:a+1],u=s[a>s.length-3?s.length-1:a+2];return n.set(zu(o,c.x,l.x,h.x,u.x),zu(o,c.y,l.y,h.y,u.y)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let s=e.points[t];this.points.push(s.clone())}return this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let s=this.points[t];e.points.push(s.toArray())}return e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let s=e.points[t];this.points.push(new oe().fromArray(s))}return this}},Vu=Object.freeze({__proto__:null,ArcCurve:Qa,CatmullRomCurve3:eo,CubicBezierCurve:wr,CubicBezierCurve3:to,EllipseCurve:Us,LineCurve:Ar,LineCurve3:no,QuadraticBezierCurve:Rr,QuadraticBezierCurve3:io,SplineCurve:Cr}),so=class extends en{constructor(){super(),this.type="CurvePath",this.curves=[],this.autoClose=!1}add(e){this.curves.push(e)}closePath(){let e=this.curves[0].getPoint(0),t=this.curves[this.curves.length-1].getPoint(1);if(!e.equals(t)){let n=e.isVector2===!0?"LineCurve":"LineCurve3";this.curves.push(new Vu[n](t,e))}return this}getPoint(e,t){let n=e*this.getLength(),s=this.getCurveLengths(),r=0;for(;r<s.length;){if(s[r]>=n){let a=s[r]-n,o=this.curves[r],c=o.getLength(),l=c===0?0:1-a/c;return o.getPointAt(l,t)}r++}return null}getLength(){let e=this.getCurveLengths();return e[e.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;let e=[],t=0;for(let n=0,s=this.curves.length;n<s;n++)t+=this.curves[n].getLength(),e.push(t);return this.cacheLengths=e,e}getSpacedPoints(e=40){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return this.autoClose&&t.push(t[0]),t}getPoints(e=12){let t=[],n;for(let s=0,r=this.curves;s<r.length;s++){let a=r[s],o=a.isEllipseCurve?e*2:a.isLineCurve||a.isLineCurve3?1:a.isSplineCurve?e*a.points.length:e,c=a.getPoints(o);for(let l=0;l<c.length;l++){let h=c[l];n&&n.equals(h)||(t.push(h),n=h)}}return this.autoClose&&t.length>1&&!t[t.length-1].equals(t[0])&&t.push(t[0]),t}copy(e){super.copy(e),this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let s=e.curves[t];this.curves.push(s.clone())}return this.autoClose=e.autoClose,this}toJSON(){let e=super.toJSON();e.autoClose=this.autoClose,e.curves=[];for(let t=0,n=this.curves.length;t<n;t++){let s=this.curves[t];e.curves.push(s.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.autoClose=e.autoClose,this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let s=e.curves[t];this.curves.push(new Vu[s.type]().fromJSON(s))}return this}},ro=class extends so{constructor(e){super(),this.type="Path",this.currentPoint=new oe,e&&this.setFromPoints(e)}setFromPoints(e){this.moveTo(e[0].x,e[0].y);for(let t=1,n=e.length;t<n;t++)this.lineTo(e[t].x,e[t].y);return this}moveTo(e,t){return this.currentPoint.set(e,t),this}lineTo(e,t){let n=new Ar(this.currentPoint.clone(),new oe(e,t));return this.curves.push(n),this.currentPoint.set(e,t),this}quadraticCurveTo(e,t,n,s){let r=new Rr(this.currentPoint.clone(),new oe(e,t),new oe(n,s));return this.curves.push(r),this.currentPoint.set(n,s),this}bezierCurveTo(e,t,n,s,r,a){let o=new wr(this.currentPoint.clone(),new oe(e,t),new oe(n,s),new oe(r,a));return this.curves.push(o),this.currentPoint.set(r,a),this}splineThru(e){let t=[this.currentPoint.clone()].concat(e),n=new Cr(t);return this.curves.push(n),this.currentPoint.copy(e[e.length-1]),this}arc(e,t,n,s,r,a){let o=this.currentPoint.x,c=this.currentPoint.y;return this.absarc(e+o,t+c,n,s,r,a),this}absarc(e,t,n,s,r,a){return this.absellipse(e,t,n,n,s,r,a),this}ellipse(e,t,n,s,r,a,o,c){let l=this.currentPoint.x,h=this.currentPoint.y;return this.absellipse(e+l,t+h,n,s,r,a,o,c),this}absellipse(e,t,n,s,r,a,o,c){let l=new Us(e,t,n,s,r,a,o,c);if(this.curves.length>0){let u=l.getPoint(0);u.equals(this.currentPoint)||this.lineTo(u.x,u.y)}this.curves.push(l);let h=l.getPoint(1);return this.currentPoint.copy(h),this}copy(e){return super.copy(e),this.currentPoint.copy(e.currentPoint),this}toJSON(){let e=super.toJSON();return e.currentPoint=this.currentPoint.toArray(),e}fromJSON(e){return super.fromJSON(e),this.currentPoint.fromArray(e.currentPoint),this}},ao=class i extends qt{constructor(e=[new oe(0,-.5),new oe(.5,0),new oe(0,.5)],t=12,n=0,s=Math.PI*2){super(),this.type="LatheGeometry",this.parameters={points:e,segments:t,phiStart:n,phiLength:s},t=Math.floor(t),s=Ge(s,0,Math.PI*2);let r=[],a=[],o=[],c=[],l=[],h=1/t,u=new A,d=new oe,p=new A,g=new A,_=new A,m=0,f=0;for(let T=0;T<=e.length-1;T++)switch(T){case 0:m=e[T+1].x-e[T].x,f=e[T+1].y-e[T].y,p.x=f*1,p.y=-m,p.z=f*0,_.copy(p),p.normalize(),c.push(p.x,p.y,p.z);break;case e.length-1:c.push(_.x,_.y,_.z);break;default:m=e[T+1].x-e[T].x,f=e[T+1].y-e[T].y,p.x=f*1,p.y=-m,p.z=f*0,g.copy(p),p.x+=_.x,p.y+=_.y,p.z+=_.z,p.normalize(),c.push(p.x,p.y,p.z),_.copy(g)}for(let T=0;T<=t;T++){let E=n+T*h*s,b=Math.sin(E),P=Math.cos(E);for(let R=0;R<=e.length-1;R++){u.x=e[R].x*b,u.y=e[R].y,u.z=e[R].x*P,a.push(u.x,u.y,u.z),d.x=T/t,d.y=R/(e.length-1),o.push(d.x,d.y);let C=c[3*R+0]*b,L=c[3*R+1],M=c[3*R+0]*P;l.push(C,L,M)}}for(let T=0;T<t;T++)for(let E=0;E<e.length-1;E++){let b=E+T*e.length,P=b,R=b+e.length,C=b+e.length+1,L=b+1;r.push(P,R,L),r.push(C,L,R)}this.setIndex(r),this.setAttribute("position",new pt(a,3)),this.setAttribute("uv",new pt(o,2)),this.setAttribute("normal",new pt(l,3))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.points,e.segments,e.phiStart,e.phiLength)}},Pr=class i extends ao{constructor(e=1,t=1,n=4,s=8){let r=new ro;r.absarc(0,-t/2,e,Math.PI*1.5,0),r.absarc(0,t/2,e,0,Math.PI*.5),super(r.getPoints(n),s),this.type="CapsuleGeometry",this.parameters={radius:e,length:t,capSegments:n,radialSegments:s}}static fromJSON(e){return new i(e.radius,e.length,e.capSegments,e.radialSegments)}},Ir=class i extends qt{constructor(e=1,t=32,n=0,s=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:s},t=Math.max(3,t);let r=[],a=[],o=[],c=[],l=new A,h=new oe;a.push(0,0,0),o.push(0,0,1),c.push(.5,.5);for(let u=0,d=3;u<=t;u++,d+=3){let p=n+u/t*s;l.x=e*Math.cos(p),l.y=e*Math.sin(p),a.push(l.x,l.y,l.z),o.push(0,0,1),h.x=(a[d]/e+1)/2,h.y=(a[d+1]/e+1)/2,c.push(h.x,h.y)}for(let u=1;u<=t;u++)r.push(u,u+1,0);this.setIndex(r),this.setAttribute("position",new pt(a,3)),this.setAttribute("normal",new pt(o,3)),this.setAttribute("uv",new pt(c,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.radius,e.segments,e.thetaStart,e.thetaLength)}},Zn=class i extends qt{constructor(e=1,t=1,n=1,s=32,r=1,a=!1,o=0,c=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:s,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:c};let l=this;s=Math.floor(s),r=Math.floor(r);let h=[],u=[],d=[],p=[],g=0,_=[],m=n/2,f=0;T(),a===!1&&(e>0&&E(!0),t>0&&E(!1)),this.setIndex(h),this.setAttribute("position",new pt(u,3)),this.setAttribute("normal",new pt(d,3)),this.setAttribute("uv",new pt(p,2));function T(){let b=new A,P=new A,R=0,C=(t-e)/n;for(let L=0;L<=r;L++){let M=[],v=L/r,I=v*(t-e)+e;for(let z=0;z<=s;z++){let F=z/s,G=F*c+o,$=Math.sin(G),W=Math.cos(G);P.x=I*$,P.y=-v*n+m,P.z=I*W,u.push(P.x,P.y,P.z),b.set($,C,W).normalize(),d.push(b.x,b.y,b.z),p.push(F,1-v),M.push(g++)}_.push(M)}for(let L=0;L<s;L++)for(let M=0;M<r;M++){let v=_[M][L],I=_[M+1][L],z=_[M+1][L+1],F=_[M][L+1];(e>0||M!==0)&&(h.push(v,I,F),R+=3),(t>0||M!==r-1)&&(h.push(I,z,F),R+=3)}l.addGroup(f,R,0),f+=R}function E(b){let P=g,R=new oe,C=new A,L=0,M=b===!0?e:t,v=b===!0?1:-1;for(let z=1;z<=s;z++)u.push(0,m*v,0),d.push(0,v,0),p.push(.5,.5),g++;let I=g;for(let z=0;z<=s;z++){let G=z/s*c+o,$=Math.cos(G),W=Math.sin(G);C.x=M*W,C.y=m*v,C.z=M*$,u.push(C.x,C.y,C.z),d.push(0,v,0),R.x=$*.5+.5,R.y=W*.5*v+.5,p.push(R.x,R.y),g++}for(let z=0;z<s;z++){let F=P+z,G=I+z;b===!0?h.push(G,G+1,F):h.push(G+1,G,F),L+=3}l.addGroup(f,L,b===!0?1:2),f+=L}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}},Lr=class i extends Zn{constructor(e=1,t=1,n=32,s=1,r=!1,a=0,o=Math.PI*2){super(0,e,t,n,s,r,a,o),this.type="ConeGeometry",this.parameters={radius:e,height:t,radialSegments:n,heightSegments:s,openEnded:r,thetaStart:a,thetaLength:o}}static fromJSON(e){return new i(e.radius,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}},Dr=class i extends qt{constructor(e=1,t=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:s};let r=e/2,a=t/2,o=Math.floor(n),c=Math.floor(s),l=o+1,h=c+1,u=e/o,d=t/c,p=[],g=[],_=[],m=[];for(let f=0;f<h;f++){let T=f*d-a;for(let E=0;E<l;E++){let b=E*u-r;g.push(b,-T,0),_.push(0,0,1),m.push(E/o),m.push(1-f/c)}}for(let f=0;f<c;f++)for(let T=0;T<o;T++){let E=T+l*f,b=T+l*(f+1),P=T+1+l*(f+1),R=T+1+l*f;p.push(E,b,R),p.push(b,P,R)}this.setIndex(p),this.setAttribute("position",new pt(g,3)),this.setAttribute("normal",new pt(_,3)),this.setAttribute("uv",new pt(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.width,e.height,e.widthSegments,e.heightSegments)}},Os=class i extends qt{constructor(e=1,t=32,n=16,s=0,r=Math.PI*2,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:s,phiLength:r,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let c=Math.min(a+o,Math.PI),l=0,h=[],u=new A,d=new A,p=[],g=[],_=[],m=[];for(let f=0;f<=n;f++){let T=[],E=f/n,b=0;f===0&&a===0?b=.5/t:f===n&&c===Math.PI&&(b=-.5/t);for(let P=0;P<=t;P++){let R=P/t;u.x=-e*Math.cos(s+R*r)*Math.sin(a+E*o),u.y=e*Math.cos(a+E*o),u.z=e*Math.sin(s+R*r)*Math.sin(a+E*o),g.push(u.x,u.y,u.z),d.copy(u).normalize(),_.push(d.x,d.y,d.z),m.push(R+b,1-E),T.push(l++)}h.push(T)}for(let f=0;f<n;f++)for(let T=0;T<t;T++){let E=h[f][T+1],b=h[f][T],P=h[f+1][T],R=h[f+1][T+1];(f!==0||a>0)&&p.push(E,b,R),(f!==n-1||c<Math.PI)&&p.push(b,P,R)}this.setIndex(p),this.setAttribute("position",new pt(g,3)),this.setAttribute("normal",new pt(_,3)),this.setAttribute("uv",new pt(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new i(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}},Rn=class extends Yn{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new We(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new We(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Wl,this.normalScale=new oe(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new It,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},oo=class extends Yn{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=yd,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},co=class extends Yn{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};Qi=class{constructor(e,t,n,s){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,s=t[n],r=t[n-1];n:{e:{let a;t:{i:if(!(e<s)){for(let o=n+2;;){if(s===void 0){if(e<r)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(r=s,s=t[++n],e<s)break e}a=t.length;break t}if(!(e>=r)){let o=t[1];e<o&&(n=2,r=o);for(let c=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===c)break;if(s=r,r=t[--n-1],e>=r)break e}a=n,n=0;break t}break n}for(;n<a;){let o=n+a>>>1;e<t[o]?a=o:n=o+1}if(s=t[n],r=t[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,s)}return this.interpolate_(n,r,e,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=e*s;for(let a=0;a!==s;++a)t[a]=n[r+a];return t}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}},lo=class extends Qi{constructor(e,t,n,s){super(e,t,n,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:yl,endingEnd:yl}}intervalChanged_(e,t,n){let s=this.parameterPositions,r=e-2,a=e+1,o=s[r],c=s[a];if(o===void 0)switch(this.getSettings_().endingStart){case vl:r=e,o=2*t-n;break;case Ml:r=s.length-2,o=t+s[r]-s[r+1];break;default:r=e,o=n}if(c===void 0)switch(this.getSettings_().endingEnd){case vl:a=e,c=2*n-t;break;case Ml:a=1,c=n+s[1]-s[0];break;default:a=e-1,c=t}let l=(n-t)*.5,h=this.valueSize;this._weightPrev=l/(t-o),this._weightNext=l/(c-n),this._offsetPrev=r*h,this._offsetNext=a*h}interpolate_(e,t,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=e*o,l=c-o,h=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,p=this._weightNext,g=(n-t)/(s-t),_=g*g,m=_*g,f=-d*m+2*d*_-d*g,T=(1+d)*m+(-1.5-2*d)*_+(-.5+d)*g+1,E=(-1-p)*m+(1.5+p)*_+.5*g,b=p*m-p*_;for(let P=0;P!==o;++P)r[P]=f*a[h+P]+T*a[l+P]+E*a[c+P]+b*a[u+P];return r}},ho=class extends Qi{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e,t,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=e*o,l=c-o,h=(n-t)/(s-t),u=1-h;for(let d=0;d!==o;++d)r[d]=a[l+d]*u+a[c+d]*h;return r}},uo=class extends Qi{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e){return this.copySampleValue_(e-1)}},un=class{constructor(e,t,n,s){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=Fa(t,this.TimeBufferType),this.values=Fa(n,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:Fa(e.times,Array),values:Fa(e.values,Array)};let s=e.getInterpolation();s!==e.DefaultInterpolation&&(n.interpolation=s)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new uo(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new ho(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new lo(this.times,this.values,this.getValueSize(),e)}setInterpolation(e){let t;switch(e){case hr:t=this.InterpolantFactoryMethodDiscrete;break;case Ga:t=this.InterpolantFactoryMethodLinear;break;case Ba:t=this.InterpolantFactoryMethodSmooth;break}if(t===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return console.warn("THREE.KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return hr;case this.InterpolantFactoryMethodLinear:return Ga;case this.InterpolantFactoryMethodSmooth:return Ba}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,s=t.length;n!==s;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,s=t.length;n!==s;++n)t[n]*=e}return this}trim(e,t){let n=this.times,s=n.length,r=0,a=s-1;for(;r!==s&&n[r]<e;)++r;for(;a!==-1&&n[a]>t;)--a;if(++a,r!==0||a!==s){r>=a&&(a=Math.max(a,1),r=a-1);let o=this.getValueSize();this.times=n.slice(r,a),this.values=this.values.slice(r*o,a*o)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),e=!1);let n=this.times,s=this.values,r=n.length;r===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),e=!1);let a=null;for(let o=0;o!==r;o++){let c=n[o];if(typeof c=="number"&&isNaN(c)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,o,c),e=!1;break}if(a!==null&&a>c){console.error("THREE.KeyframeTrack: Out of order keys.",this,o,c,a),e=!1;break}a=c}if(s!==void 0&&dg(s))for(let o=0,c=s.length;o!==c;++o){let l=s[o];if(isNaN(l)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,o,l),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),s=this.getInterpolation()===Ba,r=e.length-1,a=1;for(let o=1;o<r;++o){let c=!1,l=e[o],h=e[o+1];if(l!==h&&(o!==1||l!==e[0]))if(s)c=!0;else{let u=o*n,d=u-n,p=u+n;for(let g=0;g!==n;++g){let _=t[u+g];if(_!==t[d+g]||_!==t[p+g]){c=!0;break}}}if(c){if(o!==a){e[a]=e[o];let u=o*n,d=a*n;for(let p=0;p!==n;++p)t[d+p]=t[u+p]}++a}}if(r>0){e[a]=e[r];for(let o=r*n,c=a*n,l=0;l!==n;++l)t[c+l]=t[o+l];++a}return a!==e.length?(this.times=e.slice(0,a),this.values=t.slice(0,a*n)):(this.times=e,this.values=t),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=this.constructor,s=new n(this.name,e,t);return s.createInterpolant=this.createInterpolant,s}};un.prototype.TimeBufferType=Float32Array;un.prototype.ValueBufferType=Float32Array;un.prototype.DefaultInterpolation=Ga;di=class extends un{constructor(e,t,n){super(e,t,n)}};di.prototype.ValueTypeName="bool";di.prototype.ValueBufferType=Array;di.prototype.DefaultInterpolation=hr;di.prototype.InterpolantFactoryMethodLinear=void 0;di.prototype.InterpolantFactoryMethodSmooth=void 0;fo=class extends un{};fo.prototype.ValueTypeName="color";po=class extends un{};po.prototype.ValueTypeName="number";mo=class extends Qi{constructor(e,t,n,s){super(e,t,n,s)}interpolate_(e,t,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=(n-t)/(s-t),l=e*o;for(let h=l+o;l!==h;l+=4)xt.slerpFlat(r,0,a,l-o,a,l,c);return r}},Nr=class extends un{InterpolantFactoryMethodLinear(e){return new mo(this.times,this.values,this.getValueSize(),e)}};Nr.prototype.ValueTypeName="quaternion";Nr.prototype.InterpolantFactoryMethodSmooth=void 0;fi=class extends un{constructor(e,t,n){super(e,t,n)}};fi.prototype.ValueTypeName="string";fi.prototype.ValueBufferType=Array;fi.prototype.DefaultInterpolation=hr;fi.prototype.InterpolantFactoryMethodLinear=void 0;fi.prototype.InterpolantFactoryMethodSmooth=void 0;go=class extends un{};go.prototype.ValueTypeName="vector";_o=class{constructor(e,t,n){let s=this,r=!1,a=0,o=0,c,l=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this.itemStart=function(h){o++,r===!1&&s.onStart!==void 0&&s.onStart(h,a,o),r=!0},this.itemEnd=function(h){a++,s.onProgress!==void 0&&s.onProgress(h,a,o),a===o&&(r=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(h){s.onError!==void 0&&s.onError(h)},this.resolveURL=function(h){return c?c(h):h},this.setURLModifier=function(h){return c=h,this},this.addHandler=function(h,u){return l.push(h,u),this},this.removeHandler=function(h){let u=l.indexOf(h);return u!==-1&&l.splice(u,2),this},this.getHandler=function(h){for(let u=0,d=l.length;u<d;u+=2){let p=l[u],g=l[u+1];if(p.global&&(p.lastIndex=0),p.test(h))return g}return null}}},Ud=new _o,xo=class{constructor(e){this.manager=e!==void 0?e:Ud,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(e,t){let n=this;return new Promise(function(s,r){n.load(e,s,t,r)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}};xo.DEFAULT_MATERIAL_NAME="__DEFAULT";Ur=class extends Et{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new We(e),this.intensity=t}dispose(){}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,this.groundColor!==void 0&&(t.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(t.object.distance=this.distance),this.angle!==void 0&&(t.object.angle=this.angle),this.decay!==void 0&&(t.object.decay=this.decay),this.penumbra!==void 0&&(t.object.penumbra=this.penumbra),this.shadow!==void 0&&(t.object.shadow=this.shadow.toJSON()),this.target!==void 0&&(t.object.target=this.target.uuid),t}},Or=class extends Ur{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(Et.DEFAULT_UP),this.updateMatrix(),this.groundColor=new We(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}},xl=new _t,Hu=new A,Gu=new A,El=class{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new oe(512,512),this.map=null,this.mapPass=null,this.matrix=new _t,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Ns,this._frameExtents=new oe(1,1),this._viewportCount=1,this._viewports=[new yt(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera,n=this.matrix;Hu.setFromMatrixPosition(e.matrixWorld),t.position.copy(Hu),Gu.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(Gu),t.updateMatrixWorld(),xl.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(xl),n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(xl)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.mapSize.copy(e.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}},Fr=class extends vr{constructor(e=-1,t=1,n=1,s=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=s,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,s,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2,r=n-e,a=n+e,o=s+t,c=s-t;if(this.view!==null&&this.view.enabled){let l=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=l*this.view.offsetX,a=r+l*this.view.width,o-=h*this.view.offsetY,c=o-h*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,c,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},Tl=class extends El{constructor(){super(new Fr(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},es=class extends Ur{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(Et.DEFAULT_UP),this.updateMatrix(),this.target=new Et,this.shadow=new Tl}dispose(){this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}},yo=class extends Ot{constructor(e=[]){super(),this.isArrayCamera=!0,this.cameras=e}},Jl="\\[\\]\\.:\\/",fg=new RegExp("["+Jl+"]","g"),Kl="[^"+Jl+"]",pg="[^"+Jl.replace("\\.","")+"]",mg=/((?:WC+[\/:])*)/.source.replace("WC",Kl),gg=/(WCOD+)?/.source.replace("WCOD",pg),_g=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Kl),xg=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Kl),yg=new RegExp("^"+mg+gg+_g+xg+"$"),vg=["material","materials","bones","map"],wl=class{constructor(e,t,n){let s=n||mt.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,s)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,s=this._bindings[n];s!==void 0&&s.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let s=this._targetGroup.nCachedObjects_,r=n.length;s!==r;++s)n[s].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},mt=class i{constructor(e,t,n){this.path=t,this.parsedPath=n||i.parseTrackName(t),this.node=i.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){return e&&e.isAnimationObjectGroup?new i.Composite(e,t,n):new i(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(fg,"")}static parseTrackName(e){let t=yg.exec(e);if(t===null)throw new Error("PropertyBinding: Cannot parse trackName: "+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},s=n.nodeName&&n.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){let r=n.nodeName.substring(s+1);vg.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,s),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(r){for(let a=0;a<r.length;a++){let o=r[a];if(o.name===t||o.uuid===t)return o;let c=n(o.children);if(c)return c}return null},s=n(e.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)e[t++]=n[s]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,n=t.objectName,s=t.propertyName,r=t.propertyIndex;if(e||(e=i.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let l=t.objectIndex;switch(n){case"materials":if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let h=0;h<e.length;h++)if(e[h].name===l){l=h;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[n]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[n]}if(l!==void 0){if(e[l]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[l]}}let a=e[s];if(a===void 0){let l=t.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+l+"."+s+" but it wasn't found.",e);return}let o=this.Versioning.None;this.targetObject=e,e.needsUpdate!==void 0?o=this.Versioning.NeedsUpdate:e.matrixWorldNeedsUpdate!==void 0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(r!==void 0){if(s==="morphTargetInfluences"){if(!e.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}e.morphTargetDictionary[r]!==void 0&&(r=e.morphTargetDictionary[r])}c=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=r}else a.fromArray!==void 0&&a.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(c=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=s;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};mt.Composite=wl;mt.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};mt.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};mt.prototype.GetterByBindingType=[mt.prototype._getValue_direct,mt.prototype._getValue_array,mt.prototype._getValue_arrayElement,mt.prototype._getValue_toArray];mt.prototype.SetterByBindingTypeAndVersioning=[[mt.prototype._setValue_direct,mt.prototype._setValue_direct_setNeedsUpdate,mt.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[mt.prototype._setValue_array,mt.prototype._setValue_array_setNeedsUpdate,mt.prototype._setValue_array_setMatrixWorldNeedsUpdate],[mt.prototype._setValue_arrayElement,mt.prototype._setValue_arrayElement_setNeedsUpdate,mt.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[mt.prototype._setValue_fromArray,mt.prototype._setValue_fromArray_setNeedsUpdate,mt.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];AM=new Float32Array(1),Fs=class{constructor(e=1,t=0,n=0){return this.radius=e,this.phi=t,this.theta=n,this}set(e,t,n){return this.radius=e,this.phi=t,this.theta=n,this}copy(e){return this.radius=e.radius,this.phi=e.phi,this.theta=e.theta,this}makeSafe(){return this.phi=Ge(this.phi,1e-6,Math.PI-1e-6),this}setFromVector3(e){return this.setFromCartesianCoords(e.x,e.y,e.z)}setFromCartesianCoords(e,t,n){return this.radius=Math.sqrt(e*e+t*t+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(e,n),this.phi=Math.acos(Ge(t/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}},Br=class extends Ka{constructor(e=10,t=10,n=4473924,s=8947848){n=new We(n),s=new We(s);let r=t/2,a=e/t,o=e/2,c=[],l=[];for(let d=0,p=0,g=-o;d<=t;d++,g+=a){c.push(-o,0,g,o,0,g),c.push(g,0,-o,g,0,o);let _=d===r?n:s;_.toArray(l,p),p+=3,_.toArray(l,p),p+=3,_.toArray(l,p),p+=3,_.toArray(l,p),p+=3}let h=new qt;h.setAttribute("position",new pt(c,3)),h.setAttribute("color",new pt(l,3));let u=new Er({vertexColors:!0,toneMapped:!1});super(h,u),this.type="GridHelper"}dispose(){this.geometry.dispose(),this.material.dispose()}},kr=class extends wn{constructor(e,t=null){super(),this.object=e,this.domElement=t,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(){}disconnect(){}dispose(){}update(){}};typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:vo}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=vo)});function af(){let i=null,e=!1,t=null,n=null;function s(r,a){t(r,a),n=i.requestAnimationFrame(s)}return{start:function(){e!==!0&&t!==null&&(n=i.requestAnimationFrame(s),e=!0)},stop:function(){i.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){i=r}}}function bg(i){let e=new WeakMap;function t(o,c){let l=o.array,h=o.usage,u=l.byteLength,d=i.createBuffer();i.bindBuffer(c,d),i.bufferData(c,l,h),o.onUploadCallback();let p;if(l instanceof Float32Array)p=i.FLOAT;else if(l instanceof Uint16Array)o.isFloat16BufferAttribute?p=i.HALF_FLOAT:p=i.UNSIGNED_SHORT;else if(l instanceof Int16Array)p=i.SHORT;else if(l instanceof Uint32Array)p=i.UNSIGNED_INT;else if(l instanceof Int32Array)p=i.INT;else if(l instanceof Int8Array)p=i.BYTE;else if(l instanceof Uint8Array)p=i.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)p=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:d,type:p,bytesPerElement:l.BYTES_PER_ELEMENT,version:o.version,size:u}}function n(o,c,l){let h=c.array,u=c.updateRanges;if(i.bindBuffer(l,o),u.length===0)i.bufferSubData(l,0,h);else{u.sort((p,g)=>p.start-g.start);let d=0;for(let p=1;p<u.length;p++){let g=u[d],_=u[p];_.start<=g.start+g.count+1?g.count=Math.max(g.count,_.start+_.count-g.start):(++d,u[d]=_)}u.length=d+1;for(let p=0,g=u.length;p<g;p++){let _=u[p];i.bufferSubData(l,_.start*h.BYTES_PER_ELEMENT,h,_.start,_.count)}c.clearUpdateRanges()}c.onUploadCallback()}function s(o){return o.isInterleavedBufferAttribute&&(o=o.data),e.get(o)}function r(o){o.isInterleavedBufferAttribute&&(o=o.data);let c=e.get(o);c&&(i.deleteBuffer(c.buffer),e.delete(o))}function a(o,c){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){let h=e.get(o);(!h||h.version<o.version)&&e.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}let l=e.get(o);if(l===void 0)e.set(o,t(o,c));else if(l.version<o.version){if(l.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(l.buffer,o,c),l.version=o.version}}return{get:s,remove:r,update:a}}function ix(i,e,t,n,s,r,a){let o=new We(0),c=r===!0?0:1,l,h,u=null,d=0,p=null;function g(E){let b=E.isScene===!0?E.background:null;return b&&b.isTexture&&(b=(E.backgroundBlurriness>0?t:e).get(b)),b}function _(E){let b=!1,P=g(E);P===null?f(o,c):P&&P.isColor&&(f(P,1),b=!0);let R=i.xr.getEnvironmentBlendMode();R==="additive"?n.buffers.color.setClear(0,0,0,1,a):R==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,a),(i.autoClear||b)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function m(E,b){let P=g(b);P&&(P.isCubeTexture||P.mapping===zr)?(h===void 0&&(h=new ut(new vn(1,1,1),new Mn({name:"BackgroundCubeMaterial",uniforms:rs(Dn.backgroundCube.uniforms),vertexShader:Dn.backgroundCube.vertexShader,fragmentShader:Dn.backgroundCube.fragmentShader,side:Ht,depthTest:!1,depthWrite:!1,fog:!1})),h.geometry.deleteAttribute("normal"),h.geometry.deleteAttribute("uv"),h.onBeforeRender=function(R,C,L){this.matrixWorld.copyPosition(L.matrixWorld)},Object.defineProperty(h.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),s.update(h)),as.copy(b.backgroundRotation),as.x*=-1,as.y*=-1,as.z*=-1,P.isCubeTexture&&P.isRenderTargetTexture===!1&&(as.y*=-1,as.z*=-1),h.material.uniforms.envMap.value=P,h.material.uniforms.flipEnvMap.value=P.isCubeTexture&&P.isRenderTargetTexture===!1?-1:1,h.material.uniforms.backgroundBlurriness.value=b.backgroundBlurriness,h.material.uniforms.backgroundIntensity.value=b.backgroundIntensity,h.material.uniforms.backgroundRotation.value.setFromMatrix4(nx.makeRotationFromEuler(as)),h.material.toneMapped=nt.getTransfer(P.colorSpace)!==ct,(u!==P||d!==P.version||p!==i.toneMapping)&&(h.material.needsUpdate=!0,u=P,d=P.version,p=i.toneMapping),h.layers.enableAll(),E.unshift(h,h.geometry,h.material,0,0,null)):P&&P.isTexture&&(l===void 0&&(l=new ut(new Dr(2,2),new Mn({name:"BackgroundMaterial",uniforms:rs(Dn.background.uniforms),vertexShader:Dn.background.vertexShader,fragmentShader:Dn.background.fragmentShader,side:qn,depthTest:!1,depthWrite:!1,fog:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),s.update(l)),l.material.uniforms.t2D.value=P,l.material.uniforms.backgroundIntensity.value=b.backgroundIntensity,l.material.toneMapped=nt.getTransfer(P.colorSpace)!==ct,P.matrixAutoUpdate===!0&&P.updateMatrix(),l.material.uniforms.uvTransform.value.copy(P.matrix),(u!==P||d!==P.version||p!==i.toneMapping)&&(l.material.needsUpdate=!0,u=P,d=P.version,p=i.toneMapping),l.layers.enableAll(),E.unshift(l,l.geometry,l.material,0,0,null))}function f(E,b){E.getRGB(uc,$l(i)),n.buffers.color.setClear(uc.r,uc.g,uc.b,b,a)}function T(){h!==void 0&&(h.geometry.dispose(),h.material.dispose()),l!==void 0&&(l.geometry.dispose(),l.material.dispose())}return{getClearColor:function(){return o},setClearColor:function(E,b=1){o.set(E),c=b,f(o,c)},getClearAlpha:function(){return c},setClearAlpha:function(E){c=E,f(o,c)},render:_,addToRenderList:m,dispose:T}}function sx(i,e){let t=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=d(null),r=s,a=!1;function o(v,I,z,F,G){let $=!1,W=u(F,z,I);r!==W&&(r=W,l(r.object)),$=p(v,F,z,G),$&&g(v,F,z,G),G!==null&&e.update(G,i.ELEMENT_ARRAY_BUFFER),($||a)&&(a=!1,b(v,I,z,F),G!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,e.get(G).buffer))}function c(){return i.createVertexArray()}function l(v){return i.bindVertexArray(v)}function h(v){return i.deleteVertexArray(v)}function u(v,I,z){let F=z.wireframe===!0,G=n[v.id];G===void 0&&(G={},n[v.id]=G);let $=G[I.id];$===void 0&&($={},G[I.id]=$);let W=$[F];return W===void 0&&(W=d(c()),$[F]=W),W}function d(v){let I=[],z=[],F=[];for(let G=0;G<t;G++)I[G]=0,z[G]=0,F[G]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:I,enabledAttributes:z,attributeDivisors:F,object:v,attributes:{},index:null}}function p(v,I,z,F){let G=r.attributes,$=I.attributes,W=0,ee=z.getAttributes();for(let V in ee)if(ee[V].location>=0){let pe=G[V],Se=$[V];if(Se===void 0&&(V==="instanceMatrix"&&v.instanceMatrix&&(Se=v.instanceMatrix),V==="instanceColor"&&v.instanceColor&&(Se=v.instanceColor)),pe===void 0||pe.attribute!==Se||Se&&pe.data!==Se.data)return!0;W++}return r.attributesNum!==W||r.index!==F}function g(v,I,z,F){let G={},$=I.attributes,W=0,ee=z.getAttributes();for(let V in ee)if(ee[V].location>=0){let pe=$[V];pe===void 0&&(V==="instanceMatrix"&&v.instanceMatrix&&(pe=v.instanceMatrix),V==="instanceColor"&&v.instanceColor&&(pe=v.instanceColor));let Se={};Se.attribute=pe,pe&&pe.data&&(Se.data=pe.data),G[V]=Se,W++}r.attributes=G,r.attributesNum=W,r.index=F}function _(){let v=r.newAttributes;for(let I=0,z=v.length;I<z;I++)v[I]=0}function m(v){f(v,0)}function f(v,I){let z=r.newAttributes,F=r.enabledAttributes,G=r.attributeDivisors;z[v]=1,F[v]===0&&(i.enableVertexAttribArray(v),F[v]=1),G[v]!==I&&(i.vertexAttribDivisor(v,I),G[v]=I)}function T(){let v=r.newAttributes,I=r.enabledAttributes;for(let z=0,F=I.length;z<F;z++)I[z]!==v[z]&&(i.disableVertexAttribArray(z),I[z]=0)}function E(v,I,z,F,G,$,W){W===!0?i.vertexAttribIPointer(v,I,z,G,$):i.vertexAttribPointer(v,I,z,F,G,$)}function b(v,I,z,F){_();let G=F.attributes,$=z.getAttributes(),W=I.defaultAttributeValues;for(let ee in $){let V=$[ee];if(V.location>=0){let re=G[ee];if(re===void 0&&(ee==="instanceMatrix"&&v.instanceMatrix&&(re=v.instanceMatrix),ee==="instanceColor"&&v.instanceColor&&(re=v.instanceColor)),re!==void 0){let pe=re.normalized,Se=re.itemSize,$e=e.get(re);if($e===void 0)continue;let st=$e.buffer,X=$e.type,te=$e.bytesPerElement,be=X===i.INT||X===i.UNSIGNED_INT||re.gpuType===Do;if(re.isInterleavedBufferAttribute){let ae=re.data,Pe=ae.stride,Ne=re.offset;if(ae.isInstancedInterleavedBuffer){for(let ke=0;ke<V.locationSize;ke++)f(V.location+ke,ae.meshPerAttribute);v.isInstancedMesh!==!0&&F._maxInstanceCount===void 0&&(F._maxInstanceCount=ae.meshPerAttribute*ae.count)}else for(let ke=0;ke<V.locationSize;ke++)m(V.location+ke);i.bindBuffer(i.ARRAY_BUFFER,st);for(let ke=0;ke<V.locationSize;ke++)E(V.location+ke,Se/V.locationSize,X,pe,Pe*te,(Ne+Se/V.locationSize*ke)*te,be)}else{if(re.isInstancedBufferAttribute){for(let ae=0;ae<V.locationSize;ae++)f(V.location+ae,re.meshPerAttribute);v.isInstancedMesh!==!0&&F._maxInstanceCount===void 0&&(F._maxInstanceCount=re.meshPerAttribute*re.count)}else for(let ae=0;ae<V.locationSize;ae++)m(V.location+ae);i.bindBuffer(i.ARRAY_BUFFER,st);for(let ae=0;ae<V.locationSize;ae++)E(V.location+ae,Se/V.locationSize,X,pe,Se*te,Se/V.locationSize*ae*te,be)}}else if(W!==void 0){let pe=W[ee];if(pe!==void 0)switch(pe.length){case 2:i.vertexAttrib2fv(V.location,pe);break;case 3:i.vertexAttrib3fv(V.location,pe);break;case 4:i.vertexAttrib4fv(V.location,pe);break;default:i.vertexAttrib1fv(V.location,pe)}}}}T()}function P(){L();for(let v in n){let I=n[v];for(let z in I){let F=I[z];for(let G in F)h(F[G].object),delete F[G];delete I[z]}delete n[v]}}function R(v){if(n[v.id]===void 0)return;let I=n[v.id];for(let z in I){let F=I[z];for(let G in F)h(F[G].object),delete F[G];delete I[z]}delete n[v.id]}function C(v){for(let I in n){let z=n[I];if(z[v.id]===void 0)continue;let F=z[v.id];for(let G in F)h(F[G].object),delete F[G];delete z[v.id]}}function L(){M(),a=!0,r!==s&&(r=s,l(r.object))}function M(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:o,reset:L,resetDefaultState:M,dispose:P,releaseStatesOfGeometry:R,releaseStatesOfProgram:C,initAttributes:_,enableAttribute:m,disableUnusedAttributes:T}}function rx(i,e,t){let n;function s(l){n=l}function r(l,h){i.drawArrays(n,l,h),t.update(h,n,1)}function a(l,h,u){u!==0&&(i.drawArraysInstanced(n,l,h,u),t.update(h,n,u))}function o(l,h,u){if(u===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,h,0,u);let p=0;for(let g=0;g<u;g++)p+=h[g];t.update(p,n,1)}function c(l,h,u,d){if(u===0)return;let p=e.get("WEBGL_multi_draw");if(p===null)for(let g=0;g<l.length;g++)a(l[g],h[g],d[g]);else{p.multiDrawArraysInstancedWEBGL(n,l,0,h,0,d,0,u);let g=0;for(let _=0;_<u;_++)g+=h[_]*d[_];t.update(g,n,1)}}this.setMode=s,this.render=r,this.renderInstances=a,this.renderMultiDraw=o,this.renderMultiDrawInstances=c}function ax(i,e,t,n){let s;function r(){if(s!==void 0)return s;if(e.has("EXT_texture_filter_anisotropic")===!0){let C=e.get("EXT_texture_filter_anisotropic");s=i.getParameter(C.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function a(C){return!(C!==dn&&n.convert(C)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(C){let L=C===ks&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(C!==In&&n.convert(C)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&C!==Ln&&!L)}function c(C){if(C==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";C="mediump"}return C==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let l=t.precision!==void 0?t.precision:"highp",h=c(l);h!==l&&(console.warn("THREE.WebGLRenderer:",l,"not supported, using",h,"instead."),l=h);let u=t.logarithmicDepthBuffer===!0,d=t.reverseDepthBuffer===!0&&e.has("EXT_clip_control"),p=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),g=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),_=i.getParameter(i.MAX_TEXTURE_SIZE),m=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),f=i.getParameter(i.MAX_VERTEX_ATTRIBS),T=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),E=i.getParameter(i.MAX_VARYING_VECTORS),b=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),P=g>0,R=i.getParameter(i.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:c,textureFormatReadable:a,textureTypeReadable:o,precision:l,logarithmicDepthBuffer:u,reverseDepthBuffer:d,maxTextures:p,maxVertexTextures:g,maxTextureSize:_,maxCubemapSize:m,maxAttributes:f,maxVertexUniforms:T,maxVaryings:E,maxFragmentUniforms:b,vertexTextures:P,maxSamples:R}}function ox(i){let e=this,t=null,n=0,s=!1,r=!1,a=new cn,o=new Ve,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(u,d){let p=u.length!==0||d||n!==0||s;return s=d,n=u.length,p},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(u,d){t=h(u,d,0)},this.setState=function(u,d,p){let g=u.clippingPlanes,_=u.clipIntersection,m=u.clipShadows,f=i.get(u);if(!s||g===null||g.length===0||r&&!m)r?h(null):l();else{let T=r?0:n,E=T*4,b=f.clippingState||null;c.value=b,b=h(g,d,E,p);for(let P=0;P!==E;++P)b[P]=t[P];f.clippingState=b,this.numIntersection=_?this.numPlanes:0,this.numPlanes+=T}};function l(){c.value!==t&&(c.value=t,c.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function h(u,d,p,g){let _=u!==null?u.length:0,m=null;if(_!==0){if(m=c.value,g!==!0||m===null){let f=p+_*4,T=d.matrixWorldInverse;o.getNormalMatrix(T),(m===null||m.length<f)&&(m=new Float32Array(f));for(let E=0,b=p;E!==_;++E,b+=4)a.copy(u[E]).applyMatrix4(T,o),a.normal.toArray(m,b),m[b+3]=a.constant}c.value=m,c.needsUpdate=!0}return e.numPlanes=_,e.numIntersection=0,m}}function cx(i){let e=new WeakMap;function t(a,o){return o===Po?a.mapping=ts:o===Io&&(a.mapping=ns),a}function n(a){if(a&&a.isTexture){let o=a.mapping;if(o===Po||o===Io)if(e.has(a)){let c=e.get(a).texture;return t(c,a.mapping)}else{let c=a.image;if(c&&c.height>0){let l=new Za(c.height);return l.fromEquirectangularTexture(i,a),e.set(a,l),a.addEventListener("dispose",s),t(l.texture,a.mapping)}else return null}}return a}function s(a){let o=a.target;o.removeEventListener("dispose",s);let c=e.get(o);c!==void 0&&(e.delete(o),c.dispose())}function r(){e=new WeakMap}return{get:n,dispose:r}}function lx(i){let e=[],t=[],n=[],s=i,r=i-Hs+1+Od.length;for(let a=0;a<r;a++){let o=Math.pow(2,s);t.push(o);let c=1/o;a>i-Hs?c=Od[a-i+Hs-1]:a===0&&(c=0),n.push(c);let l=1/(o-2),h=-l,u=1+l,d=[h,h,u,h,u,u,h,h,u,u,h,u],p=6,g=6,_=3,m=2,f=1,T=new Float32Array(_*g*p),E=new Float32Array(m*g*p),b=new Float32Array(f*g*p);for(let R=0;R<p;R++){let C=R%3*2/3-1,L=R>2?0:-1,M=[C,L,0,C+2/3,L,0,C+2/3,L+1,0,C,L,0,C+2/3,L+1,0,C,L+1,0];T.set(M,_*g*R),E.set(d,m*g*R);let v=[R,R,R,R,R,R];b.set(v,f*g*R)}let P=new qt;P.setAttribute("position",new Kt(T,_)),P.setAttribute("uv",new Kt(E,m)),P.setAttribute("faceIndex",new Kt(b,f)),e.push(P),s>Hs&&s--}return{lodPlanes:e,sizeLods:t,sigmas:n}}function kd(i,e,t){let n=new An(i,e,t);return n.texture.mapping=zr,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function dc(i,e,t,n,s){i.viewport.set(e,t,n,s),i.scissor.set(e,t,n,s)}function hx(i,e,t){let n=new Float32Array(ls),s=new A(0,1,0);return new Mn({name:"SphericalGaussianBlur",defines:{n:ls,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:mh(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:$n,depthTest:!1,depthWrite:!1})}function zd(){return new Mn({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:mh(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:$n,depthTest:!1,depthWrite:!1})}function Vd(){return new Mn({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:mh(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:$n,depthTest:!1,depthWrite:!1})}function mh(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function ux(i){let e=new WeakMap,t=null;function n(o){if(o&&o.isTexture){let c=o.mapping,l=c===Po||c===Io,h=c===ts||c===ns;if(l||h){let u=e.get(o),d=u!==void 0?u.texture.pmremVersion:0;if(o.isRenderTargetTexture&&o.pmremVersion!==d)return t===null&&(t=new pc(i)),u=l?t.fromEquirectangular(o,u):t.fromCubemap(o,u),u.texture.pmremVersion=o.pmremVersion,e.set(o,u),u.texture;if(u!==void 0)return u.texture;{let p=o.image;return l&&p&&p.height>0||h&&p&&s(p)?(t===null&&(t=new pc(i)),u=l?t.fromEquirectangular(o):t.fromCubemap(o),u.texture.pmremVersion=o.pmremVersion,e.set(o,u),o.addEventListener("dispose",r),u.texture):null}}}return o}function s(o){let c=0,l=6;for(let h=0;h<l;h++)o[h]!==void 0&&c++;return c===l}function r(o){let c=o.target;c.removeEventListener("dispose",r);let l=e.get(c);l!==void 0&&(e.delete(c),l.dispose())}function a(){e=new WeakMap,t!==null&&(t.dispose(),t=null)}return{get:n,dispose:a}}function dx(i){let e={};function t(n){if(e[n]!==void 0)return e[n];let s;switch(n){case"WEBGL_depth_texture":s=i.getExtension("WEBGL_depth_texture")||i.getExtension("MOZ_WEBGL_depth_texture")||i.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":s=i.getExtension("EXT_texture_filter_anisotropic")||i.getExtension("MOZ_EXT_texture_filter_anisotropic")||i.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":s=i.getExtension("WEBGL_compressed_texture_s3tc")||i.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||i.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":s=i.getExtension("WEBGL_compressed_texture_pvrtc")||i.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:s=i.getExtension(n)}return e[n]=s,s}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){let s=t(n);return s===null&&ss("THREE.WebGLRenderer: "+n+" extension not supported."),s}}}function fx(i,e,t,n){let s={},r=new WeakMap;function a(u){let d=u.target;d.index!==null&&e.remove(d.index);for(let g in d.attributes)e.remove(d.attributes[g]);d.removeEventListener("dispose",a),delete s[d.id];let p=r.get(d);p&&(e.remove(p),r.delete(d)),n.releaseStatesOfGeometry(d),d.isInstancedBufferGeometry===!0&&delete d._maxInstanceCount,t.memory.geometries--}function o(u,d){return s[d.id]===!0||(d.addEventListener("dispose",a),s[d.id]=!0,t.memory.geometries++),d}function c(u){let d=u.attributes;for(let p in d)e.update(d[p],i.ARRAY_BUFFER)}function l(u){let d=[],p=u.index,g=u.attributes.position,_=0;if(p!==null){let T=p.array;_=p.version;for(let E=0,b=T.length;E<b;E+=3){let P=T[E+0],R=T[E+1],C=T[E+2];d.push(P,R,R,C,C,P)}}else if(g!==void 0){let T=g.array;_=g.version;for(let E=0,b=T.length/3-1;E<b;E+=3){let P=E+0,R=E+1,C=E+2;d.push(P,R,R,C,C,P)}}else return;let m=new(Zl(d)?yr:xr)(d,1);m.version=_;let f=r.get(u);f&&e.remove(f),r.set(u,m)}function h(u){let d=r.get(u);if(d){let p=u.index;p!==null&&d.version<p.version&&l(u)}else l(u);return r.get(u)}return{get:o,update:c,getWireframeAttribute:h}}function px(i,e,t){let n;function s(d){n=d}let r,a;function o(d){r=d.type,a=d.bytesPerElement}function c(d,p){i.drawElements(n,p,r,d*a),t.update(p,n,1)}function l(d,p,g){g!==0&&(i.drawElementsInstanced(n,p,r,d*a,g),t.update(p,n,g))}function h(d,p,g){if(g===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,p,0,r,d,0,g);let m=0;for(let f=0;f<g;f++)m+=p[f];t.update(m,n,1)}function u(d,p,g,_){if(g===0)return;let m=e.get("WEBGL_multi_draw");if(m===null)for(let f=0;f<d.length;f++)l(d[f]/a,p[f],_[f]);else{m.multiDrawElementsInstancedWEBGL(n,p,0,r,d,0,_,0,g);let f=0;for(let T=0;T<g;T++)f+=p[T]*_[T];t.update(f,n,1)}}this.setMode=s,this.setIndex=o,this.render=c,this.renderInstances=l,this.renderMultiDraw=h,this.renderMultiDrawInstances=u}function mx(i){let e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(t.calls++,a){case i.TRIANGLES:t.triangles+=o*(r/3);break;case i.LINES:t.lines+=o*(r/2);break;case i.LINE_STRIP:t.lines+=o*(r-1);break;case i.LINE_LOOP:t.lines+=o*r;break;case i.POINTS:t.points+=o*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",a);break}}function s(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:s,update:n}}function gx(i,e,t){let n=new WeakMap,s=new yt;function r(a,o,c){let l=a.morphTargetInfluences,h=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,u=h!==void 0?h.length:0,d=n.get(o);if(d===void 0||d.count!==u){let M=function(){C.dispose(),n.delete(o),o.removeEventListener("dispose",M)};d!==void 0&&d.texture.dispose();let p=o.morphAttributes.position!==void 0,g=o.morphAttributes.normal!==void 0,_=o.morphAttributes.color!==void 0,m=o.morphAttributes.position||[],f=o.morphAttributes.normal||[],T=o.morphAttributes.color||[],E=0;p===!0&&(E=1),g===!0&&(E=2),_===!0&&(E=3);let b=o.attributes.position.count*E,P=1;b>e.maxTextureSize&&(P=Math.ceil(b/e.maxTextureSize),b=e.maxTextureSize);let R=new Float32Array(b*P*4*u),C=new mr(R,b,P,u);C.type=Ln,C.needsUpdate=!0;let L=E*4;for(let v=0;v<u;v++){let I=m[v],z=f[v],F=T[v],G=b*P*4*v;for(let $=0;$<I.count;$++){let W=$*L;p===!0&&(s.fromBufferAttribute(I,$),R[G+W+0]=s.x,R[G+W+1]=s.y,R[G+W+2]=s.z,R[G+W+3]=0),g===!0&&(s.fromBufferAttribute(z,$),R[G+W+4]=s.x,R[G+W+5]=s.y,R[G+W+6]=s.z,R[G+W+7]=0),_===!0&&(s.fromBufferAttribute(F,$),R[G+W+8]=s.x,R[G+W+9]=s.y,R[G+W+10]=s.z,R[G+W+11]=F.itemSize===4?s.w:1)}}d={count:u,texture:C,size:new oe(b,P)},n.set(o,d),o.addEventListener("dispose",M)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)c.getUniforms().setValue(i,"morphTexture",a.morphTexture,t);else{let p=0;for(let _=0;_<l.length;_++)p+=l[_];let g=o.morphTargetsRelative?1:1-p;c.getUniforms().setValue(i,"morphTargetBaseInfluence",g),c.getUniforms().setValue(i,"morphTargetInfluences",l)}c.getUniforms().setValue(i,"morphTargetsTexture",d.texture,t),c.getUniforms().setValue(i,"morphTargetsTextureSize",d.size)}return{update:r}}function _x(i,e,t,n){let s=new WeakMap;function r(c){let l=n.render.frame,h=c.geometry,u=e.get(c,h);if(s.get(u)!==l&&(e.update(u),s.set(u,l)),c.isInstancedMesh&&(c.hasEventListener("dispose",o)===!1&&c.addEventListener("dispose",o),s.get(c)!==l&&(t.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,i.ARRAY_BUFFER),s.set(c,l))),c.isSkinnedMesh){let d=c.skeleton;s.get(d)!==l&&(d.update(),s.set(d,l))}return u}function a(){s=new WeakMap}function o(c){let l=c.target;l.removeEventListener("dispose",o),t.remove(l.instanceMatrix),l.instanceColor!==null&&t.remove(l.instanceColor)}return{update:r,dispose:a}}function Ws(i,e,t){let n=i[0];if(n<=0||n>0)return i;let s=e*t,r=Gd[s];if(r===void 0&&(r=new Float32Array(s),Gd[s]=r),e!==0){n.toArray(r,0);for(let a=1,o=0;a!==e;++a)o+=t,i[a].toArray(r,o)}return r}function Tt(i,e){if(i.length!==e.length)return!1;for(let t=0,n=i.length;t<n;t++)if(i[t]!==e[t])return!1;return!0}function wt(i,e){for(let t=0,n=e.length;t<n;t++)i[t]=e[t]}function gc(i,e){let t=Wd[e];t===void 0&&(t=new Int32Array(e),Wd[e]=t);for(let n=0;n!==e;++n)t[n]=i.allocateTextureUnit();return t}function xx(i,e){let t=this.cache;t[0]!==e&&(i.uniform1f(this.addr,e),t[0]=e)}function yx(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Tt(t,e))return;i.uniform2fv(this.addr,e),wt(t,e)}}function vx(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(i.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(Tt(t,e))return;i.uniform3fv(this.addr,e),wt(t,e)}}function Mx(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Tt(t,e))return;i.uniform4fv(this.addr,e),wt(t,e)}}function bx(i,e){let t=this.cache,n=e.elements;if(n===void 0){if(Tt(t,e))return;i.uniformMatrix2fv(this.addr,!1,e),wt(t,e)}else{if(Tt(t,n))return;Yd.set(n),i.uniformMatrix2fv(this.addr,!1,Yd),wt(t,n)}}function Sx(i,e){let t=this.cache,n=e.elements;if(n===void 0){if(Tt(t,e))return;i.uniformMatrix3fv(this.addr,!1,e),wt(t,e)}else{if(Tt(t,n))return;qd.set(n),i.uniformMatrix3fv(this.addr,!1,qd),wt(t,n)}}function Ex(i,e){let t=this.cache,n=e.elements;if(n===void 0){if(Tt(t,e))return;i.uniformMatrix4fv(this.addr,!1,e),wt(t,e)}else{if(Tt(t,n))return;Xd.set(n),i.uniformMatrix4fv(this.addr,!1,Xd),wt(t,n)}}function Tx(i,e){let t=this.cache;t[0]!==e&&(i.uniform1i(this.addr,e),t[0]=e)}function wx(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Tt(t,e))return;i.uniform2iv(this.addr,e),wt(t,e)}}function Ax(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Tt(t,e))return;i.uniform3iv(this.addr,e),wt(t,e)}}function Rx(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Tt(t,e))return;i.uniform4iv(this.addr,e),wt(t,e)}}function Cx(i,e){let t=this.cache;t[0]!==e&&(i.uniform1ui(this.addr,e),t[0]=e)}function Px(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Tt(t,e))return;i.uniform2uiv(this.addr,e),wt(t,e)}}function Ix(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Tt(t,e))return;i.uniform3uiv(this.addr,e),wt(t,e)}}function Lx(i,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Tt(t,e))return;i.uniform4uiv(this.addr,e),wt(t,e)}}function Dx(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?(Hd.compareFunction=Xl,r=Hd):r=of,t.setTexture2D(e||r,s)}function Nx(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture3D(e||lf,s)}function Ux(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTextureCube(e||hf,s)}function Ox(i,e,t){let n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture2DArray(e||cf,s)}function Fx(i){switch(i){case 5126:return xx;case 35664:return yx;case 35665:return vx;case 35666:return Mx;case 35674:return bx;case 35675:return Sx;case 35676:return Ex;case 5124:case 35670:return Tx;case 35667:case 35671:return wx;case 35668:case 35672:return Ax;case 35669:case 35673:return Rx;case 5125:return Cx;case 36294:return Px;case 36295:return Ix;case 36296:return Lx;case 35678:case 36198:case 36298:case 36306:case 35682:return Dx;case 35679:case 36299:case 36307:return Nx;case 35680:case 36300:case 36308:case 36293:return Ux;case 36289:case 36303:case 36311:case 36292:return Ox}}function Bx(i,e){i.uniform1fv(this.addr,e)}function kx(i,e){let t=Ws(e,this.size,2);i.uniform2fv(this.addr,t)}function zx(i,e){let t=Ws(e,this.size,3);i.uniform3fv(this.addr,t)}function Vx(i,e){let t=Ws(e,this.size,4);i.uniform4fv(this.addr,t)}function Hx(i,e){let t=Ws(e,this.size,4);i.uniformMatrix2fv(this.addr,!1,t)}function Gx(i,e){let t=Ws(e,this.size,9);i.uniformMatrix3fv(this.addr,!1,t)}function Wx(i,e){let t=Ws(e,this.size,16);i.uniformMatrix4fv(this.addr,!1,t)}function Xx(i,e){i.uniform1iv(this.addr,e)}function qx(i,e){i.uniform2iv(this.addr,e)}function Yx(i,e){i.uniform3iv(this.addr,e)}function Zx(i,e){i.uniform4iv(this.addr,e)}function $x(i,e){i.uniform1uiv(this.addr,e)}function jx(i,e){i.uniform2uiv(this.addr,e)}function Jx(i,e){i.uniform3uiv(this.addr,e)}function Kx(i,e){i.uniform4uiv(this.addr,e)}function Qx(i,e,t){let n=this.cache,s=e.length,r=gc(t,s);Tt(n,r)||(i.uniform1iv(this.addr,r),wt(n,r));for(let a=0;a!==s;++a)t.setTexture2D(e[a]||of,r[a])}function ey(i,e,t){let n=this.cache,s=e.length,r=gc(t,s);Tt(n,r)||(i.uniform1iv(this.addr,r),wt(n,r));for(let a=0;a!==s;++a)t.setTexture3D(e[a]||lf,r[a])}function ty(i,e,t){let n=this.cache,s=e.length,r=gc(t,s);Tt(n,r)||(i.uniform1iv(this.addr,r),wt(n,r));for(let a=0;a!==s;++a)t.setTextureCube(e[a]||hf,r[a])}function ny(i,e,t){let n=this.cache,s=e.length,r=gc(t,s);Tt(n,r)||(i.uniform1iv(this.addr,r),wt(n,r));for(let a=0;a!==s;++a)t.setTexture2DArray(e[a]||cf,r[a])}function iy(i){switch(i){case 5126:return Bx;case 35664:return kx;case 35665:return zx;case 35666:return Vx;case 35674:return Hx;case 35675:return Gx;case 35676:return Wx;case 5124:case 35670:return Xx;case 35667:case 35671:return qx;case 35668:case 35672:return Yx;case 35669:case 35673:return Zx;case 5125:return $x;case 36294:return jx;case 36295:return Jx;case 36296:return Kx;case 35678:case 36198:case 36298:case 36306:case 35682:return Qx;case 35679:case 36299:case 36307:return ey;case 35680:case 36300:case 36308:case 36293:return ty;case 36289:case 36303:case 36311:case 36292:return ny}}function Zd(i,e){i.seq.push(e),i.map[e.id]=e}function sy(i,e,t){let n=i.name,s=n.length;for(ah.lastIndex=0;;){let r=ah.exec(n),a=ah.lastIndex,o=r[1],c=r[2]==="]",l=r[3];if(c&&(o=o|0),l===void 0||l==="["&&a+2===s){Zd(t,l===void 0?new oh(o,i,e):new ch(o,i,e));break}else{let u=t.map[o];u===void 0&&(u=new lh(o),Zd(t,u)),t=u}}}function $d(i,e,t){let n=i.createShader(e);return i.shaderSource(n,t),i.compileShader(n),n}function oy(i,e){let t=i.split(`
`),n=[],s=Math.max(e-6,0),r=Math.min(e+6,t.length);for(let a=s;a<r;a++){let o=a+1;n.push(`${o===e?">":" "} ${o}: ${t[a]}`)}return n.join(`
`)}function cy(i){nt._getMatrix(jd,nt.workingColorSpace,i);let e=`mat3( ${jd.elements.map(t=>t.toFixed(4))} )`;switch(nt.getTransfer(i)){case ur:return[e,"LinearTransferOETF"];case ct:return[e,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",i),[e,"LinearTransferOETF"]}}function Jd(i,e,t){let n=i.getShaderParameter(e,i.COMPILE_STATUS),s=i.getShaderInfoLog(e).trim();if(n&&s==="")return"";let r=/ERROR: 0:(\d+)/.exec(s);if(r){let a=parseInt(r[1]);return t.toUpperCase()+`

`+s+`

`+oy(i.getShaderSource(e),a)}else return s}function ly(i,e){let t=cy(e);return[`vec4 ${i}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}function hy(i,e){let t;switch(e){case dd:t="Linear";break;case fd:t="Reinhard";break;case pd:t="Cineon";break;case Co:t="ACESFilmic";break;case gd:t="AgX";break;case _d:t="Neutral";break;case md:t="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",e),t="Linear"}return"vec3 "+i+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}function uy(){nt.getLuminanceCoefficients(fc);let i=fc.x.toFixed(4),e=fc.y.toFixed(4),t=fc.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function dy(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Yr).join(`
`)}function fy(i){let e=[];for(let t in i){let n=i[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function py(i,e){let t={},n=i.getProgramParameter(e,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){let r=i.getActiveAttrib(e,s),a=r.name,o=1;r.type===i.FLOAT_MAT2&&(o=2),r.type===i.FLOAT_MAT3&&(o=3),r.type===i.FLOAT_MAT4&&(o=4),t[a]={type:r.type,location:i.getAttribLocation(e,a),locationSize:o}}return t}function Yr(i){return i!==""}function Kd(i,e){let t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function Qd(i,e){return i.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}function hh(i){return i.replace(my,_y)}function _y(i,e){let t=Ze[e];if(t===void 0){let n=gy.get(e);if(n!==void 0)t=Ze[n],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n);else throw new Error("Can not resolve #include <"+e+">")}return hh(t)}function ef(i){return i.replace(xy,yy)}function yy(i,e,t,n){let s="";for(let r=parseInt(e);r<parseInt(t);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function tf(i){let e=`precision ${i.precision} float;
	precision ${i.precision} int;
	precision ${i.precision} sampler2D;
	precision ${i.precision} samplerCube;
	precision ${i.precision} sampler3D;
	precision ${i.precision} sampler2DArray;
	precision ${i.precision} sampler2DShadow;
	precision ${i.precision} samplerCubeShadow;
	precision ${i.precision} sampler2DArrayShadow;
	precision ${i.precision} isampler2D;
	precision ${i.precision} isampler3D;
	precision ${i.precision} isamplerCube;
	precision ${i.precision} isampler2DArray;
	precision ${i.precision} usampler2D;
	precision ${i.precision} usampler3D;
	precision ${i.precision} usamplerCube;
	precision ${i.precision} usampler2DArray;
	`;return i.precision==="highp"?e+=`
#define HIGH_PRECISION`:i.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:i.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}function vy(i){let e="SHADOWMAP_TYPE_BASIC";return i.shadowMapType===Rl?e="SHADOWMAP_TYPE_PCF":i.shadowMapType===Mo?e="SHADOWMAP_TYPE_PCF_SOFT":i.shadowMapType===Cn&&(e="SHADOWMAP_TYPE_VSM"),e}function My(i){let e="ENVMAP_TYPE_CUBE";if(i.envMap)switch(i.envMapMode){case ts:case ns:e="ENVMAP_TYPE_CUBE";break;case zr:e="ENVMAP_TYPE_CUBE_UV";break}return e}function by(i){let e="ENVMAP_MODE_REFLECTION";if(i.envMap)switch(i.envMapMode){case ns:e="ENVMAP_MODE_REFRACTION";break}return e}function Sy(i){let e="ENVMAP_BLENDING_NONE";if(i.envMap)switch(i.combine){case Ll:e="ENVMAP_BLENDING_MULTIPLY";break;case hd:e="ENVMAP_BLENDING_MIX";break;case ud:e="ENVMAP_BLENDING_ADD";break}return e}function Ey(i){let e=i.envMapCubeUVHeight;if(e===null)return null;let t=Math.log2(e)-2,n=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),7*16)),texelHeight:n,maxMip:t}}function Ty(i,e,t,n){let s=i.getContext(),r=t.defines,a=t.vertexShader,o=t.fragmentShader,c=vy(t),l=My(t),h=by(t),u=Sy(t),d=Ey(t),p=dy(t),g=fy(r),_=s.createProgram(),m,f,T=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(m=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Yr).join(`
`),m.length>0&&(m+=`
`),f=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Yr).join(`
`),f.length>0&&(f+=`
`)):(m=[tf(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Yr).join(`
`),f=[tf(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+l:"",t.envMap?"#define "+h:"",t.envMap?"#define "+u:"",d?"#define CUBEUV_TEXEL_WIDTH "+d.texelWidth:"",d?"#define CUBEUV_TEXEL_HEIGHT "+d.texelHeight:"",d?"#define CUBEUV_MAX_MIP "+d.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor||t.batchingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==jn?"#define TONE_MAPPING":"",t.toneMapping!==jn?Ze.tonemapping_pars_fragment:"",t.toneMapping!==jn?hy("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Ze.colorspace_pars_fragment,ly("linearToOutputTexel",t.outputColorSpace),uy(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Yr).join(`
`)),a=hh(a),a=Kd(a,t),a=Qd(a,t),o=hh(o),o=Kd(o,t),o=Qd(o,t),a=ef(a),o=ef(o),t.isRawShaderMaterial!==!0&&(T=`#version 300 es
`,m=[p,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,f=["#define varying in",t.glslVersion===ql?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===ql?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+f);let E=T+m+a,b=T+f+o,P=$d(s,s.VERTEX_SHADER,E),R=$d(s,s.FRAGMENT_SHADER,b);s.attachShader(_,P),s.attachShader(_,R),t.index0AttributeName!==void 0?s.bindAttribLocation(_,0,t.index0AttributeName):t.morphTargets===!0&&s.bindAttribLocation(_,0,"position"),s.linkProgram(_);function C(I){if(i.debug.checkShaderErrors){let z=s.getProgramInfoLog(_).trim(),F=s.getShaderInfoLog(P).trim(),G=s.getShaderInfoLog(R).trim(),$=!0,W=!0;if(s.getProgramParameter(_,s.LINK_STATUS)===!1)if($=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,_,P,R);else{let ee=Jd(s,P,"vertex"),V=Jd(s,R,"fragment");console.error("THREE.WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(_,s.VALIDATE_STATUS)+`

Material Name: `+I.name+`
Material Type: `+I.type+`

Program Info Log: `+z+`
`+ee+`
`+V)}else z!==""?console.warn("THREE.WebGLProgram: Program Info Log:",z):(F===""||G==="")&&(W=!1);W&&(I.diagnostics={runnable:$,programLog:z,vertexShader:{log:F,prefix:m},fragmentShader:{log:G,prefix:f}})}s.deleteShader(P),s.deleteShader(R),L=new Gs(s,_),M=py(s,_)}let L;this.getUniforms=function(){return L===void 0&&C(this),L};let M;this.getAttributes=function(){return M===void 0&&C(this),M};let v=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return v===!1&&(v=s.getProgramParameter(_,ry)),v},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(_),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=ay++,this.cacheKey=e,this.usedTimes=1,this.program=_,this.vertexShader=P,this.fragmentShader=R,this}function Ay(i,e,t,n,s,r,a){let o=new gr,c=new uh,l=new Set,h=[],u=s.logarithmicDepthBuffer,d=s.vertexTextures,p=s.precision,g={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function _(M){return l.add(M),M===0?"uv":`uv${M}`}function m(M,v,I,z,F){let G=z.fog,$=F.geometry,W=M.isMeshStandardMaterial?z.environment:null,ee=(M.isMeshStandardMaterial?t:e).get(M.envMap||W),V=ee&&ee.mapping===zr?ee.image.height:null,re=g[M.type];M.precision!==null&&(p=s.getMaxPrecision(M.precision),p!==M.precision&&console.warn("THREE.WebGLProgram.getParameters:",M.precision,"not supported, using",p,"instead."));let pe=$.morphAttributes.position||$.morphAttributes.normal||$.morphAttributes.color,Se=pe!==void 0?pe.length:0,$e=0;$.morphAttributes.position!==void 0&&($e=1),$.morphAttributes.normal!==void 0&&($e=2),$.morphAttributes.color!==void 0&&($e=3);let st,X,te,be;if(re){let ot=Dn[re];st=ot.vertexShader,X=ot.fragmentShader}else st=M.vertexShader,X=M.fragmentShader,c.update(M),te=c.getVertexShaderID(M),be=c.getFragmentShaderID(M);let ae=i.getRenderTarget(),Pe=i.state.buffers.depth.getReversed(),Ne=F.isInstancedMesh===!0,ke=F.isBatchedMesh===!0,dt=!!M.map,Je=!!M.matcap,ne=!!ee,w=!!M.aoMap,Fe=!!M.lightMap,we=!!M.bumpMap,Ie=!!M.normalMap,me=!!M.displacementMap,Ke=!!M.emissiveMap,Te=!!M.metalnessMap,S=!!M.roughnessMap,x=M.anisotropy>0,O=M.clearcoat>0,Y=M.dispersion>0,j=M.iridescence>0,q=M.sheen>0,Ee=M.transmission>0,he=x&&!!M.anisotropyMap,_e=O&&!!M.clearcoatMap,et=O&&!!M.clearcoatNormalMap,Q=O&&!!M.clearcoatRoughnessMap,xe=j&&!!M.iridescenceMap,Le=j&&!!M.iridescenceThicknessMap,Ue=q&&!!M.sheenColorMap,ye=q&&!!M.sheenRoughnessMap,Qe=!!M.specularMap,Xe=!!M.specularColorMap,ft=!!M.specularIntensityMap,D=Ee&&!!M.transmissionMap,ce=Ee&&!!M.thicknessMap,H=!!M.gradientMap,Z=!!M.alphaMap,fe=M.alphaTest>0,de=!!M.alphaHash,He=!!M.extensions,vt=jn;M.toneMapped&&(ae===null||ae.isXRRenderTarget===!0)&&(vt=i.toneMapping);let Lt={shaderID:re,shaderType:M.type,shaderName:M.name,vertexShader:st,fragmentShader:X,defines:M.defines,customVertexShaderID:te,customFragmentShaderID:be,isRawShaderMaterial:M.isRawShaderMaterial===!0,glslVersion:M.glslVersion,precision:p,batching:ke,batchingColor:ke&&F._colorsTexture!==null,instancing:Ne,instancingColor:Ne&&F.instanceColor!==null,instancingMorph:Ne&&F.morphTexture!==null,supportsVertexTextures:d,outputColorSpace:ae===null?i.outputColorSpace:ae.isXRRenderTarget===!0?ae.texture.colorSpace:ji,alphaToCoverage:!!M.alphaToCoverage,map:dt,matcap:Je,envMap:ne,envMapMode:ne&&ee.mapping,envMapCubeUVHeight:V,aoMap:w,lightMap:Fe,bumpMap:we,normalMap:Ie,displacementMap:d&&me,emissiveMap:Ke,normalMapObjectSpace:Ie&&M.normalMapType===Md,normalMapTangentSpace:Ie&&M.normalMapType===Wl,metalnessMap:Te,roughnessMap:S,anisotropy:x,anisotropyMap:he,clearcoat:O,clearcoatMap:_e,clearcoatNormalMap:et,clearcoatRoughnessMap:Q,dispersion:Y,iridescence:j,iridescenceMap:xe,iridescenceThicknessMap:Le,sheen:q,sheenColorMap:Ue,sheenRoughnessMap:ye,specularMap:Qe,specularColorMap:Xe,specularIntensityMap:ft,transmission:Ee,transmissionMap:D,thicknessMap:ce,gradientMap:H,opaque:M.transparent===!1&&M.blending===Yi&&M.alphaToCoverage===!1,alphaMap:Z,alphaTest:fe,alphaHash:de,combine:M.combine,mapUv:dt&&_(M.map.channel),aoMapUv:w&&_(M.aoMap.channel),lightMapUv:Fe&&_(M.lightMap.channel),bumpMapUv:we&&_(M.bumpMap.channel),normalMapUv:Ie&&_(M.normalMap.channel),displacementMapUv:me&&_(M.displacementMap.channel),emissiveMapUv:Ke&&_(M.emissiveMap.channel),metalnessMapUv:Te&&_(M.metalnessMap.channel),roughnessMapUv:S&&_(M.roughnessMap.channel),anisotropyMapUv:he&&_(M.anisotropyMap.channel),clearcoatMapUv:_e&&_(M.clearcoatMap.channel),clearcoatNormalMapUv:et&&_(M.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Q&&_(M.clearcoatRoughnessMap.channel),iridescenceMapUv:xe&&_(M.iridescenceMap.channel),iridescenceThicknessMapUv:Le&&_(M.iridescenceThicknessMap.channel),sheenColorMapUv:Ue&&_(M.sheenColorMap.channel),sheenRoughnessMapUv:ye&&_(M.sheenRoughnessMap.channel),specularMapUv:Qe&&_(M.specularMap.channel),specularColorMapUv:Xe&&_(M.specularColorMap.channel),specularIntensityMapUv:ft&&_(M.specularIntensityMap.channel),transmissionMapUv:D&&_(M.transmissionMap.channel),thicknessMapUv:ce&&_(M.thicknessMap.channel),alphaMapUv:Z&&_(M.alphaMap.channel),vertexTangents:!!$.attributes.tangent&&(Ie||x),vertexColors:M.vertexColors,vertexAlphas:M.vertexColors===!0&&!!$.attributes.color&&$.attributes.color.itemSize===4,pointsUvs:F.isPoints===!0&&!!$.attributes.uv&&(dt||Z),fog:!!G,useFog:M.fog===!0,fogExp2:!!G&&G.isFogExp2,flatShading:M.flatShading===!0,sizeAttenuation:M.sizeAttenuation===!0,logarithmicDepthBuffer:u,reverseDepthBuffer:Pe,skinning:F.isSkinnedMesh===!0,morphTargets:$.morphAttributes.position!==void 0,morphNormals:$.morphAttributes.normal!==void 0,morphColors:$.morphAttributes.color!==void 0,morphTargetsCount:Se,morphTextureStride:$e,numDirLights:v.directional.length,numPointLights:v.point.length,numSpotLights:v.spot.length,numSpotLightMaps:v.spotLightMap.length,numRectAreaLights:v.rectArea.length,numHemiLights:v.hemi.length,numDirLightShadows:v.directionalShadowMap.length,numPointLightShadows:v.pointShadowMap.length,numSpotLightShadows:v.spotShadowMap.length,numSpotLightShadowsWithMaps:v.numSpotLightShadowsWithMaps,numLightProbes:v.numLightProbes,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:M.dithering,shadowMapEnabled:i.shadowMap.enabled&&I.length>0,shadowMapType:i.shadowMap.type,toneMapping:vt,decodeVideoTexture:dt&&M.map.isVideoTexture===!0&&nt.getTransfer(M.map.colorSpace)===ct,decodeVideoTextureEmissive:Ke&&M.emissiveMap.isVideoTexture===!0&&nt.getTransfer(M.emissiveMap.colorSpace)===ct,premultipliedAlpha:M.premultipliedAlpha,doubleSided:M.side===Pn,flipSided:M.side===Ht,useDepthPacking:M.depthPacking>=0,depthPacking:M.depthPacking||0,index0AttributeName:M.index0AttributeName,extensionClipCullDistance:He&&M.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(He&&M.extensions.multiDraw===!0||ke)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:M.customProgramCacheKey()};return Lt.vertexUv1s=l.has(1),Lt.vertexUv2s=l.has(2),Lt.vertexUv3s=l.has(3),l.clear(),Lt}function f(M){let v=[];if(M.shaderID?v.push(M.shaderID):(v.push(M.customVertexShaderID),v.push(M.customFragmentShaderID)),M.defines!==void 0)for(let I in M.defines)v.push(I),v.push(M.defines[I]);return M.isRawShaderMaterial===!1&&(T(v,M),E(v,M),v.push(i.outputColorSpace)),v.push(M.customProgramCacheKey),v.join()}function T(M,v){M.push(v.precision),M.push(v.outputColorSpace),M.push(v.envMapMode),M.push(v.envMapCubeUVHeight),M.push(v.mapUv),M.push(v.alphaMapUv),M.push(v.lightMapUv),M.push(v.aoMapUv),M.push(v.bumpMapUv),M.push(v.normalMapUv),M.push(v.displacementMapUv),M.push(v.emissiveMapUv),M.push(v.metalnessMapUv),M.push(v.roughnessMapUv),M.push(v.anisotropyMapUv),M.push(v.clearcoatMapUv),M.push(v.clearcoatNormalMapUv),M.push(v.clearcoatRoughnessMapUv),M.push(v.iridescenceMapUv),M.push(v.iridescenceThicknessMapUv),M.push(v.sheenColorMapUv),M.push(v.sheenRoughnessMapUv),M.push(v.specularMapUv),M.push(v.specularColorMapUv),M.push(v.specularIntensityMapUv),M.push(v.transmissionMapUv),M.push(v.thicknessMapUv),M.push(v.combine),M.push(v.fogExp2),M.push(v.sizeAttenuation),M.push(v.morphTargetsCount),M.push(v.morphAttributeCount),M.push(v.numDirLights),M.push(v.numPointLights),M.push(v.numSpotLights),M.push(v.numSpotLightMaps),M.push(v.numHemiLights),M.push(v.numRectAreaLights),M.push(v.numDirLightShadows),M.push(v.numPointLightShadows),M.push(v.numSpotLightShadows),M.push(v.numSpotLightShadowsWithMaps),M.push(v.numLightProbes),M.push(v.shadowMapType),M.push(v.toneMapping),M.push(v.numClippingPlanes),M.push(v.numClipIntersection),M.push(v.depthPacking)}function E(M,v){o.disableAll(),v.supportsVertexTextures&&o.enable(0),v.instancing&&o.enable(1),v.instancingColor&&o.enable(2),v.instancingMorph&&o.enable(3),v.matcap&&o.enable(4),v.envMap&&o.enable(5),v.normalMapObjectSpace&&o.enable(6),v.normalMapTangentSpace&&o.enable(7),v.clearcoat&&o.enable(8),v.iridescence&&o.enable(9),v.alphaTest&&o.enable(10),v.vertexColors&&o.enable(11),v.vertexAlphas&&o.enable(12),v.vertexUv1s&&o.enable(13),v.vertexUv2s&&o.enable(14),v.vertexUv3s&&o.enable(15),v.vertexTangents&&o.enable(16),v.anisotropy&&o.enable(17),v.alphaHash&&o.enable(18),v.batching&&o.enable(19),v.dispersion&&o.enable(20),v.batchingColor&&o.enable(21),M.push(o.mask),o.disableAll(),v.fog&&o.enable(0),v.useFog&&o.enable(1),v.flatShading&&o.enable(2),v.logarithmicDepthBuffer&&o.enable(3),v.reverseDepthBuffer&&o.enable(4),v.skinning&&o.enable(5),v.morphTargets&&o.enable(6),v.morphNormals&&o.enable(7),v.morphColors&&o.enable(8),v.premultipliedAlpha&&o.enable(9),v.shadowMapEnabled&&o.enable(10),v.doubleSided&&o.enable(11),v.flipSided&&o.enable(12),v.useDepthPacking&&o.enable(13),v.dithering&&o.enable(14),v.transmission&&o.enable(15),v.sheen&&o.enable(16),v.opaque&&o.enable(17),v.pointsUvs&&o.enable(18),v.decodeVideoTexture&&o.enable(19),v.decodeVideoTextureEmissive&&o.enable(20),v.alphaToCoverage&&o.enable(21),M.push(o.mask)}function b(M){let v=g[M.type],I;if(v){let z=Dn[v];I=Nd.clone(z.uniforms)}else I=M.uniforms;return I}function P(M,v){let I;for(let z=0,F=h.length;z<F;z++){let G=h[z];if(G.cacheKey===v){I=G,++I.usedTimes;break}}return I===void 0&&(I=new Ty(i,v,M,r),h.push(I)),I}function R(M){if(--M.usedTimes===0){let v=h.indexOf(M);h[v]=h[h.length-1],h.pop(),M.destroy()}}function C(M){c.remove(M)}function L(){c.dispose()}return{getParameters:m,getProgramCacheKey:f,getUniforms:b,acquireProgram:P,releaseProgram:R,releaseShaderCache:C,programs:h,dispose:L}}function Ry(){let i=new WeakMap;function e(a){return i.has(a)}function t(a){let o=i.get(a);return o===void 0&&(o={},i.set(a,o)),o}function n(a){i.delete(a)}function s(a,o,c){i.get(a)[o]=c}function r(){i=new WeakMap}return{has:e,get:t,remove:n,update:s,dispose:r}}function Cy(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.material.id!==e.material.id?i.material.id-e.material.id:i.z!==e.z?i.z-e.z:i.id-e.id}function nf(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.z!==e.z?e.z-i.z:i.id-e.id}function sf(){let i=[],e=0,t=[],n=[],s=[];function r(){e=0,t.length=0,n.length=0,s.length=0}function a(u,d,p,g,_,m){let f=i[e];return f===void 0?(f={id:u.id,object:u,geometry:d,material:p,groupOrder:g,renderOrder:u.renderOrder,z:_,group:m},i[e]=f):(f.id=u.id,f.object=u,f.geometry=d,f.material=p,f.groupOrder=g,f.renderOrder=u.renderOrder,f.z=_,f.group=m),e++,f}function o(u,d,p,g,_,m){let f=a(u,d,p,g,_,m);p.transmission>0?n.push(f):p.transparent===!0?s.push(f):t.push(f)}function c(u,d,p,g,_,m){let f=a(u,d,p,g,_,m);p.transmission>0?n.unshift(f):p.transparent===!0?s.unshift(f):t.unshift(f)}function l(u,d){t.length>1&&t.sort(u||Cy),n.length>1&&n.sort(d||nf),s.length>1&&s.sort(d||nf)}function h(){for(let u=e,d=i.length;u<d;u++){let p=i[u];if(p.id===null)break;p.id=null,p.object=null,p.geometry=null,p.material=null,p.group=null}}return{opaque:t,transmissive:n,transparent:s,init:r,push:o,unshift:c,finish:h,sort:l}}function Py(){let i=new WeakMap;function e(n,s){let r=i.get(n),a;return r===void 0?(a=new sf,i.set(n,[a])):s>=r.length?(a=new sf,r.push(a)):a=r[s],a}function t(){i=new WeakMap}return{get:e,dispose:t}}function Iy(){let i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new A,color:new We};break;case"SpotLight":t={position:new A,direction:new A,color:new We,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new A,color:new We,distance:0,decay:0};break;case"HemisphereLight":t={direction:new A,skyColor:new We,groundColor:new We};break;case"RectAreaLight":t={color:new We,position:new A,halfWidth:new A,halfHeight:new A};break}return i[e.id]=t,t}}}function Ly(){let i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new oe};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new oe};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new oe,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[e.id]=t,t}}}function Ny(i,e){return(e.castShadow?2:0)-(i.castShadow?2:0)+(e.map?1:0)-(i.map?1:0)}function Uy(i){let e=new Iy,t=Ly(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)n.probe.push(new A);let s=new A,r=new _t,a=new _t;function o(l){let h=0,u=0,d=0;for(let M=0;M<9;M++)n.probe[M].set(0,0,0);let p=0,g=0,_=0,m=0,f=0,T=0,E=0,b=0,P=0,R=0,C=0;l.sort(Ny);for(let M=0,v=l.length;M<v;M++){let I=l[M],z=I.color,F=I.intensity,G=I.distance,$=I.shadow&&I.shadow.map?I.shadow.map.texture:null;if(I.isAmbientLight)h+=z.r*F,u+=z.g*F,d+=z.b*F;else if(I.isLightProbe){for(let W=0;W<9;W++)n.probe[W].addScaledVector(I.sh.coefficients[W],F);C++}else if(I.isDirectionalLight){let W=e.get(I);if(W.color.copy(I.color).multiplyScalar(I.intensity),I.castShadow){let ee=I.shadow,V=t.get(I);V.shadowIntensity=ee.intensity,V.shadowBias=ee.bias,V.shadowNormalBias=ee.normalBias,V.shadowRadius=ee.radius,V.shadowMapSize=ee.mapSize,n.directionalShadow[p]=V,n.directionalShadowMap[p]=$,n.directionalShadowMatrix[p]=I.shadow.matrix,T++}n.directional[p]=W,p++}else if(I.isSpotLight){let W=e.get(I);W.position.setFromMatrixPosition(I.matrixWorld),W.color.copy(z).multiplyScalar(F),W.distance=G,W.coneCos=Math.cos(I.angle),W.penumbraCos=Math.cos(I.angle*(1-I.penumbra)),W.decay=I.decay,n.spot[_]=W;let ee=I.shadow;if(I.map&&(n.spotLightMap[P]=I.map,P++,ee.updateMatrices(I),I.castShadow&&R++),n.spotLightMatrix[_]=ee.matrix,I.castShadow){let V=t.get(I);V.shadowIntensity=ee.intensity,V.shadowBias=ee.bias,V.shadowNormalBias=ee.normalBias,V.shadowRadius=ee.radius,V.shadowMapSize=ee.mapSize,n.spotShadow[_]=V,n.spotShadowMap[_]=$,b++}_++}else if(I.isRectAreaLight){let W=e.get(I);W.color.copy(z).multiplyScalar(F),W.halfWidth.set(I.width*.5,0,0),W.halfHeight.set(0,I.height*.5,0),n.rectArea[m]=W,m++}else if(I.isPointLight){let W=e.get(I);if(W.color.copy(I.color).multiplyScalar(I.intensity),W.distance=I.distance,W.decay=I.decay,I.castShadow){let ee=I.shadow,V=t.get(I);V.shadowIntensity=ee.intensity,V.shadowBias=ee.bias,V.shadowNormalBias=ee.normalBias,V.shadowRadius=ee.radius,V.shadowMapSize=ee.mapSize,V.shadowCameraNear=ee.camera.near,V.shadowCameraFar=ee.camera.far,n.pointShadow[g]=V,n.pointShadowMap[g]=$,n.pointShadowMatrix[g]=I.shadow.matrix,E++}n.point[g]=W,g++}else if(I.isHemisphereLight){let W=e.get(I);W.skyColor.copy(I.color).multiplyScalar(F),W.groundColor.copy(I.groundColor).multiplyScalar(F),n.hemi[f]=W,f++}}m>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=se.LTC_FLOAT_1,n.rectAreaLTC2=se.LTC_FLOAT_2):(n.rectAreaLTC1=se.LTC_HALF_1,n.rectAreaLTC2=se.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=u,n.ambient[2]=d;let L=n.hash;(L.directionalLength!==p||L.pointLength!==g||L.spotLength!==_||L.rectAreaLength!==m||L.hemiLength!==f||L.numDirectionalShadows!==T||L.numPointShadows!==E||L.numSpotShadows!==b||L.numSpotMaps!==P||L.numLightProbes!==C)&&(n.directional.length=p,n.spot.length=_,n.rectArea.length=m,n.point.length=g,n.hemi.length=f,n.directionalShadow.length=T,n.directionalShadowMap.length=T,n.pointShadow.length=E,n.pointShadowMap.length=E,n.spotShadow.length=b,n.spotShadowMap.length=b,n.directionalShadowMatrix.length=T,n.pointShadowMatrix.length=E,n.spotLightMatrix.length=b+P-R,n.spotLightMap.length=P,n.numSpotLightShadowsWithMaps=R,n.numLightProbes=C,L.directionalLength=p,L.pointLength=g,L.spotLength=_,L.rectAreaLength=m,L.hemiLength=f,L.numDirectionalShadows=T,L.numPointShadows=E,L.numSpotShadows=b,L.numSpotMaps=P,L.numLightProbes=C,n.version=Dy++)}function c(l,h){let u=0,d=0,p=0,g=0,_=0,m=h.matrixWorldInverse;for(let f=0,T=l.length;f<T;f++){let E=l[f];if(E.isDirectionalLight){let b=n.directional[u];b.direction.setFromMatrixPosition(E.matrixWorld),s.setFromMatrixPosition(E.target.matrixWorld),b.direction.sub(s),b.direction.transformDirection(m),u++}else if(E.isSpotLight){let b=n.spot[p];b.position.setFromMatrixPosition(E.matrixWorld),b.position.applyMatrix4(m),b.direction.setFromMatrixPosition(E.matrixWorld),s.setFromMatrixPosition(E.target.matrixWorld),b.direction.sub(s),b.direction.transformDirection(m),p++}else if(E.isRectAreaLight){let b=n.rectArea[g];b.position.setFromMatrixPosition(E.matrixWorld),b.position.applyMatrix4(m),a.identity(),r.copy(E.matrixWorld),r.premultiply(m),a.extractRotation(r),b.halfWidth.set(E.width*.5,0,0),b.halfHeight.set(0,E.height*.5,0),b.halfWidth.applyMatrix4(a),b.halfHeight.applyMatrix4(a),g++}else if(E.isPointLight){let b=n.point[d];b.position.setFromMatrixPosition(E.matrixWorld),b.position.applyMatrix4(m),d++}else if(E.isHemisphereLight){let b=n.hemi[_];b.direction.setFromMatrixPosition(E.matrixWorld),b.direction.transformDirection(m),_++}}}return{setup:o,setupView:c,state:n}}function rf(i){let e=new Uy(i),t=[],n=[];function s(h){l.camera=h,t.length=0,n.length=0}function r(h){t.push(h)}function a(h){n.push(h)}function o(){e.setup(t)}function c(h){e.setupView(t,h)}let l={lightsArray:t,shadowsArray:n,camera:null,lights:e,transmissionRenderTarget:{}};return{init:s,state:l,setupLights:o,setupLightsView:c,pushLight:r,pushShadow:a}}function Oy(i){let e=new WeakMap;function t(s,r=0){let a=e.get(s),o;return a===void 0?(o=new rf(i),e.set(s,[o])):r>=a.length?(o=new rf(i),a.push(o)):o=a[r],o}function n(){e=new WeakMap}return{get:t,dispose:n}}function ky(i,e,t){let n=new Ns,s=new oe,r=new oe,a=new yt,o=new oo({depthPacking:vd}),c=new co,l={},h=t.maxTextureSize,u={[qn]:Ht,[Ht]:qn,[Pn]:Pn},d=new Mn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new oe},radius:{value:4}},vertexShader:Fy,fragmentShader:By}),p=d.clone();p.defines.HORIZONTAL_PASS=1;let g=new qt;g.setAttribute("position",new Kt(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let _=new ut(g,d),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Rl;let f=this.type;this.render=function(R,C,L){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||R.length===0)return;let M=i.getRenderTarget(),v=i.getActiveCubeFace(),I=i.getActiveMipmapLevel(),z=i.state;z.setBlending($n),z.buffers.color.setClear(1,1,1,1),z.buffers.depth.setTest(!0),z.setScissorTest(!1);let F=f!==Cn&&this.type===Cn,G=f===Cn&&this.type!==Cn;for(let $=0,W=R.length;$<W;$++){let ee=R[$],V=ee.shadow;if(V===void 0){console.warn("THREE.WebGLShadowMap:",ee,"has no shadow.");continue}if(V.autoUpdate===!1&&V.needsUpdate===!1)continue;s.copy(V.mapSize);let re=V.getFrameExtents();if(s.multiply(re),r.copy(V.mapSize),(s.x>h||s.y>h)&&(s.x>h&&(r.x=Math.floor(h/re.x),s.x=r.x*re.x,V.mapSize.x=r.x),s.y>h&&(r.y=Math.floor(h/re.y),s.y=r.y*re.y,V.mapSize.y=r.y)),V.map===null||F===!0||G===!0){let Se=this.type!==Cn?{minFilter:ln,magFilter:ln}:{};V.map!==null&&V.map.dispose(),V.map=new An(s.x,s.y,Se),V.map.texture.name=ee.name+".shadowMap",V.camera.updateProjectionMatrix()}i.setRenderTarget(V.map),i.clear();let pe=V.getViewportCount();for(let Se=0;Se<pe;Se++){let $e=V.getViewport(Se);a.set(r.x*$e.x,r.y*$e.y,r.x*$e.z,r.y*$e.w),z.viewport(a),V.updateMatrices(ee,Se),n=V.getFrustum(),b(C,L,V.camera,ee,this.type)}V.isPointLightShadow!==!0&&this.type===Cn&&T(V,L),V.needsUpdate=!1}f=this.type,m.needsUpdate=!1,i.setRenderTarget(M,v,I)};function T(R,C){let L=e.update(_);d.defines.VSM_SAMPLES!==R.blurSamples&&(d.defines.VSM_SAMPLES=R.blurSamples,p.defines.VSM_SAMPLES=R.blurSamples,d.needsUpdate=!0,p.needsUpdate=!0),R.mapPass===null&&(R.mapPass=new An(s.x,s.y)),d.uniforms.shadow_pass.value=R.map.texture,d.uniforms.resolution.value=R.mapSize,d.uniforms.radius.value=R.radius,i.setRenderTarget(R.mapPass),i.clear(),i.renderBufferDirect(C,null,L,d,_,null),p.uniforms.shadow_pass.value=R.mapPass.texture,p.uniforms.resolution.value=R.mapSize,p.uniforms.radius.value=R.radius,i.setRenderTarget(R.map),i.clear(),i.renderBufferDirect(C,null,L,p,_,null)}function E(R,C,L,M){let v=null,I=L.isPointLight===!0?R.customDistanceMaterial:R.customDepthMaterial;if(I!==void 0)v=I;else if(v=L.isPointLight===!0?c:o,i.localClippingEnabled&&C.clipShadows===!0&&Array.isArray(C.clippingPlanes)&&C.clippingPlanes.length!==0||C.displacementMap&&C.displacementScale!==0||C.alphaMap&&C.alphaTest>0||C.map&&C.alphaTest>0){let z=v.uuid,F=C.uuid,G=l[z];G===void 0&&(G={},l[z]=G);let $=G[F];$===void 0&&($=v.clone(),G[F]=$,C.addEventListener("dispose",P)),v=$}if(v.visible=C.visible,v.wireframe=C.wireframe,M===Cn?v.side=C.shadowSide!==null?C.shadowSide:C.side:v.side=C.shadowSide!==null?C.shadowSide:u[C.side],v.alphaMap=C.alphaMap,v.alphaTest=C.alphaTest,v.map=C.map,v.clipShadows=C.clipShadows,v.clippingPlanes=C.clippingPlanes,v.clipIntersection=C.clipIntersection,v.displacementMap=C.displacementMap,v.displacementScale=C.displacementScale,v.displacementBias=C.displacementBias,v.wireframeLinewidth=C.wireframeLinewidth,v.linewidth=C.linewidth,L.isPointLight===!0&&v.isMeshDistanceMaterial===!0){let z=i.properties.get(v);z.light=L}return v}function b(R,C,L,M,v){if(R.visible===!1)return;if(R.layers.test(C.layers)&&(R.isMesh||R.isLine||R.isPoints)&&(R.castShadow||R.receiveShadow&&v===Cn)&&(!R.frustumCulled||n.intersectsObject(R))){R.modelViewMatrix.multiplyMatrices(L.matrixWorldInverse,R.matrixWorld);let F=e.update(R),G=R.material;if(Array.isArray(G)){let $=F.groups;for(let W=0,ee=$.length;W<ee;W++){let V=$[W],re=G[V.materialIndex];if(re&&re.visible){let pe=E(R,re,M,v);R.onBeforeShadow(i,R,C,L,F,pe,V),i.renderBufferDirect(L,null,F,pe,R,V),R.onAfterShadow(i,R,C,L,F,pe,V)}}}else if(G.visible){let $=E(R,G,M,v);R.onBeforeShadow(i,R,C,L,F,$,null),i.renderBufferDirect(L,null,F,$,R,null),R.onAfterShadow(i,R,C,L,F,$,null)}}let z=R.children;for(let F=0,G=z.length;F<G;F++)b(z[F],C,L,M,v)}function P(R){R.target.removeEventListener("dispose",P);for(let L in l){let M=l[L],v=R.target.uuid;v in M&&(M[v].dispose(),delete M[v])}}}function Vy(i,e){function t(){let D=!1,ce=new yt,H=null,Z=new yt(0,0,0,0);return{setMask:function(fe){H!==fe&&!D&&(i.colorMask(fe,fe,fe,fe),H=fe)},setLocked:function(fe){D=fe},setClear:function(fe,de,He,vt,Lt){Lt===!0&&(fe*=vt,de*=vt,He*=vt),ce.set(fe,de,He,vt),Z.equals(ce)===!1&&(i.clearColor(fe,de,He,vt),Z.copy(ce))},reset:function(){D=!1,H=null,Z.set(-1,0,0,0)}}}function n(){let D=!1,ce=!1,H=null,Z=null,fe=null;return{setReversed:function(de){if(ce!==de){let He=e.get("EXT_clip_control");ce?He.clipControlEXT(He.LOWER_LEFT_EXT,He.ZERO_TO_ONE_EXT):He.clipControlEXT(He.LOWER_LEFT_EXT,He.NEGATIVE_ONE_TO_ONE_EXT);let vt=fe;fe=null,this.setClear(vt)}ce=de},getReversed:function(){return ce},setTest:function(de){de?ae(i.DEPTH_TEST):Pe(i.DEPTH_TEST)},setMask:function(de){H!==de&&!D&&(i.depthMask(de),H=de)},setFunc:function(de){if(ce&&(de=zy[de]),Z!==de){switch(de){case bo:i.depthFunc(i.NEVER);break;case So:i.depthFunc(i.ALWAYS);break;case Eo:i.depthFunc(i.LESS);break;case Zi:i.depthFunc(i.LEQUAL);break;case To:i.depthFunc(i.EQUAL);break;case wo:i.depthFunc(i.GEQUAL);break;case Ao:i.depthFunc(i.GREATER);break;case Ro:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}Z=de}},setLocked:function(de){D=de},setClear:function(de){fe!==de&&(ce&&(de=1-de),i.clearDepth(de),fe=de)},reset:function(){D=!1,H=null,Z=null,fe=null,ce=!1}}}function s(){let D=!1,ce=null,H=null,Z=null,fe=null,de=null,He=null,vt=null,Lt=null;return{setTest:function(ot){D||(ot?ae(i.STENCIL_TEST):Pe(i.STENCIL_TEST))},setMask:function(ot){ce!==ot&&!D&&(i.stencilMask(ot),ce=ot)},setFunc:function(ot,fn,Un){(H!==ot||Z!==fn||fe!==Un)&&(i.stencilFunc(ot,fn,Un),H=ot,Z=fn,fe=Un)},setOp:function(ot,fn,Un){(de!==ot||He!==fn||vt!==Un)&&(i.stencilOp(ot,fn,Un),de=ot,He=fn,vt=Un)},setLocked:function(ot){D=ot},setClear:function(ot){Lt!==ot&&(i.clearStencil(ot),Lt=ot)},reset:function(){D=!1,ce=null,H=null,Z=null,fe=null,de=null,He=null,vt=null,Lt=null}}}let r=new t,a=new n,o=new s,c=new WeakMap,l=new WeakMap,h={},u={},d=new WeakMap,p=[],g=null,_=!1,m=null,f=null,T=null,E=null,b=null,P=null,R=null,C=new We(0,0,0),L=0,M=!1,v=null,I=null,z=null,F=null,G=null,$=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS),W=!1,ee=0,V=i.getParameter(i.VERSION);V.indexOf("WebGL")!==-1?(ee=parseFloat(/^WebGL (\d)/.exec(V)[1]),W=ee>=1):V.indexOf("OpenGL ES")!==-1&&(ee=parseFloat(/^OpenGL ES (\d)/.exec(V)[1]),W=ee>=2);let re=null,pe={},Se=i.getParameter(i.SCISSOR_BOX),$e=i.getParameter(i.VIEWPORT),st=new yt().fromArray(Se),X=new yt().fromArray($e);function te(D,ce,H,Z){let fe=new Uint8Array(4),de=i.createTexture();i.bindTexture(D,de),i.texParameteri(D,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(D,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let He=0;He<H;He++)D===i.TEXTURE_3D||D===i.TEXTURE_2D_ARRAY?i.texImage3D(ce,0,i.RGBA,1,1,Z,0,i.RGBA,i.UNSIGNED_BYTE,fe):i.texImage2D(ce+He,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,fe);return de}let be={};be[i.TEXTURE_2D]=te(i.TEXTURE_2D,i.TEXTURE_2D,1),be[i.TEXTURE_CUBE_MAP]=te(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),be[i.TEXTURE_2D_ARRAY]=te(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),be[i.TEXTURE_3D]=te(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),a.setClear(1),o.setClear(0),ae(i.DEPTH_TEST),a.setFunc(Zi),we(!1),Ie(Al),ae(i.CULL_FACE),w($n);function ae(D){h[D]!==!0&&(i.enable(D),h[D]=!0)}function Pe(D){h[D]!==!1&&(i.disable(D),h[D]=!1)}function Ne(D,ce){return u[D]!==ce?(i.bindFramebuffer(D,ce),u[D]=ce,D===i.DRAW_FRAMEBUFFER&&(u[i.FRAMEBUFFER]=ce),D===i.FRAMEBUFFER&&(u[i.DRAW_FRAMEBUFFER]=ce),!0):!1}function ke(D,ce){let H=p,Z=!1;if(D){H=d.get(ce),H===void 0&&(H=[],d.set(ce,H));let fe=D.textures;if(H.length!==fe.length||H[0]!==i.COLOR_ATTACHMENT0){for(let de=0,He=fe.length;de<He;de++)H[de]=i.COLOR_ATTACHMENT0+de;H.length=fe.length,Z=!0}}else H[0]!==i.BACK&&(H[0]=i.BACK,Z=!0);Z&&i.drawBuffers(H)}function dt(D){return g!==D?(i.useProgram(D),g=D,!0):!1}let Je={[ui]:i.FUNC_ADD,[Yu]:i.FUNC_SUBTRACT,[Zu]:i.FUNC_REVERSE_SUBTRACT};Je[$u]=i.MIN,Je[ju]=i.MAX;let ne={[Ju]:i.ZERO,[Ku]:i.ONE,[Qu]:i.SRC_COLOR,[ka]:i.SRC_ALPHA,[rd]:i.SRC_ALPHA_SATURATE,[id]:i.DST_COLOR,[td]:i.DST_ALPHA,[ed]:i.ONE_MINUS_SRC_COLOR,[za]:i.ONE_MINUS_SRC_ALPHA,[sd]:i.ONE_MINUS_DST_COLOR,[nd]:i.ONE_MINUS_DST_ALPHA,[ad]:i.CONSTANT_COLOR,[od]:i.ONE_MINUS_CONSTANT_COLOR,[cd]:i.CONSTANT_ALPHA,[ld]:i.ONE_MINUS_CONSTANT_ALPHA};function w(D,ce,H,Z,fe,de,He,vt,Lt,ot){if(D===$n){_===!0&&(Pe(i.BLEND),_=!1);return}if(_===!1&&(ae(i.BLEND),_=!0),D!==qu){if(D!==m||ot!==M){if((f!==ui||b!==ui)&&(i.blendEquation(i.FUNC_ADD),f=ui,b=ui),ot)switch(D){case Yi:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Cl:i.blendFunc(i.ONE,i.ONE);break;case Pl:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case Il:i.blendFuncSeparate(i.ZERO,i.SRC_COLOR,i.ZERO,i.SRC_ALPHA);break;default:console.error("THREE.WebGLState: Invalid blending: ",D);break}else switch(D){case Yi:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Cl:i.blendFunc(i.SRC_ALPHA,i.ONE);break;case Pl:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case Il:i.blendFunc(i.ZERO,i.SRC_COLOR);break;default:console.error("THREE.WebGLState: Invalid blending: ",D);break}T=null,E=null,P=null,R=null,C.set(0,0,0),L=0,m=D,M=ot}return}fe=fe||ce,de=de||H,He=He||Z,(ce!==f||fe!==b)&&(i.blendEquationSeparate(Je[ce],Je[fe]),f=ce,b=fe),(H!==T||Z!==E||de!==P||He!==R)&&(i.blendFuncSeparate(ne[H],ne[Z],ne[de],ne[He]),T=H,E=Z,P=de,R=He),(vt.equals(C)===!1||Lt!==L)&&(i.blendColor(vt.r,vt.g,vt.b,Lt),C.copy(vt),L=Lt),m=D,M=!1}function Fe(D,ce){D.side===Pn?Pe(i.CULL_FACE):ae(i.CULL_FACE);let H=D.side===Ht;ce&&(H=!H),we(H),D.blending===Yi&&D.transparent===!1?w($n):w(D.blending,D.blendEquation,D.blendSrc,D.blendDst,D.blendEquationAlpha,D.blendSrcAlpha,D.blendDstAlpha,D.blendColor,D.blendAlpha,D.premultipliedAlpha),a.setFunc(D.depthFunc),a.setTest(D.depthTest),a.setMask(D.depthWrite),r.setMask(D.colorWrite);let Z=D.stencilWrite;o.setTest(Z),Z&&(o.setMask(D.stencilWriteMask),o.setFunc(D.stencilFunc,D.stencilRef,D.stencilFuncMask),o.setOp(D.stencilFail,D.stencilZFail,D.stencilZPass)),Ke(D.polygonOffset,D.polygonOffsetFactor,D.polygonOffsetUnits),D.alphaToCoverage===!0?ae(i.SAMPLE_ALPHA_TO_COVERAGE):Pe(i.SAMPLE_ALPHA_TO_COVERAGE)}function we(D){v!==D&&(D?i.frontFace(i.CW):i.frontFace(i.CCW),v=D)}function Ie(D){D!==Wu?(ae(i.CULL_FACE),D!==I&&(D===Al?i.cullFace(i.BACK):D===Xu?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):Pe(i.CULL_FACE),I=D}function me(D){D!==z&&(W&&i.lineWidth(D),z=D)}function Ke(D,ce,H){D?(ae(i.POLYGON_OFFSET_FILL),(F!==ce||G!==H)&&(i.polygonOffset(ce,H),F=ce,G=H)):Pe(i.POLYGON_OFFSET_FILL)}function Te(D){D?ae(i.SCISSOR_TEST):Pe(i.SCISSOR_TEST)}function S(D){D===void 0&&(D=i.TEXTURE0+$-1),re!==D&&(i.activeTexture(D),re=D)}function x(D,ce,H){H===void 0&&(re===null?H=i.TEXTURE0+$-1:H=re);let Z=pe[H];Z===void 0&&(Z={type:void 0,texture:void 0},pe[H]=Z),(Z.type!==D||Z.texture!==ce)&&(re!==H&&(i.activeTexture(H),re=H),i.bindTexture(D,ce||be[D]),Z.type=D,Z.texture=ce)}function O(){let D=pe[re];D!==void 0&&D.type!==void 0&&(i.bindTexture(D.type,null),D.type=void 0,D.texture=void 0)}function Y(){try{i.compressedTexImage2D.apply(i,arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function j(){try{i.compressedTexImage3D.apply(i,arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function q(){try{i.texSubImage2D.apply(i,arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function Ee(){try{i.texSubImage3D.apply(i,arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function he(){try{i.compressedTexSubImage2D.apply(i,arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function _e(){try{i.compressedTexSubImage3D.apply(i,arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function et(){try{i.texStorage2D.apply(i,arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function Q(){try{i.texStorage3D.apply(i,arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function xe(){try{i.texImage2D.apply(i,arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function Le(){try{i.texImage3D.apply(i,arguments)}catch(D){console.error("THREE.WebGLState:",D)}}function Ue(D){st.equals(D)===!1&&(i.scissor(D.x,D.y,D.z,D.w),st.copy(D))}function ye(D){X.equals(D)===!1&&(i.viewport(D.x,D.y,D.z,D.w),X.copy(D))}function Qe(D,ce){let H=l.get(ce);H===void 0&&(H=new WeakMap,l.set(ce,H));let Z=H.get(D);Z===void 0&&(Z=i.getUniformBlockIndex(ce,D.name),H.set(D,Z))}function Xe(D,ce){let Z=l.get(ce).get(D);c.get(ce)!==Z&&(i.uniformBlockBinding(ce,Z,D.__bindingPointIndex),c.set(ce,Z))}function ft(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),a.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),h={},re=null,pe={},u={},d=new WeakMap,p=[],g=null,_=!1,m=null,f=null,T=null,E=null,b=null,P=null,R=null,C=new We(0,0,0),L=0,M=!1,v=null,I=null,z=null,F=null,G=null,st.set(0,0,i.canvas.width,i.canvas.height),X.set(0,0,i.canvas.width,i.canvas.height),r.reset(),a.reset(),o.reset()}return{buffers:{color:r,depth:a,stencil:o},enable:ae,disable:Pe,bindFramebuffer:Ne,drawBuffers:ke,useProgram:dt,setBlending:w,setMaterial:Fe,setFlipSided:we,setCullFace:Ie,setLineWidth:me,setPolygonOffset:Ke,setScissorTest:Te,activeTexture:S,bindTexture:x,unbindTexture:O,compressedTexImage2D:Y,compressedTexImage3D:j,texImage2D:xe,texImage3D:Le,updateUBOMapping:Qe,uniformBlockBinding:Xe,texStorage2D:et,texStorage3D:Q,texSubImage2D:q,texSubImage3D:Ee,compressedTexSubImage2D:he,compressedTexSubImage3D:_e,scissor:Ue,viewport:ye,reset:ft}}function Hy(i,e,t,n,s,r,a){let o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new oe,h=new WeakMap,u,d=new WeakMap,p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(S,x){return p?new OffscreenCanvas(S,x):fr("canvas")}function _(S,x,O){let Y=1,j=Te(S);if((j.width>O||j.height>O)&&(Y=O/Math.max(j.width,j.height)),Y<1)if(typeof HTMLImageElement<"u"&&S instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&S instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&S instanceof ImageBitmap||typeof VideoFrame<"u"&&S instanceof VideoFrame){let q=Math.floor(Y*j.width),Ee=Math.floor(Y*j.height);u===void 0&&(u=g(q,Ee));let he=x?g(q,Ee):u;return he.width=q,he.height=Ee,he.getContext("2d").drawImage(S,0,0,q,Ee),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+j.width+"x"+j.height+") to ("+q+"x"+Ee+")."),he}else return"data"in S&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+j.width+"x"+j.height+")."),S;return S}function m(S){return S.generateMipmaps}function f(S){i.generateMipmap(S)}function T(S){return S.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:S.isWebGL3DRenderTarget?i.TEXTURE_3D:S.isWebGLArrayRenderTarget||S.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function E(S,x,O,Y,j=!1){if(S!==null){if(i[S]!==void 0)return i[S];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+S+"'")}let q=x;if(x===i.RED&&(O===i.FLOAT&&(q=i.R32F),O===i.HALF_FLOAT&&(q=i.R16F),O===i.UNSIGNED_BYTE&&(q=i.R8)),x===i.RED_INTEGER&&(O===i.UNSIGNED_BYTE&&(q=i.R8UI),O===i.UNSIGNED_SHORT&&(q=i.R16UI),O===i.UNSIGNED_INT&&(q=i.R32UI),O===i.BYTE&&(q=i.R8I),O===i.SHORT&&(q=i.R16I),O===i.INT&&(q=i.R32I)),x===i.RG&&(O===i.FLOAT&&(q=i.RG32F),O===i.HALF_FLOAT&&(q=i.RG16F),O===i.UNSIGNED_BYTE&&(q=i.RG8)),x===i.RG_INTEGER&&(O===i.UNSIGNED_BYTE&&(q=i.RG8UI),O===i.UNSIGNED_SHORT&&(q=i.RG16UI),O===i.UNSIGNED_INT&&(q=i.RG32UI),O===i.BYTE&&(q=i.RG8I),O===i.SHORT&&(q=i.RG16I),O===i.INT&&(q=i.RG32I)),x===i.RGB_INTEGER&&(O===i.UNSIGNED_BYTE&&(q=i.RGB8UI),O===i.UNSIGNED_SHORT&&(q=i.RGB16UI),O===i.UNSIGNED_INT&&(q=i.RGB32UI),O===i.BYTE&&(q=i.RGB8I),O===i.SHORT&&(q=i.RGB16I),O===i.INT&&(q=i.RGB32I)),x===i.RGBA_INTEGER&&(O===i.UNSIGNED_BYTE&&(q=i.RGBA8UI),O===i.UNSIGNED_SHORT&&(q=i.RGBA16UI),O===i.UNSIGNED_INT&&(q=i.RGBA32UI),O===i.BYTE&&(q=i.RGBA8I),O===i.SHORT&&(q=i.RGBA16I),O===i.INT&&(q=i.RGBA32I)),x===i.RGB&&O===i.UNSIGNED_INT_5_9_9_9_REV&&(q=i.RGB9_E5),x===i.RGBA){let Ee=j?ur:nt.getTransfer(Y);O===i.FLOAT&&(q=i.RGBA32F),O===i.HALF_FLOAT&&(q=i.RGBA16F),O===i.UNSIGNED_BYTE&&(q=Ee===ct?i.SRGB8_ALPHA8:i.RGBA8),O===i.UNSIGNED_SHORT_4_4_4_4&&(q=i.RGBA4),O===i.UNSIGNED_SHORT_5_5_5_1&&(q=i.RGB5_A1)}return(q===i.R16F||q===i.R32F||q===i.RG16F||q===i.RG32F||q===i.RGBA16F||q===i.RGBA32F)&&e.get("EXT_color_buffer_float"),q}function b(S,x){let O;return S?x===null||x===_i||x===is?O=i.DEPTH24_STENCIL8:x===Ln?O=i.DEPTH32F_STENCIL8:x===Bs&&(O=i.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):x===null||x===_i||x===is?O=i.DEPTH_COMPONENT24:x===Ln?O=i.DEPTH_COMPONENT32F:x===Bs&&(O=i.DEPTH_COMPONENT16),O}function P(S,x){return m(S)===!0||S.isFramebufferTexture&&S.minFilter!==ln&&S.minFilter!==yn?Math.log2(Math.max(x.width,x.height))+1:S.mipmaps!==void 0&&S.mipmaps.length>0?S.mipmaps.length:S.isCompressedTexture&&Array.isArray(S.image)?x.mipmaps.length:1}function R(S){let x=S.target;x.removeEventListener("dispose",R),L(x),x.isVideoTexture&&h.delete(x)}function C(S){let x=S.target;x.removeEventListener("dispose",C),v(x)}function L(S){let x=n.get(S);if(x.__webglInit===void 0)return;let O=S.source,Y=d.get(O);if(Y){let j=Y[x.__cacheKey];j.usedTimes--,j.usedTimes===0&&M(S),Object.keys(Y).length===0&&d.delete(O)}n.remove(S)}function M(S){let x=n.get(S);i.deleteTexture(x.__webglTexture);let O=S.source,Y=d.get(O);delete Y[x.__cacheKey],a.memory.textures--}function v(S){let x=n.get(S);if(S.depthTexture&&(S.depthTexture.dispose(),n.remove(S.depthTexture)),S.isWebGLCubeRenderTarget)for(let Y=0;Y<6;Y++){if(Array.isArray(x.__webglFramebuffer[Y]))for(let j=0;j<x.__webglFramebuffer[Y].length;j++)i.deleteFramebuffer(x.__webglFramebuffer[Y][j]);else i.deleteFramebuffer(x.__webglFramebuffer[Y]);x.__webglDepthbuffer&&i.deleteRenderbuffer(x.__webglDepthbuffer[Y])}else{if(Array.isArray(x.__webglFramebuffer))for(let Y=0;Y<x.__webglFramebuffer.length;Y++)i.deleteFramebuffer(x.__webglFramebuffer[Y]);else i.deleteFramebuffer(x.__webglFramebuffer);if(x.__webglDepthbuffer&&i.deleteRenderbuffer(x.__webglDepthbuffer),x.__webglMultisampledFramebuffer&&i.deleteFramebuffer(x.__webglMultisampledFramebuffer),x.__webglColorRenderbuffer)for(let Y=0;Y<x.__webglColorRenderbuffer.length;Y++)x.__webglColorRenderbuffer[Y]&&i.deleteRenderbuffer(x.__webglColorRenderbuffer[Y]);x.__webglDepthRenderbuffer&&i.deleteRenderbuffer(x.__webglDepthRenderbuffer)}let O=S.textures;for(let Y=0,j=O.length;Y<j;Y++){let q=n.get(O[Y]);q.__webglTexture&&(i.deleteTexture(q.__webglTexture),a.memory.textures--),n.remove(O[Y])}n.remove(S)}let I=0;function z(){I=0}function F(){let S=I;return S>=s.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+S+" texture units while this GPU supports only "+s.maxTextures),I+=1,S}function G(S){let x=[];return x.push(S.wrapS),x.push(S.wrapT),x.push(S.wrapR||0),x.push(S.magFilter),x.push(S.minFilter),x.push(S.anisotropy),x.push(S.internalFormat),x.push(S.format),x.push(S.type),x.push(S.generateMipmaps),x.push(S.premultiplyAlpha),x.push(S.flipY),x.push(S.unpackAlignment),x.push(S.colorSpace),x.join()}function $(S,x){let O=n.get(S);if(S.isVideoTexture&&me(S),S.isRenderTargetTexture===!1&&S.version>0&&O.__version!==S.version){let Y=S.image;if(Y===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(Y.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{X(O,S,x);return}}t.bindTexture(i.TEXTURE_2D,O.__webglTexture,i.TEXTURE0+x)}function W(S,x){let O=n.get(S);if(S.version>0&&O.__version!==S.version){X(O,S,x);return}t.bindTexture(i.TEXTURE_2D_ARRAY,O.__webglTexture,i.TEXTURE0+x)}function ee(S,x){let O=n.get(S);if(S.version>0&&O.__version!==S.version){X(O,S,x);return}t.bindTexture(i.TEXTURE_3D,O.__webglTexture,i.TEXTURE0+x)}function V(S,x){let O=n.get(S);if(S.version>0&&O.__version!==S.version){te(O,S,x);return}t.bindTexture(i.TEXTURE_CUBE_MAP,O.__webglTexture,i.TEXTURE0+x)}let re={[Va]:i.REPEAT,[hi]:i.CLAMP_TO_EDGE,[Ha]:i.MIRRORED_REPEAT},pe={[ln]:i.NEAREST,[xd]:i.NEAREST_MIPMAP_NEAREST,[Vr]:i.NEAREST_MIPMAP_LINEAR,[yn]:i.LINEAR,[Lo]:i.LINEAR_MIPMAP_NEAREST,[gi]:i.LINEAR_MIPMAP_LINEAR},Se={[bd]:i.NEVER,[Rd]:i.ALWAYS,[Sd]:i.LESS,[Xl]:i.LEQUAL,[Ed]:i.EQUAL,[Ad]:i.GEQUAL,[Td]:i.GREATER,[wd]:i.NOTEQUAL};function $e(S,x){if(x.type===Ln&&e.has("OES_texture_float_linear")===!1&&(x.magFilter===yn||x.magFilter===Lo||x.magFilter===Vr||x.magFilter===gi||x.minFilter===yn||x.minFilter===Lo||x.minFilter===Vr||x.minFilter===gi)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(S,i.TEXTURE_WRAP_S,re[x.wrapS]),i.texParameteri(S,i.TEXTURE_WRAP_T,re[x.wrapT]),(S===i.TEXTURE_3D||S===i.TEXTURE_2D_ARRAY)&&i.texParameteri(S,i.TEXTURE_WRAP_R,re[x.wrapR]),i.texParameteri(S,i.TEXTURE_MAG_FILTER,pe[x.magFilter]),i.texParameteri(S,i.TEXTURE_MIN_FILTER,pe[x.minFilter]),x.compareFunction&&(i.texParameteri(S,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(S,i.TEXTURE_COMPARE_FUNC,Se[x.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(x.magFilter===ln||x.minFilter!==Vr&&x.minFilter!==gi||x.type===Ln&&e.has("OES_texture_float_linear")===!1)return;if(x.anisotropy>1||n.get(x).__currentAnisotropy){let O=e.get("EXT_texture_filter_anisotropic");i.texParameterf(S,O.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(x.anisotropy,s.getMaxAnisotropy())),n.get(x).__currentAnisotropy=x.anisotropy}}}function st(S,x){let O=!1;S.__webglInit===void 0&&(S.__webglInit=!0,x.addEventListener("dispose",R));let Y=x.source,j=d.get(Y);j===void 0&&(j={},d.set(Y,j));let q=G(x);if(q!==S.__cacheKey){j[q]===void 0&&(j[q]={texture:i.createTexture(),usedTimes:0},a.memory.textures++,O=!0),j[q].usedTimes++;let Ee=j[S.__cacheKey];Ee!==void 0&&(j[S.__cacheKey].usedTimes--,Ee.usedTimes===0&&M(x)),S.__cacheKey=q,S.__webglTexture=j[q].texture}return O}function X(S,x,O){let Y=i.TEXTURE_2D;(x.isDataArrayTexture||x.isCompressedArrayTexture)&&(Y=i.TEXTURE_2D_ARRAY),x.isData3DTexture&&(Y=i.TEXTURE_3D);let j=st(S,x),q=x.source;t.bindTexture(Y,S.__webglTexture,i.TEXTURE0+O);let Ee=n.get(q);if(q.version!==Ee.__version||j===!0){t.activeTexture(i.TEXTURE0+O);let he=nt.getPrimaries(nt.workingColorSpace),_e=x.colorSpace===Jn?null:nt.getPrimaries(x.colorSpace),et=x.colorSpace===Jn||he===_e?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,x.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,x.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,et);let Q=_(x.image,!1,s.maxTextureSize);Q=Ke(x,Q);let xe=r.convert(x.format,x.colorSpace),Le=r.convert(x.type),Ue=E(x.internalFormat,xe,Le,x.colorSpace,x.isVideoTexture);$e(Y,x);let ye,Qe=x.mipmaps,Xe=x.isVideoTexture!==!0,ft=Ee.__version===void 0||j===!0,D=q.dataReady,ce=P(x,Q);if(x.isDepthTexture)Ue=b(x.format===$i,x.type),ft&&(Xe?t.texStorage2D(i.TEXTURE_2D,1,Ue,Q.width,Q.height):t.texImage2D(i.TEXTURE_2D,0,Ue,Q.width,Q.height,0,xe,Le,null));else if(x.isDataTexture)if(Qe.length>0){Xe&&ft&&t.texStorage2D(i.TEXTURE_2D,ce,Ue,Qe[0].width,Qe[0].height);for(let H=0,Z=Qe.length;H<Z;H++)ye=Qe[H],Xe?D&&t.texSubImage2D(i.TEXTURE_2D,H,0,0,ye.width,ye.height,xe,Le,ye.data):t.texImage2D(i.TEXTURE_2D,H,Ue,ye.width,ye.height,0,xe,Le,ye.data);x.generateMipmaps=!1}else Xe?(ft&&t.texStorage2D(i.TEXTURE_2D,ce,Ue,Q.width,Q.height),D&&t.texSubImage2D(i.TEXTURE_2D,0,0,0,Q.width,Q.height,xe,Le,Q.data)):t.texImage2D(i.TEXTURE_2D,0,Ue,Q.width,Q.height,0,xe,Le,Q.data);else if(x.isCompressedTexture)if(x.isCompressedArrayTexture){Xe&&ft&&t.texStorage3D(i.TEXTURE_2D_ARRAY,ce,Ue,Qe[0].width,Qe[0].height,Q.depth);for(let H=0,Z=Qe.length;H<Z;H++)if(ye=Qe[H],x.format!==dn)if(xe!==null)if(Xe){if(D)if(x.layerUpdates.size>0){let fe=Ql(ye.width,ye.height,x.format,x.type);for(let de of x.layerUpdates){let He=ye.data.subarray(de*fe/ye.data.BYTES_PER_ELEMENT,(de+1)*fe/ye.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,H,0,0,de,ye.width,ye.height,1,xe,He)}x.clearLayerUpdates()}else t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,H,0,0,0,ye.width,ye.height,Q.depth,xe,ye.data)}else t.compressedTexImage3D(i.TEXTURE_2D_ARRAY,H,Ue,ye.width,ye.height,Q.depth,0,ye.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Xe?D&&t.texSubImage3D(i.TEXTURE_2D_ARRAY,H,0,0,0,ye.width,ye.height,Q.depth,xe,Le,ye.data):t.texImage3D(i.TEXTURE_2D_ARRAY,H,Ue,ye.width,ye.height,Q.depth,0,xe,Le,ye.data)}else{Xe&&ft&&t.texStorage2D(i.TEXTURE_2D,ce,Ue,Qe[0].width,Qe[0].height);for(let H=0,Z=Qe.length;H<Z;H++)ye=Qe[H],x.format!==dn?xe!==null?Xe?D&&t.compressedTexSubImage2D(i.TEXTURE_2D,H,0,0,ye.width,ye.height,xe,ye.data):t.compressedTexImage2D(i.TEXTURE_2D,H,Ue,ye.width,ye.height,0,ye.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Xe?D&&t.texSubImage2D(i.TEXTURE_2D,H,0,0,ye.width,ye.height,xe,Le,ye.data):t.texImage2D(i.TEXTURE_2D,H,Ue,ye.width,ye.height,0,xe,Le,ye.data)}else if(x.isDataArrayTexture)if(Xe){if(ft&&t.texStorage3D(i.TEXTURE_2D_ARRAY,ce,Ue,Q.width,Q.height,Q.depth),D)if(x.layerUpdates.size>0){let H=Ql(Q.width,Q.height,x.format,x.type);for(let Z of x.layerUpdates){let fe=Q.data.subarray(Z*H/Q.data.BYTES_PER_ELEMENT,(Z+1)*H/Q.data.BYTES_PER_ELEMENT);t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,Z,Q.width,Q.height,1,xe,Le,fe)}x.clearLayerUpdates()}else t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,Q.width,Q.height,Q.depth,xe,Le,Q.data)}else t.texImage3D(i.TEXTURE_2D_ARRAY,0,Ue,Q.width,Q.height,Q.depth,0,xe,Le,Q.data);else if(x.isData3DTexture)Xe?(ft&&t.texStorage3D(i.TEXTURE_3D,ce,Ue,Q.width,Q.height,Q.depth),D&&t.texSubImage3D(i.TEXTURE_3D,0,0,0,0,Q.width,Q.height,Q.depth,xe,Le,Q.data)):t.texImage3D(i.TEXTURE_3D,0,Ue,Q.width,Q.height,Q.depth,0,xe,Le,Q.data);else if(x.isFramebufferTexture){if(ft)if(Xe)t.texStorage2D(i.TEXTURE_2D,ce,Ue,Q.width,Q.height);else{let H=Q.width,Z=Q.height;for(let fe=0;fe<ce;fe++)t.texImage2D(i.TEXTURE_2D,fe,Ue,H,Z,0,xe,Le,null),H>>=1,Z>>=1}}else if(Qe.length>0){if(Xe&&ft){let H=Te(Qe[0]);t.texStorage2D(i.TEXTURE_2D,ce,Ue,H.width,H.height)}for(let H=0,Z=Qe.length;H<Z;H++)ye=Qe[H],Xe?D&&t.texSubImage2D(i.TEXTURE_2D,H,0,0,xe,Le,ye):t.texImage2D(i.TEXTURE_2D,H,Ue,xe,Le,ye);x.generateMipmaps=!1}else if(Xe){if(ft){let H=Te(Q);t.texStorage2D(i.TEXTURE_2D,ce,Ue,H.width,H.height)}D&&t.texSubImage2D(i.TEXTURE_2D,0,0,0,xe,Le,Q)}else t.texImage2D(i.TEXTURE_2D,0,Ue,xe,Le,Q);m(x)&&f(Y),Ee.__version=q.version,x.onUpdate&&x.onUpdate(x)}S.__version=x.version}function te(S,x,O){if(x.image.length!==6)return;let Y=st(S,x),j=x.source;t.bindTexture(i.TEXTURE_CUBE_MAP,S.__webglTexture,i.TEXTURE0+O);let q=n.get(j);if(j.version!==q.__version||Y===!0){t.activeTexture(i.TEXTURE0+O);let Ee=nt.getPrimaries(nt.workingColorSpace),he=x.colorSpace===Jn?null:nt.getPrimaries(x.colorSpace),_e=x.colorSpace===Jn||Ee===he?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,x.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,x.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,_e);let et=x.isCompressedTexture||x.image[0].isCompressedTexture,Q=x.image[0]&&x.image[0].isDataTexture,xe=[];for(let Z=0;Z<6;Z++)!et&&!Q?xe[Z]=_(x.image[Z],!0,s.maxCubemapSize):xe[Z]=Q?x.image[Z].image:x.image[Z],xe[Z]=Ke(x,xe[Z]);let Le=xe[0],Ue=r.convert(x.format,x.colorSpace),ye=r.convert(x.type),Qe=E(x.internalFormat,Ue,ye,x.colorSpace),Xe=x.isVideoTexture!==!0,ft=q.__version===void 0||Y===!0,D=j.dataReady,ce=P(x,Le);$e(i.TEXTURE_CUBE_MAP,x);let H;if(et){Xe&&ft&&t.texStorage2D(i.TEXTURE_CUBE_MAP,ce,Qe,Le.width,Le.height);for(let Z=0;Z<6;Z++){H=xe[Z].mipmaps;for(let fe=0;fe<H.length;fe++){let de=H[fe];x.format!==dn?Ue!==null?Xe?D&&t.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,fe,0,0,de.width,de.height,Ue,de.data):t.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,fe,Qe,de.width,de.height,0,de.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):Xe?D&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,fe,0,0,de.width,de.height,Ue,ye,de.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,fe,Qe,de.width,de.height,0,Ue,ye,de.data)}}}else{if(H=x.mipmaps,Xe&&ft){H.length>0&&ce++;let Z=Te(xe[0]);t.texStorage2D(i.TEXTURE_CUBE_MAP,ce,Qe,Z.width,Z.height)}for(let Z=0;Z<6;Z++)if(Q){Xe?D&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,0,0,xe[Z].width,xe[Z].height,Ue,ye,xe[Z].data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,Qe,xe[Z].width,xe[Z].height,0,Ue,ye,xe[Z].data);for(let fe=0;fe<H.length;fe++){let He=H[fe].image[Z].image;Xe?D&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,fe+1,0,0,He.width,He.height,Ue,ye,He.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,fe+1,Qe,He.width,He.height,0,Ue,ye,He.data)}}else{Xe?D&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,0,0,Ue,ye,xe[Z]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,Qe,Ue,ye,xe[Z]);for(let fe=0;fe<H.length;fe++){let de=H[fe];Xe?D&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,fe+1,0,0,Ue,ye,de.image[Z]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Z,fe+1,Qe,Ue,ye,de.image[Z])}}}m(x)&&f(i.TEXTURE_CUBE_MAP),q.__version=j.version,x.onUpdate&&x.onUpdate(x)}S.__version=x.version}function be(S,x,O,Y,j,q){let Ee=r.convert(O.format,O.colorSpace),he=r.convert(O.type),_e=E(O.internalFormat,Ee,he,O.colorSpace),et=n.get(x),Q=n.get(O);if(Q.__renderTarget=x,!et.__hasExternalTextures){let xe=Math.max(1,x.width>>q),Le=Math.max(1,x.height>>q);j===i.TEXTURE_3D||j===i.TEXTURE_2D_ARRAY?t.texImage3D(j,q,_e,xe,Le,x.depth,0,Ee,he,null):t.texImage2D(j,q,_e,xe,Le,0,Ee,he,null)}t.bindFramebuffer(i.FRAMEBUFFER,S),Ie(x)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Y,j,Q.__webglTexture,0,we(x)):(j===i.TEXTURE_2D||j>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&j<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,Y,j,Q.__webglTexture,q),t.bindFramebuffer(i.FRAMEBUFFER,null)}function ae(S,x,O){if(i.bindRenderbuffer(i.RENDERBUFFER,S),x.depthBuffer){let Y=x.depthTexture,j=Y&&Y.isDepthTexture?Y.type:null,q=b(x.stencilBuffer,j),Ee=x.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,he=we(x);Ie(x)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,he,q,x.width,x.height):O?i.renderbufferStorageMultisample(i.RENDERBUFFER,he,q,x.width,x.height):i.renderbufferStorage(i.RENDERBUFFER,q,x.width,x.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,Ee,i.RENDERBUFFER,S)}else{let Y=x.textures;for(let j=0;j<Y.length;j++){let q=Y[j],Ee=r.convert(q.format,q.colorSpace),he=r.convert(q.type),_e=E(q.internalFormat,Ee,he,q.colorSpace),et=we(x);O&&Ie(x)===!1?i.renderbufferStorageMultisample(i.RENDERBUFFER,et,_e,x.width,x.height):Ie(x)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,et,_e,x.width,x.height):i.renderbufferStorage(i.RENDERBUFFER,_e,x.width,x.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Pe(S,x){if(x&&x.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(t.bindFramebuffer(i.FRAMEBUFFER,S),!(x.depthTexture&&x.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");let Y=n.get(x.depthTexture);Y.__renderTarget=x,(!Y.__webglTexture||x.depthTexture.image.width!==x.width||x.depthTexture.image.height!==x.height)&&(x.depthTexture.image.width=x.width,x.depthTexture.image.height=x.height,x.depthTexture.needsUpdate=!0),$(x.depthTexture,0);let j=Y.__webglTexture,q=we(x);if(x.depthTexture.format===qi)Ie(x)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,i.DEPTH_ATTACHMENT,i.TEXTURE_2D,j,0,q):i.framebufferTexture2D(i.FRAMEBUFFER,i.DEPTH_ATTACHMENT,i.TEXTURE_2D,j,0);else if(x.depthTexture.format===$i)Ie(x)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,i.DEPTH_STENCIL_ATTACHMENT,i.TEXTURE_2D,j,0,q):i.framebufferTexture2D(i.FRAMEBUFFER,i.DEPTH_STENCIL_ATTACHMENT,i.TEXTURE_2D,j,0);else throw new Error("Unknown depthTexture format")}function Ne(S){let x=n.get(S),O=S.isWebGLCubeRenderTarget===!0;if(x.__boundDepthTexture!==S.depthTexture){let Y=S.depthTexture;if(x.__depthDisposeCallback&&x.__depthDisposeCallback(),Y){let j=()=>{delete x.__boundDepthTexture,delete x.__depthDisposeCallback,Y.removeEventListener("dispose",j)};Y.addEventListener("dispose",j),x.__depthDisposeCallback=j}x.__boundDepthTexture=Y}if(S.depthTexture&&!x.__autoAllocateDepthBuffer){if(O)throw new Error("target.depthTexture not supported in Cube render targets");Pe(x.__webglFramebuffer,S)}else if(O){x.__webglDepthbuffer=[];for(let Y=0;Y<6;Y++)if(t.bindFramebuffer(i.FRAMEBUFFER,x.__webglFramebuffer[Y]),x.__webglDepthbuffer[Y]===void 0)x.__webglDepthbuffer[Y]=i.createRenderbuffer(),ae(x.__webglDepthbuffer[Y],S,!1);else{let j=S.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,q=x.__webglDepthbuffer[Y];i.bindRenderbuffer(i.RENDERBUFFER,q),i.framebufferRenderbuffer(i.FRAMEBUFFER,j,i.RENDERBUFFER,q)}}else if(t.bindFramebuffer(i.FRAMEBUFFER,x.__webglFramebuffer),x.__webglDepthbuffer===void 0)x.__webglDepthbuffer=i.createRenderbuffer(),ae(x.__webglDepthbuffer,S,!1);else{let Y=S.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,j=x.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,j),i.framebufferRenderbuffer(i.FRAMEBUFFER,Y,i.RENDERBUFFER,j)}t.bindFramebuffer(i.FRAMEBUFFER,null)}function ke(S,x,O){let Y=n.get(S);x!==void 0&&be(Y.__webglFramebuffer,S,S.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),O!==void 0&&Ne(S)}function dt(S){let x=S.texture,O=n.get(S),Y=n.get(x);S.addEventListener("dispose",C);let j=S.textures,q=S.isWebGLCubeRenderTarget===!0,Ee=j.length>1;if(Ee||(Y.__webglTexture===void 0&&(Y.__webglTexture=i.createTexture()),Y.__version=x.version,a.memory.textures++),q){O.__webglFramebuffer=[];for(let he=0;he<6;he++)if(x.mipmaps&&x.mipmaps.length>0){O.__webglFramebuffer[he]=[];for(let _e=0;_e<x.mipmaps.length;_e++)O.__webglFramebuffer[he][_e]=i.createFramebuffer()}else O.__webglFramebuffer[he]=i.createFramebuffer()}else{if(x.mipmaps&&x.mipmaps.length>0){O.__webglFramebuffer=[];for(let he=0;he<x.mipmaps.length;he++)O.__webglFramebuffer[he]=i.createFramebuffer()}else O.__webglFramebuffer=i.createFramebuffer();if(Ee)for(let he=0,_e=j.length;he<_e;he++){let et=n.get(j[he]);et.__webglTexture===void 0&&(et.__webglTexture=i.createTexture(),a.memory.textures++)}if(S.samples>0&&Ie(S)===!1){O.__webglMultisampledFramebuffer=i.createFramebuffer(),O.__webglColorRenderbuffer=[],t.bindFramebuffer(i.FRAMEBUFFER,O.__webglMultisampledFramebuffer);for(let he=0;he<j.length;he++){let _e=j[he];O.__webglColorRenderbuffer[he]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,O.__webglColorRenderbuffer[he]);let et=r.convert(_e.format,_e.colorSpace),Q=r.convert(_e.type),xe=E(_e.internalFormat,et,Q,_e.colorSpace,S.isXRRenderTarget===!0),Le=we(S);i.renderbufferStorageMultisample(i.RENDERBUFFER,Le,xe,S.width,S.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+he,i.RENDERBUFFER,O.__webglColorRenderbuffer[he])}i.bindRenderbuffer(i.RENDERBUFFER,null),S.depthBuffer&&(O.__webglDepthRenderbuffer=i.createRenderbuffer(),ae(O.__webglDepthRenderbuffer,S,!0)),t.bindFramebuffer(i.FRAMEBUFFER,null)}}if(q){t.bindTexture(i.TEXTURE_CUBE_MAP,Y.__webglTexture),$e(i.TEXTURE_CUBE_MAP,x);for(let he=0;he<6;he++)if(x.mipmaps&&x.mipmaps.length>0)for(let _e=0;_e<x.mipmaps.length;_e++)be(O.__webglFramebuffer[he][_e],S,x,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+he,_e);else be(O.__webglFramebuffer[he],S,x,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+he,0);m(x)&&f(i.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(Ee){for(let he=0,_e=j.length;he<_e;he++){let et=j[he],Q=n.get(et);t.bindTexture(i.TEXTURE_2D,Q.__webglTexture),$e(i.TEXTURE_2D,et),be(O.__webglFramebuffer,S,et,i.COLOR_ATTACHMENT0+he,i.TEXTURE_2D,0),m(et)&&f(i.TEXTURE_2D)}t.unbindTexture()}else{let he=i.TEXTURE_2D;if((S.isWebGL3DRenderTarget||S.isWebGLArrayRenderTarget)&&(he=S.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(he,Y.__webglTexture),$e(he,x),x.mipmaps&&x.mipmaps.length>0)for(let _e=0;_e<x.mipmaps.length;_e++)be(O.__webglFramebuffer[_e],S,x,i.COLOR_ATTACHMENT0,he,_e);else be(O.__webglFramebuffer,S,x,i.COLOR_ATTACHMENT0,he,0);m(x)&&f(he),t.unbindTexture()}S.depthBuffer&&Ne(S)}function Je(S){let x=S.textures;for(let O=0,Y=x.length;O<Y;O++){let j=x[O];if(m(j)){let q=T(S),Ee=n.get(j).__webglTexture;t.bindTexture(q,Ee),f(q),t.unbindTexture()}}}let ne=[],w=[];function Fe(S){if(S.samples>0){if(Ie(S)===!1){let x=S.textures,O=S.width,Y=S.height,j=i.COLOR_BUFFER_BIT,q=S.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,Ee=n.get(S),he=x.length>1;if(he)for(let _e=0;_e<x.length;_e++)t.bindFramebuffer(i.FRAMEBUFFER,Ee.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+_e,i.RENDERBUFFER,null),t.bindFramebuffer(i.FRAMEBUFFER,Ee.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+_e,i.TEXTURE_2D,null,0);t.bindFramebuffer(i.READ_FRAMEBUFFER,Ee.__webglMultisampledFramebuffer),t.bindFramebuffer(i.DRAW_FRAMEBUFFER,Ee.__webglFramebuffer);for(let _e=0;_e<x.length;_e++){if(S.resolveDepthBuffer&&(S.depthBuffer&&(j|=i.DEPTH_BUFFER_BIT),S.stencilBuffer&&S.resolveStencilBuffer&&(j|=i.STENCIL_BUFFER_BIT)),he){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,Ee.__webglColorRenderbuffer[_e]);let et=n.get(x[_e]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,et,0)}i.blitFramebuffer(0,0,O,Y,0,0,O,Y,j,i.NEAREST),c===!0&&(ne.length=0,w.length=0,ne.push(i.COLOR_ATTACHMENT0+_e),S.depthBuffer&&S.resolveDepthBuffer===!1&&(ne.push(q),w.push(q),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,w)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,ne))}if(t.bindFramebuffer(i.READ_FRAMEBUFFER,null),t.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),he)for(let _e=0;_e<x.length;_e++){t.bindFramebuffer(i.FRAMEBUFFER,Ee.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+_e,i.RENDERBUFFER,Ee.__webglColorRenderbuffer[_e]);let et=n.get(x[_e]).__webglTexture;t.bindFramebuffer(i.FRAMEBUFFER,Ee.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+_e,i.TEXTURE_2D,et,0)}t.bindFramebuffer(i.DRAW_FRAMEBUFFER,Ee.__webglMultisampledFramebuffer)}else if(S.depthBuffer&&S.resolveDepthBuffer===!1&&c){let x=S.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[x])}}}function we(S){return Math.min(s.maxSamples,S.samples)}function Ie(S){let x=n.get(S);return S.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&x.__useRenderToTexture!==!1}function me(S){let x=a.render.frame;h.get(S)!==x&&(h.set(S,x),S.update())}function Ke(S,x){let O=S.colorSpace,Y=S.format,j=S.type;return S.isCompressedTexture===!0||S.isVideoTexture===!0||O!==ji&&O!==Jn&&(nt.getTransfer(O)===ct?(Y!==dn||j!==In)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",O)),x}function Te(S){return typeof HTMLImageElement<"u"&&S instanceof HTMLImageElement?(l.width=S.naturalWidth||S.width,l.height=S.naturalHeight||S.height):typeof VideoFrame<"u"&&S instanceof VideoFrame?(l.width=S.displayWidth,l.height=S.displayHeight):(l.width=S.width,l.height=S.height),l}this.allocateTextureUnit=F,this.resetTextureUnits=z,this.setTexture2D=$,this.setTexture2DArray=W,this.setTexture3D=ee,this.setTextureCube=V,this.rebindTextures=ke,this.setupRenderTarget=dt,this.updateRenderTargetMipmap=Je,this.updateMultisampleRenderTarget=Fe,this.setupDepthRenderbuffer=Ne,this.setupFrameBufferTexture=be,this.useMultisampledRTT=Ie}function Gy(i,e){function t(n,s=Jn){let r,a=nt.getTransfer(s);if(n===In)return i.UNSIGNED_BYTE;if(n===No)return i.UNSIGNED_SHORT_4_4_4_4;if(n===Uo)return i.UNSIGNED_SHORT_5_5_5_1;if(n===Ol)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===Nl)return i.BYTE;if(n===Ul)return i.SHORT;if(n===Bs)return i.UNSIGNED_SHORT;if(n===Do)return i.INT;if(n===_i)return i.UNSIGNED_INT;if(n===Ln)return i.FLOAT;if(n===ks)return i.HALF_FLOAT;if(n===Fl)return i.ALPHA;if(n===Bl)return i.RGB;if(n===dn)return i.RGBA;if(n===kl)return i.LUMINANCE;if(n===zl)return i.LUMINANCE_ALPHA;if(n===qi)return i.DEPTH_COMPONENT;if(n===$i)return i.DEPTH_STENCIL;if(n===Vl)return i.RED;if(n===Oo)return i.RED_INTEGER;if(n===Hl)return i.RG;if(n===Fo)return i.RG_INTEGER;if(n===Bo)return i.RGBA_INTEGER;if(n===Hr||n===Gr||n===Wr||n===Xr)if(a===ct)if(r=e.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===Hr)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Gr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Wr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Xr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=e.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===Hr)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Gr)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Wr)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Xr)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===ko||n===zo||n===Vo||n===Ho)if(r=e.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===ko)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===zo)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===Vo)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===Ho)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===Go||n===Wo||n===Xo)if(r=e.get("WEBGL_compressed_texture_etc"),r!==null){if(n===Go||n===Wo)return a===ct?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===Xo)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(n===qo||n===Yo||n===Zo||n===$o||n===jo||n===Jo||n===Ko||n===Qo||n===ec||n===tc||n===nc||n===ic||n===sc||n===rc)if(r=e.get("WEBGL_compressed_texture_astc"),r!==null){if(n===qo)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===Yo)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===Zo)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===$o)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===jo)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Jo)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===Ko)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===Qo)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===ec)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===tc)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===nc)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===ic)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===sc)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===rc)return a===ct?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===qr||n===ac||n===oc)if(r=e.get("EXT_texture_compression_bptc"),r!==null){if(n===qr)return a===ct?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===ac)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===oc)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Gl||n===cc||n===lc||n===hc)if(r=e.get("EXT_texture_compression_rgtc"),r!==null){if(n===qr)return r.COMPRESSED_RED_RGTC1_EXT;if(n===cc)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===lc)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===hc)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===is?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:t}}function Zy(i,e){function t(m,f){m.matrixAutoUpdate===!0&&m.updateMatrix(),f.value.copy(m.matrix)}function n(m,f){f.color.getRGB(m.fogColor.value,$l(i)),f.isFog?(m.fogNear.value=f.near,m.fogFar.value=f.far):f.isFogExp2&&(m.fogDensity.value=f.density)}function s(m,f,T,E,b){f.isMeshBasicMaterial||f.isMeshLambertMaterial?r(m,f):f.isMeshToonMaterial?(r(m,f),u(m,f)):f.isMeshPhongMaterial?(r(m,f),h(m,f)):f.isMeshStandardMaterial?(r(m,f),d(m,f),f.isMeshPhysicalMaterial&&p(m,f,b)):f.isMeshMatcapMaterial?(r(m,f),g(m,f)):f.isMeshDepthMaterial?r(m,f):f.isMeshDistanceMaterial?(r(m,f),_(m,f)):f.isMeshNormalMaterial?r(m,f):f.isLineBasicMaterial?(a(m,f),f.isLineDashedMaterial&&o(m,f)):f.isPointsMaterial?c(m,f,T,E):f.isSpriteMaterial?l(m,f):f.isShadowMaterial?(m.color.value.copy(f.color),m.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}function r(m,f){m.opacity.value=f.opacity,f.color&&m.diffuse.value.copy(f.color),f.emissive&&m.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(m.map.value=f.map,t(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.bumpMap&&(m.bumpMap.value=f.bumpMap,t(f.bumpMap,m.bumpMapTransform),m.bumpScale.value=f.bumpScale,f.side===Ht&&(m.bumpScale.value*=-1)),f.normalMap&&(m.normalMap.value=f.normalMap,t(f.normalMap,m.normalMapTransform),m.normalScale.value.copy(f.normalScale),f.side===Ht&&m.normalScale.value.negate()),f.displacementMap&&(m.displacementMap.value=f.displacementMap,t(f.displacementMap,m.displacementMapTransform),m.displacementScale.value=f.displacementScale,m.displacementBias.value=f.displacementBias),f.emissiveMap&&(m.emissiveMap.value=f.emissiveMap,t(f.emissiveMap,m.emissiveMapTransform)),f.specularMap&&(m.specularMap.value=f.specularMap,t(f.specularMap,m.specularMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest);let T=e.get(f),E=T.envMap,b=T.envMapRotation;E&&(m.envMap.value=E,os.copy(b),os.x*=-1,os.y*=-1,os.z*=-1,E.isCubeTexture&&E.isRenderTargetTexture===!1&&(os.y*=-1,os.z*=-1),m.envMapRotation.value.setFromMatrix4(Yy.makeRotationFromEuler(os)),m.flipEnvMap.value=E.isCubeTexture&&E.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=f.reflectivity,m.ior.value=f.ior,m.refractionRatio.value=f.refractionRatio),f.lightMap&&(m.lightMap.value=f.lightMap,m.lightMapIntensity.value=f.lightMapIntensity,t(f.lightMap,m.lightMapTransform)),f.aoMap&&(m.aoMap.value=f.aoMap,m.aoMapIntensity.value=f.aoMapIntensity,t(f.aoMap,m.aoMapTransform))}function a(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,f.map&&(m.map.value=f.map,t(f.map,m.mapTransform))}function o(m,f){m.dashSize.value=f.dashSize,m.totalSize.value=f.dashSize+f.gapSize,m.scale.value=f.scale}function c(m,f,T,E){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.size.value=f.size*T,m.scale.value=E*.5,f.map&&(m.map.value=f.map,t(f.map,m.uvTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function l(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.rotation.value=f.rotation,f.map&&(m.map.value=f.map,t(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function h(m,f){m.specular.value.copy(f.specular),m.shininess.value=Math.max(f.shininess,1e-4)}function u(m,f){f.gradientMap&&(m.gradientMap.value=f.gradientMap)}function d(m,f){m.metalness.value=f.metalness,f.metalnessMap&&(m.metalnessMap.value=f.metalnessMap,t(f.metalnessMap,m.metalnessMapTransform)),m.roughness.value=f.roughness,f.roughnessMap&&(m.roughnessMap.value=f.roughnessMap,t(f.roughnessMap,m.roughnessMapTransform)),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)}function p(m,f,T){m.ior.value=f.ior,f.sheen>0&&(m.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),m.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(m.sheenColorMap.value=f.sheenColorMap,t(f.sheenColorMap,m.sheenColorMapTransform)),f.sheenRoughnessMap&&(m.sheenRoughnessMap.value=f.sheenRoughnessMap,t(f.sheenRoughnessMap,m.sheenRoughnessMapTransform))),f.clearcoat>0&&(m.clearcoat.value=f.clearcoat,m.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(m.clearcoatMap.value=f.clearcoatMap,t(f.clearcoatMap,m.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,t(f.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(m.clearcoatNormalMap.value=f.clearcoatNormalMap,t(f.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===Ht&&m.clearcoatNormalScale.value.negate())),f.dispersion>0&&(m.dispersion.value=f.dispersion),f.iridescence>0&&(m.iridescence.value=f.iridescence,m.iridescenceIOR.value=f.iridescenceIOR,m.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(m.iridescenceMap.value=f.iridescenceMap,t(f.iridescenceMap,m.iridescenceMapTransform)),f.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=f.iridescenceThicknessMap,t(f.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),f.transmission>0&&(m.transmission.value=f.transmission,m.transmissionSamplerMap.value=T.texture,m.transmissionSamplerSize.value.set(T.width,T.height),f.transmissionMap&&(m.transmissionMap.value=f.transmissionMap,t(f.transmissionMap,m.transmissionMapTransform)),m.thickness.value=f.thickness,f.thicknessMap&&(m.thicknessMap.value=f.thicknessMap,t(f.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=f.attenuationDistance,m.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(m.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(m.anisotropyMap.value=f.anisotropyMap,t(f.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=f.specularIntensity,m.specularColor.value.copy(f.specularColor),f.specularColorMap&&(m.specularColorMap.value=f.specularColorMap,t(f.specularColorMap,m.specularColorMapTransform)),f.specularIntensityMap&&(m.specularIntensityMap.value=f.specularIntensityMap,t(f.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,f){f.matcap&&(m.matcap.value=f.matcap)}function _(m,f){let T=e.get(f).light;m.referencePosition.value.setFromMatrixPosition(T.matrixWorld),m.nearDistance.value=T.shadow.camera.near,m.farDistance.value=T.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function $y(i,e,t,n){let s={},r={},a=[],o=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function c(T,E){let b=E.program;n.uniformBlockBinding(T,b)}function l(T,E){let b=s[T.id];b===void 0&&(g(T),b=h(T),s[T.id]=b,T.addEventListener("dispose",m));let P=E.program;n.updateUBOMapping(T,P);let R=e.render.frame;r[T.id]!==R&&(d(T),r[T.id]=R)}function h(T){let E=u();T.__bindingPointIndex=E;let b=i.createBuffer(),P=T.__size,R=T.usage;return i.bindBuffer(i.UNIFORM_BUFFER,b),i.bufferData(i.UNIFORM_BUFFER,P,R),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,E,b),b}function u(){for(let T=0;T<o;T++)if(a.indexOf(T)===-1)return a.push(T),T;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function d(T){let E=s[T.id],b=T.uniforms,P=T.__cache;i.bindBuffer(i.UNIFORM_BUFFER,E);for(let R=0,C=b.length;R<C;R++){let L=Array.isArray(b[R])?b[R]:[b[R]];for(let M=0,v=L.length;M<v;M++){let I=L[M];if(p(I,R,M,P)===!0){let z=I.__offset,F=Array.isArray(I.value)?I.value:[I.value],G=0;for(let $=0;$<F.length;$++){let W=F[$],ee=_(W);typeof W=="number"||typeof W=="boolean"?(I.__data[0]=W,i.bufferSubData(i.UNIFORM_BUFFER,z+G,I.__data)):W.isMatrix3?(I.__data[0]=W.elements[0],I.__data[1]=W.elements[1],I.__data[2]=W.elements[2],I.__data[3]=0,I.__data[4]=W.elements[3],I.__data[5]=W.elements[4],I.__data[6]=W.elements[5],I.__data[7]=0,I.__data[8]=W.elements[6],I.__data[9]=W.elements[7],I.__data[10]=W.elements[8],I.__data[11]=0):(W.toArray(I.__data,G),G+=ee.storage/Float32Array.BYTES_PER_ELEMENT)}i.bufferSubData(i.UNIFORM_BUFFER,z,I.__data)}}}i.bindBuffer(i.UNIFORM_BUFFER,null)}function p(T,E,b,P){let R=T.value,C=E+"_"+b;if(P[C]===void 0)return typeof R=="number"||typeof R=="boolean"?P[C]=R:P[C]=R.clone(),!0;{let L=P[C];if(typeof R=="number"||typeof R=="boolean"){if(L!==R)return P[C]=R,!0}else if(L.equals(R)===!1)return L.copy(R),!0}return!1}function g(T){let E=T.uniforms,b=0,P=16;for(let C=0,L=E.length;C<L;C++){let M=Array.isArray(E[C])?E[C]:[E[C]];for(let v=0,I=M.length;v<I;v++){let z=M[v],F=Array.isArray(z.value)?z.value:[z.value];for(let G=0,$=F.length;G<$;G++){let W=F[G],ee=_(W),V=b%P,re=V%ee.boundary,pe=V+re;b+=re,pe!==0&&P-pe<ee.storage&&(b+=P-pe),z.__data=new Float32Array(ee.storage/Float32Array.BYTES_PER_ELEMENT),z.__offset=b,b+=ee.storage}}}let R=b%P;return R>0&&(b+=P-R),T.__size=b,T.__cache={},this}function _(T){let E={boundary:0,storage:0};return typeof T=="number"||typeof T=="boolean"?(E.boundary=4,E.storage=4):T.isVector2?(E.boundary=8,E.storage=8):T.isVector3||T.isColor?(E.boundary=16,E.storage=12):T.isVector4?(E.boundary=16,E.storage=16):T.isMatrix3?(E.boundary=48,E.storage=48):T.isMatrix4?(E.boundary=64,E.storage=64):T.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",T),E}function m(T){let E=T.target;E.removeEventListener("dispose",m);let b=a.indexOf(E.__bindingPointIndex);a.splice(b,1),i.deleteBuffer(s[E.id]),delete s[E.id],delete r[E.id]}function f(){for(let T in s)i.deleteBuffer(s[T]);a=[],s={},r={}}return{bind:c,update:l,dispose:f}}var Sg,Eg,Tg,wg,Ag,Rg,Cg,Pg,Ig,Lg,Dg,Ng,Ug,Og,Fg,Bg,kg,zg,Vg,Hg,Gg,Wg,Xg,qg,Yg,Zg,$g,jg,Jg,Kg,Qg,e_,t_,n_,i_,s_,r_,a_,o_,c_,l_,h_,u_,d_,f_,p_,m_,g_,__,x_,y_,v_,M_,b_,S_,E_,T_,w_,A_,R_,C_,P_,I_,L_,D_,N_,U_,O_,F_,B_,k_,z_,V_,H_,G_,W_,X_,q_,Y_,Z_,$_,j_,J_,K_,Q_,e0,t0,n0,i0,s0,r0,a0,o0,c0,l0,h0,u0,d0,f0,p0,m0,g0,_0,x0,y0,v0,M0,b0,S0,E0,T0,w0,A0,R0,C0,P0,I0,L0,D0,N0,U0,O0,F0,B0,k0,z0,V0,H0,G0,W0,X0,q0,Y0,Z0,$0,j0,J0,K0,Q0,ex,tx,Ze,se,Dn,uc,as,nx,Hs,Od,ls,th,Fd,nh,ih,sh,rh,cs,Vs,Bd,pc,of,Hd,cf,lf,hf,Gd,Wd,Xd,qd,Yd,oh,ch,lh,ah,Gs,ry,ay,jd,fc,my,gy,xy,wy,uh,dh,Dy,Fy,By,zy,Wy,Zr,Xy,qy,fh,ph,os,Yy,mc,xi=lt(()=>{eh();eh();Sg=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Eg=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,Tg=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,wg=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Ag=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Rg=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Cg=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,Pg=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Ig=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,Lg=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Dg=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,Ng=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Ug=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,Og=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,Fg=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,Bg=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,kg=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,zg=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Vg=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Hg=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,Gg=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,Wg=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,Xg=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,qg=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,Yg=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,Zg=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,$g=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,jg=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Jg=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Kg=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Qg="gl_FragColor = linearToOutputTexel( gl_FragColor );",e_=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,t_=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,n_=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,i_=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,s_=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,r_=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,a_=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,o_=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,c_=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,l_=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,h_=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,u_=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,d_=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,f_=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,p_=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,m_=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,g_=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,__=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,x_=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,y_=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,v_=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,M_=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,b_=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,S_=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,E_=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,T_=`#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,w_=`#if defined( USE_LOGDEPTHBUF )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,A_=`#ifdef USE_LOGDEPTHBUF
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,R_=`#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,C_=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,P_=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,I_=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,L_=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,D_=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,N_=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,U_=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,O_=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,F_=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,B_=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,k_=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,z_=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,V_=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,H_=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,G_=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,W_=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,X_=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,q_=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Y_=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Z_=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,$_=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,j_=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,J_=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,K_=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Q_=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,e0=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,t0=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,n0=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,i0=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,s0=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,r0=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,a0=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,o0=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,c0=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,l0=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,h0=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,u0=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,d0=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,f0=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,p0=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,m0=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,g0=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,_0=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
		
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
		
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		
		#else
		
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,x0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,y0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,v0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,M0=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,b0=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,S0=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,E0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,T0=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,w0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,A0=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,R0=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,C0=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,P0=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,I0=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,L0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,D0=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,N0=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,U0=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,O0=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,F0=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,B0=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,k0=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,z0=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,V0=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,H0=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,G0=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,W0=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,X0=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,q0=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,Y0=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Z0=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,$0=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,j0=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,J0=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,K0=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Q0=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,ex=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,tx=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Ze={alphahash_fragment:Sg,alphahash_pars_fragment:Eg,alphamap_fragment:Tg,alphamap_pars_fragment:wg,alphatest_fragment:Ag,alphatest_pars_fragment:Rg,aomap_fragment:Cg,aomap_pars_fragment:Pg,batching_pars_vertex:Ig,batching_vertex:Lg,begin_vertex:Dg,beginnormal_vertex:Ng,bsdfs:Ug,iridescence_fragment:Og,bumpmap_pars_fragment:Fg,clipping_planes_fragment:Bg,clipping_planes_pars_fragment:kg,clipping_planes_pars_vertex:zg,clipping_planes_vertex:Vg,color_fragment:Hg,color_pars_fragment:Gg,color_pars_vertex:Wg,color_vertex:Xg,common:qg,cube_uv_reflection_fragment:Yg,defaultnormal_vertex:Zg,displacementmap_pars_vertex:$g,displacementmap_vertex:jg,emissivemap_fragment:Jg,emissivemap_pars_fragment:Kg,colorspace_fragment:Qg,colorspace_pars_fragment:e_,envmap_fragment:t_,envmap_common_pars_fragment:n_,envmap_pars_fragment:i_,envmap_pars_vertex:s_,envmap_physical_pars_fragment:m_,envmap_vertex:r_,fog_vertex:a_,fog_pars_vertex:o_,fog_fragment:c_,fog_pars_fragment:l_,gradientmap_pars_fragment:h_,lightmap_pars_fragment:u_,lights_lambert_fragment:d_,lights_lambert_pars_fragment:f_,lights_pars_begin:p_,lights_toon_fragment:g_,lights_toon_pars_fragment:__,lights_phong_fragment:x_,lights_phong_pars_fragment:y_,lights_physical_fragment:v_,lights_physical_pars_fragment:M_,lights_fragment_begin:b_,lights_fragment_maps:S_,lights_fragment_end:E_,logdepthbuf_fragment:T_,logdepthbuf_pars_fragment:w_,logdepthbuf_pars_vertex:A_,logdepthbuf_vertex:R_,map_fragment:C_,map_pars_fragment:P_,map_particle_fragment:I_,map_particle_pars_fragment:L_,metalnessmap_fragment:D_,metalnessmap_pars_fragment:N_,morphinstance_vertex:U_,morphcolor_vertex:O_,morphnormal_vertex:F_,morphtarget_pars_vertex:B_,morphtarget_vertex:k_,normal_fragment_begin:z_,normal_fragment_maps:V_,normal_pars_fragment:H_,normal_pars_vertex:G_,normal_vertex:W_,normalmap_pars_fragment:X_,clearcoat_normal_fragment_begin:q_,clearcoat_normal_fragment_maps:Y_,clearcoat_pars_fragment:Z_,iridescence_pars_fragment:$_,opaque_fragment:j_,packing:J_,premultiplied_alpha_fragment:K_,project_vertex:Q_,dithering_fragment:e0,dithering_pars_fragment:t0,roughnessmap_fragment:n0,roughnessmap_pars_fragment:i0,shadowmap_pars_fragment:s0,shadowmap_pars_vertex:r0,shadowmap_vertex:a0,shadowmask_pars_fragment:o0,skinbase_vertex:c0,skinning_pars_vertex:l0,skinning_vertex:h0,skinnormal_vertex:u0,specularmap_fragment:d0,specularmap_pars_fragment:f0,tonemapping_fragment:p0,tonemapping_pars_fragment:m0,transmission_fragment:g0,transmission_pars_fragment:_0,uv_pars_fragment:x0,uv_pars_vertex:y0,uv_vertex:v0,worldpos_vertex:M0,background_vert:b0,background_frag:S0,backgroundCube_vert:E0,backgroundCube_frag:T0,cube_vert:w0,cube_frag:A0,depth_vert:R0,depth_frag:C0,distanceRGBA_vert:P0,distanceRGBA_frag:I0,equirect_vert:L0,equirect_frag:D0,linedashed_vert:N0,linedashed_frag:U0,meshbasic_vert:O0,meshbasic_frag:F0,meshlambert_vert:B0,meshlambert_frag:k0,meshmatcap_vert:z0,meshmatcap_frag:V0,meshnormal_vert:H0,meshnormal_frag:G0,meshphong_vert:W0,meshphong_frag:X0,meshphysical_vert:q0,meshphysical_frag:Y0,meshtoon_vert:Z0,meshtoon_frag:$0,points_vert:j0,points_frag:J0,shadow_vert:K0,shadow_frag:Q0,sprite_vert:ex,sprite_frag:tx},se={common:{diffuse:{value:new We(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ve},alphaMap:{value:null},alphaMapTransform:{value:new Ve},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ve}},envmap:{envMap:{value:null},envMapRotation:{value:new Ve},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ve}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ve}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ve},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ve},normalScale:{value:new oe(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ve},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ve}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ve}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ve}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new We(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new We(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ve},alphaTest:{value:0},uvTransform:{value:new Ve}},sprite:{diffuse:{value:new We(16777215)},opacity:{value:1},center:{value:new oe(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ve},alphaMap:{value:null},alphaMapTransform:{value:new Ve},alphaTest:{value:0}}},Dn={basic:{uniforms:Bt([se.common,se.specularmap,se.envmap,se.aomap,se.lightmap,se.fog]),vertexShader:Ze.meshbasic_vert,fragmentShader:Ze.meshbasic_frag},lambert:{uniforms:Bt([se.common,se.specularmap,se.envmap,se.aomap,se.lightmap,se.emissivemap,se.bumpmap,se.normalmap,se.displacementmap,se.fog,se.lights,{emissive:{value:new We(0)}}]),vertexShader:Ze.meshlambert_vert,fragmentShader:Ze.meshlambert_frag},phong:{uniforms:Bt([se.common,se.specularmap,se.envmap,se.aomap,se.lightmap,se.emissivemap,se.bumpmap,se.normalmap,se.displacementmap,se.fog,se.lights,{emissive:{value:new We(0)},specular:{value:new We(1118481)},shininess:{value:30}}]),vertexShader:Ze.meshphong_vert,fragmentShader:Ze.meshphong_frag},standard:{uniforms:Bt([se.common,se.envmap,se.aomap,se.lightmap,se.emissivemap,se.bumpmap,se.normalmap,se.displacementmap,se.roughnessmap,se.metalnessmap,se.fog,se.lights,{emissive:{value:new We(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ze.meshphysical_vert,fragmentShader:Ze.meshphysical_frag},toon:{uniforms:Bt([se.common,se.aomap,se.lightmap,se.emissivemap,se.bumpmap,se.normalmap,se.displacementmap,se.gradientmap,se.fog,se.lights,{emissive:{value:new We(0)}}]),vertexShader:Ze.meshtoon_vert,fragmentShader:Ze.meshtoon_frag},matcap:{uniforms:Bt([se.common,se.bumpmap,se.normalmap,se.displacementmap,se.fog,{matcap:{value:null}}]),vertexShader:Ze.meshmatcap_vert,fragmentShader:Ze.meshmatcap_frag},points:{uniforms:Bt([se.points,se.fog]),vertexShader:Ze.points_vert,fragmentShader:Ze.points_frag},dashed:{uniforms:Bt([se.common,se.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ze.linedashed_vert,fragmentShader:Ze.linedashed_frag},depth:{uniforms:Bt([se.common,se.displacementmap]),vertexShader:Ze.depth_vert,fragmentShader:Ze.depth_frag},normal:{uniforms:Bt([se.common,se.bumpmap,se.normalmap,se.displacementmap,{opacity:{value:1}}]),vertexShader:Ze.meshnormal_vert,fragmentShader:Ze.meshnormal_frag},sprite:{uniforms:Bt([se.sprite,se.fog]),vertexShader:Ze.sprite_vert,fragmentShader:Ze.sprite_frag},background:{uniforms:{uvTransform:{value:new Ve},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ze.background_vert,fragmentShader:Ze.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ve}},vertexShader:Ze.backgroundCube_vert,fragmentShader:Ze.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ze.cube_vert,fragmentShader:Ze.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ze.equirect_vert,fragmentShader:Ze.equirect_frag},distanceRGBA:{uniforms:Bt([se.common,se.displacementmap,{referencePosition:{value:new A},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ze.distanceRGBA_vert,fragmentShader:Ze.distanceRGBA_frag},shadow:{uniforms:Bt([se.lights,se.fog,{color:{value:new We(0)},opacity:{value:1}}]),vertexShader:Ze.shadow_vert,fragmentShader:Ze.shadow_frag}};Dn.physical={uniforms:Bt([Dn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ve},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ve},clearcoatNormalScale:{value:new oe(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ve},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ve},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ve},sheen:{value:0},sheenColor:{value:new We(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ve},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ve},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ve},transmissionSamplerSize:{value:new oe},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ve},attenuationDistance:{value:0},attenuationColor:{value:new We(0)},specularColor:{value:new We(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ve},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ve},anisotropyVector:{value:new oe},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ve}}]),vertexShader:Ze.meshphysical_vert,fragmentShader:Ze.meshphysical_frag};uc={r:0,b:0,g:0},as=new It,nx=new _t;Hs=4,Od=[.125,.215,.35,.446,.526,.582],ls=20,th=new Fr,Fd=new We,nh=null,ih=0,sh=0,rh=!1,cs=(1+Math.sqrt(5))/2,Vs=1/cs,Bd=[new A(-cs,Vs,0),new A(cs,Vs,0),new A(-Vs,0,cs),new A(Vs,0,cs),new A(0,cs,-Vs),new A(0,cs,Vs),new A(-1,1,-1),new A(1,1,-1),new A(-1,1,1),new A(1,1,1)],pc=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(e,t=0,n=.1,s=100){nh=this._renderer.getRenderTarget(),ih=this._renderer.getActiveCubeFace(),sh=this._renderer.getActiveMipmapLevel(),rh=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(256);let r=this._allocateTargets();return r.depthBuffer=!0,this._sceneToCubeUV(e,n,s,r),t>0&&this._blur(r,0,0,t),this._applyPMREM(r),this._cleanup(r),r}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Vd(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=zd(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodPlanes.length;e++)this._lodPlanes[e].dispose()}_cleanup(e){this._renderer.setRenderTarget(nh,ih,sh),this._renderer.xr.enabled=rh,e.scissorTest=!1,dc(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===ts||e.mapping===ns?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),nh=this._renderer.getRenderTarget(),ih=this._renderer.getActiveCubeFace(),sh=this._renderer.getActiveMipmapLevel(),rh=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:yn,minFilter:yn,generateMipmaps:!1,type:ks,format:dn,colorSpace:ji,depthBuffer:!1},s=kd(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=kd(e,t,n);let{_lodMax:r}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=lx(r)),this._blurMaterial=hx(r,e,t)}return s}_compileMaterial(e){let t=new ut(this._lodPlanes[0],e);this._renderer.compile(t,th)}_sceneToCubeUV(e,t,n,s){let o=new Ot(90,1,t,n),c=[1,-1,1,1,1,1],l=[1,1,1,-1,-1,-1],h=this._renderer,u=h.autoClear,d=h.toneMapping;h.getClearColor(Fd),h.toneMapping=jn,h.autoClear=!1;let p=new _r({name:"PMREM.Background",side:Ht,depthWrite:!1,depthTest:!1}),g=new ut(new vn,p),_=!1,m=e.background;m?m.isColor&&(p.color.copy(m),e.background=null,_=!0):(p.color.copy(Fd),_=!0);for(let f=0;f<6;f++){let T=f%3;T===0?(o.up.set(0,c[f],0),o.lookAt(l[f],0,0)):T===1?(o.up.set(0,0,c[f]),o.lookAt(0,l[f],0)):(o.up.set(0,c[f],0),o.lookAt(0,0,l[f]));let E=this._cubeSize;dc(s,T*E,f>2?E:0,E,E),h.setRenderTarget(s),_&&h.render(g,o),h.render(e,o)}g.geometry.dispose(),g.material.dispose(),h.toneMapping=d,h.autoClear=u,e.background=m}_textureToCubeUV(e,t){let n=this._renderer,s=e.mapping===ts||e.mapping===ns;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=Vd()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=zd());let r=s?this._cubemapMaterial:this._equirectMaterial,a=new ut(this._lodPlanes[0],r),o=r.uniforms;o.envMap.value=e;let c=this._cubeSize;dc(t,0,0,3*c,2*c),n.setRenderTarget(t),n.render(a,th)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let s=this._lodPlanes.length;for(let r=1;r<s;r++){let a=Math.sqrt(this._sigmas[r]*this._sigmas[r]-this._sigmas[r-1]*this._sigmas[r-1]),o=Bd[(s-r-1)%Bd.length];this._blur(e,r-1,r,a,o)}t.autoClear=n}_blur(e,t,n,s,r){let a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,s,"latitudinal",r),this._halfBlur(a,e,n,n,s,"longitudinal",r)}_halfBlur(e,t,n,s,r,a,o){let c=this._renderer,l=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");let h=3,u=new ut(this._lodPlanes[s],l),d=l.uniforms,p=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*p):2*Math.PI/(2*ls-1),_=r/g,m=isFinite(r)?1+Math.floor(h*_):ls;m>ls&&console.warn(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${ls}`);let f=[],T=0;for(let C=0;C<ls;++C){let L=C/_,M=Math.exp(-L*L/2);f.push(M),C===0?T+=M:C<m&&(T+=2*M)}for(let C=0;C<f.length;C++)f[C]=f[C]/T;d.envMap.value=e.texture,d.samples.value=m,d.weights.value=f,d.latitudinal.value=a==="latitudinal",o&&(d.poleAxis.value=o);let{_lodMax:E}=this;d.dTheta.value=g,d.mipInt.value=E-n;let b=this._sizeLods[s],P=3*b*(s>E-Hs?s-E+Hs:0),R=4*(this._cubeSize-b);dc(t,P,R,3*b,2*b),c.setRenderTarget(t),c.render(u,th)}};of=new Qt,Hd=new Tr(1,1),cf=new mr,lf=new qa,hf=new Mr,Gd=[],Wd=[],Xd=new Float32Array(16),qd=new Float32Array(9),Yd=new Float32Array(4);oh=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=Fx(t.type)}},ch=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=iy(t.type)}},lh=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let s=this.seq;for(let r=0,a=s.length;r!==a;++r){let o=s[r];o.setValue(e,t[o.id],n)}}},ah=/(\w+)(\])?(\[|\.)?/g;Gs=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let s=0;s<n;++s){let r=e.getActiveUniform(t,s),a=e.getUniformLocation(t,r.name);sy(r,a,this)}}setValue(e,t,n,s){let r=this.map[t];r!==void 0&&r.setValue(e,n,s)}setOptional(e,t,n){let s=t[n];s!==void 0&&this.setValue(e,n,s)}static upload(e,t,n,s){for(let r=0,a=t.length;r!==a;++r){let o=t[r],c=n[o.id];c.needsUpdate!==!1&&o.setValue(e,c.value,s)}}static seqWithValue(e,t){let n=[];for(let s=0,r=e.length;s!==r;++s){let a=e[s];a.id in t&&n.push(a)}return n}};ry=37297,ay=0;jd=new Ve;fc=new A;my=/^[ \t]*#include +<([\w\d./]+)>/gm;gy=new Map;xy=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;wy=0,uh=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){let t=e.vertexShader,n=e.fragmentShader,s=this._getShaderStage(t),r=this._getShaderStage(n),a=this._getShaderCacheForMaterial(e);return a.has(s)===!1&&(a.add(s),s.usedTimes++),a.has(r)===!1&&(a.add(r),r.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new dh(e),t.set(e,n)),n}},dh=class{constructor(e){this.id=wy++,this.code=e,this.usedTimes=0}};Dy=0;Fy=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,By=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;zy={[bo]:So,[Eo]:Ao,[To]:Ro,[Zi]:wo,[So]:bo,[Ao]:Eo,[Ro]:To,[wo]:Zi};Wy={type:"move"},Zr=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new hn,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new hn,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new A,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new A),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new hn,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new A,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new A),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let s=null,r=null,a=null,o=this._targetRay,c=this._grip,l=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(l&&e.hand){a=!0;for(let _ of e.hand.values()){let m=t.getJointPose(_,n),f=this._getHandJoint(l,_);m!==null&&(f.matrix.fromArray(m.transform.matrix),f.matrix.decompose(f.position,f.rotation,f.scale),f.matrixWorldNeedsUpdate=!0,f.jointRadius=m.radius),f.visible=m!==null}let h=l.joints["index-finger-tip"],u=l.joints["thumb-tip"],d=h.position.distanceTo(u.position),p=.02,g=.005;l.inputState.pinching&&d>p+g?(l.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!l.inputState.pinching&&d<=p-g&&(l.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else c!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(c.matrix.fromArray(r.transform.matrix),c.matrix.decompose(c.position,c.rotation,c.scale),c.matrixWorldNeedsUpdate=!0,r.linearVelocity?(c.hasLinearVelocity=!0,c.linearVelocity.copy(r.linearVelocity)):c.hasLinearVelocity=!1,r.angularVelocity?(c.hasAngularVelocity=!0,c.angularVelocity.copy(r.angularVelocity)):c.hasAngularVelocity=!1));o!==null&&(s=t.getPose(e.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(o.matrix.fromArray(s.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,s.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(s.linearVelocity)):o.hasLinearVelocity=!1,s.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(s.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(Wy)))}return o!==null&&(o.visible=s!==null),c!==null&&(c.visible=r!==null),l!==null&&(l.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new hn;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}},Xy=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,qy=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,fh=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t,n){if(this.texture===null){let s=new Qt,r=e.properties.get(s);r.__webglTexture=t.texture,(t.depthNear!=n.depthNear||t.depthFar!=n.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=s}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new Mn({vertexShader:Xy,fragmentShader:qy,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new ut(new Dr(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},ph=class extends wn{constructor(e,t){super();let n=this,s=null,r=1,a=null,o="local-floor",c=1,l=null,h=null,u=null,d=null,p=null,g=null,_=new fh,m=t.getContextAttributes(),f=null,T=null,E=[],b=[],P=new oe,R=null,C=new Ot;C.viewport=new yt;let L=new Ot;L.viewport=new yt;let M=[C,L],v=new yo,I=null,z=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(X){let te=E[X];return te===void 0&&(te=new Zr,E[X]=te),te.getTargetRaySpace()},this.getControllerGrip=function(X){let te=E[X];return te===void 0&&(te=new Zr,E[X]=te),te.getGripSpace()},this.getHand=function(X){let te=E[X];return te===void 0&&(te=new Zr,E[X]=te),te.getHandSpace()};function F(X){let te=b.indexOf(X.inputSource);if(te===-1)return;let be=E[te];be!==void 0&&(be.update(X.inputSource,X.frame,l||a),be.dispatchEvent({type:X.type,data:X.inputSource}))}function G(){s.removeEventListener("select",F),s.removeEventListener("selectstart",F),s.removeEventListener("selectend",F),s.removeEventListener("squeeze",F),s.removeEventListener("squeezestart",F),s.removeEventListener("squeezeend",F),s.removeEventListener("end",G),s.removeEventListener("inputsourceschange",$);for(let X=0;X<E.length;X++){let te=b[X];te!==null&&(b[X]=null,E[X].disconnect(te))}I=null,z=null,_.reset(),e.setRenderTarget(f),p=null,d=null,u=null,s=null,T=null,st.stop(),n.isPresenting=!1,e.setPixelRatio(R),e.setSize(P.width,P.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(X){r=X,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(X){o=X,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return l||a},this.setReferenceSpace=function(X){l=X},this.getBaseLayer=function(){return d!==null?d:p},this.getBinding=function(){return u},this.getFrame=function(){return g},this.getSession=function(){return s},this.setSession=async function(X){if(s=X,s!==null){if(f=e.getRenderTarget(),s.addEventListener("select",F),s.addEventListener("selectstart",F),s.addEventListener("selectend",F),s.addEventListener("squeeze",F),s.addEventListener("squeezestart",F),s.addEventListener("squeezeend",F),s.addEventListener("end",G),s.addEventListener("inputsourceschange",$),m.xrCompatible!==!0&&await t.makeXRCompatible(),R=e.getPixelRatio(),e.getSize(P),s.renderState.layers===void 0){let te={antialias:m.antialias,alpha:!0,depth:m.depth,stencil:m.stencil,framebufferScaleFactor:r};p=new XRWebGLLayer(s,t,te),s.updateRenderState({baseLayer:p}),e.setPixelRatio(1),e.setSize(p.framebufferWidth,p.framebufferHeight,!1),T=new An(p.framebufferWidth,p.framebufferHeight,{format:dn,type:In,colorSpace:e.outputColorSpace,stencilBuffer:m.stencil})}else{let te=null,be=null,ae=null;m.depth&&(ae=m.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,te=m.stencil?$i:qi,be=m.stencil?is:_i);let Pe={colorFormat:t.RGBA8,depthFormat:ae,scaleFactor:r};u=new XRWebGLBinding(s,t),d=u.createProjectionLayer(Pe),s.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),T=new An(d.textureWidth,d.textureHeight,{format:dn,type:In,depthTexture:new Tr(d.textureWidth,d.textureHeight,be,void 0,void 0,void 0,void 0,void 0,void 0,te),stencilBuffer:m.stencil,colorSpace:e.outputColorSpace,samples:m.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1})}T.isXRRenderTarget=!0,this.setFoveation(c),l=null,a=await s.requestReferenceSpace(o),st.setContext(s),st.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return _.getDepthTexture()};function $(X){for(let te=0;te<X.removed.length;te++){let be=X.removed[te],ae=b.indexOf(be);ae>=0&&(b[ae]=null,E[ae].disconnect(be))}for(let te=0;te<X.added.length;te++){let be=X.added[te],ae=b.indexOf(be);if(ae===-1){for(let Ne=0;Ne<E.length;Ne++)if(Ne>=b.length){b.push(be),ae=Ne;break}else if(b[Ne]===null){b[Ne]=be,ae=Ne;break}if(ae===-1)break}let Pe=E[ae];Pe&&Pe.connect(be)}}let W=new A,ee=new A;function V(X,te,be){W.setFromMatrixPosition(te.matrixWorld),ee.setFromMatrixPosition(be.matrixWorld);let ae=W.distanceTo(ee),Pe=te.projectionMatrix.elements,Ne=be.projectionMatrix.elements,ke=Pe[14]/(Pe[10]-1),dt=Pe[14]/(Pe[10]+1),Je=(Pe[9]+1)/Pe[5],ne=(Pe[9]-1)/Pe[5],w=(Pe[8]-1)/Pe[0],Fe=(Ne[8]+1)/Ne[0],we=ke*w,Ie=ke*Fe,me=ae/(-w+Fe),Ke=me*-w;if(te.matrixWorld.decompose(X.position,X.quaternion,X.scale),X.translateX(Ke),X.translateZ(me),X.matrixWorld.compose(X.position,X.quaternion,X.scale),X.matrixWorldInverse.copy(X.matrixWorld).invert(),Pe[10]===-1)X.projectionMatrix.copy(te.projectionMatrix),X.projectionMatrixInverse.copy(te.projectionMatrixInverse);else{let Te=ke+me,S=dt+me,x=we-Ke,O=Ie+(ae-Ke),Y=Je*dt/S*Te,j=ne*dt/S*Te;X.projectionMatrix.makePerspective(x,O,Y,j,Te,S),X.projectionMatrixInverse.copy(X.projectionMatrix).invert()}}function re(X,te){te===null?X.matrixWorld.copy(X.matrix):X.matrixWorld.multiplyMatrices(te.matrixWorld,X.matrix),X.matrixWorldInverse.copy(X.matrixWorld).invert()}this.updateCamera=function(X){if(s===null)return;let te=X.near,be=X.far;_.texture!==null&&(_.depthNear>0&&(te=_.depthNear),_.depthFar>0&&(be=_.depthFar)),v.near=L.near=C.near=te,v.far=L.far=C.far=be,(I!==v.near||z!==v.far)&&(s.updateRenderState({depthNear:v.near,depthFar:v.far}),I=v.near,z=v.far),C.layers.mask=X.layers.mask|2,L.layers.mask=X.layers.mask|4,v.layers.mask=C.layers.mask|L.layers.mask;let ae=X.parent,Pe=v.cameras;re(v,ae);for(let Ne=0;Ne<Pe.length;Ne++)re(Pe[Ne],ae);Pe.length===2?V(v,C,L):v.projectionMatrix.copy(C.projectionMatrix),pe(X,v,ae)};function pe(X,te,be){be===null?X.matrix.copy(te.matrixWorld):(X.matrix.copy(be.matrixWorld),X.matrix.invert(),X.matrix.multiply(te.matrixWorld)),X.matrix.decompose(X.position,X.quaternion,X.scale),X.updateMatrixWorld(!0),X.projectionMatrix.copy(te.projectionMatrix),X.projectionMatrixInverse.copy(te.projectionMatrixInverse),X.isPerspectiveCamera&&(X.fov=Ds*2*Math.atan(1/X.projectionMatrix.elements[5]),X.zoom=1)}this.getCamera=function(){return v},this.getFoveation=function(){if(!(d===null&&p===null))return c},this.setFoveation=function(X){c=X,d!==null&&(d.fixedFoveation=X),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=X)},this.hasDepthSensing=function(){return _.texture!==null},this.getDepthSensingMesh=function(){return _.getMesh(v)};let Se=null;function $e(X,te){if(h=te.getViewerPose(l||a),g=te,h!==null){let be=h.views;p!==null&&(e.setRenderTargetFramebuffer(T,p.framebuffer),e.setRenderTarget(T));let ae=!1;be.length!==v.cameras.length&&(v.cameras.length=0,ae=!0);for(let Ne=0;Ne<be.length;Ne++){let ke=be[Ne],dt=null;if(p!==null)dt=p.getViewport(ke);else{let ne=u.getViewSubImage(d,ke);dt=ne.viewport,Ne===0&&(e.setRenderTargetTextures(T,ne.colorTexture,d.ignoreDepthValues?void 0:ne.depthStencilTexture),e.setRenderTarget(T))}let Je=M[Ne];Je===void 0&&(Je=new Ot,Je.layers.enable(Ne),Je.viewport=new yt,M[Ne]=Je),Je.matrix.fromArray(ke.transform.matrix),Je.matrix.decompose(Je.position,Je.quaternion,Je.scale),Je.projectionMatrix.fromArray(ke.projectionMatrix),Je.projectionMatrixInverse.copy(Je.projectionMatrix).invert(),Je.viewport.set(dt.x,dt.y,dt.width,dt.height),Ne===0&&(v.matrix.copy(Je.matrix),v.matrix.decompose(v.position,v.quaternion,v.scale)),ae===!0&&v.cameras.push(Je)}let Pe=s.enabledFeatures;if(Pe&&Pe.includes("depth-sensing")){let Ne=u.getDepthInformation(be[0]);Ne&&Ne.isValid&&Ne.texture&&_.init(e,Ne,s.renderState)}}for(let be=0;be<E.length;be++){let ae=b[be],Pe=E[be];ae!==null&&Pe!==void 0&&Pe.update(ae,te,l||a)}Se&&Se(X,te),te.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:te}),g=null}let st=new af;st.setAnimationLoop($e),this.setAnimationLoop=function(X){Se=X},this.dispose=function(){}}},os=new It,Yy=new _t;mc=class{constructor(e={}){let{canvas:t=Cd(),context:n=null,depth:s=!0,stencil:r=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:u=!1,reverseDepthBuffer:d=!1}=e;this.isWebGLRenderer=!0;let p;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");p=n.getContextAttributes().alpha}else p=a;let g=new Uint32Array(4),_=new Int32Array(4),m=null,f=null,T=[],E=[];this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this._outputColorSpace=Vt,this.toneMapping=jn,this.toneMappingExposure=1;let b=this,P=!1,R=0,C=0,L=null,M=-1,v=null,I=new yt,z=new yt,F=null,G=new We(0),$=0,W=t.width,ee=t.height,V=1,re=null,pe=null,Se=new yt(0,0,W,ee),$e=new yt(0,0,W,ee),st=!1,X=new Ns,te=!1,be=!1,ae=new _t,Pe=new _t,Ne=new A,ke=new yt,dt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Je=!1;function ne(){return L===null?V:1}let w=n;function Fe(y,N){return t.getContext(y,N)}try{let y={alpha:!0,depth:s,stencil:r,antialias:o,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:h,failIfMajorPerformanceCaveat:u};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${vo}`),t.addEventListener("webglcontextlost",Z,!1),t.addEventListener("webglcontextrestored",fe,!1),t.addEventListener("webglcontextcreationerror",de,!1),w===null){let N="webgl2";if(w=Fe(N,y),w===null)throw Fe(N)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(y){throw console.error("THREE.WebGLRenderer: "+y.message),y}let we,Ie,me,Ke,Te,S,x,O,Y,j,q,Ee,he,_e,et,Q,xe,Le,Ue,ye,Qe,Xe,ft,D;function ce(){we=new dx(w),we.init(),Xe=new Gy(w,we),Ie=new ax(w,we,e,Xe),me=new Vy(w,we),Ie.reverseDepthBuffer&&d&&me.buffers.depth.setReversed(!0),Ke=new mx(w),Te=new Ry,S=new Hy(w,we,me,Te,Ie,Xe,Ke),x=new cx(b),O=new ux(b),Y=new bg(w),ft=new sx(w,Y),j=new fx(w,Y,Ke,ft),q=new _x(w,j,Y,Ke),Ue=new gx(w,Ie,S),Q=new ox(Te),Ee=new Ay(b,x,O,we,Ie,ft,Q),he=new Zy(b,Te),_e=new Py,et=new Oy(we),Le=new ix(b,x,O,me,q,p,c),xe=new ky(b,q,Ie),D=new $y(w,Ke,Ie,me),ye=new rx(w,we,Ke),Qe=new px(w,we,Ke),Ke.programs=Ee.programs,b.capabilities=Ie,b.extensions=we,b.properties=Te,b.renderLists=_e,b.shadowMap=xe,b.state=me,b.info=Ke}ce();let H=new ph(b,w);this.xr=H,this.getContext=function(){return w},this.getContextAttributes=function(){return w.getContextAttributes()},this.forceContextLoss=function(){let y=we.get("WEBGL_lose_context");y&&y.loseContext()},this.forceContextRestore=function(){let y=we.get("WEBGL_lose_context");y&&y.restoreContext()},this.getPixelRatio=function(){return V},this.setPixelRatio=function(y){y!==void 0&&(V=y,this.setSize(W,ee,!1))},this.getSize=function(y){return y.set(W,ee)},this.setSize=function(y,N,B=!0){if(H.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}W=y,ee=N,t.width=Math.floor(y*V),t.height=Math.floor(N*V),B===!0&&(t.style.width=y+"px",t.style.height=N+"px"),this.setViewport(0,0,y,N)},this.getDrawingBufferSize=function(y){return y.set(W*V,ee*V).floor()},this.setDrawingBufferSize=function(y,N,B){W=y,ee=N,V=B,t.width=Math.floor(y*B),t.height=Math.floor(N*B),this.setViewport(0,0,y,N)},this.getCurrentViewport=function(y){return y.copy(I)},this.getViewport=function(y){return y.copy(Se)},this.setViewport=function(y,N,B,k){y.isVector4?Se.set(y.x,y.y,y.z,y.w):Se.set(y,N,B,k),me.viewport(I.copy(Se).multiplyScalar(V).round())},this.getScissor=function(y){return y.copy($e)},this.setScissor=function(y,N,B,k){y.isVector4?$e.set(y.x,y.y,y.z,y.w):$e.set(y,N,B,k),me.scissor(z.copy($e).multiplyScalar(V).round())},this.getScissorTest=function(){return st},this.setScissorTest=function(y){me.setScissorTest(st=y)},this.setOpaqueSort=function(y){re=y},this.setTransparentSort=function(y){pe=y},this.getClearColor=function(y){return y.copy(Le.getClearColor())},this.setClearColor=function(){Le.setClearColor.apply(Le,arguments)},this.getClearAlpha=function(){return Le.getClearAlpha()},this.setClearAlpha=function(){Le.setClearAlpha.apply(Le,arguments)},this.clear=function(y=!0,N=!0,B=!0){let k=0;if(y){let U=!1;if(L!==null){let K=L.texture.format;U=K===Bo||K===Fo||K===Oo}if(U){let K=L.texture.type,le=K===In||K===_i||K===Bs||K===is||K===No||K===Uo,ge=Le.getClearColor(),ve=Le.getClearAlpha(),Oe=ge.r,Be=ge.g,Ae=ge.b;le?(g[0]=Oe,g[1]=Be,g[2]=Ae,g[3]=ve,w.clearBufferuiv(w.COLOR,0,g)):(_[0]=Oe,_[1]=Be,_[2]=Ae,_[3]=ve,w.clearBufferiv(w.COLOR,0,_))}else k|=w.COLOR_BUFFER_BIT}N&&(k|=w.DEPTH_BUFFER_BIT),B&&(k|=w.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),w.clear(k)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",Z,!1),t.removeEventListener("webglcontextrestored",fe,!1),t.removeEventListener("webglcontextcreationerror",de,!1),Le.dispose(),_e.dispose(),et.dispose(),Te.dispose(),x.dispose(),O.dispose(),q.dispose(),ft.dispose(),D.dispose(),Ee.dispose(),H.dispose(),H.removeEventListener("sessionstart",Ah),H.removeEventListener("sessionend",Rh),vi.stop()};function Z(y){y.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),P=!0}function fe(){console.log("THREE.WebGLRenderer: Context Restored."),P=!1;let y=Ke.autoReset,N=xe.enabled,B=xe.autoUpdate,k=xe.needsUpdate,U=xe.type;ce(),Ke.autoReset=y,xe.enabled=N,xe.autoUpdate=B,xe.needsUpdate=k,xe.type=U}function de(y){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",y.statusMessage)}function He(y){let N=y.target;N.removeEventListener("dispose",He),vt(N)}function vt(y){Lt(y),Te.remove(y)}function Lt(y){let N=Te.get(y).programs;N!==void 0&&(N.forEach(function(B){Ee.releaseProgram(B)}),y.isShaderMaterial&&Ee.releaseShaderCache(y))}this.renderBufferDirect=function(y,N,B,k,U,K){N===null&&(N=dt);let le=U.isMesh&&U.matrixWorld.determinant()<0,ge=Pf(y,N,B,k,U);me.setMaterial(k,le);let ve=B.index,Oe=1;if(k.wireframe===!0){if(ve=j.getWireframeAttribute(B),ve===void 0)return;Oe=2}let Be=B.drawRange,Ae=B.attributes.position,tt=Be.start*Oe,rt=(Be.start+Be.count)*Oe;K!==null&&(tt=Math.max(tt,K.start*Oe),rt=Math.min(rt,(K.start+K.count)*Oe)),ve!==null?(tt=Math.max(tt,0),rt=Math.min(rt,ve.count)):Ae!=null&&(tt=Math.max(tt,0),rt=Math.min(rt,Ae.count));let bt=rt-tt;if(bt<0||bt===1/0)return;ft.setup(U,k,ge,B,ve);let Mt,it=ye;if(ve!==null&&(Mt=Y.get(ve),it=Qe,it.setIndex(Mt)),U.isMesh)k.wireframe===!0?(me.setLineWidth(k.wireframeLinewidth*ne()),it.setMode(w.LINES)):it.setMode(w.TRIANGLES);else if(U.isLine){let Re=k.linewidth;Re===void 0&&(Re=1),me.setLineWidth(Re*ne()),U.isLineSegments?it.setMode(w.LINES):U.isLineLoop?it.setMode(w.LINE_LOOP):it.setMode(w.LINE_STRIP)}else U.isPoints?it.setMode(w.POINTS):U.isSprite&&it.setMode(w.TRIANGLES);if(U.isBatchedMesh)if(U._multiDrawInstances!==null)it.renderMultiDrawInstances(U._multiDrawStarts,U._multiDrawCounts,U._multiDrawCount,U._multiDrawInstances);else if(we.get("WEBGL_multi_draw"))it.renderMultiDraw(U._multiDrawStarts,U._multiDrawCounts,U._multiDrawCount);else{let Re=U._multiDrawStarts,Ct=U._multiDrawCounts,at=U._multiDrawCount,pn=ve?Y.get(ve).bytesPerElement:1,hs=Te.get(k).currentProgram.getUniforms();for(let $t=0;$t<at;$t++)hs.setValue(w,"_gl_DrawID",$t),it.render(Re[$t]/pn,Ct[$t])}else if(U.isInstancedMesh)it.renderInstances(tt,bt,U.count);else if(B.isInstancedBufferGeometry){let Re=B._maxInstanceCount!==void 0?B._maxInstanceCount:1/0,Ct=Math.min(B.instanceCount,Re);it.renderInstances(tt,bt,Ct)}else it.render(tt,bt)};function ot(y,N,B){y.transparent===!0&&y.side===Pn&&y.forceSinglePass===!1?(y.side=Ht,y.needsUpdate=!0,ea(y,N,B),y.side=qn,y.needsUpdate=!0,ea(y,N,B),y.side=Pn):ea(y,N,B)}this.compile=function(y,N,B=null){B===null&&(B=y),f=et.get(B),f.init(N),E.push(f),B.traverseVisible(function(U){U.isLight&&U.layers.test(N.layers)&&(f.pushLight(U),U.castShadow&&f.pushShadow(U))}),y!==B&&y.traverseVisible(function(U){U.isLight&&U.layers.test(N.layers)&&(f.pushLight(U),U.castShadow&&f.pushShadow(U))}),f.setupLights();let k=new Set;return y.traverse(function(U){if(!(U.isMesh||U.isPoints||U.isLine||U.isSprite))return;let K=U.material;if(K)if(Array.isArray(K))for(let le=0;le<K.length;le++){let ge=K[le];ot(ge,B,U),k.add(ge)}else ot(K,B,U),k.add(K)}),E.pop(),f=null,k},this.compileAsync=function(y,N,B=null){let k=this.compile(y,N,B);return new Promise(U=>{function K(){if(k.forEach(function(le){Te.get(le).currentProgram.isReady()&&k.delete(le)}),k.size===0){U(y);return}setTimeout(K,10)}we.get("KHR_parallel_shader_compile")!==null?K():setTimeout(K,10)})};let fn=null;function Un(y){fn&&fn(y)}function Ah(){vi.stop()}function Rh(){vi.start()}let vi=new af;vi.setAnimationLoop(Un),typeof self<"u"&&vi.setContext(self),this.setAnimationLoop=function(y){fn=y,H.setAnimationLoop(y),y===null?vi.stop():vi.start()},H.addEventListener("sessionstart",Ah),H.addEventListener("sessionend",Rh),this.render=function(y,N){if(N!==void 0&&N.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(P===!0)return;if(y.matrixWorldAutoUpdate===!0&&y.updateMatrixWorld(),N.parent===null&&N.matrixWorldAutoUpdate===!0&&N.updateMatrixWorld(),H.enabled===!0&&H.isPresenting===!0&&(H.cameraAutoUpdate===!0&&H.updateCamera(N),N=H.getCamera()),y.isScene===!0&&y.onBeforeRender(b,y,N,L),f=et.get(y,E.length),f.init(N),E.push(f),Pe.multiplyMatrices(N.projectionMatrix,N.matrixWorldInverse),X.setFromProjectionMatrix(Pe),be=this.localClippingEnabled,te=Q.init(this.clippingPlanes,be),m=_e.get(y,T.length),m.init(),T.push(m),H.enabled===!0&&H.isPresenting===!0){let K=b.xr.getDepthSensingMesh();K!==null&&Cc(K,N,-1/0,b.sortObjects)}Cc(y,N,0,b.sortObjects),m.finish(),b.sortObjects===!0&&m.sort(re,pe),Je=H.enabled===!1||H.isPresenting===!1||H.hasDepthSensing()===!1,Je&&Le.addToRenderList(m,y),this.info.render.frame++,te===!0&&Q.beginShadows();let B=f.state.shadowsArray;xe.render(B,y,N),te===!0&&Q.endShadows(),this.info.autoReset===!0&&this.info.reset();let k=m.opaque,U=m.transmissive;if(f.setupLights(),N.isArrayCamera){let K=N.cameras;if(U.length>0)for(let le=0,ge=K.length;le<ge;le++){let ve=K[le];Ph(k,U,y,ve)}Je&&Le.render(y);for(let le=0,ge=K.length;le<ge;le++){let ve=K[le];Ch(m,y,ve,ve.viewport)}}else U.length>0&&Ph(k,U,y,N),Je&&Le.render(y),Ch(m,y,N);L!==null&&(S.updateMultisampleRenderTarget(L),S.updateRenderTargetMipmap(L)),y.isScene===!0&&y.onAfterRender(b,y,N),ft.resetDefaultState(),M=-1,v=null,E.pop(),E.length>0?(f=E[E.length-1],te===!0&&Q.setGlobalState(b.clippingPlanes,f.state.camera)):f=null,T.pop(),T.length>0?m=T[T.length-1]:m=null};function Cc(y,N,B,k){if(y.visible===!1)return;if(y.layers.test(N.layers)){if(y.isGroup)B=y.renderOrder;else if(y.isLOD)y.autoUpdate===!0&&y.update(N);else if(y.isLight)f.pushLight(y),y.castShadow&&f.pushShadow(y);else if(y.isSprite){if(!y.frustumCulled||X.intersectsSprite(y)){k&&ke.setFromMatrixPosition(y.matrixWorld).applyMatrix4(Pe);let le=q.update(y),ge=y.material;ge.visible&&m.push(y,le,ge,B,ke.z,null)}}else if((y.isMesh||y.isLine||y.isPoints)&&(!y.frustumCulled||X.intersectsObject(y))){let le=q.update(y),ge=y.material;if(k&&(y.boundingSphere!==void 0?(y.boundingSphere===null&&y.computeBoundingSphere(),ke.copy(y.boundingSphere.center)):(le.boundingSphere===null&&le.computeBoundingSphere(),ke.copy(le.boundingSphere.center)),ke.applyMatrix4(y.matrixWorld).applyMatrix4(Pe)),Array.isArray(ge)){let ve=le.groups;for(let Oe=0,Be=ve.length;Oe<Be;Oe++){let Ae=ve[Oe],tt=ge[Ae.materialIndex];tt&&tt.visible&&m.push(y,le,tt,B,ke.z,Ae)}}else ge.visible&&m.push(y,le,ge,B,ke.z,null)}}let K=y.children;for(let le=0,ge=K.length;le<ge;le++)Cc(K[le],N,B,k)}function Ch(y,N,B,k){let U=y.opaque,K=y.transmissive,le=y.transparent;f.setupLightsView(B),te===!0&&Q.setGlobalState(b.clippingPlanes,B),k&&me.viewport(I.copy(k)),U.length>0&&Qr(U,N,B),K.length>0&&Qr(K,N,B),le.length>0&&Qr(le,N,B),me.buffers.depth.setTest(!0),me.buffers.depth.setMask(!0),me.buffers.color.setMask(!0),me.setPolygonOffset(!1)}function Ph(y,N,B,k){if((B.isScene===!0?B.overrideMaterial:null)!==null)return;f.state.transmissionRenderTarget[k.id]===void 0&&(f.state.transmissionRenderTarget[k.id]=new An(1,1,{generateMipmaps:!0,type:we.has("EXT_color_buffer_half_float")||we.has("EXT_color_buffer_float")?ks:In,minFilter:gi,samples:4,stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:nt.workingColorSpace}));let K=f.state.transmissionRenderTarget[k.id],le=k.viewport||I;K.setSize(le.z,le.w);let ge=b.getRenderTarget();b.setRenderTarget(K),b.getClearColor(G),$=b.getClearAlpha(),$<1&&b.setClearColor(16777215,.5),b.clear(),Je&&Le.render(B);let ve=b.toneMapping;b.toneMapping=jn;let Oe=k.viewport;if(k.viewport!==void 0&&(k.viewport=void 0),f.setupLightsView(k),te===!0&&Q.setGlobalState(b.clippingPlanes,k),Qr(y,B,k),S.updateMultisampleRenderTarget(K),S.updateRenderTargetMipmap(K),we.has("WEBGL_multisampled_render_to_texture")===!1){let Be=!1;for(let Ae=0,tt=N.length;Ae<tt;Ae++){let rt=N[Ae],bt=rt.object,Mt=rt.geometry,it=rt.material,Re=rt.group;if(it.side===Pn&&bt.layers.test(k.layers)){let Ct=it.side;it.side=Ht,it.needsUpdate=!0,Ih(bt,B,k,Mt,it,Re),it.side=Ct,it.needsUpdate=!0,Be=!0}}Be===!0&&(S.updateMultisampleRenderTarget(K),S.updateRenderTargetMipmap(K))}b.setRenderTarget(ge),b.setClearColor(G,$),Oe!==void 0&&(k.viewport=Oe),b.toneMapping=ve}function Qr(y,N,B){let k=N.isScene===!0?N.overrideMaterial:null;for(let U=0,K=y.length;U<K;U++){let le=y[U],ge=le.object,ve=le.geometry,Oe=k===null?le.material:k,Be=le.group;ge.layers.test(B.layers)&&Ih(ge,N,B,ve,Oe,Be)}}function Ih(y,N,B,k,U,K){y.onBeforeRender(b,N,B,k,U,K),y.modelViewMatrix.multiplyMatrices(B.matrixWorldInverse,y.matrixWorld),y.normalMatrix.getNormalMatrix(y.modelViewMatrix),U.onBeforeRender(b,N,B,k,y,K),U.transparent===!0&&U.side===Pn&&U.forceSinglePass===!1?(U.side=Ht,U.needsUpdate=!0,b.renderBufferDirect(B,N,k,U,y,K),U.side=qn,U.needsUpdate=!0,b.renderBufferDirect(B,N,k,U,y,K),U.side=Pn):b.renderBufferDirect(B,N,k,U,y,K),y.onAfterRender(b,N,B,k,U,K)}function ea(y,N,B){N.isScene!==!0&&(N=dt);let k=Te.get(y),U=f.state.lights,K=f.state.shadowsArray,le=U.state.version,ge=Ee.getParameters(y,U.state,K,N,B),ve=Ee.getProgramCacheKey(ge),Oe=k.programs;k.environment=y.isMeshStandardMaterial?N.environment:null,k.fog=N.fog,k.envMap=(y.isMeshStandardMaterial?O:x).get(y.envMap||k.environment),k.envMapRotation=k.environment!==null&&y.envMap===null?N.environmentRotation:y.envMapRotation,Oe===void 0&&(y.addEventListener("dispose",He),Oe=new Map,k.programs=Oe);let Be=Oe.get(ve);if(Be!==void 0){if(k.currentProgram===Be&&k.lightsStateVersion===le)return Dh(y,ge),Be}else ge.uniforms=Ee.getUniforms(y),y.onBeforeCompile(ge,b),Be=Ee.acquireProgram(ge,ve),Oe.set(ve,Be),k.uniforms=ge.uniforms;let Ae=k.uniforms;return(!y.isShaderMaterial&&!y.isRawShaderMaterial||y.clipping===!0)&&(Ae.clippingPlanes=Q.uniform),Dh(y,ge),k.needsLights=Lf(y),k.lightsStateVersion=le,k.needsLights&&(Ae.ambientLightColor.value=U.state.ambient,Ae.lightProbe.value=U.state.probe,Ae.directionalLights.value=U.state.directional,Ae.directionalLightShadows.value=U.state.directionalShadow,Ae.spotLights.value=U.state.spot,Ae.spotLightShadows.value=U.state.spotShadow,Ae.rectAreaLights.value=U.state.rectArea,Ae.ltc_1.value=U.state.rectAreaLTC1,Ae.ltc_2.value=U.state.rectAreaLTC2,Ae.pointLights.value=U.state.point,Ae.pointLightShadows.value=U.state.pointShadow,Ae.hemisphereLights.value=U.state.hemi,Ae.directionalShadowMap.value=U.state.directionalShadowMap,Ae.directionalShadowMatrix.value=U.state.directionalShadowMatrix,Ae.spotShadowMap.value=U.state.spotShadowMap,Ae.spotLightMatrix.value=U.state.spotLightMatrix,Ae.spotLightMap.value=U.state.spotLightMap,Ae.pointShadowMap.value=U.state.pointShadowMap,Ae.pointShadowMatrix.value=U.state.pointShadowMatrix),k.currentProgram=Be,k.uniformsList=null,Be}function Lh(y){if(y.uniformsList===null){let N=y.currentProgram.getUniforms();y.uniformsList=Gs.seqWithValue(N.seq,y.uniforms)}return y.uniformsList}function Dh(y,N){let B=Te.get(y);B.outputColorSpace=N.outputColorSpace,B.batching=N.batching,B.batchingColor=N.batchingColor,B.instancing=N.instancing,B.instancingColor=N.instancingColor,B.instancingMorph=N.instancingMorph,B.skinning=N.skinning,B.morphTargets=N.morphTargets,B.morphNormals=N.morphNormals,B.morphColors=N.morphColors,B.morphTargetsCount=N.morphTargetsCount,B.numClippingPlanes=N.numClippingPlanes,B.numIntersection=N.numClipIntersection,B.vertexAlphas=N.vertexAlphas,B.vertexTangents=N.vertexTangents,B.toneMapping=N.toneMapping}function Pf(y,N,B,k,U){N.isScene!==!0&&(N=dt),S.resetTextureUnits();let K=N.fog,le=k.isMeshStandardMaterial?N.environment:null,ge=L===null?b.outputColorSpace:L.isXRRenderTarget===!0?L.texture.colorSpace:ji,ve=(k.isMeshStandardMaterial?O:x).get(k.envMap||le),Oe=k.vertexColors===!0&&!!B.attributes.color&&B.attributes.color.itemSize===4,Be=!!B.attributes.tangent&&(!!k.normalMap||k.anisotropy>0),Ae=!!B.morphAttributes.position,tt=!!B.morphAttributes.normal,rt=!!B.morphAttributes.color,bt=jn;k.toneMapped&&(L===null||L.isXRRenderTarget===!0)&&(bt=b.toneMapping);let Mt=B.morphAttributes.position||B.morphAttributes.normal||B.morphAttributes.color,it=Mt!==void 0?Mt.length:0,Re=Te.get(k),Ct=f.state.lights;if(te===!0&&(be===!0||y!==v)){let kt=y===v&&k.id===M;Q.setState(k,y,kt)}let at=!1;k.version===Re.__version?(Re.needsLights&&Re.lightsStateVersion!==Ct.state.version||Re.outputColorSpace!==ge||U.isBatchedMesh&&Re.batching===!1||!U.isBatchedMesh&&Re.batching===!0||U.isBatchedMesh&&Re.batchingColor===!0&&U.colorTexture===null||U.isBatchedMesh&&Re.batchingColor===!1&&U.colorTexture!==null||U.isInstancedMesh&&Re.instancing===!1||!U.isInstancedMesh&&Re.instancing===!0||U.isSkinnedMesh&&Re.skinning===!1||!U.isSkinnedMesh&&Re.skinning===!0||U.isInstancedMesh&&Re.instancingColor===!0&&U.instanceColor===null||U.isInstancedMesh&&Re.instancingColor===!1&&U.instanceColor!==null||U.isInstancedMesh&&Re.instancingMorph===!0&&U.morphTexture===null||U.isInstancedMesh&&Re.instancingMorph===!1&&U.morphTexture!==null||Re.envMap!==ve||k.fog===!0&&Re.fog!==K||Re.numClippingPlanes!==void 0&&(Re.numClippingPlanes!==Q.numPlanes||Re.numIntersection!==Q.numIntersection)||Re.vertexAlphas!==Oe||Re.vertexTangents!==Be||Re.morphTargets!==Ae||Re.morphNormals!==tt||Re.morphColors!==rt||Re.toneMapping!==bt||Re.morphTargetsCount!==it)&&(at=!0):(at=!0,Re.__version=k.version);let pn=Re.currentProgram;at===!0&&(pn=ea(k,N,U));let hs=!1,$t=!1,Ys=!1,gt=pn.getUniforms(),tn=Re.uniforms;if(me.useProgram(pn.program)&&(hs=!0,$t=!0,Ys=!0),k.id!==M&&(M=k.id,$t=!0),hs||v!==y){me.buffers.depth.getReversed()?(ae.copy(y.projectionMatrix),Id(ae),Ld(ae),gt.setValue(w,"projectionMatrix",ae)):gt.setValue(w,"projectionMatrix",y.projectionMatrix),gt.setValue(w,"viewMatrix",y.matrixWorldInverse);let Gt=gt.map.cameraPosition;Gt!==void 0&&Gt.setValue(w,Ne.setFromMatrixPosition(y.matrixWorld)),Ie.logarithmicDepthBuffer&&gt.setValue(w,"logDepthBufFC",2/(Math.log(y.far+1)/Math.LN2)),(k.isMeshPhongMaterial||k.isMeshToonMaterial||k.isMeshLambertMaterial||k.isMeshBasicMaterial||k.isMeshStandardMaterial||k.isShaderMaterial)&&gt.setValue(w,"isOrthographic",y.isOrthographicCamera===!0),v!==y&&(v=y,$t=!0,Ys=!0)}if(U.isSkinnedMesh){gt.setOptional(w,U,"bindMatrix"),gt.setOptional(w,U,"bindMatrixInverse");let kt=U.skeleton;kt&&(kt.boneTexture===null&&kt.computeBoneTexture(),gt.setValue(w,"boneTexture",kt.boneTexture,S))}U.isBatchedMesh&&(gt.setOptional(w,U,"batchingTexture"),gt.setValue(w,"batchingTexture",U._matricesTexture,S),gt.setOptional(w,U,"batchingIdTexture"),gt.setValue(w,"batchingIdTexture",U._indirectTexture,S),gt.setOptional(w,U,"batchingColorTexture"),U._colorsTexture!==null&&gt.setValue(w,"batchingColorTexture",U._colorsTexture,S));let nn=B.morphAttributes;if((nn.position!==void 0||nn.normal!==void 0||nn.color!==void 0)&&Ue.update(U,B,pn),($t||Re.receiveShadow!==U.receiveShadow)&&(Re.receiveShadow=U.receiveShadow,gt.setValue(w,"receiveShadow",U.receiveShadow)),k.isMeshGouraudMaterial&&k.envMap!==null&&(tn.envMap.value=ve,tn.flipEnvMap.value=ve.isCubeTexture&&ve.isRenderTargetTexture===!1?-1:1),k.isMeshStandardMaterial&&k.envMap===null&&N.environment!==null&&(tn.envMapIntensity.value=N.environmentIntensity),$t&&(gt.setValue(w,"toneMappingExposure",b.toneMappingExposure),Re.needsLights&&If(tn,Ys),K&&k.fog===!0&&he.refreshFogUniforms(tn,K),he.refreshMaterialUniforms(tn,k,V,ee,f.state.transmissionRenderTarget[y.id]),Gs.upload(w,Lh(Re),tn,S)),k.isShaderMaterial&&k.uniformsNeedUpdate===!0&&(Gs.upload(w,Lh(Re),tn,S),k.uniformsNeedUpdate=!1),k.isSpriteMaterial&&gt.setValue(w,"center",U.center),gt.setValue(w,"modelViewMatrix",U.modelViewMatrix),gt.setValue(w,"normalMatrix",U.normalMatrix),gt.setValue(w,"modelMatrix",U.matrixWorld),k.isShaderMaterial||k.isRawShaderMaterial){let kt=k.uniformsGroups;for(let Gt=0,Pc=kt.length;Gt<Pc;Gt++){let Mi=kt[Gt];D.update(Mi,pn),D.bind(Mi,pn)}}return pn}function If(y,N){y.ambientLightColor.needsUpdate=N,y.lightProbe.needsUpdate=N,y.directionalLights.needsUpdate=N,y.directionalLightShadows.needsUpdate=N,y.pointLights.needsUpdate=N,y.pointLightShadows.needsUpdate=N,y.spotLights.needsUpdate=N,y.spotLightShadows.needsUpdate=N,y.rectAreaLights.needsUpdate=N,y.hemisphereLights.needsUpdate=N}function Lf(y){return y.isMeshLambertMaterial||y.isMeshToonMaterial||y.isMeshPhongMaterial||y.isMeshStandardMaterial||y.isShadowMaterial||y.isShaderMaterial&&y.lights===!0}this.getActiveCubeFace=function(){return R},this.getActiveMipmapLevel=function(){return C},this.getRenderTarget=function(){return L},this.setRenderTargetTextures=function(y,N,B){Te.get(y.texture).__webglTexture=N,Te.get(y.depthTexture).__webglTexture=B;let k=Te.get(y);k.__hasExternalTextures=!0,k.__autoAllocateDepthBuffer=B===void 0,k.__autoAllocateDepthBuffer||we.has("WEBGL_multisampled_render_to_texture")===!0&&(console.warn("THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided"),k.__useRenderToTexture=!1)},this.setRenderTargetFramebuffer=function(y,N){let B=Te.get(y);B.__webglFramebuffer=N,B.__useDefaultFramebuffer=N===void 0},this.setRenderTarget=function(y,N=0,B=0){L=y,R=N,C=B;let k=!0,U=null,K=!1,le=!1;if(y){let ve=Te.get(y);if(ve.__useDefaultFramebuffer!==void 0)me.bindFramebuffer(w.FRAMEBUFFER,null),k=!1;else if(ve.__webglFramebuffer===void 0)S.setupRenderTarget(y);else if(ve.__hasExternalTextures)S.rebindTextures(y,Te.get(y.texture).__webglTexture,Te.get(y.depthTexture).__webglTexture);else if(y.depthBuffer){let Ae=y.depthTexture;if(ve.__boundDepthTexture!==Ae){if(Ae!==null&&Te.has(Ae)&&(y.width!==Ae.image.width||y.height!==Ae.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");S.setupDepthRenderbuffer(y)}}let Oe=y.texture;(Oe.isData3DTexture||Oe.isDataArrayTexture||Oe.isCompressedArrayTexture)&&(le=!0);let Be=Te.get(y).__webglFramebuffer;y.isWebGLCubeRenderTarget?(Array.isArray(Be[N])?U=Be[N][B]:U=Be[N],K=!0):y.samples>0&&S.useMultisampledRTT(y)===!1?U=Te.get(y).__webglMultisampledFramebuffer:Array.isArray(Be)?U=Be[B]:U=Be,I.copy(y.viewport),z.copy(y.scissor),F=y.scissorTest}else I.copy(Se).multiplyScalar(V).floor(),z.copy($e).multiplyScalar(V).floor(),F=st;if(me.bindFramebuffer(w.FRAMEBUFFER,U)&&k&&me.drawBuffers(y,U),me.viewport(I),me.scissor(z),me.setScissorTest(F),K){let ve=Te.get(y.texture);w.framebufferTexture2D(w.FRAMEBUFFER,w.COLOR_ATTACHMENT0,w.TEXTURE_CUBE_MAP_POSITIVE_X+N,ve.__webglTexture,B)}else if(le){let ve=Te.get(y.texture),Oe=N||0;w.framebufferTextureLayer(w.FRAMEBUFFER,w.COLOR_ATTACHMENT0,ve.__webglTexture,B||0,Oe)}M=-1},this.readRenderTargetPixels=function(y,N,B,k,U,K,le){if(!(y&&y.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let ge=Te.get(y).__webglFramebuffer;if(y.isWebGLCubeRenderTarget&&le!==void 0&&(ge=ge[le]),ge){me.bindFramebuffer(w.FRAMEBUFFER,ge);try{let ve=y.texture,Oe=ve.format,Be=ve.type;if(!Ie.textureFormatReadable(Oe)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!Ie.textureTypeReadable(Be)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}N>=0&&N<=y.width-k&&B>=0&&B<=y.height-U&&w.readPixels(N,B,k,U,Xe.convert(Oe),Xe.convert(Be),K)}finally{let ve=L!==null?Te.get(L).__webglFramebuffer:null;me.bindFramebuffer(w.FRAMEBUFFER,ve)}}},this.readRenderTargetPixelsAsync=async function(y,N,B,k,U,K,le){if(!(y&&y.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let ge=Te.get(y).__webglFramebuffer;if(y.isWebGLCubeRenderTarget&&le!==void 0&&(ge=ge[le]),ge){let ve=y.texture,Oe=ve.format,Be=ve.type;if(!Ie.textureFormatReadable(Oe))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!Ie.textureTypeReadable(Be))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");if(N>=0&&N<=y.width-k&&B>=0&&B<=y.height-U){me.bindFramebuffer(w.FRAMEBUFFER,ge);let Ae=w.createBuffer();w.bindBuffer(w.PIXEL_PACK_BUFFER,Ae),w.bufferData(w.PIXEL_PACK_BUFFER,K.byteLength,w.STREAM_READ),w.readPixels(N,B,k,U,Xe.convert(Oe),Xe.convert(Be),0);let tt=L!==null?Te.get(L).__webglFramebuffer:null;me.bindFramebuffer(w.FRAMEBUFFER,tt);let rt=w.fenceSync(w.SYNC_GPU_COMMANDS_COMPLETE,0);return w.flush(),await Pd(w,rt,4),w.bindBuffer(w.PIXEL_PACK_BUFFER,Ae),w.getBufferSubData(w.PIXEL_PACK_BUFFER,0,K),w.deleteBuffer(Ae),w.deleteSync(rt),K}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")}},this.copyFramebufferToTexture=function(y,N=null,B=0){y.isTexture!==!0&&(ss("WebGLRenderer: copyFramebufferToTexture function signature has changed."),N=arguments[0]||null,y=arguments[1]);let k=Math.pow(2,-B),U=Math.floor(y.image.width*k),K=Math.floor(y.image.height*k),le=N!==null?N.x:0,ge=N!==null?N.y:0;S.setTexture2D(y,0),w.copyTexSubImage2D(w.TEXTURE_2D,B,0,0,le,ge,U,K),me.unbindTexture()};let Df=w.createFramebuffer(),Nf=w.createFramebuffer();this.copyTextureToTexture=function(y,N,B=null,k=null,U=0,K=null){y.isTexture!==!0&&(ss("WebGLRenderer: copyTextureToTexture function signature has changed."),k=arguments[0]||null,y=arguments[1],N=arguments[2],K=arguments[3]||0,B=null),K===null&&(U!==0?(ss("WebGLRenderer: copyTextureToTexture function signature has changed to support src and dst mipmap levels."),K=U,U=0):K=0);let le,ge,ve,Oe,Be,Ae,tt,rt,bt,Mt=y.isCompressedTexture?y.mipmaps[K]:y.image;if(B!==null)le=B.max.x-B.min.x,ge=B.max.y-B.min.y,ve=B.isBox3?B.max.z-B.min.z:1,Oe=B.min.x,Be=B.min.y,Ae=B.isBox3?B.min.z:0;else{let nn=Math.pow(2,-U);le=Math.floor(Mt.width*nn),ge=Math.floor(Mt.height*nn),y.isDataArrayTexture?ve=Mt.depth:y.isData3DTexture?ve=Math.floor(Mt.depth*nn):ve=1,Oe=0,Be=0,Ae=0}k!==null?(tt=k.x,rt=k.y,bt=k.z):(tt=0,rt=0,bt=0);let it=Xe.convert(N.format),Re=Xe.convert(N.type),Ct;N.isData3DTexture?(S.setTexture3D(N,0),Ct=w.TEXTURE_3D):N.isDataArrayTexture||N.isCompressedArrayTexture?(S.setTexture2DArray(N,0),Ct=w.TEXTURE_2D_ARRAY):(S.setTexture2D(N,0),Ct=w.TEXTURE_2D),w.pixelStorei(w.UNPACK_FLIP_Y_WEBGL,N.flipY),w.pixelStorei(w.UNPACK_PREMULTIPLY_ALPHA_WEBGL,N.premultiplyAlpha),w.pixelStorei(w.UNPACK_ALIGNMENT,N.unpackAlignment);let at=w.getParameter(w.UNPACK_ROW_LENGTH),pn=w.getParameter(w.UNPACK_IMAGE_HEIGHT),hs=w.getParameter(w.UNPACK_SKIP_PIXELS),$t=w.getParameter(w.UNPACK_SKIP_ROWS),Ys=w.getParameter(w.UNPACK_SKIP_IMAGES);w.pixelStorei(w.UNPACK_ROW_LENGTH,Mt.width),w.pixelStorei(w.UNPACK_IMAGE_HEIGHT,Mt.height),w.pixelStorei(w.UNPACK_SKIP_PIXELS,Oe),w.pixelStorei(w.UNPACK_SKIP_ROWS,Be),w.pixelStorei(w.UNPACK_SKIP_IMAGES,Ae);let gt=y.isDataArrayTexture||y.isData3DTexture,tn=N.isDataArrayTexture||N.isData3DTexture;if(y.isDepthTexture){let nn=Te.get(y),kt=Te.get(N),Gt=Te.get(nn.__renderTarget),Pc=Te.get(kt.__renderTarget);me.bindFramebuffer(w.READ_FRAMEBUFFER,Gt.__webglFramebuffer),me.bindFramebuffer(w.DRAW_FRAMEBUFFER,Pc.__webglFramebuffer);for(let Mi=0;Mi<ve;Mi++)gt&&(w.framebufferTextureLayer(w.READ_FRAMEBUFFER,w.COLOR_ATTACHMENT0,Te.get(y).__webglTexture,U,Ae+Mi),w.framebufferTextureLayer(w.DRAW_FRAMEBUFFER,w.COLOR_ATTACHMENT0,Te.get(N).__webglTexture,K,bt+Mi)),w.blitFramebuffer(Oe,Be,le,ge,tt,rt,le,ge,w.DEPTH_BUFFER_BIT,w.NEAREST);me.bindFramebuffer(w.READ_FRAMEBUFFER,null),me.bindFramebuffer(w.DRAW_FRAMEBUFFER,null)}else if(U!==0||y.isRenderTargetTexture||Te.has(y)){let nn=Te.get(y),kt=Te.get(N);me.bindFramebuffer(w.READ_FRAMEBUFFER,Df),me.bindFramebuffer(w.DRAW_FRAMEBUFFER,Nf);for(let Gt=0;Gt<ve;Gt++)gt?w.framebufferTextureLayer(w.READ_FRAMEBUFFER,w.COLOR_ATTACHMENT0,nn.__webglTexture,U,Ae+Gt):w.framebufferTexture2D(w.READ_FRAMEBUFFER,w.COLOR_ATTACHMENT0,w.TEXTURE_2D,nn.__webglTexture,U),tn?w.framebufferTextureLayer(w.DRAW_FRAMEBUFFER,w.COLOR_ATTACHMENT0,kt.__webglTexture,K,bt+Gt):w.framebufferTexture2D(w.DRAW_FRAMEBUFFER,w.COLOR_ATTACHMENT0,w.TEXTURE_2D,kt.__webglTexture,K),U!==0?w.blitFramebuffer(Oe,Be,le,ge,tt,rt,le,ge,w.COLOR_BUFFER_BIT,w.NEAREST):tn?w.copyTexSubImage3D(Ct,K,tt,rt,bt+Gt,Oe,Be,le,ge):w.copyTexSubImage2D(Ct,K,tt,rt,Oe,Be,le,ge);me.bindFramebuffer(w.READ_FRAMEBUFFER,null),me.bindFramebuffer(w.DRAW_FRAMEBUFFER,null)}else tn?y.isDataTexture||y.isData3DTexture?w.texSubImage3D(Ct,K,tt,rt,bt,le,ge,ve,it,Re,Mt.data):N.isCompressedArrayTexture?w.compressedTexSubImage3D(Ct,K,tt,rt,bt,le,ge,ve,it,Mt.data):w.texSubImage3D(Ct,K,tt,rt,bt,le,ge,ve,it,Re,Mt):y.isDataTexture?w.texSubImage2D(w.TEXTURE_2D,K,tt,rt,le,ge,it,Re,Mt.data):y.isCompressedTexture?w.compressedTexSubImage2D(w.TEXTURE_2D,K,tt,rt,Mt.width,Mt.height,it,Mt.data):w.texSubImage2D(w.TEXTURE_2D,K,tt,rt,le,ge,it,Re,Mt);w.pixelStorei(w.UNPACK_ROW_LENGTH,at),w.pixelStorei(w.UNPACK_IMAGE_HEIGHT,pn),w.pixelStorei(w.UNPACK_SKIP_PIXELS,hs),w.pixelStorei(w.UNPACK_SKIP_ROWS,$t),w.pixelStorei(w.UNPACK_SKIP_IMAGES,Ys),K===0&&N.generateMipmaps&&w.generateMipmap(Ct),me.unbindTexture()},this.copyTextureToTexture3D=function(y,N,B=null,k=null,U=0){return y.isTexture!==!0&&(ss("WebGLRenderer: copyTextureToTexture3D function signature has changed."),B=arguments[0]||null,k=arguments[1]||null,y=arguments[2],N=arguments[3],U=arguments[4]||0),ss('WebGLRenderer: copyTextureToTexture3D function has been deprecated. Use "copyTextureToTexture" instead.'),this.copyTextureToTexture(y,N,B,k,U)},this.initRenderTarget=function(y){Te.get(y).__webglFramebuffer===void 0&&S.setupRenderTarget(y)},this.initTexture=function(y){y.isCubeTexture?S.setTextureCube(y,0):y.isData3DTexture?S.setTexture3D(y,0):y.isDataArrayTexture||y.isCompressedArrayTexture?S.setTexture2DArray(y,0):S.setTexture2D(y,0),me.unbindTexture()},this.resetState=function(){R=0,C=0,L=null,me.reset(),ft.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Tn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorspace=nt._getDrawingBufferColorSpace(e),t.unpackColorSpace=nt._getUnpackColorSpace()}}});function Jy(i){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(i.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.domElement.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(i)&&(this._addPointer(i),i.pointerType==="touch"?this._onTouchStart(i):this._onMouseDown(i)))}function Ky(i){this.enabled!==!1&&(i.pointerType==="touch"?this._onTouchMove(i):this._onMouseMove(i))}function Qy(i){switch(this._removePointer(i),this._pointers.length){case 0:this.domElement.releasePointerCapture(i.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(ff),this.state=ht.NONE;break;case 1:let e=this._pointers[0],t=this._pointerPositions[e];this._onTouchStart({pointerId:e,pageX:t.x,pageY:t.y});break}}function ev(i){let e;switch(i.button){case 0:e=this.mouseButtons.LEFT;break;case 1:e=this.mouseButtons.MIDDLE;break;case 2:e=this.mouseButtons.RIGHT;break;default:e=-1}switch(e){case pi.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(i),this.state=ht.DOLLY;break;case pi.ROTATE:if(i.ctrlKey||i.metaKey||i.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(i),this.state=ht.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(i),this.state=ht.ROTATE}break;case pi.PAN:if(i.ctrlKey||i.metaKey||i.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(i),this.state=ht.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(i),this.state=ht.PAN}break;default:this.state=ht.NONE}this.state!==ht.NONE&&this.dispatchEvent(_h)}function tv(i){switch(this.state){case ht.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(i);break;case ht.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(i);break;case ht.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(i);break}}function nv(i){this.enabled===!1||this.enableZoom===!1||this.state!==ht.NONE||(i.preventDefault(),this.dispatchEvent(_h),this._handleMouseWheel(this._customWheelEvent(i)),this.dispatchEvent(ff))}function iv(i){this.enabled!==!1&&this._handleKeyDown(i)}function sv(i){switch(this._trackPointer(i),this._pointers.length){case 1:switch(this.touches.ONE){case mi.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(i),this.state=ht.TOUCH_ROTATE;break;case mi.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(i),this.state=ht.TOUCH_PAN;break;default:this.state=ht.NONE}break;case 2:switch(this.touches.TWO){case mi.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(i),this.state=ht.TOUCH_DOLLY_PAN;break;case mi.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(i),this.state=ht.TOUCH_DOLLY_ROTATE;break;default:this.state=ht.NONE}break;default:this.state=ht.NONE}this.state!==ht.NONE&&this.dispatchEvent(_h)}function rv(i){switch(this._trackPointer(i),this.state){case ht.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(i),this.update();break;case ht.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(i),this.update();break;case ht.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(i),this.update();break;case ht.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(i),this.update();break;default:this.state=ht.NONE}}function av(i){this.enabled!==!1&&i.preventDefault()}function ov(i){i.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function cv(i){i.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}var uf,_h,ff,_c,df,jy,At,Zt,ht,gh,xc,pf=lt(()=>{xi();uf={type:"change"},_h={type:"start"},ff={type:"end"},_c=new Ki,df=new cn,jy=Math.cos(70*Yt.DEG2RAD),At=new A,Zt=2*Math.PI,ht={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},gh=1e-6,xc=class extends kr{constructor(e,t=null){super(e,t),this.state=ht.NONE,this.enabled=!0,this.target=new A,this.cursor=new A,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:pi.ROTATE,MIDDLE:pi.DOLLY,RIGHT:pi.PAN},this.touches={ONE:mi.ROTATE,TWO:mi.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._domElementKeyEvents=null,this._lastPosition=new A,this._lastQuaternion=new xt,this._lastTargetPosition=new A,this._quat=new xt().setFromUnitVectors(e.up,new A(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new Fs,this._sphericalDelta=new Fs,this._scale=1,this._panOffset=new A,this._rotateStart=new oe,this._rotateEnd=new oe,this._rotateDelta=new oe,this._panStart=new oe,this._panEnd=new oe,this._panDelta=new oe,this._dollyStart=new oe,this._dollyEnd=new oe,this._dollyDelta=new oe,this._dollyDirection=new A,this._mouse=new oe,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=Ky.bind(this),this._onPointerDown=Jy.bind(this),this._onPointerUp=Qy.bind(this),this._onContextMenu=av.bind(this),this._onMouseWheel=nv.bind(this),this._onKeyDown=iv.bind(this),this._onTouchStart=sv.bind(this),this._onTouchMove=rv.bind(this),this._onMouseDown=ev.bind(this),this._onMouseMove=tv.bind(this),this._interceptControlDown=ov.bind(this),this._interceptControlUp=cv.bind(this),this.domElement!==null&&this.connect(),this.update()}connect(){this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.getRootNode().removeEventListener("keydown",this._interceptControlDown,{capture:!0}),this.domElement.style.touchAction="auto"}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(e){e.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=e}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(uf),this.update(),this.state=ht.NONE}update(e=null){let t=this.object.position;At.copy(t).sub(this.target),At.applyQuaternion(this._quat),this._spherical.setFromVector3(At),this.autoRotate&&this.state===ht.NONE&&this._rotateLeft(this._getAutoRotationAngle(e)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,s=this.maxAzimuthAngle;isFinite(n)&&isFinite(s)&&(n<-Math.PI?n+=Zt:n>Math.PI&&(n-=Zt),s<-Math.PI?s+=Zt:s>Math.PI&&(s-=Zt),n<=s?this._spherical.theta=Math.max(n,Math.min(s,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+s)/2?Math.max(n,this._spherical.theta):Math.min(s,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let r=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let a=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),r=a!=this._spherical.radius}if(At.setFromSpherical(this._spherical),At.applyQuaternion(this._quatInverse),t.copy(this.target).add(At),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let a=null;if(this.object.isPerspectiveCamera){let o=At.length();a=this._clampDistance(o*this._scale);let c=o-a;this.object.position.addScaledVector(this._dollyDirection,c),this.object.updateMatrixWorld(),r=!!c}else if(this.object.isOrthographicCamera){let o=new A(this._mouse.x,this._mouse.y,0);o.unproject(this.object);let c=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),r=c!==this.object.zoom;let l=new A(this._mouse.x,this._mouse.y,0);l.unproject(this.object),this.object.position.sub(l).add(o),this.object.updateMatrixWorld(),a=At.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;a!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(a).add(this.object.position):(_c.origin.copy(this.object.position),_c.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(_c.direction))<jy?this.object.lookAt(this.target):(df.setFromNormalAndCoplanarPoint(this.object.up,this.target),_c.intersectPlane(df,this.target))))}else if(this.object.isOrthographicCamera){let a=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),a!==this.object.zoom&&(this.object.updateProjectionMatrix(),r=!0)}return this._scale=1,this._performCursorZoom=!1,r||this._lastPosition.distanceToSquared(this.object.position)>gh||8*(1-this._lastQuaternion.dot(this.object.quaternion))>gh||this._lastTargetPosition.distanceToSquared(this.target)>gh?(this.dispatchEvent(uf),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(e){return e!==null?Zt/60*this.autoRotateSpeed*e:Zt/60/60*this.autoRotateSpeed}_getZoomScale(e){let t=Math.abs(e*.01);return Math.pow(.95,this.zoomSpeed*t)}_rotateLeft(e){this._sphericalDelta.theta-=e}_rotateUp(e){this._sphericalDelta.phi-=e}_panLeft(e,t){At.setFromMatrixColumn(t,0),At.multiplyScalar(-e),this._panOffset.add(At)}_panUp(e,t){this.screenSpacePanning===!0?At.setFromMatrixColumn(t,1):(At.setFromMatrixColumn(t,0),At.crossVectors(this.object.up,At)),At.multiplyScalar(e),this._panOffset.add(At)}_pan(e,t){let n=this.domElement;if(this.object.isPerspectiveCamera){let s=this.object.position;At.copy(s).sub(this.target);let r=At.length();r*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*e*r/n.clientHeight,this.object.matrix),this._panUp(2*t*r/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(e*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(t*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(e){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=e:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(e,t){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let n=this.domElement.getBoundingClientRect(),s=e-n.left,r=t-n.top,a=n.width,o=n.height;this._mouse.x=s/a*2-1,this._mouse.y=-(r/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(e){return Math.max(this.minDistance,Math.min(this.maxDistance,e))}_handleMouseDownRotate(e){this._rotateStart.set(e.clientX,e.clientY)}_handleMouseDownDolly(e){this._updateZoomParameters(e.clientX,e.clientX),this._dollyStart.set(e.clientX,e.clientY)}_handleMouseDownPan(e){this._panStart.set(e.clientX,e.clientY)}_handleMouseMoveRotate(e){this._rotateEnd.set(e.clientX,e.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(Zt*this._rotateDelta.x/t.clientHeight),this._rotateUp(Zt*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(e){this._dollyEnd.set(e.clientX,e.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(e){this._panEnd.set(e.clientX,e.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(e){this._updateZoomParameters(e.clientX,e.clientY),e.deltaY<0?this._dollyIn(this._getZoomScale(e.deltaY)):e.deltaY>0&&this._dollyOut(this._getZoomScale(e.deltaY)),this.update()}_handleKeyDown(e){let t=!1;switch(e.code){case this.keys.UP:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(Zt*this.rotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),t=!0;break;case this.keys.BOTTOM:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateUp(-Zt*this.rotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),t=!0;break;case this.keys.LEFT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(Zt*this.rotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),t=!0;break;case this.keys.RIGHT:e.ctrlKey||e.metaKey||e.shiftKey?this.enableRotate&&this._rotateLeft(-Zt*this.rotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),t=!0;break}t&&(e.preventDefault(),this.update())}_handleTouchStartRotate(e){if(this._pointers.length===1)this._rotateStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),s=.5*(e.pageY+t.y);this._rotateStart.set(n,s)}}_handleTouchStartPan(e){if(this._pointers.length===1)this._panStart.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),s=.5*(e.pageY+t.y);this._panStart.set(n,s)}}_handleTouchStartDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,s=e.pageY-t.y,r=Math.sqrt(n*n+s*s);this._dollyStart.set(0,r)}_handleTouchStartDollyPan(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enablePan&&this._handleTouchStartPan(e)}_handleTouchStartDollyRotate(e){this.enableZoom&&this._handleTouchStartDolly(e),this.enableRotate&&this._handleTouchStartRotate(e)}_handleTouchMoveRotate(e){if(this._pointers.length==1)this._rotateEnd.set(e.pageX,e.pageY);else{let n=this._getSecondPointerPosition(e),s=.5*(e.pageX+n.x),r=.5*(e.pageY+n.y);this._rotateEnd.set(s,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let t=this.domElement;this._rotateLeft(Zt*this._rotateDelta.x/t.clientHeight),this._rotateUp(Zt*this._rotateDelta.y/t.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(e){if(this._pointers.length===1)this._panEnd.set(e.pageX,e.pageY);else{let t=this._getSecondPointerPosition(e),n=.5*(e.pageX+t.x),s=.5*(e.pageY+t.y);this._panEnd.set(n,s)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(e){let t=this._getSecondPointerPosition(e),n=e.pageX-t.x,s=e.pageY-t.y,r=Math.sqrt(n*n+s*s);this._dollyEnd.set(0,r),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let a=(e.pageX+t.x)*.5,o=(e.pageY+t.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enablePan&&this._handleTouchMovePan(e)}_handleTouchMoveDollyRotate(e){this.enableZoom&&this._handleTouchMoveDolly(e),this.enableRotate&&this._handleTouchMoveRotate(e)}_addPointer(e){this._pointers.push(e.pointerId)}_removePointer(e){delete this._pointerPositions[e.pointerId];for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId){this._pointers.splice(t,1);return}}_isTrackingPointer(e){for(let t=0;t<this._pointers.length;t++)if(this._pointers[t]==e.pointerId)return!0;return!1}_trackPointer(e){let t=this._pointerPositions[e.pointerId];t===void 0&&(t=new oe,this._pointerPositions[e.pointerId]=t),t.set(e.pageX,e.pageY)}_getSecondPointerPosition(e){let t=e.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[t]}_customWheelEvent(e){let t=e.deltaMode,n={clientX:e.clientX,clientY:e.clientY,deltaY:e.deltaY};switch(t){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100;break}return e.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}}});function _f(i){return/^(thumb|index|middle|ring|pinky)_/.test(i)}function vc(i){let e=i??new Rn({color:13029080,roughness:.42,metalness:0,flatShading:!1}),t=new hn;t.name="posecode-mannequin";let n=new Map;for(let s of mf){let r=new Et;r.name=s.id;let a=new A(...s.offset);if(_f(s.id)&&a.multiplyScalar(gf),r.position.copy(a),((s.parent?n.get(s.parent):t)??t).add(r),n.set(s.id,r),s.parent&&s.radius){let c=xf(a.length(),s.radius,e);yf(c,a),n.get(s.parent).add(c)}}for(let s of mf){if(!_f(s.id)||!s.radius)continue;let a=new A(...s.offset).clone().multiplyScalar(1-gf),o=xf(a.length(),s.radius*.92,e);yf(o,a),n.get(s.id).add(o)}return yc(n.get("head"),.12,e),lv(n.get("head")),yc(n.get("wrist_left"),.05,e),yc(n.get("wrist_right"),.05,e),vf(n.get("ankle_left"),e),vf(n.get("ankle_right"),e),yc(n.get("pelvis"),.13,e),{root:t,bones:n,effectors:{hands:["wrist_left","wrist_right"],feet:["ankle_left","ankle_right"]}}}function xf(i,e,t){let n=Math.max(.001,i-e*2),s=new Pr(e,n,4,10);return new ut(s,t)}function yf(i,e){let t=e.clone().normalize(),n=new A(0,1,0);i.quaternion.setFromUnitVectors(n,t),i.position.copy(e.clone().multiplyScalar(.5))}function yc(i,e,t){let n=new Os(e/2,12,10);i.add(new ut(n,t))}function lv(i){let e=new Rn({color:3752526,roughness:.6}),t=new hn;t.name="face";let n=new ut(new Lr(.013,.035,10),e);n.rotation.x=Math.PI/2,n.position.set(0,-.004,.064),t.add(n);for(let s of[-1,1]){let r=new ut(new Os(.0095,10,8),e);r.position.set(s*.024,.016,.054),t.add(r)}i.add(t)}function vf(i,e){let t=new vn(.07,.04,.16),n=new ut(t,e);n.position.set(0,-.02,.05),i.add(n)}var mf,gf,xh=lt(()=>{"use strict";xi();mf=[{id:"pelvis",parent:null,offset:[0,.95,0]},{id:"spine",parent:"pelvis",offset:[0,.14,0],radius:.09},{id:"chest",parent:"spine",offset:[0,.18,0],radius:.1},{id:"neck",parent:"chest",offset:[0,.16,0],radius:.05},{id:"head",parent:"neck",offset:[0,.1,0],radius:.045},{id:"shoulder_left",parent:"chest",offset:[.18,.12,0],radius:.045},{id:"elbow_left",parent:"shoulder_left",offset:[0,-.28,0],radius:.04},{id:"wrist_left",parent:"elbow_left",offset:[0,-.26,0],radius:.035},{id:"shoulder_right",parent:"chest",offset:[-.18,.12,0],radius:.045},{id:"elbow_right",parent:"shoulder_right",offset:[0,-.28,0],radius:.04},{id:"wrist_right",parent:"elbow_right",offset:[0,-.26,0],radius:.035},{id:"hip_left",parent:"pelvis",offset:[.1,-.06,0],radius:.06},{id:"knee_left",parent:"hip_left",offset:[0,-.45,0],radius:.05},{id:"ankle_left",parent:"knee_left",offset:[0,-.43,0],radius:.04},{id:"hip_right",parent:"pelvis",offset:[-.1,-.06,0],radius:.06},{id:"knee_right",parent:"hip_right",offset:[0,-.45,0],radius:.05},{id:"ankle_right",parent:"knee_right",offset:[0,-.43,0],radius:.04},{id:"thumb_left",parent:"wrist_left",offset:[.035,-.04,.025],radius:.014},{id:"index_left",parent:"wrist_left",offset:[.025,-.085,.012],radius:.013},{id:"middle_left",parent:"wrist_left",offset:[.008,-.092,.012],radius:.013},{id:"ring_left",parent:"wrist_left",offset:[-.01,-.088,.012],radius:.013},{id:"pinky_left",parent:"wrist_left",offset:[-.028,-.075,.012],radius:.012},{id:"thumb_right",parent:"wrist_right",offset:[-.035,-.04,.025],radius:.014},{id:"index_right",parent:"wrist_right",offset:[-.025,-.085,.012],radius:.013},{id:"middle_right",parent:"wrist_right",offset:[-.008,-.092,.012],radius:.013},{id:"ring_right",parent:"wrist_right",offset:[.01,-.088,.012],radius:.013},{id:"pinky_right",parent:"wrist_right",offset:[.028,-.075,.012],radius:.012}],gf=.55});function Mc(i){i.root.updateMatrixWorld(!0);let e=new Ft().setFromObject(i.root);Number.isFinite(e.min.y)&&(i.root.position.y-=e.min.y,i.root.updateMatrixWorld(!0))}function uv(i,e){let t=new Set;for(let n of e)for(let s of i.effectors[n]??[])t.add(s);return[...t]}function yh(i,e){let t=new A,n=0;for(let s of e){let r=i.bones.get(s);r&&(t.add(r.getWorldPosition(new A)),n++)}return n>0?t.multiplyScalar(1/n):t}function vh(i,e,t){let n=new xt().setFromAxisAngle(hv,t);i.root.position.sub(e).applyQuaternion(n).add(e),i.root.quaternion.premultiply(n),i.root.updateMatrixWorld(!0)}function bc(i,e){if(e.length===0)return;let t=uv(i,e),n=t.filter(r=>r.startsWith("wrist")),s=t.filter(r=>r.startsWith("ankle"));if(n.length>0&&s.length>0){let r=yh(i,s);for(let o=0;o<8;o++){let c=yh(i,n).y;if(Math.abs(c)<.004)break;vh(i,r,.01);let l=yh(i,n).y;vh(i,r,-.01);let h=(l-c)/.01;if(Math.abs(h)<1e-4)break;vh(i,r,Yt.clamp(-c/h,-.35,.35))}i.root.updateMatrixWorld(!0);let a=new Ft().setFromObject(i.root);a.min.y<0&&(i.root.position.y-=a.min.y,i.root.updateMatrixWorld(!0));return}if(s.length>0){let r=1/0;for(let a of s){let o=i.bones.get(a);if(!o)continue;let c=new Ft().setFromObject(o);Number.isFinite(c.min.y)&&(r=Math.min(r,c.min.y))}Number.isFinite(r)&&(i.root.position.y-=r,i.root.updateMatrixWorld(!0))}}var hv,Mh=lt(()=>{"use strict";xi();hv=new A(1,0,0)});function Mf(i){return i?_v[i]??Sc:Sc}var Sc,dv,fv,pv,mv,gv,_v,bf=lt(()=>{"use strict";Sc={root:{position:[0,0,0],rotationDeg:[0,0,0]},joints:{}},dv={root:{position:[0,.6,0],rotationDeg:[72,0,0]},joints:{shoulder_left:[-90,0,0],shoulder_right:[-90,0,0],ankle_left:[-25,0,0],ankle_right:[-25,0,0]}},fv=Sc,pv={root:{position:[0,.5,0],rotationDeg:[-90,0,0]},joints:{}},mv={root:{position:[0,.5,0],rotationDeg:[90,0,0]},joints:{}},gv={root:{position:[0,.5,0],rotationDeg:[0,0,0]},joints:{hip_left:[-90,0,0],hip_right:[-90,0,0]}},_v={neutral:Sc,standing:fv,plank:dv,supine:pv,prone:mv,seated:gv}});function Sf([i,e,t]){return new xt().setFromEuler(new It(i*$r,e*$r,t*$r,"XYZ"))}function Ec(i){let e=Mf(i.startPose),t=new Map(Object.entries(e.joints??{})),n=new Map(t),s=0,r={x:0,z:0},a=0,o=[];o.push({time:0,name:i.startPose??"start",easing:"linear",quats:bh(n),groundLock:[],reaches:[],pins:[],yaw:0,pos:{x:0,z:0}});let c=0;for(let g of i.phases){for(let _ of g.targets)n.set(_.boneId,[_.euler.x,_.euler.y,_.euler.z]);g.turnDeg!==void 0&&(s=g.turnDeg),g.travel&&(r={x:g.travel.x,z:g.travel.z}),a=Math.max(a,Math.hypot(r.x,r.z)),c+=g.durationSec,o.push({time:c,name:g.name,...g.cue?{cue:g.cue}:{},easing:g.easing,quats:bh(n),groundLock:g.groundLock,reaches:g.reaches,pins:g.pins,yaw:s*$r,pos:{...r}})}let l=i.phases[0]?.durationSec??1,h=Math.round(s/360)*360*$r;c+=l,o.push({time:c,name:"reset",easing:"ease-in-out",quats:bh(new Map(t)),groundLock:[],reaches:[],pins:[],yaw:h,pos:{x:0,z:0}});let u=[...new Set(o.flatMap(g=>[...g.quats.keys()]))];for(let g of o)for(let _ of u)g.quats.has(_)||g.quats.set(_,new xt);let d=c,p=[];for(let g=1;g<o.length-1;g++){let _=o[g];p.push({name:_.name,start:o[g-1].time,end:_.time,..._.cue?{cue:_.cue}:{}})}return{duration:d,repeat:i.repeat,basePose:e,bonesUsed:u,segments:p,travelExtent:a,sample(g,_){let m=d>0?(g%d+d)%d:0,f=o[0],T=o[o.length-1];for(let L=0;L<o.length-1;L++)if(m>=o[L].time&&m<o[L+1].time){f=o[L],T=o[L+1];break}let E=Math.max(1e-6,T.time-f.time),b=Yt.clamp((m-f.time)/E,0,1),P=xv[T.easing](b);for(let L of u){let M=_.get(L);M&&M.quaternion.slerpQuaternions(f.quats.get(L),T.quats.get(L),P)}let R=f.yaw+(T.yaw-f.yaw)*P,C={x:f.pos.x+(T.pos.x-f.pos.x)*P,z:f.pos.z+(T.pos.z-f.pos.z)*P};return{phaseName:T.name,...T.cue?{cue:T.cue}:{},groundLock:T.groundLock,reaches:T.reaches,pins:T.pins,rootYaw:R,rootOffset:C}}}}function bh(i){let e=new Map;for(let[n,s]of i)e.set(n,Sf(s));let t=i.get("pelvis")?.[0]??0;if(t!==0)for(let n of["hip_left","hip_right"]){let[s,r,a]=i.get(n)??[0,0,0];e.set(n,Sf([s-t,r,a]))}return e}var $r,xv,Sh=lt(()=>{"use strict";xi();bf();$r=Math.PI/180;xv={linear:i=>i,"ease-in":i=>i*i,"ease-out":i=>1-(1-i)*(1-i),"ease-in-out":i=>i*i*(3-2*i)}});function Tc(i,e=10,t=1e-4){let{joints:n,effector:s,target:r}=i,a=Mv(n[0]??s);for(let o=0;o<e;o++){for(let c=n.length-1;c>=0;c--){let l=n[c];if(l.getWorldPosition(Eh),s.getWorldPosition(qs),jr.subVectors(qs,Eh),Jr.subVectors(r,Eh),jr.lengthSq()<1e-8||Jr.lengthSq()<1e-8)continue;jr.normalize(),Jr.normalize();let h=Yt.clamp(jr.dot(Jr),-1,1),u=Math.acos(h);if(u<1e-5||(Kr.crossVectors(jr,Jr),Kr.lengthSq()<1e-8))continue;Kr.normalize(),yv.setFromAxisAngle(Kr,u),l.parent?.getWorldQuaternion(Ef);let d=Kr.clone().applyQuaternion(Ef.clone().invert()),p=new xt().setFromAxisAngle(d,u);l.quaternion.premultiply(p),vv(l,i.limits?.[c]),l.updateMatrixWorld(!0)}if(s.getWorldPosition(qs),qs.distanceToSquared(r)<t)break}return a.updateMatrixWorld(!0),s.getWorldPosition(qs),qs.distanceToSquared(r)}function vv(i,e){if(!e)return;Kn.setFromQuaternion(i.quaternion,"XYZ");let t=Yt.clamp(Kn.x,e.x[0],e.x[1]),n=Yt.clamp(Kn.y,e.y[0],e.y[1]),s=Yt.clamp(Kn.z,e.z[0],e.z[1]);t===Kn.x&&n===Kn.y&&s===Kn.z||(Kn.set(t,n,s,"XYZ"),i.quaternion.setFromEuler(Kn))}function Mv(i){let e=i;for(;e.parent;)e=e.parent;return e}var Eh,qs,jr,Jr,Kr,yv,Ef,Kn,Th=lt(()=>{"use strict";xi();Eh=new A,qs=new A,jr=new A,Jr=new A,Kr=new A,yv=new xt,Ef=new xt,Kn=new It});function Rc(i,e){let t=new hn;t.name="posecode-props";let n=new Map,s=e??new Rn({color:7041664,roughness:.8,metalness:.05});for(let r of i)if(r==="chair"){let o=wc(.42,.06,.42,s);o.position.set(0,.5,-.16);let c=wc(.42,.5,.06,s);c.position.set(0,.5+.28,-.34),t.add(o,c,Ac(s,.18,-0),Ac(s,-.18,-0),Ac(s,.18,-.32),Ac(s,-.18,-.32)),n.set("seat",new A(0,.5+.03,-.12))}else if(r==="bar"){let o=new ut(new Zn(.025,.025,1.2,12),s);o.rotation.z=Math.PI/2,o.position.set(0,2.3,0),t.add(o);for(let c of[-.55,.55]){let l=new ut(new Zn(.03,.03,2.3,10),s);l.position.set(c,2.3/2,0),t.add(l)}n.set("bar",new A(0,2.3,0))}else if(r==="wall"){let a=wc(2.2,2.6,.1,s);a.position.set(0,1.3,-.34),t.add(a),n.set("wall",new A(0,.9,-.29))}else if(r==="dip-bars"){for(let c of[-.22,.22]){let l=new ut(new Zn(.022,.022,.9,12),s);l.rotation.x=Math.PI/2,l.position.set(c,1.1,0),t.add(l);for(let h of[-.35,.35]){let u=new ut(new Zn(.026,.026,1.1,10),s);u.position.set(c,1.1/2,h),t.add(u)}}n.set("bars",new A(0,1.1,0))}else if(r==="box"){let o=wc(.5,.3,.42,s);o.position.set(0,.3/2,.32),t.add(o),n.set("box",new A(0,.3,.3))}return{group:t,anchors:n}}function wc(i,e,t,n){return new ut(new vn(i,e,t),n)}function Ac(i,e,t){let n=new ut(new vn(.05,.5,.05),i);return n.position.set(e,.25,t),n}var wh=lt(()=>{"use strict";xi()});var wf={};Lc(wf,{applyGroundLock:()=>bc,buildMannequin:()=>vc,buildProps:()=>Rc,buildTimeline:()=>Ec,createViewer:()=>bv,groundFigure:()=>Mc,solveCCD:()=>Tc});function bv(i,e={}){let t=new mc({canvas:i,antialias:!0});t.setPixelRatio(Math.min(window.devicePixelRatio,2)),t.shadowMap.enabled=!0,t.shadowMap.type=Mo,t.outputColorSpace=Vt,t.toneMapping=Co,t.toneMappingExposure=1.05;let n=new Sr;n.background=new We(790293),n.fog=new br(790293,9,18);let s=new Ot(42,1,.1,100);s.position.set(2.6,1.6,3.4);let r=new xc(s,i);r.target.set(0,.9,0),r.enableDamping=!0,r.dampingFactor=.08,r.minDistance=1.2,r.maxDistance=9,r.maxPolarAngle=Math.PI*.92,r.autoRotate=e.autoRotate??!0,r.autoRotateSpeed=.5;let a=new Or(14674431,2106412,.85);n.add(a);let o=new es(16774374,2);o.position.set(3.5,6,4),o.castShadow=!0,o.shadow.mapSize.set(2048,2048),o.shadow.camera.near=.5,o.shadow.camera.far=22,o.shadow.camera.left=-3,o.shadow.camera.right=3,o.shadow.camera.top=3,o.shadow.camera.bottom=-3,o.shadow.bias=-4e-4,o.shadow.radius=4,n.add(o);let c=new es(10467583,.5);c.position.set(-4,2.5,-2),n.add(c);let l=new es(16777215,.7);l.position.set(-1,3,-5),n.add(l);let h=new ut(new Ir(8,64),new Rn({color:1316895,roughness:.95,metalness:0}));h.rotation.x=-Math.PI/2,h.receiveShadow=!0,n.add(h);let u=new Br(12,24,2830909,1777703);u.material.transparent=!0,u.material.opacity=.5,u.position.y=.001,n.add(u);let d=vc();Tf(d.root),n.add(d.root);let p=null,g=new Map,_=new Map,m=null,f=new A,T=new xt,E=0,b=1,P=!1,R=!0,C=()=>{},L=()=>{},M=()=>{},v="",I=new A(0,.9,0),z=s.position.clone(),F=!1;function G(){let ne=i.clientWidth||1,w=i.clientHeight||1;(i.width!==ne||i.height!==w)&&(t.setSize(ne,w,!1),s.aspect=ne/w,s.updateProjectionMatrix())}function $(){let ne=d.root,w=p?.basePose.root;ne.position.set(...w?.position??[0,0,0]);let[Fe,we,Ie]=w?.rotationDeg??[0,0,0];ne.rotation.set(Fe*Nn,we*Nn,Ie*Nn),ne.updateMatrixWorld(!0)}function W(){g=new Map;for(let ne of Object.values(d.effectors))for(let w of ne){let Fe=d.bones.get(w);Fe&&g.set(w,Fe.getWorldPosition(new A))}}let ee=new A(0,1,0),V=new xt,re={hand_left:"wrist_left",hand_right:"wrist_right",foot_left:"ankle_left",foot_right:"ankle_right"};function pe(ne){let w=ne.endsWith("_left")?"left":"right",Fe=ne.startsWith("wrist")?[`shoulder_${w}`,`elbow_${w}`]:ne.startsWith("ankle")?[`hip_${w}`,`knee_${w}`]:[],we=[],Ie=[];for(let me of Fe){let Ke=d.bones.get(me);Ke&&(we.push(Ke),Ie.push($e(me,Ke)))}return{joints:we,limits:Ie}}let Se=new It;function $e(ne,w){let Fe=Wc(ne);return Fe?(Se.setFromQuaternion(w.quaternion,"XYZ"),{x:st(Fe.x.min*Nn,Fe.x.max*Nn,Se.x),y:st(Fe.y.min*Nn,Fe.y.max*Nn,Se.y),z:st(Fe.z.min*Nn,Fe.z.max*Nn,Se.z)}):null}function st(ne,w,Fe){return[Math.min(ne,Fe),Math.max(w,Fe)]}function X(ne,w){if(ne==="floor"){let Ie=w.getWorldPosition(new A);return Ie.y=0,Ie}let Fe=_.get(ne);if(Fe)return Fe.clone();let we=d.bones.get(ne);return we?we.getWorldPosition(new A):null}function te(ne){for(let w of ne){let Fe=re[w.effector]??w.effector,we=d.bones.get(Fe);if(!we)continue;let Ie=X(w.target,we);if(!Ie)continue;let{joints:me,limits:Ke}=pe(Fe);me.length!==0&&Tc({joints:me,limits:Ke,effector:we,target:Ie},12)}}function be(ne){if(ne.length===0)return;let w=new A,Fe=0;for(let we of ne){let Ie=re[we.effector]??we.effector,me=d.bones.get(Ie);if(!me)continue;let Ke=X(we.anchor,me);Ke&&(w.add(Ke.sub(me.getWorldPosition(new A))),Fe++)}Fe>0&&(d.root.position.add(w.multiplyScalar(1/Fe)),d.root.updateMatrixWorld(!0))}function ae(){let ne=new Ft().setFromObject(d.root);if(m&&ne.union(new Ft().setFromObject(m.group)),ne.isEmpty())return;let w=ne.getCenter(new A),Fe=ne.getSize(new A),we=p?.travelExtent??0,Ie=Math.max(Fe.x,Fe.y,Fe.z,1.8)*.5+we,me=Ie/Math.sin(s.fov*Nn/2)*1.15+.3;I.copy(w),I.y=Math.max(w.y,.55),z.set(w.x+me*.55,Math.max(w.y+Ie*.5,1),w.z+me),F=!0}function Pe(){if(p){let ne=p.sample(E,d.bones);d.root.position.copy(f),d.root.quaternion.copy(T),ne.rootYaw!==0&&(V.setFromAxisAngle(ee,ne.rootYaw),d.root.quaternion.premultiply(V)),d.root.position.x+=ne.rootOffset.x,d.root.position.z+=ne.rootOffset.z,d.root.updateMatrixWorld(!0),bc(d,ne.groundLock),be(ne.pins),d.root.updateMatrixWorld(!0);let w=new Ft().setFromObject(d.root);w.min.y<0&&(d.root.position.y-=w.min.y,d.root.updateMatrixWorld(!0)),te(ne.reaches),ne.phaseName!==v&&(v=ne.phaseName,C({phaseName:ne.phaseName,...ne.cue?{cue:ne.cue}:{}}))}F&&(r.target.lerp(I,.07),s.position.lerp(z,.07),s.position.distanceToSquared(z)<1e-4&&(F=!1)),G(),r.update(),t.render(n,s)}let Ne=0,ke=performance.now();function dt(ne){let w=Math.min(.05,(ne-ke)/1e3);ke=ne,P&&p&&(E+=w*b,E>=p.duration&&(R?(E%=p.duration,M()):(E=p.duration,P=!1)),L(E,p.duration)),Pe(),Ne=requestAnimationFrame(dt)}return Ne=requestAnimationFrame(dt),{load(ne){p=Ec(ne),E=0,v="",m&&(n.remove(m.group),Sv(m.group)),m=ne.props.length>0?Rc(ne.props):null,_=m?.anchors??new Map,m&&(Tf(m.group),n.add(m.group));for(let w of d.bones.values())w.quaternion.identity();$(),p.sample(0,d.bones),d.root.updateMatrixWorld(!0),Mc(d),W(),f.copy(d.root.position),T.copy(d.root.quaternion),ae()},play(){P=!0,ke=performance.now()},pause(){P=!1},toggle(){return P=!P,ke=performance.now(),P},seek(ne){p&&(E=Yt.clamp(ne,0,p.duration))},setSpeed(ne){b=Math.max(.1,ne)},setLoop(ne){R=ne},get playing(){return P},get duration(){return p?.duration??0},get time(){return E},getTimeline(){return p?{duration:p.duration,repeat:p.repeat,segments:p.segments}:null},captureFrame(){return Pe(),t.domElement.toDataURL("image/png")},onPhase(ne){C=ne},onTick(ne){L=ne},onLoop(ne){M=ne},dispose(){cancelAnimationFrame(Ne),r.dispose(),t.dispose()}}}function Tf(i){i.traverse(e=>{e.isMesh&&(e.castShadow=!0,e.receiveShadow=!0)})}function Sv(i){i.traverse(e=>{let t=e;if(t.isMesh){t.geometry?.dispose();let n=t.material;Array.isArray(n)?n.forEach(s=>s.dispose()):n?.dispose()}})}var Nn,Af=lt(()=>{"use strict";xi();pf();Yc();xh();Mh();Sh();Th();wh();xh();Mh();Sh();Th();wh();Nn=Math.PI/180});var Av={};Lc(Av,{DEFAULT_OPTIONS:()=>zi,PosecodePlayerElement:()=>yi,definePosecodePlayer:()=>Cf,parseOptions:()=>ma,resolveSource:()=>ga,version:()=>wv});Yc();var mm=/^[A-Za-z0-9_-]+$/;function pu(i){if(typeof i!="string"||i.length===0)throw new TypeError("encodePosecode: source must be a non-empty string");if(i.length>8e3)throw new RangeError(`encodePosecode: document is ${i.length} chars, over the 8000 limit for a shareable link`);return xm(gm(i))}function mu(i){if(typeof i!="string"||!mm.test(i))throw new TypeError("decodePosecode: token is not a valid base64url string");return _m(ym(i))}var er="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";function gm(i){let e=[];for(let t=0;t<i.length;t++){let n=i.charCodeAt(t);if(n>=55296&&n<=56319&&t+1<i.length){let s=i.charCodeAt(t+1);s>=56320&&s<=57343&&(n=65536+(n-55296<<10)+(s-56320),t++)}n<128?e.push(n):n<2048?e.push(192|n>>6,128|n&63):n<65536?e.push(224|n>>12,128|n>>6&63,128|n&63):e.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|n&63)}return e}function _m(i){let e="",t=0;for(;t<i.length;){let n=i[t++],s;n<128?s=n:(n&224)===192?s=(n&31)<<6|i[t++]&63:(n&240)===224?s=(n&15)<<12|(i[t++]&63)<<6|i[t++]&63:s=(n&7)<<18|(i[t++]&63)<<12|(i[t++]&63)<<6|i[t++]&63,s>65535?(s-=65536,e+=String.fromCharCode(55296+(s>>10),56320+(s&1023))):e+=String.fromCharCode(s)}return e}function xm(i){let e="";for(let t=0;t<i.length;t+=3){let n=t+1<i.length,s=t+2<i.length,r=i[t],a=n?i[t+1]:0,o=s?i[t+2]:0;e+=er[r>>2],e+=er[(r&3)<<4|a>>4],n&&(e+=er[(a&15)<<2|o>>6]),s&&(e+=er[o&63])}return e}function ym(i){let e=[],t=0,n=0;for(let s=0;s<i.length;s++){let r=er.indexOf(i[s]);if(r<0)throw new Error("decodePosecode: token contains a non-base64url character");t=t<<6|r,n+=6,n>=8&&(n-=8,e.push(t>>n&255))}return e}var zi={autoplay:!0,loop:!0,controls:!0,autoRotate:!0,speed:1},vm=.1,Mm=4,bm=new Set(["false","0","no","off"]);function pa(i,e){return i==null?e:!bm.has(i.trim().toLowerCase())}function Sm(i,e,t){return Math.min(t,Math.max(e,i))}function ma(i){let e=i.speed!=null?Number(i.speed):NaN;return{autoplay:pa(i.autoplay,zi.autoplay),loop:pa(i.loop,zi.loop),controls:pa(i.controls,zi.controls),autoRotate:pa(i.autorotate,zi.autoRotate),speed:Number.isFinite(e)?Sm(e,vm,Mm):zi.speed}}async function ga(i,e=globalThis.fetch){let t=i.doc?.trim();if(t)try{return{ok:!0,source:mu(t)}}catch{return{ok:!1,error:"Could not decode the movement token."}}let n=i.src?.trim();if(n){if(!e)return{ok:!1,error:"No fetch available to load the src URL."};try{let r=await e(n);if(!r.ok)return{ok:!1,error:`Could not load ${n} (HTTP ${r.status}).`};let a=await r.text();return gu(a)}catch{return{ok:!1,error:`Could not fetch ${n}.`}}}let s=i.text?.trim();return s?gu(s):{ok:!1,error:"No movement to render \u2014 set a doc token, a src URL, or inline text."}}function gu(i){return i.length>8e3?{ok:!1,error:"Movement source is too large to render."}:{ok:!0,source:i}}var _u=`
  :host {
    display: block;
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    min-height: 220px;
    border-radius: 12px;
    overflow: hidden;
    background: #0c0f15;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #e7ecf3;
  }
  :host([hidden]) { display: none; }
  canvas { display: block; width: 100%; height: 100%; }

  .bar {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: linear-gradient(to top, rgba(6, 8, 12, 0.85), transparent);
    opacity: 0;
    transition: opacity 0.18s ease;
    pointer-events: none;
  }
  :host(:hover) .bar, .bar.pinned { opacity: 1; pointer-events: auto; }

  button.play {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px; height: 34px;
    border: none;
    border-radius: 999px;
    background: #c6f24e;
    color: #0c0f15;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
  }
  button.play:focus-visible { outline: 2px solid #c6f24e; outline-offset: 2px; }

  .phase {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #c6f24e;
  }

  .link {
    font-size: 11px;
    color: #9aa4b2;
    text-decoration: none;
  }
  .link:hover { color: #e7ecf3; }

  .msg {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    text-align: center;
    font-size: 13px;
    line-height: 1.4;
    color: #9aa4b2;
  }
  .msg code { color: #e7ecf3; font-family: ui-monospace, monospace; }
  .msg.error { color: #ff9d9d; }
`;var Rf="\u25B6",Ev="\u275A\u275A",Tv="https://posecode.org/play",yi=class extends HTMLElement{static tagName="posecode-player";#t=null;#n=null;#a=!1;#s;#o;#e;#r;#i="";constructor(){super(),this.#s=this.attachShadow({mode:"open"})}connectedCallback(){this.#i=this.textContent??"",this.#p(),this.#f()?(this.#n=new IntersectionObserver(e=>{e.some(t=>t.isIntersecting)&&this.#h()}),this.#n.observe(this)):this.#h()}#f(){if(typeof IntersectionObserver!="function")return!1;let e=window.innerHeight||document.documentElement.clientHeight||0,t=window.innerWidth||document.documentElement.clientWidth||0;if(!e||!t)return!1;let n=this.getBoundingClientRect();return n.top>e||n.bottom<0||n.left>t||n.right<0}disconnectedCallback(){this.#n?.disconnect(),this.#n=null,this.#t?.dispose(),this.#t=null,this.#a=!1}get viewer(){return this.#t}toggle(){if(!this.#t)return;let e=this.#t.toggle();this.#u(e)}#c(){return ma({autoplay:this.getAttribute("autoplay"),loop:this.getAttribute("loop"),controls:this.getAttribute("controls"),autorotate:this.getAttribute("autorotate"),speed:this.getAttribute("speed")})}#p(){let e=this.#c(),t=document.createElement("style");t.textContent=_u,this.#o=document.createElement("canvas"),this.#e=document.createElement("button"),this.#e.className="play",this.#e.textContent=Rf,this.#e.setAttribute("aria-label","Play or pause"),this.#e.addEventListener("click",()=>this.toggle()),this.#r=document.createElement("span"),this.#r.className="phase";let n=document.createElement("a");n.className="link",n.target="_blank",n.rel="noopener",n.textContent="Edit \u2197",n.href=this.#l();let s=document.createElement("div");s.className=(e.controls,"bar"),e.controls||(s.style.display="none"),s.append(this.#e,this.#r,n),this.#s.replaceChildren(t,this.#o,s)}#l(){let e=this.getAttribute("playground")??Tv;if(!this.#i.trim())return e;try{return`${e}#doc=${pu(this.#i.trim())}`}catch{return e}}async#h(){if(this.#a)return;this.#a=!0,this.#n?.disconnect();let e=await ga({doc:this.getAttribute("doc"),src:this.getAttribute("src"),text:this.#i});if(!e.ok)return this.#d(e.error,!0);this.#i=e.source;let{ir:t,errors:n}=fu(e.source);if(!t||n.length>0){let h=n[0]?`${n[0].message} (line ${n[0].line})`:"";return this.#d(`Couldn't parse this movement. ${h}`.trim(),!0)}let s=this.#c(),r=typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches,{createViewer:a}=await Promise.resolve().then(()=>(Af(),wf)),o=a(this.#o,{autoRotate:s.autoRotate&&!r});this.#t=o,o.onPhase(({phaseName:h})=>{this.#r.textContent=h==="reset"?"":h}),o.load(t),o.setLoop(s.loop),o.setSpeed(s.speed);let c=s.autoplay&&!r;c&&o.play(),this.#u(c);let l=this.#s.querySelector("a.link");l&&(l.href=this.#l()),this.dispatchEvent(new CustomEvent("posecode:ready",{bubbles:!0}))}#u(e){this.#e.textContent=e?Ev:Rf}#d(e,t){let n=document.createElement("div");n.className=t?"msg error":"msg",n.textContent=e,this.#s.append(n),t&&this.dispatchEvent(new CustomEvent("posecode:error",{bubbles:!0,detail:{error:e}}))}};var wv="0.1.0";function Cf(){typeof customElements>"u"||customElements.get(yi.tagName)||customElements.define(yi.tagName,yi)}Cf();return kf(Av);})();
/*! Bundled license information:

three/build/three.core.js:
  (**
   * @license
   * Copyright 2010-2024 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)

three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2024 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)
*/
