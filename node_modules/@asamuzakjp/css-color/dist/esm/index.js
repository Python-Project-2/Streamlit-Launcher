import { SyntaxFlag as e, color as t } from "@csstools/css-color-parser";
import { isCommentNode as n, isFunctionNode as r, isWhitespaceNode as i, parseComponentValue as a, parseListOfComponentValues as o } from "@csstools/css-parser-algorithms";
import { TokenType as s, tokenize as c } from "@csstools/css-tokenizer";
import { LRUCache as l } from "lru-cache";
import { calc as u } from "@csstools/css-calc";
//#region src/utils/cache.ts
var d = 4096, f = class {
	#e;
	constructor(e) {
		this.#e = e;
	}
	get item() {
		return this.#e;
	}
}, p = new l({ max: d }), m = (e, t) => {
	e && (t instanceof f ? p.set(e, t) : p.set(e, new f(t)));
}, h = (e) => {
	if (!e) return !1;
	let t = p.get(e);
	return t !== void 0 && t;
}, g = (e) => {
	let t = Object.keys(e);
	if (t.length === 0) return "";
	t.sort();
	let n = "";
	for (let r of t) n += `${r}:${JSON.stringify(e[r])};`;
	return n;
}, _ = (e, t = {}) => {
	if (!e || t.customProperty && typeof t.customProperty.callback == "function" || t.dimension && typeof t.dimension.callback == "function") return "";
	let n = e.namespace || "", r = e.name || "", i = e.value || "";
	if (!n && !r && !i) return "";
	let a = `${n}:${r}:${i}`, o = [];
	for (let [e, n] of Object.entries(t)) e !== "customProperty" && e !== "dimension" && o.push(`${e}_${n}`);
	let s = t.customProperty ? g(t.customProperty) : "", c = t.dimension ? g(t.dimension) : "";
	return `${a}:${o.sort().join("|")}:${s}:${c}`;
}, v = (e) => typeof e == "string" || e instanceof String, y = (e) => v(e) || typeof e == "number", b = "(?:0|[1-9]\\d*)", x = "clamp|max|min|exp|hypot|log|pow|sqrt|abs|sign|mod|rem|round|a?(?:cos|sin|tan)|atan2", S = `calc|${x}`, C = `var|${S}`, w = "deg|g?rad|turn", T = "[cm]m|[dls]?v(?:[bhiw]|max|min)|in|p[ctx]|q|r?(?:[cl]h|cap|e[mx]|ic)", E = `[+-]?(?:${b}(?:\\.\\d*)?|\\.\\d+)(?:e-?${b})?`, D = `\\+?(?:${b}(?:\\.\\d*)?|\\.\\d+)(?:e-?${b})?`, O = "none", k = `${E}%`, A = `^(?:${S})\\(|(?<=[*\\/\\s\\(])(?:${S})\\(`, ee = `^(?:${x})\\($`, te = "^var\\(|(?<=[*\\/\\s\\(])var\\(", ne = `^(?:${C})\\(`, j = `(?:\\s*\\/\\s*(?:${E}|${k}|${O}))?`, re = `(?:\\s*,\\s*(?:${E}|${k}))?`, ie = "[a-z]+|#[\\da-f]{3}|#[\\da-f]{4}|#[\\da-f]{6}|#[\\da-f]{8}", ae = "(?:ok)?lch|hsl|hwb", oe = "(?:de|in)creasing|longer|shorter", se = `${E}(?:${w})?`, ce = `(?:${E}(?:${w})?|${O})`, le = `(?:${E}|${k}|${O})`, ue = "(?:ok)?l(?:ab|ch)|color|hsla?|hwb|rgba?", de = `(?:${ae})(?:\\s(?:${oe})\\shue)?`;
`${ae}${oe}`;
var fe = "(?:ok)?lab", pe = "(?:a98|prophoto)-rgb|display-p3|rec2020|srgb(?:-linear)?", me = "xyz(?:-d(?:50|65))?", he = `${fe}|${pe}|${me}`, ge = `${de}|${he}`, _e = "calc(", ve = `(?:${pe}|${me})(?:\\s+${le}){3}${j}`, ye = "^light-dark\\(", be = `^(?:${ue})\\(\\s*from\\s+|(?<=[\\s])(?:${ue})\\(\\s*from\\s+`, xe = `${ce}(?:\\s+${le}){2}${j}`, Se = `${se}(?:\\s*,\\s*${k}){2}${re}`, Ce = `(?:${le}\\s+){2}${ce}${j}`, we = `${le}(?:\\s+${le}){2}${j}`, Te = `${ie}|hsla?\\(\\s*${Se}\\s*\\)|rgba?\\(\\s*${`(?:${E}(?:\\s*,\\s*${E}){2}|${k}(?:\\s*,\\s*${k}){2})${re}`}\\s*\\)|(?:hsla?|hwb)\\(\\s*${xe}\\s*\\)|(?:(?:ok)?lab|rgba?)\\(\\s*${we}\\s*\\)|(?:ok)?lch\\(\\s*${Ce}\\s*\\)|color\\(\\s*${ve}\\s*\\)`, Ee = `(?:${Te})(?:\\s+${k})?`, De = `color-mix\\(\\s*in\\s+(?:${ge})\\s*,\\s*${Ee}\\s*,\\s*${Ee}\\s*\\)`;
`${ge}${Ee}${Ee}`;
var Oe = "(?:repeating-)?(?:conic|linear|radial)-gradient", M = "computedValue", N = "mixValue", ke = "specifiedValue", Ae = .5, je = 24389 / 27, Me = 12.92, P = .055, Ne = 1024, Pe = 65536, Fe = 2.4, Ie = .001, Le = "util", { CloseParen: Re, Comma: ze, Comment: Be, Delim: Ve, EOF: He, Function: Ue, OpenParen: We, Whitespace: Ge } = s;
RegExp(`^(${E})(${w})?$`);
var Ke = /^,$/, qe = /--[\w-]+/g, Je = /^\/$/, Ye = /^\s+$/, Xe = /* @__PURE__ */ new Map([
	["xx-small", 9 / 16],
	["x-small", 5 / 8],
	["small", 13 / 16],
	["medium", 1],
	["large", 9 / 8],
	["x-large", 3 / 2],
	["xx-large", 2],
	["xxx-large", 3]
]), Ze = /* @__PURE__ */ new Map([["smaller", 1 / 1.2], ["larger", 1.2]]), Qe = /* @__PURE__ */ new Map([
	["cm", 96 / 2.54],
	["mm", 96 / 25.4],
	["q", 96 / 101.6],
	["in", 96],
	["pc", 16],
	["pt", 96 / 72],
	["px", 1]
]), $e = /* @__PURE__ */ new Map([
	["rcap", 1],
	["rch", .5],
	["rem", 1],
	["rex", .5],
	["ric", 1],
	["rlh", 1.2]
]), et = (e = {}, t = !1) => {
	let { maxLength: n } = e, r = t ? Pe : Ne;
	return Number.isInteger(n) && n > 0 && n < r ? n : r;
}, F = (e, t = {}) => {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	let n = e.trim(), r = { ...t }, i = et(r, !0);
	if (!n || n.length > i) return [];
	let { delimiter: a = " ", preserveComment: o = !1 } = r, s = _({
		namespace: Le,
		name: "splitValue",
		value: n
	}, {
		delimiter: a,
		preserveComment: o
	}), l = h(s);
	if (l) return [...l.item];
	let u;
	switch (a) {
		case ",":
			u = Ke;
			break;
		case "/":
			u = Je;
			break;
		default: u = Ye;
	}
	let d = c({ css: n }), f = 0, p = "", g = [];
	for (let [e, t] of d) switch (e) {
		case ze:
		case Ve:
			f === 0 && u.test(t) ? (g.push(p.trim()), p = "") : p += t;
			break;
		case Be:
			o && (a === "," || a === "/") && (p += t);
			break;
		case Ue:
		case We:
			p += t, f++;
			break;
		case Re:
			p += t, f--;
			break;
		case Ge:
			u.test(t) ? f === 0 ? p &&= (g.push(p.trim()), "") : p += " " : p.endsWith(" ") || (p += " ");
			break;
		default: e === He ? (g.push(p.trim()), p = "") : p += t;
	}
	return m(s, g), [...g];
}, tt = (e) => {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	let t = e.trim();
	if (!t) return [];
	let n = _({
		namespace: Le,
		name: "extractDashedIdent",
		value: t
	}), r = h(n);
	if (r) return [...r.item];
	let i = t.match(qe), a = i ? [...new Set(i)] : [];
	return m(n, a), [...a];
}, I = (e, t = 0) => {
	if (!Number.isFinite(e)) throw TypeError(`${e} is not a finite number.`);
	if (!Number.isFinite(t)) throw TypeError(`${t} is not a finite number.`);
	if (t < 0 || t > 16) throw RangeError(`${t} is not between 0 and 16.`);
	if (t === 0) return Math.round(e);
	let n = t === 16 ? 6 : t < 10 ? 4 : 5;
	return parseFloat(e.toPrecision(n));
}, nt = (e, t, n = "shorter") => {
	if (!Number.isFinite(e)) throw TypeError(`${e} is not a finite number.`);
	if (!Number.isFinite(t)) throw TypeError(`${t} is not a finite number.`);
	let r = e, i = t;
	switch (n) {
		case "decreasing":
			i > r && (r += 360);
			break;
		case "increasing":
			i < r && (i += 360);
			break;
		case "longer":
			i > r && i < r + 180 ? r += 360 : i > r - 180 && i <= r && (i += 360);
			break;
		default: i > r + 180 ? r += 360 : i < r - 180 && (i += 360);
	}
	return [r, i];
}, rt = (e, t, n = {}) => {
	let { dimension: r = {} } = n, { callback: i, em: a, rem: o, vh: s, vw: c } = r;
	if (v(e)) {
		let t = e.toLowerCase().trim(), r = et(n);
		if (t.length > r) return NaN;
		let i = Xe.get(t);
		if (i !== void 0 && typeof o == "number") return i * o;
		let s = Ze.get(t);
		return s !== void 0 && typeof a == "number" ? s * a : NaN;
	}
	if (Number.isFinite(e) && t) {
		let n = t.toLowerCase();
		if (Object.hasOwn(r, n)) {
			let t = r[n];
			return typeof t == "number" ? e * t : NaN;
		}
		if (typeof i == "function") {
			let t = i(n);
			return typeof t == "number" ? e * t : NaN;
		}
		let l = Qe.get(n);
		if (l !== void 0) return e * l;
		let u = $e.get(n);
		if (u !== void 0 && typeof o == "number") return e * u * o;
		let d = $e.get(`r${n}`);
		if (d !== void 0 && typeof a == "number") return e * d * a;
		switch (n) {
			case "vb": return typeof s == "number" ? e * s : NaN;
			case "vi": return typeof c == "number" ? e * c : NaN;
			case "vmax": return typeof s == "number" && typeof c == "number" ? e * Math.max(s, c) : NaN;
			case "vmin": return typeof s == "number" && typeof c == "number" ? e * Math.min(s, c) : NaN;
		}
	}
	return NaN;
}, it = (e) => {
	if (!Number.isFinite(e)) throw TypeError(`${e} is not a number.`);
	let t = Math.round(e);
	if (t < 0 || t > 255) throw RangeError(`${t} is not between 0 and 255.`);
	let n = t.toString(16);
	return n.length === 1 ? `0${n}` : n;
}, L = (e = "") => {
	if (!v(e)) return 1;
	let t = e.trim();
	if (!t) return 1;
	if (t === "none") return 0;
	let n;
	if (n = t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t), !Number.isFinite(n)) throw TypeError(`${n} is not a finite number.`);
	return n < .001 ? 0 : n > 1 ? 1 : parseFloat(n.toFixed(3));
}, at = (e) => {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	let t = e.trim();
	if (!t) throw SyntaxError("Invalid property value: (empty string)");
	let n = parseInt(t, 16);
	if (n <= 0) return 0;
	if (n >= 255) return 1;
	let r = /* @__PURE__ */ new Map();
	for (let e = 1; e < 100; e++) r.set(Math.round(e * 255 / 100), e);
	return n = r.has(n) ? r.get(n) / 100 : Math.round(n / 255 / Ie) * Ie, parseFloat(n.toFixed(3));
}, R = (e) => {
	let n = c({ css: e });
	return t(a(n)) || null;
}, ot = (e, t, n = !1) => {
	if (t === "specifiedValue") return m(e, ""), "";
	if (n) return m(e, null), null;
	let r = [
		"rgb",
		0,
		0,
		0,
		0
	];
	return m(e, r), r;
}, z = (e, t = !1) => {
	switch (e) {
		case "hsl":
		case "hwb":
		case N: return null;
		case ke: return "";
		default: return t ? null : [
			"rgb",
			0,
			0,
			0,
			0
		];
	}
}, st = (e) => {
	let t = o(c({ css: e })), r = [];
	for (let e of t) !n(e) && !i(e) && r.push(e.toString().trim());
	return r;
}, ct = [
	.3457 / .3585,
	1,
	.2958 / .3585
], lt = [
	[
		.955473421488075,
		-.02309845494876471,
		.06325924320057072
	],
	[
		-.0283697093338637,
		1.0099953980813041,
		.021041441191917323
	],
	[
		.012314014864481998,
		-.020507649298898964,
		1.330365926242124
	]
], B = [
	[
		1.0479297925449969,
		.022946870601609652,
		-.05019226628920524
	],
	[
		.02962780877005599,
		.9904344267538799,
		-.017073799063418826
	],
	[
		-.009243040646204504,
		.015055191490298152,
		.7518742814281371
	]
], ut = [
	[
		506752 / 1228815,
		87881 / 245763,
		12673 / 70218
	],
	[
		87098 / 409605,
		175762 / 245763,
		12673 / 175545
	],
	[
		7918 / 409605,
		87881 / 737289,
		1001167 / 1053270
	]
], dt = [
	[
		12831 / 3959,
		-329 / 214,
		-1974 / 3959
	],
	[
		-851781 / 878810,
		1648619 / 878810,
		36519 / 878810
	],
	[
		705 / 12673,
		-2585 / 12673,
		705 / 667
	]
], ft = [
	[
		.819022437996703,
		.3619062600528904,
		-.1288737815209879
	],
	[
		.0329836539323885,
		.9292868615863434,
		.0361446663506424
	],
	[
		.0481771893596242,
		.2642395317527308,
		.6335478284694309
	]
], pt = [
	[
		1.2268798758459243,
		-.5578149944602171,
		.2813910456659647
	],
	[
		-.0405757452148008,
		1.112286803280317,
		-.0717110580655164
	],
	[
		-.0763729366746601,
		-.4214933324022432,
		1.5869240198367816
	]
], mt = [
	[
		1,
		.3963377773761749,
		.2158037573099136
	],
	[
		1,
		-.1055613458156586,
		-.0638541728258133
	],
	[
		1,
		-.0894841775298119,
		-1.2914855480194092
	]
], ht = [
	[
		.210454268309314,
		.7936177747023054,
		-.0040720430116193
	],
	[
		1.9779985324311684,
		-2.42859224204858,
		.450593709617411
	],
	[
		.0259040424655478,
		.7827717124575296,
		-.8086757549230774
	]
], gt = [
	[
		608311 / 1250200,
		189793 / 714400,
		198249 / 1000160
	],
	[
		35783 / 156275,
		247089 / 357200,
		198249 / 2500400
	],
	[
		0,
		32229 / 714400,
		5220557 / 5000800
	]
], _t = [
	[
		63426534 / 99577255,
		20160776 / 139408157,
		47086771 / 278816314
	],
	[
		26158966 / 99577255,
		472592308 / 697040785,
		8267143 / 139408157
	],
	[
		0,
		19567812 / 697040785,
		295819943 / 278816314
	]
], vt = [
	[
		573536 / 994567,
		263643 / 1420810,
		187206 / 994567
	],
	[
		591459 / 1989134,
		6239551 / 9945670,
		374412 / 4972835
	],
	[
		53769 / 1989134,
		351524 / 4972835,
		4929758 / 4972835
	]
], yt = [
	[
		.7977666449006423,
		.13518129740053308,
		.0313477341283922
	],
	[
		.2880748288194013,
		.711835234241873,
		8993693872564e-17
	],
	[
		0,
		0,
		.8251046025104602
	]
], V = (e, t = {}) => {
	if (!Array.isArray(e)) throw TypeError(`${e} is not an array.`);
	let { alpha: n = !1, minLength: r = 3, maxLength: i = 4, minRange: a = 0, maxRange: o = 1, validateRange: s = !0 } = t;
	if (!Number.isFinite(r)) throw TypeError(`${r} is not a number.`);
	if (!Number.isFinite(i)) throw TypeError(`${i} is not a number.`);
	if (!Number.isFinite(a)) throw TypeError(`${a} is not a number.`);
	if (!Number.isFinite(o)) throw TypeError(`${o} is not a number.`);
	let c = e.length;
	if (c < r || c > i) throw Error(`Unexpected array length ${c}.`);
	let l = 0;
	for (; l < c;) {
		let t = e[l];
		if (!Number.isFinite(t)) throw TypeError(`${t} is not a number.`);
		if (l < 3 && s && (t < a || t > o)) throw RangeError(`${t} is not between ${a} and ${o}.`);
		if (l === 3 && (t < 0 || t > 1)) throw RangeError(`${t} is not between 0 and 1.`);
		l++;
	}
	return n && c === 3 && e.push(1), e;
}, bt = (e, t, n = !1) => {
	if (!Array.isArray(e)) throw TypeError(`${e} is not an array.`);
	if (e.length !== 4) throw Error(`Unexpected array length ${e.length}.`);
	if (!Array.isArray(t)) throw TypeError(`${t} is not an array.`);
	if (t.length !== 4) throw Error(`Unexpected array length ${t.length}.`);
	let r = 0;
	for (; r < 4;) e[r] === "none" && t[r] === "none" ? (e[r] = 0, t[r] = 0) : e[r] === "none" ? e[r] = t[r] : t[r] === "none" && (t[r] = e[r]), r++;
	return n ? [e, t] : [V(e, {
		minLength: 4,
		validateRange: !1
	}), V(t, {
		minLength: 4,
		validateRange: !1
	})];
}, H = (e, t, n = !1) => {
	if (!Array.isArray(e)) throw TypeError(`${e} is not an array.`);
	if (e.length !== 3) throw Error(`Unexpected array length ${e.length}.`);
	if (!n) for (let t of e) t = V(t, {
		maxLength: 3,
		validateRange: !1
	});
	let [[r, i, a], [o, s, c], [l, u, d]] = e, f, p, m;
	return n ? [f, p, m] = t : [f, p, m] = V(t, {
		maxLength: 3,
		validateRange: !1
	}), [
		r * f + i * p + a * m,
		o * f + s * p + c * m,
		l * f + u * p + d * m
	];
}, xt = (e, t = !1) => {
	let n, r, i;
	t ? [n, r, i] = e : [n, r, i] = V(e, {
		maxLength: 3,
		maxRange: 255
	});
	let a = n / 255, o = r / 255, s = i / 255, c = .04045;
	return a > c ? a = ((a + P) / (1 + P)) ** +Fe : a /= Me, o > c ? o = ((o + P) / (1 + P)) ** +Fe : o /= Me, s > c ? s = ((s + P) / (1 + P)) ** +Fe : s /= Me, [
		a,
		o,
		s
	];
}, St = (e, t = !1) => (t || (e = V(e, {
	maxLength: 3,
	maxRange: 255
})), e = xt(e, !0), H(ut, e, !0)), Ct = (e, t = !1) => {
	let [n, r, i] = V(e, { maxLength: 3 }), a = 809 / 258400;
	return n > a ? n = n ** (1 / Fe) * (1 + P) - P : n *= Me, n *= 255, r > a ? r = r ** (1 / Fe) * (1 + P) - P : r *= Me, r *= 255, i > a ? i = i ** (1 / Fe) * (1 + P) - P : i *= Me, i *= 255, [
		t ? Math.round(n) : n,
		t ? Math.round(r) : r,
		t ? Math.round(i) : i
	];
}, wt = (e, t = !1) => {
	t || (e = V(e, {
		maxLength: 3,
		validateRange: !1
	}));
	let [n, r, i] = H(dt, e, !0);
	return [n, r, i] = Ct([
		Math.min(Math.max(n, 0), 1),
		Math.min(Math.max(r, 0), 1),
		Math.min(Math.max(i, 0), 1)
	], !0), [
		n,
		r,
		i
	];
}, Tt = (e, t = !1) => {
	let [n, r, i] = wt(e, t), a = n / 255, o = r / 255, s = i / 255, c = Math.max(a, o, s), l = Math.min(a, o, s), u = c - l, d = (c + l) * Ae * 100, f, p;
	if (Math.round(d) === 0 || Math.round(d) === 100) f = 0, p = 0;
	else if (p = u / (1 - Math.abs(c + l - 1)) * 100, p === 0) f = 0;
	else {
		switch (c) {
			case a:
				f = (o - s) / u;
				break;
			case o:
				f = (s - a) / u + 2;
				break;
			case s:
			default: f = (a - o) / u + 4;
		}
		f = f * 60 % 360, f < 0 && (f += 360);
	}
	return [
		f,
		p,
		d
	];
}, Et = (e, t = !1) => {
	let [n, r, i] = wt(e, t), a = Math.min(n, r, i) / 255, o = 1 - Math.max(n, r, i) / 255, s;
	return a + o === 1 ? s = 0 : [s] = Tt(e), [
		s,
		a * 100,
		o * 100
	];
}, Dt = (e, t = !1) => {
	t || (e = V(e, {
		maxLength: 3,
		validateRange: !1
	}));
	let [n, r, i] = H(ht, H(ft, e, !0).map((e) => Math.cbrt(e)), !0);
	n = Math.min(Math.max(n, 0), 1);
	let a = Math.round(parseFloat(n.toFixed(4)) * 100);
	return (a === 0 || a === 100) && (r = 0, i = 0), [
		n,
		r,
		i
	];
}, Ot = (e, t = !1) => {
	let [n, r, i] = Dt(e, t), a, o, s = Math.round(parseFloat(n.toFixed(4)) * 100);
	return s === 0 || s === 100 ? (a = 0, o = 0) : (a = Math.max(Math.sqrt(r ** 2 + i ** 2), 0), parseFloat(a.toFixed(4)) === 0 ? o = 0 : (o = Math.atan2(i, r) * 180 / Math.PI, o < 0 && (o += 360))), [
		n,
		a,
		o
	];
}, kt = (e, t = !1) => (t || (e = V(e, {
	maxLength: 3,
	validateRange: !1
})), wt(H(lt, e, !0), !0)), At = (e, t = !1) => {
	t || (e = V(e, {
		maxLength: 3,
		validateRange: !1
	}));
	let [n, r, i] = e.map((e, t) => e / ct[t]).map((e) => e > .008856451679035631 ? Math.cbrt(e) : (je * e + 16) / 116), a = Math.min(Math.max(116 * r - 16, 0), 100), o, s;
	return a === 0 || a === 100 ? (o = 0, s = 0) : (o = (n - r) * 500, s = (r - i) * 200), [
		a,
		o,
		s
	];
}, jt = (e, t = !1) => {
	let [n, r, i] = At(e, t), a, o;
	return n === 0 || n === 100 ? (a = 0, o = 0) : (a = Math.max(Math.sqrt(r ** 2 + i ** 2), 0), o = Math.atan2(i, r) * 180 / Math.PI, o < 0 && (o += 360)), [
		n,
		a,
		o
	];
}, Mt = (e) => {
	let [t, n, r, i] = V(e, {
		alpha: !0,
		maxRange: 255
	}), a = it(t), o = it(n), s = it(r), c = it(i * 255);
	return c === "ff" ? `#${a}${o}${s}` : `#${a}${o}${s}${c}`;
}, Nt = (e) => {
	if (v(e)) e = e.toLowerCase().trim();
	else throw TypeError(`${e} is not a string.`);
	if (!(/^#[\da-f]{6}$/.test(e) || /^#[\da-f]{3}$/.test(e) || /^#[\da-f]{8}$/.test(e) || /^#[\da-f]{4}$/.test(e))) throw SyntaxError(`Invalid property value: ${e}`);
	let t = [];
	if (/^#[\da-f]{3}$/.test(e)) {
		let [, n, r, i] = e.match(/^#([\da-f])([\da-f])([\da-f])$/);
		t.push(parseInt(`${n}${n}`, 16), parseInt(`${r}${r}`, 16), parseInt(`${i}${i}`, 16), 1);
	} else if (/^#[\da-f]{4}$/.test(e)) {
		let [, n, r, i, a] = e.match(/^#([\da-f])([\da-f])([\da-f])([\da-f])$/);
		t.push(parseInt(`${n}${n}`, 16), parseInt(`${r}${r}`, 16), parseInt(`${i}${i}`, 16), at(`${a}${a}`));
	} else if (/^#[\da-f]{8}$/.test(e)) {
		let [, n, r, i, a] = e.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})$/);
		t.push(parseInt(n, 16), parseInt(r, 16), parseInt(i, 16), at(a));
	} else {
		let [, n, r, i] = e.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/);
		t.push(parseInt(n, 16), parseInt(r, 16), parseInt(i, 16), 1);
	}
	return t;
}, Pt = (e) => {
	let [t, n, r, i] = Nt(e), [a, o, s] = xt([
		t,
		n,
		r
	], !0);
	return [
		a,
		o,
		s,
		i
	];
}, Ft = (e) => {
	let [t, n, r, i] = Pt(e), [a, o, s] = H(ut, [
		t,
		n,
		r
	], !0);
	return [
		a,
		o,
		s,
		i
	];
}, { CloseParen: It, Comment: Lt, Delim: Rt, Dimension: zt, EOF: Bt, Function: Vt, Ident: Ht, Number: Ut, OpenParen: Wt, Whitespace: Gt } = s, Kt = "css-calc-var", qt = /* @__PURE__ */ new Set([
	"inherit",
	"initial",
	"revert",
	"revert-layer",
	"unset"
]), Jt = /* @__PURE__ */ new Set([
	"+",
	"-",
	"*",
	"/"
]), Yt = new RegExp(A), Xt = RegExp(`^calc\\((${E})\\)$`), Zt = new RegExp(ee), Qt = new RegExp(te), $t = new RegExp(ne), en = /\s[-+*/]\s/, tn = (e) => {
	if (typeof e == "number") return {
		num: e,
		unit: ""
	};
	if (!v(e)) return null;
	let t = c({ css: e }).filter(([e]) => e !== Gt && e !== Lt && e !== Bt);
	if (t.length !== 1) return null;
	let [n, r, , , i] = t[0];
	return n === Ut ? {
		num: Number(r),
		unit: ""
	} : n === zt && i ? {
		num: Number(i.value),
		unit: i.unit
	} : r.endsWith("%") ? {
		num: parseFloat(r),
		unit: "%"
	} : null;
}, nn = class {
	#e;
	#t;
	#n;
	#r;
	#i;
	#a;
	#o;
	#s;
	#c;
	#l;
	#u;
	#d;
	#f;
	#p;
	#m;
	#h;
	#g;
	constructor() {
		this.#e = !1, this.#t = [], this.#n = [], this.#r = !1, this.#i = [], this.#a = [], this.#o = !1, this.#s = [], this.#c = [], this.#l = [], this.#u = [], this.#d = !1, this.#f = [], this.#p = [], this.#m = [], this.#h = [], this.#g = { toCanonicalUnits: !0 };
	}
	get hasNum() {
		return this.#e;
	}
	set hasNum(e) {
		this.#e = !!e;
	}
	get numSum() {
		return this.#t;
	}
	get numMul() {
		return this.#n;
	}
	get hasPct() {
		return this.#r;
	}
	set hasPct(e) {
		this.#r = !!e;
	}
	get pctSum() {
		return this.#i;
	}
	get pctMul() {
		return this.#a;
	}
	get hasDim() {
		return this.#o;
	}
	set hasDim(e) {
		this.#o = !!e;
	}
	get dimSum() {
		return this.#s;
	}
	get dimSub() {
		return this.#c;
	}
	get dimMul() {
		return this.#l;
	}
	get dimDiv() {
		return this.#u;
	}
	get hasEtc() {
		return this.#d;
	}
	set hasEtc(e) {
		this.#d = !!e;
	}
	get etcSum() {
		return this.#f;
	}
	get etcSub() {
		return this.#p;
	}
	get etcMul() {
		return this.#m;
	}
	get etcDiv() {
		return this.#h;
	}
	clear() {
		this.#e = !1, this.#t.length = 0, this.#n.length = 0, this.#r = !1, this.#i.length = 0, this.#a.length = 0, this.#o = !1, this.#s.length = 0, this.#c.length = 0, this.#l.length = 0, this.#u.length = 0, this.#d = !1, this.#f.length = 0, this.#p.length = 0, this.#m.length = 0, this.#h.length = 0;
	}
	sort(e = []) {
		let t = [...e];
		return t.length > 1 && t.sort((e, t) => {
			let n = tn(e), r = tn(t);
			if (n && r && n.unit && r.unit) {
				let { num: e, unit: t } = n, { num: i, unit: a } = r;
				return t === a ? e === i ? 0 : e > i ? 1 : -1 : t > a ? 1 : -1;
			}
			return e === t ? 0 : e > t ? 1 : -1;
		}), t;
	}
	multiply() {
		let e = [], t;
		if (this.#e) {
			t = 1;
			for (let e of this.#n) if (t *= e, t === 0 || !Number.isFinite(t) || Number.isNaN(t)) break;
			!this.#r && !this.#o && !this.hasEtc && (Number.isFinite(t) && (t = I(t, 16)), e.push(t));
		}
		if (this.#r) {
			typeof t != "number" && (t = 1);
			for (let e of this.#a) if (t *= e, t === 0 || !Number.isFinite(t) || Number.isNaN(t)) break;
			Number.isFinite(t) && (t = `${I(t, 16)}%`), !this.#o && !this.hasEtc && e.push(t);
		}
		if (this.#o) {
			let n = "", r = "", i = "";
			this.#l.length && (this.#l.length === 1 ? [r] = this.#l : r = `${this.sort(this.#l).join(" * ")}`), this.#u.length && (this.#u.length === 1 ? [i] = this.#u : i = `${this.sort(this.#u).join(" * ")}`), Number.isFinite(t) ? (n = r ? i ? i.includes("*") ? u(`calc(${t} * ${r} / (${i}))`, this.#g) : u(`calc(${t} * ${r} / ${i})`, this.#g) : u(`calc(${t} * ${r})`, this.#g) : i.includes("*") ? u(`calc(${t} / (${i}))`, this.#g) : u(`calc(${t} / ${i})`, this.#g), e.push(n.replace(/^calc/, ""))) : (!e.length && t !== void 0 && e.push(t), r ? (n = i ? i.includes("*") ? u(`calc(${r} / (${i}))`, this.#g) : u(`calc(${r} / ${i})`, this.#g) : u(`calc(${r})`, this.#g), e.length ? e.push("*", n.replace(/^calc/, "")) : e.push(n.replace(/^calc/, ""))) : (n = u(`calc(${i})`, this.#g), e.length ? e.push("/", n.replace(/^calc/, "")) : e.push("1", "/", n.replace(/^calc/, ""))));
		}
		if (this.#d) {
			if (this.#m.length) {
				!e.length && t !== void 0 && e.push(t);
				let n = this.sort(this.#m).join(" * ");
				e.length ? e.push(`* ${n}`) : e.push(`${n}`);
			}
			if (this.#h.length) {
				let t = this.sort(this.#h).join(" * ");
				t.includes("*") ? e.length ? e.push(`/ (${t})`) : e.push(`1 / (${t})`) : e.length ? e.push(`/ ${t}`) : e.push(`1 / ${t}`);
			}
		}
		return e.length ? e.join(" ") : "";
	}
	sum() {
		let e = [];
		if (this.#e) {
			let t = 0;
			for (let e of this.#t) if (t += e, !Number.isFinite(t) || Number.isNaN(t)) break;
			e.push(t);
		}
		if (this.#r) {
			let t = 0;
			for (let e of this.#i) if (t += e, !Number.isFinite(t)) break;
			Number.isFinite(t) && (t = `${t}%`), e.length ? e.push(`+ ${t}`) : e.push(t);
		}
		if (this.#o) {
			let t, n, r;
			this.#s.length && (n = this.sort(this.#s).join(" + ")), this.#c.length && (r = this.sort(this.#c).join(" + ")), t = n ? r ? r.includes("-") ? u(`calc(${n} - (${r}))`, this.#g) : u(`calc(${n} - ${r})`, this.#g) : u(`calc(${n})`, this.#g) : u(`calc(-1 * (${r}))`, this.#g), e.length ? e.push("+", t.replace(/^calc/, "")) : e.push(t.replace(/^calc/, ""));
		}
		if (this.#d) {
			if (this.#f.length) {
				let t = this.sort(this.#f).map((e) => {
					let t;
					return t = c({ css: e }).some(([e, t]) => e === Rt && Jt.has(t)) && !e.startsWith("(") && !e.endsWith(")") ? `(${e})` : e, t;
				}).join(" + ");
				e.length ? this.#f.length > 1 ? e.push(`+ (${t})`) : e.push(`+ ${t}`) : e.push(`${t}`);
			}
			if (this.#p.length) {
				let t = this.sort(this.#p).map((e) => {
					let t;
					return t = c({ css: e }).some(([e, t]) => e === Rt && Jt.has(t)) && !e.startsWith("(") && !e.endsWith(")") ? `(${e})` : e, t;
				}).join(" + ");
				e.length ? this.#p.length > 1 ? e.push(`- (${t})`) : e.push(`- ${t}`) : this.#p.length > 1 ? e.push(`-1 * (${t})`) : e.push(`-1 * ${t}`);
			}
		}
		return e.length ? e.join(" ") : "";
	}
}, rn = (e = [], t = !1) => {
	if (e.length < 3) throw Error(`Unexpected array length ${e.length}.`);
	let n = e.shift();
	if (!v(n) || !n.endsWith("(")) throw Error(`Unexpected token ${n}.`);
	let r = e.pop();
	if (r !== ")") throw Error(`Unexpected token ${r}.`);
	if (e.length === 1) {
		let [t] = e;
		if (!y(t)) throw Error(`Unexpected token ${t}.`);
		return `${n}${t}${r}`;
	}
	let i = [], a = new nn(), o = "", s = !1;
	for (let t of e) {
		if (!y(t)) throw Error(`Unexpected token ${t}.`);
		if (t === "*" || t === "/") o = t;
		else if (t === "+" || t === "-") {
			let e = a.multiply();
			e && i.push(e, t), s = !0, a.clear(), o = "";
		} else {
			let e = Number(t), n = `${t}`, r = tn(n), i = r && r.unit !== "" && r.unit !== "%";
			switch (o) {
				case "/":
					Number.isFinite(e) ? (a.hasNum = !0, a.numMul.push(1 / e)) : r && r.unit === "%" ? (a.hasPct = !0, a.pctMul.push(1e4 / r.num)) : i ? (a.hasDim = !0, a.dimDiv.push(n)) : (a.hasEtc = !0, a.etcDiv.push(n));
					break;
				default: Number.isFinite(e) ? (a.hasNum = !0, a.numMul.push(e)) : r && r.unit === "%" ? (a.hasPct = !0, a.pctMul.push(r.num)) : i ? (a.hasDim = !0, a.dimMul.push(n)) : (a.hasEtc = !0, a.etcMul.push(n));
			}
		}
	}
	let c = a.multiply();
	c && i.push(c);
	let l = "";
	if (t && s) {
		let e = [];
		a.clear(), o = "";
		for (let e of i) if (e === "+" || e === "-") o = e;
		else {
			let t = Number(e), n = `${e}`, r = tn(n), i = r && r.unit !== "" && r.unit !== "%";
			switch (o) {
				case "-":
					Number.isFinite(t) ? (a.hasNum = !0, a.numSum.push(-1 * t)) : r && r.unit === "%" ? (a.hasPct = !0, a.pctSum.push(-1 * r.num)) : i ? (a.hasDim = !0, a.dimSub.push(n)) : (a.hasEtc = !0, a.etcSub.push(n));
					break;
				default: Number.isFinite(t) ? (a.hasNum = !0, a.numSum.push(t)) : r && r.unit === "%" ? (a.hasPct = !0, a.pctSum.push(r.num)) : i ? (a.hasDim = !0, a.dimSum.push(n)) : (a.hasEtc = !0, a.etcSum.push(n));
			}
		}
		let t = a.sum();
		e.push(t), a.clear(), o = "", l = e.join(" ").replace(/\+\s-/g, "- ");
	} else l = i.join(" ").replace(/\+\s-/g, "- ");
	return l.startsWith("(") && l.endsWith(")") && l.lastIndexOf("(") === 0 && l.indexOf(")") === l.length - 1 && (l = l.substring(1, l.length - 1)), `${n}${l}${r}`;
}, an = (e) => {
	let t = c({ css: e }), n = [], r = [], i = "", a = 0;
	for (let e of t) {
		let [t, o] = e;
		if (t === Wt || t === Vt ? a++ : t === It && a--, a === 0 && (o === "+" || o === "-")) {
			let e = r.join("").trim();
			e && n.push((i === "-" ? "-" : "") + e), r = [], i = o;
			continue;
		}
		r.push(o);
	}
	let o = r.join("").trim();
	if (o && n.push((i === "-" ? "-" : "") + o), n.length === 0) return e;
	n.sort((e, t) => {
		let n = tn(e), r = tn(t);
		return n && r ? n.unit === r.unit ? n.num - r.num : n.unit > r.unit ? 1 : -1 : e === t ? 0 : e > t ? 1 : -1;
	});
	let [s, ...l] = n, u = s;
	for (let e of l) e.startsWith("-") ? u += ` - ${e.substring(1)}` : u += ` + ${e}`;
	return u;
}, on = (e, t) => {
	let n = e[0], r = v(n) && Zt.test(n), i = [];
	for (let t of e) Array.isArray(t) ? i.push(on(t, r)) : i.push(t);
	let a = i.includes(","), o = i[0] ?? "", s = v(o) && Zt.test(o);
	if (a && s && i.at(-1) === ")") {
		let e = i.shift(), t = i.pop(), n = [], r = [];
		for (let e of i) e === "," ? (n.push(r), r = []) : r.push(e);
		return r.length && n.push(r), `${e}${n.map((e) => {
			if (e.length >= 3) {
				let t = rn([
					_e,
					...e,
					")"
				], !0);
				return an(t.substring(5, t.length - 1));
			}
			if (e.length === 1) {
				let t = e[0];
				if (v(t) && t.startsWith("calc(") && t.endsWith(")")) return an(t.substring(5, t.length - 1));
			}
			return e.join("");
		}).join(", ")}${t}`;
	}
	if (t) {
		if (!a) {
			if (i.length >= 3) return rn(i, !0);
			let e = i[0] ?? "";
			return e.endsWith("(") ? i.join("") : /^[a-z-]+\(/.test(e) ? e : `calc(${e})`;
		}
		return i.join("").replace(/,\s*/g, ", ");
	}
	if (i.length >= 3 && !a) {
		let e = rn(i, !1);
		return $t.test(e) && (e = u(e, { toCanonicalUnits: !0 })), e;
	}
	return i.join("").replace(/,\s*/g, ", ");
}, sn = (e, t = {}) => {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	let { format: n = "" } = t;
	if (!$t.test(e) || n !== "specifiedValue") return e;
	let r = e.toLowerCase().trim(), i = _({
		namespace: Kt,
		name: "serializeCalc",
		value: r
	}, t), a = h(i);
	if (a !== !1) return a.item;
	let o = c({ css: r }).filter((e) => {
		let [t] = e;
		return t !== Gt && t !== Lt && t !== Bt;
	}), s = [[]];
	for (let e of o) {
		let [t, n] = e;
		if (t === Wt || t === Vt) {
			let e = [n];
			s.at(-1).push(e), s.push(e);
		} else t === It ? s.length > 1 ? s.pop().push(n) : s[0].push(n) : s.at(-1).push(n);
	}
	let l = "", u = s[0];
	return l = u.length === 1 && Array.isArray(u[0]) ? on(u[0], !0) : on(u, !0), m(i, l), l;
}, cn = (e, t = {}) => {
	if (!Array.isArray(e)) throw TypeError(`${e} is not an array.`);
	let [, , , , n = {}] = e, { unit: r, value: i } = n;
	if (r === "px") return `${i}${r}`;
	let a = rt(Number(i), r, t);
	return Number.isFinite(a) ? `${I(a, 16)}px` : null;
}, ln = (e, t = {}) => {
	if (!Array.isArray(e)) throw TypeError(`${e} is not an array.`);
	let { format: n = "" } = t, r = /* @__PURE__ */ new Set(), i = 0, a = [];
	for (let o of e) {
		if (!Array.isArray(o)) throw TypeError(`${o} is not an array.`);
		let [e = "", s = ""] = o;
		switch (e) {
			case zt:
				if (n === "specifiedValue" && !r.has(i)) a.push(s);
				else {
					let e = cn(o, t);
					v(e) ? a.push(e) : a.push(s);
				}
				break;
			case Vt:
			case Wt:
				a.push(s), i++, Zt.test(s) && r.add(i);
				break;
			case It:
				a.length && a.at(-1) === " " ? a.splice(-1, 1, s) : a.push(s), r.has(i) && r.delete(i), i--;
				break;
			case Gt:
				if (a.length) {
					let e = a.at(-1);
					v(e) && !e.endsWith("(") && e !== " " && a.push(s);
				}
				break;
			default: e !== Lt && e !== Bt && a.push(s);
		}
	}
	return a;
}, un = (e, t = {}) => {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	let n = { ...t }, r = et(n);
	if (e.length > r) return "";
	let { format: i } = n;
	if (Qt.test(e)) {
		if (i === "specifiedValue") return e;
		{
			let t = pn(e, n);
			return v(t) ? t : "";
		}
	}
	if (!Yt.test(e)) return e;
	let a = e.toLowerCase().trim(), o = _({
		namespace: Kt,
		name: "cssCalc",
		value: a
	}, n), s = h(o);
	if (s !== !1) return s.item;
	let l = ln(c({ css: a }), n), d = u(l.join(""), { toCanonicalUnits: !0 });
	if ($t.test(e)) {
		let e = tn(d);
		e && e.unit !== "" && (d = `${I(Number(e.num), 16)}${e.unit}`), d && !$t.test(d) && i === "specifiedValue" && (d = `calc(${d})`);
	}
	if (i === "specifiedValue") {
		if (en.test(d) && !d.includes("NaN")) d = sn(d, n);
		else if (Xt.test(d)) {
			let [, e] = d.match(Xt);
			d = `calc(${I(Number(e), 16)})`;
		}
	}
	return m(o, d), d;
};
function dn(e, t = {}) {
	if (!Array.isArray(e)) throw TypeError(`${e} is not an array.`);
	let { customProperty: n = {} } = t, r = [];
	for (; e.length;) {
		let i = e.shift();
		if (!i) break;
		if (!Array.isArray(i)) throw TypeError(`${i} is not an array.`);
		let [a, o] = i;
		if (a === It) break;
		if (o === "var(") {
			let [, n] = dn(e, t);
			n && r.push(n);
		} else if (o && a === Ht) {
			if (o.startsWith("--")) {
				let e;
				if (n[o]) {
					let t = n[o];
					e = typeof t == "function" ? t(o) : t;
				} else typeof n.callback == "function" && (e = n.callback(o));
				e && r.push(e);
			} else r.push(o);
		}
	}
	let i = !1;
	r.length > 1 && (i = Y(r.at(-1)));
	let a = "";
	for (let e of r) {
		if (e = e.trim(), Qt.test(e)) {
			let n = pn(e, t);
			v(n) && (!i || Y(n)) && (a = n);
		} else Yt.test(e) ? (e = un(e, t), (!i || Y(e)) && (a = e)) : e && !qt.has(e) && (!i || Y(e)) && (a = e);
		if (a) break;
	}
	return [e, a];
}
function fn(e, t = {}) {
	let n = [];
	for (; e.length;) {
		let r = e.shift();
		if (!r) break;
		let [i = "", a = ""] = r;
		if (a === "var(") {
			let [, r] = dn(e, t);
			if (!r) return null;
			n.push(r);
		} else switch (i) {
			case It:
				n.length && n.at(-1) === " " ? n[n.length - 1] = a : n.push(a);
				break;
			case Gt:
				if (n.length) {
					let e = n.at(-1);
					v(e) && !e.endsWith("(") && e !== " " && n.push(a);
				}
				break;
			default: i !== Lt && i !== Bt && n.push(a);
		}
	}
	return n;
}
function pn(e, t = {}) {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	let n = et(t);
	if (e.length > n) return null;
	if (!Qt.test(e) || t.format === "specifiedValue") return e;
	let r = e.trim(), i = _({
		namespace: Kt,
		name: "resolveVar",
		value: r
	}, t), a = h(i);
	if (a !== !1) return a.item;
	let o = fn(c({ css: r }), t);
	if (Array.isArray(o)) {
		let e = o.join("");
		return e.length > n ? (m(i, null), null) : (Yt.test(e) && (e = un(e, t)), m(i, e), e);
	}
	return m(i, null), null;
}
var mn = (e, t = {}) => {
	let n = pn(e, { ...t });
	return v(n) ? n : "";
}, hn = {
	aliceblue: [
		240,
		248,
		255
	],
	antiquewhite: [
		250,
		235,
		215
	],
	aqua: [
		0,
		255,
		255
	],
	aquamarine: [
		127,
		255,
		212
	],
	azure: [
		240,
		255,
		255
	],
	beige: [
		245,
		245,
		220
	],
	bisque: [
		255,
		228,
		196
	],
	black: [
		0,
		0,
		0
	],
	blanchedalmond: [
		255,
		235,
		205
	],
	blue: [
		0,
		0,
		255
	],
	blueviolet: [
		138,
		43,
		226
	],
	brown: [
		165,
		42,
		42
	],
	burlywood: [
		222,
		184,
		135
	],
	cadetblue: [
		95,
		158,
		160
	],
	chartreuse: [
		127,
		255,
		0
	],
	chocolate: [
		210,
		105,
		30
	],
	coral: [
		255,
		127,
		80
	],
	cornflowerblue: [
		100,
		149,
		237
	],
	cornsilk: [
		255,
		248,
		220
	],
	crimson: [
		220,
		20,
		60
	],
	cyan: [
		0,
		255,
		255
	],
	darkblue: [
		0,
		0,
		139
	],
	darkcyan: [
		0,
		139,
		139
	],
	darkgoldenrod: [
		184,
		134,
		11
	],
	darkgray: [
		169,
		169,
		169
	],
	darkgreen: [
		0,
		100,
		0
	],
	darkgrey: [
		169,
		169,
		169
	],
	darkkhaki: [
		189,
		183,
		107
	],
	darkmagenta: [
		139,
		0,
		139
	],
	darkolivegreen: [
		85,
		107,
		47
	],
	darkorange: [
		255,
		140,
		0
	],
	darkorchid: [
		153,
		50,
		204
	],
	darkred: [
		139,
		0,
		0
	],
	darksalmon: [
		233,
		150,
		122
	],
	darkseagreen: [
		143,
		188,
		143
	],
	darkslateblue: [
		72,
		61,
		139
	],
	darkslategray: [
		47,
		79,
		79
	],
	darkslategrey: [
		47,
		79,
		79
	],
	darkturquoise: [
		0,
		206,
		209
	],
	darkviolet: [
		148,
		0,
		211
	],
	deeppink: [
		255,
		20,
		147
	],
	deepskyblue: [
		0,
		191,
		255
	],
	dimgray: [
		105,
		105,
		105
	],
	dimgrey: [
		105,
		105,
		105
	],
	dodgerblue: [
		30,
		144,
		255
	],
	firebrick: [
		178,
		34,
		34
	],
	floralwhite: [
		255,
		250,
		240
	],
	forestgreen: [
		34,
		139,
		34
	],
	fuchsia: [
		255,
		0,
		255
	],
	gainsboro: [
		220,
		220,
		220
	],
	ghostwhite: [
		248,
		248,
		255
	],
	gold: [
		255,
		215,
		0
	],
	goldenrod: [
		218,
		165,
		32
	],
	gray: [
		128,
		128,
		128
	],
	green: [
		0,
		128,
		0
	],
	greenyellow: [
		173,
		255,
		47
	],
	grey: [
		128,
		128,
		128
	],
	honeydew: [
		240,
		255,
		240
	],
	hotpink: [
		255,
		105,
		180
	],
	indianred: [
		205,
		92,
		92
	],
	indigo: [
		75,
		0,
		130
	],
	ivory: [
		255,
		255,
		240
	],
	khaki: [
		240,
		230,
		140
	],
	lavender: [
		230,
		230,
		250
	],
	lavenderblush: [
		255,
		240,
		245
	],
	lawngreen: [
		124,
		252,
		0
	],
	lemonchiffon: [
		255,
		250,
		205
	],
	lightblue: [
		173,
		216,
		230
	],
	lightcoral: [
		240,
		128,
		128
	],
	lightcyan: [
		224,
		255,
		255
	],
	lightgoldenrodyellow: [
		250,
		250,
		210
	],
	lightgray: [
		211,
		211,
		211
	],
	lightgreen: [
		144,
		238,
		144
	],
	lightgrey: [
		211,
		211,
		211
	],
	lightpink: [
		255,
		182,
		193
	],
	lightsalmon: [
		255,
		160,
		122
	],
	lightseagreen: [
		32,
		178,
		170
	],
	lightskyblue: [
		135,
		206,
		250
	],
	lightslategray: [
		119,
		136,
		153
	],
	lightslategrey: [
		119,
		136,
		153
	],
	lightsteelblue: [
		176,
		196,
		222
	],
	lightyellow: [
		255,
		255,
		224
	],
	lime: [
		0,
		255,
		0
	],
	limegreen: [
		50,
		205,
		50
	],
	linen: [
		250,
		240,
		230
	],
	magenta: [
		255,
		0,
		255
	],
	maroon: [
		128,
		0,
		0
	],
	mediumaquamarine: [
		102,
		205,
		170
	],
	mediumblue: [
		0,
		0,
		205
	],
	mediumorchid: [
		186,
		85,
		211
	],
	mediumpurple: [
		147,
		112,
		219
	],
	mediumseagreen: [
		60,
		179,
		113
	],
	mediumslateblue: [
		123,
		104,
		238
	],
	mediumspringgreen: [
		0,
		250,
		154
	],
	mediumturquoise: [
		72,
		209,
		204
	],
	mediumvioletred: [
		199,
		21,
		133
	],
	midnightblue: [
		25,
		25,
		112
	],
	mintcream: [
		245,
		255,
		250
	],
	mistyrose: [
		255,
		228,
		225
	],
	moccasin: [
		255,
		228,
		181
	],
	navajowhite: [
		255,
		222,
		173
	],
	navy: [
		0,
		0,
		128
	],
	oldlace: [
		253,
		245,
		230
	],
	olive: [
		128,
		128,
		0
	],
	olivedrab: [
		107,
		142,
		35
	],
	orange: [
		255,
		165,
		0
	],
	orangered: [
		255,
		69,
		0
	],
	orchid: [
		218,
		112,
		214
	],
	palegoldenrod: [
		238,
		232,
		170
	],
	palegreen: [
		152,
		251,
		152
	],
	paleturquoise: [
		175,
		238,
		238
	],
	palevioletred: [
		219,
		112,
		147
	],
	papayawhip: [
		255,
		239,
		213
	],
	peachpuff: [
		255,
		218,
		185
	],
	peru: [
		205,
		133,
		63
	],
	pink: [
		255,
		192,
		203
	],
	plum: [
		221,
		160,
		221
	],
	powderblue: [
		176,
		224,
		230
	],
	purple: [
		128,
		0,
		128
	],
	rebeccapurple: [
		102,
		51,
		153
	],
	red: [
		255,
		0,
		0
	],
	rosybrown: [
		188,
		143,
		143
	],
	royalblue: [
		65,
		105,
		225
	],
	saddlebrown: [
		139,
		69,
		19
	],
	salmon: [
		250,
		128,
		114
	],
	sandybrown: [
		244,
		164,
		96
	],
	seagreen: [
		46,
		139,
		87
	],
	seashell: [
		255,
		245,
		238
	],
	sienna: [
		160,
		82,
		45
	],
	silver: [
		192,
		192,
		192
	],
	skyblue: [
		135,
		206,
		235
	],
	slateblue: [
		106,
		90,
		205
	],
	slategray: [
		112,
		128,
		144
	],
	slategrey: [
		112,
		128,
		144
	],
	snow: [
		255,
		250,
		250
	],
	springgreen: [
		0,
		255,
		127
	],
	steelblue: [
		70,
		130,
		180
	],
	tan: [
		210,
		180,
		140
	],
	teal: [
		0,
		128,
		128
	],
	thistle: [
		216,
		191,
		216
	],
	tomato: [
		255,
		99,
		71
	],
	turquoise: [
		64,
		224,
		208
	],
	violet: [
		238,
		130,
		238
	],
	wheat: [
		245,
		222,
		179
	],
	white: [
		255,
		255,
		255
	],
	whitesmoke: [
		245,
		245,
		245
	],
	yellow: [
		255,
		255,
		0
	],
	yellowgreen: [
		154,
		205,
		50
	]
}, gn = RegExp(`^(?:${Te})$`), _n = /^currentColor$/i, U = /^(?:specifi|comput)edValue$/, vn = (t, n = {}) => {
	if (!v(t)) throw TypeError(`${t} is not a string.`);
	t = t.toLowerCase().trim();
	let { format: r = "", nullable: i = !1 } = n, a = R(t);
	if (!a || a.colorNotation !== "rgb") {
		let e = z(r, i);
		return e === null ? null : (v(e), e);
	}
	let [o, s, c] = a.channels, l = a.alpha, u = a.syntaxFlags instanceof Set && a.syntaxFlags.has(e.HasNoneKeywords), d = Number.isNaN(o) ? 0 : Math.min(Math.max(I(o * 255, 8), 0), 255), f = Number.isNaN(s) ? 0 : Math.min(Math.max(I(s * 255, 8), 0), 255), p = Number.isNaN(c) ? 0 : Math.min(Math.max(I(c * 255, 8), 0), 255), m;
	return m = typeof l == "number" && !Number.isNaN(l) ? L(String(l)) : 0, [
		"rgb",
		d,
		f,
		p,
		r === "mixValue" && Number.isNaN(l) && u ? O : m
	];
}, yn = (t, n = {}) => {
	if (!v(t)) throw TypeError(`${t} is not a string.`);
	t = t.trim();
	let { format: r = "", nullable: i = !1 } = n, a = R(t);
	if (!a || a.colorNotation !== "hsl") {
		let e = z(r, i);
		return e === null ? null : (v(e), e);
	}
	let [o, s, c] = a.channels, l = a.alpha, u = a.syntaxFlags instanceof Set && a.syntaxFlags.has(e.HasNoneKeywords), d = Number.isNaN(o) ? 0 : o, f = Number.isNaN(s) ? 0 : Math.min(Math.max(s, 0), 100), p = Number.isNaN(c) ? 0 : Math.min(Math.max(c, 0), 100), m;
	m = typeof l == "number" && !Number.isNaN(l) ? L(String(l)) : 0;
	let h = Number.isNaN(l) && u;
	if (r === "hsl") return [
		r,
		Number.isNaN(o) ? O : d,
		Number.isNaN(s) ? O : f,
		Number.isNaN(c) ? O : p,
		h ? O : m
	];
	d = d / 360 * 12, p /= 100;
	let g = f / 100 * Math.min(p, 1 - p), _ = d % 12, y = (8 + d) % 12, b = (4 + d) % 12, x = p - g * Math.max(-1, Math.min(_ - 3, 9 - _, 1)), S = p - g * Math.max(-1, Math.min(y - 3, 9 - y, 1)), C = p - g * Math.max(-1, Math.min(b - 3, 9 - b, 1));
	return [
		"rgb",
		Math.min(Math.max(I(x * 255, 8), 0), 255),
		Math.min(Math.max(I(S * 255, 8), 0), 255),
		Math.min(Math.max(I(C * 255, 8), 0), 255),
		m
	];
}, bn = (t, n = {}) => {
	if (!v(t)) throw TypeError(`${t} is not a string.`);
	t = t.trim();
	let { format: r = "", nullable: i = !1 } = n, a = R(t);
	if (!a || a.colorNotation !== "hwb") {
		let e = z(r, i);
		return e === null ? null : (v(e), e);
	}
	let [o, s, c] = a.channels, l = a.alpha, u = a.syntaxFlags instanceof Set && a.syntaxFlags.has(e.HasNoneKeywords), d = Number.isNaN(o) ? 0 : o, f = Number.isNaN(s) ? 0 : Math.min(Math.max(s, 0), 100) / 100, p = Number.isNaN(c) ? 0 : Math.min(Math.max(c, 0), 100) / 100, m;
	m = typeof l == "number" && !Number.isNaN(l) ? L(String(l)) : 0;
	let h = Number.isNaN(l) && u;
	if (r === "hwb") return [
		r,
		Number.isNaN(o) ? O : d,
		Number.isNaN(s) ? O : f * 100,
		Number.isNaN(c) ? O : p * 100,
		h ? O : m
	];
	if (f + p >= 1) {
		let e = I(f / (f + p) * 255, 8);
		return [
			"rgb",
			e,
			e,
			e,
			m
		];
	}
	let g = (1 - f - p) / 255, [, _, y, b] = yn(`hsl(${d} 100 50)`);
	return _ = I((_ * g + f) * 255, 8), y = I((y * g + f) * 255, 8), b = I((b * g + f) * 255, 8), [
		"rgb",
		Math.min(Math.max(_, 0), 255),
		Math.min(Math.max(y, 0), 255),
		Math.min(Math.max(b, 0), 255),
		m
	];
}, xn = (t, n = {}) => {
	if (!v(t)) throw TypeError(`${t} is not a string.`);
	t = t.trim();
	let { format: r = "", nullable: i = !1 } = n, a = R(t);
	if (!a || a.colorNotation !== "lab") {
		let e = z(r, i);
		return e === null ? null : (v(e), e);
	}
	let [o, s, c] = a.channels, l = a.alpha, u = a.syntaxFlags instanceof Set && a.syntaxFlags.has(e.HasNoneKeywords), d = Number.isNaN(o) ? 0 : Math.max(o, 0), f = Number.isNaN(s) ? 0 : s, p = Number.isNaN(c) ? 0 : c, m;
	m = typeof l == "number" && !Number.isNaN(l) ? L(String(l)) : 0;
	let h = Number.isNaN(l) && u;
	if (U.test(r)) return [
		"lab",
		Number.isNaN(o) ? O : I(d, 16),
		Number.isNaN(s) ? O : I(f, 16),
		Number.isNaN(c) ? O : I(p, 16),
		h ? O : m
	];
	let g = (d + 16) / 116, _ = f / 500 + g, y = g - p / 200, b = g ** 3, x = _ ** 3, S = y ** 3, [C, w, T] = [
		x > .008856451679035631 ? x : (_ * 116 - 16) / je,
		d > 8 ? b : d / je,
		S > .008856451679035631 ? S : (y * 116 - 16) / je
	].map((e, t) => e * ct[t]);
	return [
		"xyz-d50",
		I(C, 16),
		I(w, 16),
		I(T, 16),
		m
	];
}, Sn = (t, n = {}) => {
	if (!v(t)) throw TypeError(`${t} is not a string.`);
	t = t.trim();
	let { format: r = "", nullable: i = !1 } = n, a = R(t);
	if (!a || a.colorNotation !== "lch") {
		let e = z(r, i);
		return e === null ? null : (v(e), e);
	}
	let [o, s, c] = a.channels, l = a.alpha, u = a.syntaxFlags instanceof Set && a.syntaxFlags.has(e.HasNoneKeywords), d = Number.isNaN(o) ? 0 : Math.max(o, 0), f = Number.isNaN(s) ? 0 : Math.max(s, 0), p = Number.isNaN(c) ? 0 : c, m;
	m = typeof l == "number" && !Number.isNaN(l) ? L(String(l)) : 0;
	let h = Number.isNaN(l) && u;
	if (U.test(r)) return [
		"lch",
		Number.isNaN(o) ? O : I(d, 16),
		Number.isNaN(s) ? O : I(f, 16),
		Number.isNaN(c) ? O : I(p, 16),
		h ? O : m
	];
	let [, g, _, y] = xn(`lab(${d} ${f * Math.cos(p * Math.PI / 180)} ${f * Math.sin(p * Math.PI / 180)})`);
	return [
		"xyz-d50",
		I(g, 16),
		I(_, 16),
		I(y, 16),
		m
	];
}, Cn = (t, n = {}) => {
	if (!v(t)) throw TypeError(`${t} is not a string.`);
	t = t.trim();
	let { format: r = "", nullable: i = !1 } = n, a = R(t);
	if (!a || a.colorNotation !== "oklab") {
		let e = z(r, i);
		return e === null ? null : (v(e), e);
	}
	let [o, s, c] = a.channels, l = a.alpha, u = a.syntaxFlags instanceof Set && a.syntaxFlags.has(e.HasNoneKeywords), d = Number.isNaN(o) ? 0 : Math.max(o, 0), f = Number.isNaN(s) ? 0 : s, p = Number.isNaN(c) ? 0 : c, m;
	m = typeof l == "number" && !Number.isNaN(l) ? L(String(l)) : 0;
	let h = Number.isNaN(l) && u;
	if (U.test(r)) return [
		"oklab",
		Number.isNaN(o) ? O : I(d, 16),
		Number.isNaN(s) ? O : I(f, 16),
		Number.isNaN(c) ? O : I(p, 16),
		h ? O : m
	];
	let [g, _, y] = H(pt, H(mt, [
		d,
		f,
		p
	]).map((e) => e ** 3), !0);
	return [
		"xyz-d65",
		I(g, 16),
		I(_, 16),
		I(y, 16),
		m
	];
}, wn = (t, n = {}) => {
	if (!v(t)) throw TypeError(`${t} is not a string.`);
	t = t.trim();
	let { format: r = "", nullable: i = !1 } = n, a = R(t);
	if (!a || a.colorNotation !== "oklch") {
		let e = z(r, i);
		return e === null ? null : (v(e), e);
	}
	let [o, s, c] = a.channels, l = a.alpha, u = a.syntaxFlags instanceof Set && a.syntaxFlags.has(e.HasNoneKeywords), d = Number.isNaN(o) ? 0 : Math.max(o, 0), f = Number.isNaN(s) ? 0 : Math.max(s, 0), p = Number.isNaN(c) ? 0 : c, m;
	m = typeof l == "number" && !Number.isNaN(l) ? L(String(l)) : 0;
	let h = Number.isNaN(l) && u;
	if (U.test(r)) return [
		"oklch",
		Number.isNaN(o) ? O : I(d, 16),
		Number.isNaN(s) ? O : I(f, 16),
		Number.isNaN(c) ? O : I(p, 16),
		h ? O : m
	];
	let [g, _, y] = H(pt, H(mt, [
		d,
		f * Math.cos(p * Math.PI / 180),
		f * Math.sin(p * Math.PI / 180)
	]).map((e) => e ** 3), !0);
	return [
		"xyz-d65",
		I(g, 16),
		I(_, 16),
		I(y, 16),
		m
	];
}, W = (t, n = {}) => {
	if (!v(t)) throw TypeError(`${t} is not a string.`);
	t = t.trim();
	let { colorSpace: r = "", d50: i = !1, format: a = "", nullable: o = !1 } = n, s = R(t);
	if (!s) {
		let e = z(a, o);
		return e === null ? null : (v(e), e);
	}
	let c = s.colorNotation, [l, u, d] = s.channels, f = s.alpha, p = s.syntaxFlags instanceof Set && s.syntaxFlags.has(e.HasNoneKeywords), m = Number.isNaN(l) ? 0 : l, h = Number.isNaN(u) ? 0 : u, g = Number.isNaN(d) ? 0 : d, _;
	_ = typeof f == "number" && !Number.isNaN(f) ? L(String(f)) : 0;
	let y = Number.isNaN(f) && p;
	if (U.test(a) || a === "mixValue" && c === r) return [
		c,
		Number.isNaN(l) ? O : I(m, 10),
		Number.isNaN(u) ? O : I(h, 10),
		Number.isNaN(d) ? O : I(g, 10),
		y ? O : _
	];
	let b = 0, x = 0, S = 0;
	if (c === "srgb-linear") [b, x, S] = H(ut, [
		m,
		h,
		g
	]), i && ([b, x, S] = H(B, [
		b,
		x,
		S
	], !0));
	else if (c === "display-p3") {
		let e = xt([
			m * 255,
			h * 255,
			g * 255
		]);
		[b, x, S] = H(gt, e), i && ([b, x, S] = H(B, [
			b,
			x,
			S
		], !0));
	} else if (c === "rec2020") {
		let e = 1.09929682680944, t = .45, n = [
			m,
			h,
			g
		].map((n) => {
			let r;
			return r = n < .018053968510807 * t * 10 ? n / (t * 10) : ((n + e - 1) / e) ** (1 / t), r;
		});
		[b, x, S] = H(_t, n), i && ([b, x, S] = H(B, [
			b,
			x,
			S
		], !0));
	} else if (c === "a98-rgb") {
		let e = [
			m,
			h,
			g
		].map((e) => e ** 2.19921875);
		[b, x, S] = H(vt, e), i && ([b, x, S] = H(B, [
			b,
			x,
			S
		], !0));
	} else if (c === "prophoto-rgb") {
		let e = [
			m,
			h,
			g
		].map((e) => {
			let t;
			return t = e > 1 / 32 ? e ** 1.8 : e / 16, t;
		});
		[b, x, S] = H(yt, e), i || ([b, x, S] = H(lt, [
			b,
			x,
			S
		], !0));
	} else /^xyz(?:-d(?:50|65))?$/.test(c) ? ([b, x, S] = [
		m,
		h,
		g
	], c === "xyz-d50" ? i || ([b, x, S] = H(lt, [
		b,
		x,
		S
	])) : i && ([b, x, S] = H(B, [
		b,
		x,
		S
	], !0))) : ([b, x, S] = St([
		m * 255,
		h * 255,
		g * 255
	]), i && ([b, x, S] = H(B, [
		b,
		x,
		S
	], !0)));
	return [
		i ? "xyz-d50" : "xyz-d65",
		I(b, 16),
		I(x, 16),
		I(S, 16),
		a === "mixValue" && y ? O : _
	];
}, G = (e, t = {}) => {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	e = e.toLowerCase().trim();
	let { d50: n = !1, format: r = "", nullable: i = !1 } = t;
	if (!gn.test(e)) {
		let e = z(r, i);
		return e === null ? null : (v(e), e);
	}
	let a = 0, o = 0, s = 0, c = 0;
	if (_n.test(e)) {
		if (r === "computedValue") return [
			"rgb",
			0,
			0,
			0,
			0
		];
		if (r === "specifiedValue") return e;
	} else if (/^[a-z]+$/.test(e)) {
		if (Object.hasOwn(hn, e)) {
			if (r === "specifiedValue") return e;
			let [t, i, l] = hn[e];
			if (c = 1, r === "computedValue") return [
				"rgb",
				t,
				i,
				l,
				c
			];
			[a, o, s] = St([
				t,
				i,
				l
			], !0), n && ([a, o, s] = H(B, [
				a,
				o,
				s
			], !0));
		} else switch (r) {
			case M: return i && e !== "transparent" ? null : [
				"rgb",
				0,
				0,
				0,
				0
			];
			case ke: return e === "transparent" ? e : "";
			case N: return e === "transparent" ? [
				"rgb",
				0,
				0,
				0,
				0
			] : null;
		}
	} else if (e[0] === "#") {
		if (U.test(r)) return ["rgb", ...Nt(e)];
		[a, o, s, c] = Ft(e), n && ([a, o, s] = H(B, [
			a,
			o,
			s
		], !0));
	} else if (e.startsWith("lab")) {
		if (U.test(r)) return xn(e, t);
		[, a, o, s, c] = xn(e), n || ([a, o, s] = H(lt, [
			a,
			o,
			s
		], !0));
	} else if (e.startsWith("lch")) {
		if (U.test(r)) return Sn(e, t);
		[, a, o, s, c] = Sn(e), n || ([a, o, s] = H(lt, [
			a,
			o,
			s
		], !0));
	} else if (e.startsWith("oklab")) {
		if (U.test(r)) return Cn(e, t);
		[, a, o, s, c] = Cn(e), n && ([a, o, s] = H(B, [
			a,
			o,
			s
		], !0));
	} else if (e.startsWith("oklch")) {
		if (U.test(r)) return wn(e, t);
		[, a, o, s, c] = wn(e), n && ([a, o, s] = H(B, [
			a,
			o,
			s
		], !0));
	} else {
		let i, l, u;
		if (e.startsWith("hsl") ? [, i, l, u, c] = yn(e) : e.startsWith("hwb") ? [, i, l, u, c] = bn(e) : [, i, l, u, c] = vn(e, t), U.test(r)) return [
			"rgb",
			Math.round(i),
			Math.round(l),
			Math.round(u),
			c
		];
		[a, o, s] = St([
			i,
			l,
			u
		]), n && ([a, o, s] = H(B, [
			a,
			o,
			s
		], !0));
	}
	return [
		n ? "xyz-d50" : "xyz-d65",
		I(a, 16),
		I(o, 16),
		I(s, 16),
		c
	];
}, Tn = RegExp(`^color\\(\\s*(${ve})\\s*\\)$`), En = RegExp(`^hsla?\\(\\s*(${xe}|${Se})\\s*\\)$`), Dn = RegExp(`^hwb\\(\\s*(${xe})\\s*\\)$`), On = RegExp(`^lab\\(\\s*(${we})\\s*\\)$`), kn = RegExp(`^lch\\(\\s*(${Ce})\\s*\\)$`), An = RegExp(`^oklab\\(\\s*(${we})\\s*\\)$`), jn = RegExp(`^oklch\\(\\s*(${Ce})\\s*\\)$`), Mn = (e, t = {}) => {
	if (v(e)) e = e.trim();
	else throw TypeError(`${e} is not a string.`);
	let { colorSpace: n = "", format: r = "" } = t, i = "", a, o, s, c, l, u, d;
	if (r === "mixValue") {
		let r;
		if (r = e.startsWith("color(") ? W(e, t) : G(e, t), r === null) return null;
		if ([i, l, u, d, c] = r, i === n) return [
			l,
			u,
			d,
			c
		];
		[a, o, s] = H(dt, [
			l,
			u,
			d
		], !0);
	} else if (e.startsWith("color(")) {
		let [, t] = e.match(Tn), [n] = t.match(/[^\s,/]+/g);
		n === "srgb-linear" ? [, a, o, s, c] = q(e, { format: M }) : ([, l, u, d, c] = W(e), [a, o, s] = H(dt, [
			l,
			u,
			d
		], !0));
	} else [, l, u, d, c] = G(e), [a, o, s] = H(dt, [
		l,
		u,
		d
	], !0);
	return [
		Math.min(Math.max(a, 0), 1),
		Math.min(Math.max(o, 0), 1),
		Math.min(Math.max(s, 0), 1),
		c
	];
}, Nn = (e, t = {}) => {
	if (v(e)) e = e.trim();
	else throw TypeError(`${e} is not a string.`);
	let { format: n = "" } = t, r, i, a, o;
	if (n === "mixValue") {
		let n;
		if (n = e.startsWith("color(") ? q(e, t) : qr(e, t), n === null) return null;
		[, r, i, a, o] = n;
	} else if (e.startsWith("color(")) {
		let [, t] = e.match(Tn), [n] = t.match(/[^\s,/]+/g);
		n === "srgb" ? ([, r, i, a, o] = q(e, { format: M }), r *= 255, i *= 255, a *= 255) : [, r, i, a, o] = q(e);
	} else /^(?:ok)?l(?:ab|ch)/.test(e) ? ([r, i, a, o] = Mn(e), [r, i, a] = Ct([
		r,
		i,
		a
	])) : [, r, i, a, o] = qr(e, { format: M });
	return [
		r,
		i,
		a,
		o
	];
}, Pn = (e, t = {}) => {
	if (v(e)) e = e.trim();
	else throw TypeError(`${e} is not a string.`);
	let { d50: n = !1, format: r = "" } = t, i, a, o, s;
	if (r === "mixValue") {
		let n;
		if (n = e.startsWith("color(") ? W(e, t) : G(e, t), n === null) return null;
		[, i, a, o, s] = n;
	} else if (e.startsWith("color(")) {
		let [, r] = e.match(Tn), [c] = r.match(/[^\s,/]+/g);
		n ? c === "xyz-d50" ? [, i, a, o, s] = q(e, { format: M }) : [, i, a, o, s] = W(e, t) : /^xyz(?:-d65)?$/.test(c) ? [, i, a, o, s] = q(e, { format: M }) : [, i, a, o, s] = W(e);
	} else [, i, a, o, s] = G(e, t);
	return [
		i,
		a,
		o,
		s
	];
}, Fn = (e, t = {}) => {
	if (v(e)) e = e.trim();
	else throw TypeError(`${e} is not a string.`);
	let { format: n = "" } = t, r, i, a, o;
	if (En.test(e)) return [, r, i, a, o] = yn(e, { format: "hsl" }), n === "hsl" ? [
		Math.round(r),
		Math.round(i),
		Math.round(a),
		o
	] : [
		r,
		i,
		a,
		o
	];
	let s, c, l;
	if (n === "mixValue") {
		let n;
		if (n = e.startsWith("color(") ? W(e, t) : G(e, t), n === null) return null;
		[, s, c, l, o] = n;
	} else e.startsWith("color(") ? [, s, c, l, o] = W(e) : [, s, c, l, o] = G(e);
	return [r, i, a] = Tt([
		s,
		c,
		l
	], !0), n === "hsl" ? [
		Math.round(r),
		Math.round(i),
		Math.round(a),
		o
	] : [
		n === "mixValue" && i === 0 ? O : r,
		i,
		a,
		o
	];
}, In = (e, t = {}) => {
	if (v(e)) e = e.trim();
	else throw TypeError(`${e} is not a string.`);
	let { format: n = "" } = t, r, i, a, o;
	if (Dn.test(e)) return [, r, i, a, o] = bn(e, { format: "hwb" }), n === "hwb" ? [
		Math.round(r),
		Math.round(i),
		Math.round(a),
		o
	] : [
		r,
		i,
		a,
		o
	];
	let s, c, l;
	if (n === "mixValue") {
		let n;
		if (n = e.startsWith("color(") ? W(e, t) : G(e, t), n === null) return null;
		[, s, c, l, o] = n;
	} else e.startsWith("color(") ? [, s, c, l, o] = W(e) : [, s, c, l, o] = G(e);
	return [r, i, a] = Et([
		s,
		c,
		l
	], !0), n === "hwb" ? [
		Math.round(r),
		Math.round(i),
		Math.round(a),
		o
	] : [
		n === "mixValue" && i + a >= 100 ? O : r,
		i,
		a,
		o
	];
}, Ln = (e, t = {}) => {
	if (v(e)) e = e.trim();
	else throw TypeError(`${e} is not a string.`);
	let { format: n = "" } = t, r, i, a, o;
	if (On.test(e)) return [, r, i, a, o] = xn(e, { format: M }), [
		r,
		i,
		a,
		o
	];
	let s, c, l;
	if (n === "mixValue") {
		let n, r = {
			...t,
			d50: !0
		};
		if (n = e.startsWith("color(") ? W(e, r) : G(e, r), n === null) return null;
		[, s, c, l, o] = n;
	} else e.startsWith("color(") ? [, s, c, l, o] = W(e, { d50: !0 }) : [, s, c, l, o] = G(e, { d50: !0 });
	return [r, i, a] = At([
		s,
		c,
		l
	], !0), [
		r,
		i,
		a,
		o
	];
}, Rn = (e, t = {}) => {
	if (v(e)) e = e.trim();
	else throw TypeError(`${e} is not a string.`);
	let { format: n = "" } = t, r, i, a, o;
	if (kn.test(e)) return [, r, i, a, o] = Sn(e, { format: M }), [
		r,
		i,
		a,
		o
	];
	let s, c, l;
	if (n === "mixValue") {
		let n, r = {
			...t,
			d50: !0
		};
		if (n = e.startsWith("color(") ? W(e, r) : G(e, r), n === null) return null;
		[, s, c, l, o] = n;
	} else e.startsWith("color(") ? [, s, c, l, o] = W(e, { d50: !0 }) : [, s, c, l, o] = G(e, { d50: !0 });
	return [r, i, a] = jt([
		s,
		c,
		l
	], !0), [
		r,
		i,
		n === "mixValue" && i === 0 ? O : a,
		o
	];
}, zn = (e, t = {}) => {
	if (v(e)) e = e.trim();
	else throw TypeError(`${e} is not a string.`);
	let { format: n = "" } = t, r, i, a, o;
	if (An.test(e)) return [, r, i, a, o] = Cn(e, { format: M }), [
		r,
		i,
		a,
		o
	];
	let s, c, l;
	if (n === "mixValue") {
		let n;
		if (n = e.startsWith("color(") ? W(e, t) : G(e, t), n === null) return null;
		[, s, c, l, o] = n;
	} else e.startsWith("color(") ? [, s, c, l, o] = W(e) : [, s, c, l, o] = G(e);
	return [r, i, a] = Dt([
		s,
		c,
		l
	], !0), [
		r,
		i,
		a,
		o
	];
}, Bn = (e, t = {}) => {
	if (v(e)) e = e.trim();
	else throw TypeError(`${e} is not a string.`);
	let { format: n = "" } = t, r, i, a, o;
	if (jn.test(e)) return [, r, i, a, o] = wn(e, { format: M }), [
		r,
		i,
		a,
		o
	];
	let s, c, l;
	if (n === "mixValue") {
		let n;
		if (n = e.startsWith("color(") ? W(e, t) : G(e, t), n === null) return null;
		[, s, c, l, o] = n;
	} else e.startsWith("color(") ? [, s, c, l, o] = W(e) : [, s, c, l, o] = G(e);
	return [r, i, a] = Ot([
		s,
		c,
		l
	], !0), [
		r,
		i,
		n === "mixValue" && i === 0 ? O : a,
		o
	];
}, Vn = "color-mix", Hn = (e) => {
	let t = F(e).filter(Boolean);
	if (t[0] !== "in" || t.length < 2) return null;
	let n = t.indexOf("hue");
	return t.length > 2 && n > -1 ? {
		colorSpace: t[1],
		hueArc: t.slice(2, n).join(" ")
	} : {
		colorSpace: t.slice(1).join(" "),
		hueArc: ""
	};
}, Un = (e) => {
	let t = F(e).filter(Boolean), n = "", r = "";
	if (t.length === 1) n = t[0];
	else {
		let e = (e) => e.endsWith("%") || e.startsWith("calc(") || e === "none";
		e(t[t.length - 1]) ? (r = t.pop(), n = t.join(" ")) : (e(t[0]) && (r = t.shift()), n = t.join(" "));
	}
	return {
		color: n,
		pct: r
	};
}, Wn = (e, t, n) => {
	let r = e;
	for (; v(r) && (r.startsWith("color-mix(") || r.startsWith("var(") || r.startsWith("light-dark("));) {
		let e = n(r, {
			...t,
			format: t.format === "specifiedValue" ? t.format : M
		});
		if (!e) break;
		if (Array.isArray(e)) {
			let [t, n, i, a, o] = e;
			r = o === 1 || o === void 0 ? t === "rgb" ? `${t}(${n}, ${i}, ${a})` : `${t}(${n} ${i} ${a})` : t === "rgb" ? `${t}a(${n}, ${i}, ${a}, ${o})` : `${t}(${n} ${i} ${a} / ${o})`;
			break;
		}
		if (typeof e == "string") {
			if (e === r) break;
			r = e;
		} else break;
	}
	return r;
}, Gn = (e, t) => {
	let n, r, i;
	if (e && t) {
		let a = parseFloat(e) / 100, o = parseFloat(t) / 100;
		if (Number.isNaN(a) || Number.isNaN(o) || a < 0 || a > 1 || o < 0 || o > 1 || a === 0 && o === 0) return null;
		let s = a + o;
		n = a / s, r = o / s, i = s < 1 ? s : 1;
	} else {
		if (e) {
			let t = parseFloat(e);
			if (Number.isNaN(t) || t < 0 || t > 100) return null;
			n = t / 100, r = (100 - t) / 100;
		} else if (t) {
			let e = parseFloat(t);
			if (Number.isNaN(e) || e < 0 || e > 100) return null;
			r = e / 100, n = (100 - e) / 100;
		} else n = Ae, r = Ae;
		i = 1;
	}
	return {
		pA: n,
		pB: r,
		m: i
	};
}, Kn = (e, t) => {
	if (!v(e)) return "";
	if (e.startsWith("color-mix(") || e.startsWith("light-dark(")) return e;
	if (e.startsWith("color(")) {
		let [n, r, i, a, o] = W(e, t);
		return o === 1 ? `color(${n} ${r} ${i} ${a})` : `color(${n} ${r} ${i} ${a} / ${o})`;
	}
	let n = G(e, t);
	if (Array.isArray(n)) {
		let [e, t, r, i, a] = n;
		return a === 1 ? e === "rgb" ? `${e}(${t}, ${r}, ${i})` : `${e}(${t} ${r} ${i})` : e === "rgb" ? `${e}a(${t}, ${r}, ${i}, ${a})` : `${e}(${t} ${r} ${i} / ${a})`;
	}
	return !v(n) || !n ? "" : n;
}, qn = (e, t, n, r, i, a, o) => {
	let s = Kn(n, o), c = Kn(i, o);
	if (!s || !c) return "";
	if (r && a) s += ` ${parseFloat(r)}%`, c += ` ${parseFloat(a)}%`;
	else if (r) {
		let e = parseFloat(r);
		e !== 50 && (s += ` ${e}%`);
	} else if (a) {
		let e = 100 - parseFloat(a);
		e !== 50 && (s += ` ${e}%`);
	}
	return t ? `color-mix(in ${e} ${t} hue, ${s}, ${c})` : `color-mix(in ${e}, ${s}, ${c})`;
}, Jn = (e, t, n, r, i, a) => {
	let o = n * i, s = r * a, c = o + s, l;
	return l = c === 0 ? [
		e[0] * i + t[0] * a,
		e[1] * i + t[1] * a,
		e[2] * i + t[2] * a
	] : [
		(e[0] * o + t[0] * s) / c,
		(e[1] * o + t[1] * s) / c,
		(e[2] * o + t[2] * s) / c
	], {
		comps: l,
		alpha: c
	};
}, Yn = (e, t, n, r, i, a, o) => {
	let [s, c, l, u] = n, [d, f, p] = t;
	if (a === "computedValue") return [
		e,
		s ? O : I(d, 16),
		c ? O : I(f, 16),
		l ? O : I(p, 16),
		u ? O : r * i
	];
	let [m, h, g] = o ?? t;
	return [
		"rgb",
		Math.round(m),
		Math.round(h),
		Math.round(g),
		parseFloat((r * i).toFixed(3))
	];
}, K = (e, t, n) => Array.isArray(e) ? e : e === "currentcolor" ? [
	O,
	O,
	O,
	O
] : t(e, n), Xn = (e, t, n, r, i, a, o) => {
	let s = e === "srgb" ? Nn : Mn, c = K(t, s, {
		colorSpace: e,
		format: N
	}), l = K(n, s, {
		colorSpace: e,
		format: N
	});
	if (!c || !l) return null;
	let [u, d, f, p] = c, [m, h, g, _] = l, v = [
		u === "none" && m === "none",
		d === "none" && h === "none",
		f === "none" && g === "none",
		p === "none" && _ === "none"
	], [[y, b, x, S], [C, w, T, E]] = bt(c, l, !0), { comps: D, alpha: O } = Jn([
		y,
		b,
		x
	], [
		C,
		w,
		T
	], S, E, r, i);
	return Yn(e, D, v, O, o, a, [
		D[0] * 255,
		D[1] * 255,
		D[2] * 255
	]);
}, Zn = (e, t, n, r, i, a, o) => {
	let s = e === "xyz-d50", c = {
		colorSpace: e,
		d50: s,
		format: N
	}, l = K(t, Pn, c), u = K(n, Pn, c);
	if (!l || !u) return null;
	let [d, f, p, m] = l, [h, g, _, v] = u, y = [
		d === "none" && h === "none",
		f === "none" && g === "none",
		p === "none" && _ === "none",
		m === "none" && v === "none"
	], [[b, x, S, C], [w, T, E, D]] = bt(l, u, !0), { comps: O, alpha: k } = Jn([
		b,
		x,
		S
	], [
		w,
		T,
		E
	], C, D, r, i);
	return Yn(e, O, y, k, o, a, s ? kt(O, !0) : wt(O, !0));
}, Qn = (e, t, n, r, i, a, o, s) => {
	let c = e === "hsl" ? Fn : In, l = {
		colorSpace: e,
		format: N
	}, u = K(n, c, l), d = K(r, c, l);
	if (!u || !d) return null;
	let [, , , f] = u, [, , , p] = d, m = [
		!1,
		!1,
		!1,
		f === "none" && p === "none"
	], [[h, g, _, v], [y, b, x, S]] = bt(u, d, !0);
	t && ([h, y] = nt(h, y, t));
	let C = v * i, w = S * a, T = C + w, E = (h * i + y * a) % 360, D, O;
	T === 0 ? (D = g * i + b * a, O = _ * i + x * a) : (D = (g * C + b * w) / T, O = (_ * C + x * w) / T);
	let [k, A, ee] = Nn(`${e}(${E} ${D} ${O})`), te = [
		k / 255,
		A / 255,
		ee / 255
	];
	return Yn(o === "computedValue" ? "srgb" : e, te, m, T, s, o, [
		k,
		A,
		ee
	]);
}, $n = (e, t, n, r, i, a, o, s) => {
	let c = e === "lch" ? Rn : Bn, l = {
		colorSpace: e,
		format: N
	}, u = K(n, c, l), d = K(r, c, l);
	if (!u || !d) return null;
	let [f, p, m, h] = u, [g, _, v, y] = d, b = [
		f === "none" && g === "none",
		p === "none" && _ === "none",
		m === "none" && v === "none",
		h === "none" && y === "none"
	], [[x, S, C, w], [T, E, D, O]] = bt(u, d, !0);
	t && ([C, D] = nt(C, D, t));
	let k = w * i, A = O * a, ee = k + A, te = (C * i + D * a) % 360, ne, j;
	ee === 0 ? (ne = x * i + T * a, j = S * i + E * a) : (ne = (x * k + T * A) / ee, j = (S * k + E * A) / ee);
	let re;
	if (o !== "computedValue") {
		let [, t, n, r] = qr(`${e}(${ne} ${j} ${te})`);
		re = [
			t,
			n,
			r
		];
	}
	return Yn(e, [
		ne,
		j,
		te
	], b, ee, s, o, re);
}, er = (e, t, n, r, i, a, o) => {
	let s = e === "lab" ? Ln : zn, c = {
		colorSpace: e,
		format: N
	}, l = K(t, s, c), u = K(n, s, c);
	if (!l || !u) return null;
	let [d, f, p, m] = l, [h, g, _, v] = u, y = [
		d === "none" && h === "none",
		f === "none" && g === "none",
		p === "none" && _ === "none",
		m === "none" && v === "none"
	], [[b, x, S, C], [w, T, E, D]] = bt(l, u, !0), { comps: O, alpha: k } = Jn([
		b,
		x,
		S
	], [
		w,
		T,
		E
	], C, D, r, i), A;
	if (a !== "computedValue") {
		let [, t, n, r] = qr(`${e}(${O[0]} ${O[1]} ${O[2]})`);
		A = [
			t,
			n,
			r
		];
	}
	return Yn(e, O, y, k, o, a, A);
}, tr = (e, t, n, r, i, a, o, s, c, l) => {
	let u = null;
	return /^srgb(?:-linear)?$/.test(e) ? u = Xn(e, n, r, i, a, s, o) : /^xyz(?:-d65|-d50)?$/.test(e) ? u = Zn(e, n, r, i, a, s, o) : /^h(?:sl|wb)$/.test(e) ? u = Qn(e, t, n, r, i, a, s, o) : /^(?:ok)?lch$/.test(e) ? u = $n(e, t, n, r, i, a, s, o) : /^(?:ok)?lab$/.test(e) && (u = er(e, n, r, i, a, s, o)), u === null ? ot(l, s, c) : u;
}, nr = (e, t = {}, n = () => null) => {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	e = e.toLowerCase().trim();
	let { format: r = "", nullable: i = !1 } = t, a = _({
		namespace: Vn,
		name: "resolveColorMix",
		value: e
	}, t), o = h(a);
	if (o !== !1) {
		let { item: e } = o;
		return Array.isArray(e) ? [...e] : v(e) ? e : null;
	}
	if (!e.startsWith("color-mix(") || !e.endsWith(")")) return ot(a, r, i);
	let s = F(e.slice(10, -1).trim(), { delimiter: "," }).map((e) => e.trim());
	if (s.length !== 3) return ot(a, r, i);
	let c = Hn(s[0]);
	if (!c) return ot(a, r, i);
	let { colorSpace: l, hueArc: u } = c, { color: d, pct: f } = Un(s[1]), { color: p, pct: g } = Un(s[2]);
	d = Wn(d, t, n), p = Wn(p, t, n);
	let y = Gn(f, g);
	if (!y) return ot(a, r, i);
	let { pA: b, pB: x, m: S } = y;
	if (l === "xyz" && (l = "xyz-d65"), r === "specifiedValue") {
		let e = qn(l, u, d, f, p, g, t);
		return e ? (m(a, e), e) : ot(a, r, i);
	}
	let C = tr(l, u, d, p, b, x, S, r, i, a);
	return C && m(a, C), C;
}, rr = "relative-color", { CloseParen: ir, Comment: ar, Delim: or, Dimension: sr, EOF: cr, Function: lr, Ident: ur, Number: dr, OpenParen: fr, Percentage: pr, Whitespace: mr } = s, { HasNoneKeywords: hr } = e, gr = /* @__PURE__ */ new Map([
	["color", [
		"r",
		"g",
		"b",
		"alpha"
	]],
	["hsl", [
		"h",
		"s",
		"l",
		"alpha"
	]],
	["hsla", [
		"h",
		"s",
		"l",
		"alpha"
	]],
	["hwb", [
		"h",
		"w",
		"b",
		"alpha"
	]],
	["lab", [
		"l",
		"a",
		"b",
		"alpha"
	]],
	["lch", [
		"l",
		"c",
		"h",
		"alpha"
	]],
	["oklab", [
		"l",
		"a",
		"b",
		"alpha"
	]],
	["oklch", [
		"l",
		"c",
		"h",
		"alpha"
	]],
	["rgb", [
		"r",
		"g",
		"b",
		"alpha"
	]],
	["rgba", [
		"r",
		"g",
		"b",
		"alpha"
	]]
]), _r = /* @__PURE__ */ new Set([
	"lab",
	"lch",
	"oklab",
	"oklch"
]), vr = /* @__PURE__ */ new Set([
	"hsl",
	"hsla",
	"hwb"
]), yr = /* @__PURE__ */ new Set([
	"color(",
	"hsl(",
	"hsla(",
	"hwb(",
	"lab(",
	"lch(",
	"oklab(",
	"oklch(",
	"rgb(",
	"rgba("
]), br = /* @__PURE__ */ new Set([
	"abs(",
	"acos(",
	"asin(",
	"atan(",
	"atan2(",
	"clamp(",
	"cos(",
	"exp(",
	"hypot(",
	"log(",
	"max(",
	"min(",
	"mod(",
	"pow(",
	"rem(",
	"round(",
	"sign(",
	"sin(",
	"sqrt(",
	"tan("
]), xr = /* @__PURE__ */ new Set([
	"abs(",
	"cos(",
	"sign(",
	"sin(",
	"tan("
]), Sr = RegExp(`^(?:${ue})\\(\\s*from\\s+(${Te}|${De})\\s+`), Cr = RegExp(`^(${ue})\\(\\s*from\\s+`), wr = RegExp(`^(?:${ue})\\(\\s*from\\s+`), Tr = (e, t) => {
	let n = [];
	for (let r of e) if (r.length === 1) {
		let [e] = r;
		y(e) && n.push(e);
	} else if (r.length) {
		let e = sn(r.join(""), { format: t });
		n.push(e);
	}
	return n;
}, Er = (e) => {
	for (let t = e.length - 1; t >= 0; t--) if (e[t] !== " ") return e[t];
}, Dr = (e, t = {}) => {
	if (!Array.isArray(e)) throw TypeError(`${e} is not an array.`);
	let { colorSpace: n = "", format: r = "" } = t, i = gr.get(n);
	if (!i) return null;
	let a = /* @__PURE__ */ new Set(), o = [
		[],
		[],
		[],
		[]
	], s = 0, c = 0, l = "", u = !1;
	for (let n of e) {
		if (!Array.isArray(n)) throw TypeError(`${n} is not an array.`);
		let [e, r, , , d] = n, f = o[s];
		if (Array.isArray(f)) switch (e) {
			case or:
				if (l) {
					if ((r === "+" || r === "-") && u && !xr.has(l)) return null;
					u = !1, f.push(r);
				}
				break;
			case sr: {
				if (!l || !xr.has(l)) return null;
				let e = cn(n, t);
				v(e) ? f.push(e) : f.push(r);
				break;
			}
			case lr:
				f.push(r), l = r, c++, br.has(r) && a.add(c);
				break;
			case ur:
				if (!i.includes(r)) return null;
				f.push(r), l || s++;
				break;
			case dr:
				f.push(Number(d?.value)), l || s++;
				break;
			case fr:
				f.push(r), c++;
				break;
			case ir:
				l && (f.at(-1) === " " ? f[f.length - 1] = r : f.push(r), a.has(c) && a.delete(c), c--, c === 0 && (l = "", s++));
				break;
			case pr:
				if (!l) return null;
				if (!xr.has(l)) {
					let e = Er(f);
					if (e === "+" || e === "-") return null;
					u = e !== "*" && e !== "/";
				}
				f.push(Number(d?.value) / 100);
				break;
			case mr:
				if (f.length && l) {
					let e = f.at(-1);
					(typeof e == "number" || v(e) && !e.endsWith("(") && e !== " ") && f.push(r);
				}
				break;
			default: e !== ar && e !== cr && l && f.push(r);
		}
	}
	return Tr(o, r);
}, Or = (e, t, n, r) => {
	let { colorScheme: i, format: a } = n, [, o] = F(e.replace(RegExp(`^${t}\\(`), "").replace(/\)$/, "")), s = r(o, {
		colorScheme: i,
		format: ke
	});
	if (!s) return null;
	if (a === "specifiedValue") return e.replace(o, s);
	let c = r(s, n);
	return v(c) ? e.replace(o, c) : null;
}, kr = (e, t, n) => {
	let [, r] = e.match(Cr), i = {
		...t,
		colorSpace: r
	}, [, a] = e.split(wr), o = c({ css: a }), s = [], l = 0, u = 0;
	for (let [e, t] of o) {
		switch (u++, e) {
			case lr:
			case fr:
				s.push(t), l++;
				break;
			case ir:
				s.at(-1) === " " ? s[s.length - 1] = t : s.push(t), l--;
				break;
			case mr: {
				let e = s.at(-1);
				v(e) && !e.endsWith("(") && e !== " " && s.push(t);
				break;
			}
			default: e !== ar && e !== cr && s.push(t);
		}
		if (l === 0) break;
	}
	let d = Pr(s.join("").trim(), i, n);
	if (d === null) return null;
	let f = Dr(o.slice(u), i);
	if (f === null) return null;
	let [p, m, h, g] = f, _ = "";
	return _ = y(g) ? ` ${p} ${m} ${h} / ${g})` : ` ${f.join(" ")})`, e.replace(a, `${d}${_}`);
}, Ar = (e, t = {}, n = () => null) => {
	if (!v(e) || (e = e.toLowerCase().trim(), !e)) return null;
	if (!wr.test(e)) return e;
	let { currentColor: r, format: i } = t, a = _({
		namespace: rr,
		name: "extractOriginColor",
		value: e
	}, t), o = h(a);
	if (o !== !1) return o.item;
	if (/currentcolor/.test(e)) {
		if (!r) return m(a, null), null;
		e = e.replace(/currentcolor/g, r);
	}
	let [, s] = e.match(Cr), l = {
		...t,
		colorSpace: s
	};
	if (e.includes("light-dark(")) {
		let t = Or(e, s, l, n);
		if (t === null) return m(a, null), null;
		e = t;
	}
	if (Sr.test(e)) {
		let [, t] = e.match(Sr), [, r] = e.split(t);
		if (/^[a-z]+$/.test(t)) {
			if (!/^transparent$/.test(t) && !Object.hasOwn(hn, t)) return m(a, null), null;
		} else if (i === "specifiedValue") {
			let r = n(t, l);
			e = e.replace(t, r);
		}
		if (i === "specifiedValue") {
			let t = Dr(c({ css: r }), l);
			if (t === null) return m(a, null), null;
			let [n, i, o, s] = t, u = "";
			u = y(s) ? ` ${n} ${i} ${o} / ${s})` : ` ${t.join(" ")})`, r !== u && (e = e.replace(r, u));
		}
	} else {
		let t = kr(e, l, n);
		if (t === null) return m(a, null), null;
		e = t;
	}
	return m(a, e), e;
}, jr = (e) => {
	for (let t of e) {
		let [e, n] = t;
		if (e === lr && n === "var(") return !0;
	}
	return !1;
}, Mr = (e) => {
	for (let t = 0; t < e.length - 1; t++) {
		let [n, r] = e[t];
		if (n === lr && yr.has(r)) for (let n = t + 1; n < e.length; n++) {
			let [t, r] = e[n];
			if (t !== mr && t !== ar) {
				if (t === ur && r === "from") return !0;
				break;
			}
		}
	}
	return !1;
}, Nr = (e) => {
	if (!e) return null;
	let { alpha: t, channels: n, colorNotation: r, syntaxFlags: i } = e, a;
	a = Number.isNaN(Number(t)) ? i instanceof Set && i.has(hr) ? O : 0 : I(Number(t), 8);
	let o, s, c;
	[o, s, c] = n;
	let l;
	if (_r.has(r)) {
		let e = i instanceof Set && i.has(hr);
		o = Number.isNaN(o) ? e ? O : 0 : I(o, 16), s = Number.isNaN(s) ? e ? O : 0 : I(s, 16), c = Number.isNaN(c) ? e ? O : 0 : I(c, 16), l = a === 1 ? `${r}(${o} ${s} ${c})` : `${r}(${o} ${s} ${c} / ${a})`;
	} else if (vr.has(r)) {
		Number.isNaN(o) && (o = 0), Number.isNaN(s) && (s = 0), Number.isNaN(c) && (c = 0);
		let [e, t, n] = Nn(`${r}(${o} ${s} ${c} / ${a})`);
		e = I(e / 255, 10), t = I(t / 255, 10), n = I(n / 255, 10), l = a === 1 ? `color(srgb ${e} ${t} ${n})` : `color(srgb ${e} ${t} ${n} / ${a})`;
	} else {
		let e = r === "rgb" ? "srgb" : r, t = i instanceof Set && i.has(hr);
		o = Number.isNaN(o) ? t ? O : 0 : I(o, 10), s = Number.isNaN(s) ? t ? O : 0 : I(s, 10), c = Number.isNaN(c) ? t ? O : 0 : I(c, 10), l = a === 1 ? `color(${e} ${o} ${s} ${c})` : `color(${e} ${o} ${s} ${c} / ${a})`;
	}
	return l;
};
function Pr(e, n = {}, r = () => null) {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	e = e.toLowerCase().trim();
	let i = { ...n }, { format: o = "" } = i, s = c({ css: e });
	if (jr(s)) {
		if (o !== "specifiedValue") throw SyntaxError("Unexpected token var( found.");
		return e;
	}
	if (!Mr(s)) return e;
	let l = _({
		namespace: rr,
		name: "resolveRelativeColor",
		value: e
	}, i), u = h(l);
	if (u !== !1) return u.item;
	let d = Ar(e, i, r);
	if (d === null) return m(l, null), null;
	let f = d;
	if (o === "specifiedValue") return f.startsWith("rgba(") ? f.replace("rgba(", "rgb(") : f.startsWith("hsla(") ? f.replace("hsla(", "hsl(") : f;
	let p = c({ css: f }), g = a(p), y = Nr(t(g));
	return y === null ? (m(l, null), null) : (m(l, y), y);
}
//#endregion
//#region src/resolvers/resolve-color.ts
var Fr = "resolve-color", Ir = "rgba(0, 0, 0, 0)", Lr = RegExp(`^(?:${Te})$`), Rr = RegExp(`^color\\(\\s*(${ve})\\s*\\)$`), zr = /^currentColor$/i, Br = new RegExp(A), Vr = /^(?:(?:ok)?l(?:ab|ch)|color(?:-mix)?|hsla?|hwb|rgba?|var)\(/, Hr = new RegExp(ye), Ur = new RegExp(be), Wr = new RegExp(te), Gr = new RegExp(De), Kr = /^(?:specifi|comput)edValue$/, qr = (e, t = {}) => {
	if (v(e)) e = e.toLowerCase().trim();
	else throw TypeError(`${e} is not a string.`);
	let { colorSpace: n = "", format: r = "", nullable: i = !1 } = t, a = _({
		namespace: Fr,
		name: "resolveColorValue",
		value: e
	}, t), o = h(a);
	if (o !== !1) {
		let { item: e } = o;
		return Array.isArray(e) ? [...e] : e;
	}
	if (!Lr.test(e)) {
		let e = z(r, i);
		return e === null ? (m(a, null), null) : (m(a, e), v(e), e);
	}
	let s = "", c = 0, l = 0, u = 0, d = 0;
	if (zr.test(e)) {
		if (r === "specifiedValue") return m(a, e), e;
	} else if (/^[a-z]+$/.test(e)) {
		if (Object.hasOwn(hn, e)) {
			if (r === "specifiedValue") return m(a, e), e;
			[c, l, u] = hn[e], d = 1;
		} else switch (r) {
			case ke: return e === "transparent" ? (m(a, e), e) : (m(a, ""), "");
			case N:
				if (e === "transparent") {
					let e = [
						"rgb",
						0,
						0,
						0,
						0
					];
					return m(a, e), [...e];
				}
				return m(a, null), null;
			case M:
			default: {
				if (i && e !== "transparent") return m(a, null), null;
				let t = [
					"rgb",
					0,
					0,
					0,
					0
				];
				return m(a, t), [...t];
			}
		}
	} else if (e[0] === "#") [c, l, u, d] = Nt(e);
	else if (e.startsWith("hsl")) [, c, l, u, d] = yn(e, t);
	else if (e.startsWith("hwb")) [, c, l, u, d] = bn(e, t);
	else if (/^l(?:ab|ch)/.test(e)) {
		let n, i, o;
		if (e.startsWith("lab") ? [s, n, i, o, d] = xn(e, t) : [s, n, i, o, d] = Sn(e, t), Kr.test(r)) {
			let e = [
				s,
				n,
				i,
				o,
				d
			];
			return m(a, e), [...e];
		}
		[c, l, u] = kt([
			n,
			i,
			o
		]);
	} else if (/^okl(?:ab|ch)/.test(e)) {
		let n, i, o;
		if (e.startsWith("oklab") ? [s, n, i, o, d] = Cn(e, t) : [s, n, i, o, d] = wn(e, t), Kr.test(r)) {
			let e = [
				s,
				n,
				i,
				o,
				d
			];
			return m(a, e), [...e];
		}
		[c, l, u] = wt([
			n,
			i,
			o
		]);
	} else [, c, l, u, d] = vn(e, t);
	if (r === "mixValue" && n === "srgb") {
		let e = [
			"srgb",
			c / 255,
			l / 255,
			u / 255,
			d
		];
		return m(a, e), [...e];
	}
	let f = [
		"rgb",
		Math.round(c),
		Math.round(l),
		Math.round(u),
		d
	];
	return m(a, f), [...f];
}, q = (e, t = {}) => {
	if (v(e)) e = e.toLowerCase().trim();
	else throw TypeError(`${e} is not a string.`);
	let { colorSpace: n = "", format: r = "", nullable: i = !1 } = t, a = _({
		namespace: Fr,
		name: "resolveColorFunc",
		value: e
	}, t), o = h(a);
	if (o !== !1) {
		let { item: e } = o;
		return Array.isArray(e) ? [...e] : e;
	}
	if (!Rr.test(e)) {
		let e = z(r, i);
		return e === null ? (m(a, null), null) : (m(a, e), v(e), e);
	}
	let [s, c, l, u, d] = W(e, t);
	if (Kr.test(r) || r === "mixValue" && s === n) {
		let e = [
			s,
			c,
			l,
			u,
			d
		];
		return m(a, e), [...e];
	}
	let f = parseFloat(`${c}`), p = parseFloat(`${l}`), g = parseFloat(`${u}`), y = L(`${d}`), [b, x, S] = wt([
		f,
		p,
		g
	], !0), C = [
		"rgb",
		b,
		x,
		S,
		y
	];
	return m(a, C), [...C];
}, J = (e, t = {}) => {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	e = e.trim();
	let { colorScheme: n = "normal", currentColor: r = "", format: i = M, nullable: a = !1 } = t, o = _({
		namespace: Fr,
		name: "resolve",
		value: e
	}, t), s = h(o);
	if (s !== !1) return s.item;
	if (Wr.test(e)) {
		if (i === "specifiedValue") return m(o, e), e;
		let n = pn(e, t);
		if (n === null) {
			let e = i === "hex" || i === "hexAlpha" || a ? null : Ir;
			return m(o, e), e;
		}
		e = n;
	}
	if (t.format !== i && (t.format = i), e = e.toLowerCase(), Hr.test(e) && e.endsWith(")")) {
		let [r = "", a = ""] = F(e.replace(Hr, "").replace(/\)$/, ""), { delimiter: "," });
		if (r && a) {
			if (i === "specifiedValue") {
				let e = J(r, t), n = J(a, t), i = e && n ? `light-dark(${e}, ${n})` : "";
				return m(o, i), i;
			}
			let e = J(n === "dark" ? a : r, t);
			return m(o, e), e;
		}
		let s;
		return s = i === "specifiedValue" ? "" : i === "hex" || i === "hexAlpha" ? null : Ir, m(o, s), s;
	}
	if (Ur.test(e)) {
		let n = Pr(e, t, J);
		if (i === "computedValue") {
			let e = n === null && !a ? Ir : n;
			return m(o, e), e;
		}
		if (i === "specifiedValue") {
			let e = n === null ? "" : n;
			return m(o, e), e;
		}
		e = n === null ? "" : n;
	}
	Br.test(e) && (e = un(e, t));
	let c = "", l = NaN, u = NaN, d = NaN, f = NaN;
	if (e === "transparent") {
		let t;
		switch (i) {
			case ke:
				t = e;
				break;
			case "hex":
				t = null;
				break;
			case "hexAlpha":
				t = "#00000000";
				break;
			default: t = Ir;
		}
		return m(o, t), t;
	}
	if (e === "currentcolor") {
		if (i === "specifiedValue") return m(o, e), e;
		if (r) {
			let e;
			if (e = r.startsWith("color-mix(") ? nr(r, t, J) : r.startsWith("color(") ? q(r, t) : qr(r, t), e === null) return m(o, null), null;
			[c, l, u, d, f] = e;
		} else {
			let t = i === "computedValue" ? Ir : e;
			if (i === "computedValue") return m(o, t), t;
		}
	} else if (i === "specifiedValue") {
		let n = "";
		if (e.startsWith("color-mix(")) {
			let r = nr(e, t, J);
			v(r) && r && (n = r);
		} else if (e.startsWith("color(")) {
			let r = q(e, t);
			if (Array.isArray(r)) {
				let [e, t, i, a, o] = r;
				n = o === 1 ? `color(${e} ${t} ${i} ${a})` : `color(${e} ${t} ${i} ${a} / ${o})`;
			}
		} else {
			let r = qr(e, t);
			if (Array.isArray(r)) {
				let [e, t, i, a, o] = r;
				n = e === "rgb" ? o === 1 ? `${e}(${t}, ${i}, ${a})` : `${e}a(${t}, ${i}, ${a}, ${o})` : o === 1 ? `${e}(${t} ${i} ${a})` : `${e}(${t} ${i} ${a} / ${o})`;
			} else r && (n = r);
		}
		return m(o, n), n;
	} else if (e.startsWith("color-mix(")) {
		r && (e = e.replace(/currentcolor/g, r)), e = e.replace(/transparent/g, Ir);
		let n = nr(e, t, J);
		if (n === null) return m(o, null), null;
		[c, l, u, d, f] = n;
	} else if (e.startsWith("color(")) {
		let n = q(e, t);
		if (n === null) return m(o, null), null;
		[c, l, u, d, f] = n;
	} else if (e) {
		let n = qr(e, t);
		if (n === null) return m(o, null), null;
		[c, l, u, d, f] = n;
	}
	let p = "";
	switch (i) {
		case "hex":
		case "hexAlpha":
			p = Number.isNaN(l) || Number.isNaN(u) || Number.isNaN(d) || Number.isNaN(f) || i === "hex" && f === 0 ? null : Mt([
				l,
				u,
				d,
				i === "hex" ? 1 : f
			]);
			break;
		default: p = c === "rgb" ? f === 1 ? `${c}(${l}, ${u}, ${d})` : `${c}a(${l}, ${u}, ${d}, ${f})` : [
			"lab",
			"lch",
			"oklab",
			"oklch"
		].includes(c) ? f === 1 ? `${c}(${l} ${u} ${d})` : `${c}(${l} ${u} ${d} / ${f})` : f === 1 ? `color(${c} ${l} ${u} ${d})` : `color(${c} ${l} ${u} ${d} / ${f})`;
	}
	return m(o, p), p;
}, Y = (e, t = {}) => {
	if (!v(e)) return !1;
	let n = e.toLowerCase().trim();
	return n ? /^[a-z]+$/.test(n) ? n === "currentcolor" || n === "transparent" || Object.hasOwn(hn, n) : Lr.test(n) || Gr.test(n) ? !0 : Vr.test(n) ? !!J(n, {
		...t,
		nullable: !0
	}) : !1 : !1;
}, { CloseParen: Jr, Comma: Yr, Comment: Xr, Delim: Zr, Dimension: Qr, EOF: $r, Function: ei, Ident: ti, Number: ni, OpenParen: ri, Percentage: ii, Whitespace: ai } = s, oi = RegExp(`^(?:${T})$`, "i"), si = /^(?:calc|min|max|clamp)\(/i, ci = /^(?:e|pi|-?infinity|NaN)$/i, li = (e) => {
	let t = e.tokens[e.index];
	for (; t && (t[0] === ai || t[0] === Xr);) e.index++, t = e.tokens[e.index];
}, ui = (e, t, n) => {
	for (let r = t; r >= 0 && r < e.length; r += n) {
		let [t] = e[r];
		if (t === ai) return !0;
		if (t !== Xr) break;
	}
	return !1;
}, di = (e) => {
	let t = pi(e);
	if (t === null) return null;
	li(e);
	let n = e.tokens[e.index];
	for (; n && n[0] === Zr && (n[1] === "*" || n[1] === "/");) {
		let r = n[1];
		e.index++;
		let i = pi(e);
		if (i === null || (r === "*" ? t !== 0 && i !== 0 : i !== 0)) return null;
		t += i, li(e), n = e.tokens[e.index];
	}
	return t;
}, fi = (e) => {
	let t = di(e);
	if (t === null) return null;
	let n = e.tokens[e.index];
	for (; n && n[0] === Zr && (n[1] === "+" || n[1] === "-");) {
		if (!ui(e.tokens, e.index - 1, -1) || !ui(e.tokens, e.index + 1, 1) || (e.index++, di(e) !== t)) return null;
		n = e.tokens[e.index];
	}
	return t;
};
function pi(e) {
	li(e);
	let t = e.tokens[e.index];
	if (!t || t[0] === $r) return null;
	e.index++;
	let [n, , , , r] = t;
	switch (n) {
		case ni: return 0;
		case ii: return 1;
		case Qr: return oi.test(r.unit) ? 1 : null;
		case ti: return ci.test(r.value) ? 0 : null;
		case ri:
		case ei: {
			let t = n === ei ? r.value.toLowerCase() : "calc";
			if (![
				"calc",
				"min",
				"max",
				"clamp"
			].includes(t)) return null;
			let i = fi(e);
			if (i === null) return null;
			let a = 1, o = e.tokens[e.index];
			for (; o && o[0] === Yr;) {
				if (e.index++, fi(e) !== i) return null;
				a++, o = e.tokens[e.index];
			}
			let s = e.tokens[e.index];
			return !s || s[0] !== Jr || t === "calc" && a !== 1 || t === "clamp" && a !== 3 ? null : (e.index++, i);
		}
		default: return null;
	}
}
var mi = (e) => {
	if (!v(e) || !si.test(e)) return !1;
	let t = [], n = {
		tokens: c({ css: e }, { onParseError: t.push.bind(t) }),
		index: 0
	}, r = pi(n);
	li(n);
	let i = n.tokens[n.index];
	return t.length === 0 && r === 1 && !!i && i[0] === $r;
}, { Function: hi } = s, gi = `${E}(?:${w})`, X = `${`${E}(?:${T})|0`}|${k}`, _i = `${D}(?:${T}|%)|0`, vi = `${D}(?:${T})|0`, Z = "center", yi = "left|right", bi = "top|bottom", xi = "start|end", Si = `${yi}|x-(?:${xi})`, Ci = `${bi}|y-(?:${xi})`, wi = `block-(?:${xi})`, Ti = `inline-(?:${xi})`, Ei = `${Z}|${Si}|${Ci}|${wi}|${Ti}|${X}`, Di = [
	`(?:${Z}|${Si})\\s+(?:${Z}|${Ci})`,
	`(?:${Z}|${Ci})\\s+(?:${Z}|${Si})`,
	`(?:${Z}|${Si}|${X})\\s+(?:${Z}|${Ci}|${X})`,
	`(?:${Z}|${wi})\\s+(?:${Z}|${Ti})`,
	`(?:${Z}|${Ti})\\s+(?:${Z}|${wi})`,
	`(?:${Z}|${xi})\\s+(?:${Z}|${xi})`
].join("|"), Oi = [
	`(?:${Si})\\s+(?:${X})\\s+(?:${Ci})\\s+(?:${X})`,
	`(?:${Ci})\\s+(?:${X})\\s+(?:${Si})\\s+(?:${X})`,
	`(?:${wi})\\s+(?:${X})\\s+(?:${Ci})\\s+(?:${X})`,
	`(?:${Ti})\\s+(?:${X})\\s+(?:${wi})\\s+(?:${X})`,
	`(?:${xi})\\s+(?:${X})\\s+(?:${xi})\\s+(?:${X})`
].join("|"), ki = "(?:clos|farth)est-(?:corner|side)", Ai = [
	`${ki}(?:\\s+${ki})?`,
	`${vi}`,
	`(?:${_i})\\s+(?:${_i})`
].join("|"), ji = "circle|ellipse", Mi = `from\\s+${gi}`, Q = `at\\s+(?:${Ei}|${Di}|${Oi})`, Ni = `to\\s+(?:(?:${yi})(?:\\s(?:${bi}))?|(?:${bi})(?:\\s(?:${yi}))?)`, $ = `in\\s+(?:${he}|${de})`, Pi = [
	/ellipse/,
	/farthest-corner/,
	/at\s+center/
], Fi = [/at\s+center/], Ii = {
	format: ke,
	nullable: !0
}, Li = /^(?:repeating-)?conic-gradient$/, Ri = /^(?:repeating-)?linear-gradient$/, zi = /^(?:repeating-)?radial-gradient$/;
RegExp(`^${Oe}$`, "i");
var Bi = RegExp(`^(?:${T})$`, "i"), Vi = /^to\s+bottom$/i, Hi = [
	RegExp(`^${Mi}(?:\\s+${Q})?(?:\\s+${$})?$`, "i"),
	RegExp(`^${Q}(?:\\s+${$})?$`, "i"),
	RegExp(`^${$}(?:\\s+${Mi})?(?:\\s+${Q})?$`, "i")
], Ui = [RegExp(`^(?:${gi}|${Ni})(?:\\s+${$})?$`, "i"), RegExp(`^${$}(?:\\s+(?:${gi}|${Ni}))?$`, "i")], Wi = [
	RegExp(`^(?:${ji})(?:\\s+(?:${Ai}))?(?:\\s+${Q})?(?:\\s+${$})?$`, "i"),
	RegExp(`^(?:${Ai})(?:\\s+(?:${ji}))?(?:\\s+${Q})?(?:\\s+${$})?$`, "i"),
	RegExp(`^${Q}(?:\\s+${$})?$`, "i"),
	RegExp(`^${$}(?:\\s+${ji})(?:\\s+(?:${Ai}))?(?:\\s+${Q})?$`, "i"),
	RegExp(`^${$}(?:\\s+${Ai})(?:\\s+(?:${ji}))?(?:\\s+${Q})?$`, "i"),
	RegExp(`^${$}(?:\\s+${Q})?$`, "i")
], Gi = (e) => {
	if (!v(e)) return {
		line: "",
		valid: !1
	};
	let t = e.trim();
	if (!t) return {
		line: "",
		valid: !0
	};
	let n = st(t);
	if (n.length === 0) return {
		line: e,
		valid: !1
	};
	let r = n.join(" ");
	if (!Ui.some((e) => e.test(r))) return {
		line: e,
		valid: !1
	};
	let i = r.replace(/\s+/g, " ").trim();
	return Vi.test(i) ? {
		line: "",
		valid: !0
	} : {
		line: i.replace(/^to\sbottom\s/i, "").replace(/\sto\sbottom$/i, "").trim(),
		valid: !0
	};
}, Ki = (e) => {
	if (!v(e)) return {
		line: "",
		valid: !1
	};
	let t = e.trim();
	if (!t) return {
		line: "",
		valid: !0
	};
	let n = st(t);
	if (n.length === 0) return {
		line: e,
		valid: !1
	};
	let r = n.join(" ");
	if (!Wi.some((e) => e.test(r))) return {
		line: e,
		valid: !1
	};
	let i = r;
	for (let e of Pi) i = i.replace(e, "");
	return i = i.replace(/\s{2,}/g, " ").trim(), {
		line: i,
		valid: !0
	};
}, qi = (e) => {
	if (!v(e)) return {
		line: "",
		valid: !1
	};
	let t = e.trim();
	if (!t) return {
		line: "",
		valid: !0
	};
	let n = st(t);
	if (n.length === 0) return {
		line: e,
		valid: !1
	};
	let r = n.join(" ");
	if (!Hi.some((e) => e.test(r))) return {
		line: e,
		valid: !1
	};
	let i = r;
	for (let e of Fi) i = i.replace(e, "");
	return i = i.replace(/\s{2,}/g, " ").trim(), {
		line: i,
		valid: !0
	};
}, Ji = (e, t) => {
	if (v(e) && v(t)) {
		let n = e.trim(), r = t.trim();
		if (Ri.test(r)) return Gi(n);
		if (zi.test(r)) return Ki(n);
		if (Li.test(r)) return qi(n);
	}
	return {
		line: e,
		valid: !1
	};
}, Yi = (e) => st(e), Xi = (e, t) => {
	if (!v(e)) return !1;
	let n = e.trim();
	if (!n) return !1;
	let r = c({ css: n }).filter((e) => e[0] !== s.Whitespace && e[0] !== s.Comment && e[0] !== s.EOF);
	if (r.length === 1) {
		let [e, n, , , i] = r[0];
		if (e === s.Number) return !t && Number(n) === 0;
		if (e === s.Percentage) return !0;
		if (e === s.Dimension) {
			let e = i.unit.toLowerCase();
			return t ? w.split("|").some((t) => RegExp(`^${t}$`, "i").test(e)) : Bi.test(e);
		}
		return !1;
	}
	return !t && mi(n);
}, Zi = (e, t, n = {}) => {
	if (!Array.isArray(e) || e.length <= 1) return {
		colorStops: e,
		valid: !1
	};
	let r = Li.test(t), i = [], a = "";
	for (let [t, o] of e.entries()) {
		if (!v(o)) return {
			colorStops: e,
			valid: !1
		};
		let s = Yi(o), [c, ...l] = s;
		if (!c || s.length > 3) return {
			colorStops: e,
			valid: !1
		};
		if (s.length === 1 && Xi(c, r)) {
			if (t === 0 || a === "hint") return {
				colorStops: e,
				valid: !1
			};
			a = "hint";
			let r = mi(c) ? un(c, n) : c;
			i.push(r);
			continue;
		}
		let u = [];
		for (let t of l) {
			if (!Xi(t, r)) return {
				colorStops: e,
				valid: !1
			};
			let i = mi(t) ? un(t, n) : t;
			u.push(i);
		}
		let d = F(c).join(" ");
		if (!Y(d, Ii)) return {
			colorStops: e,
			valid: !1
		};
		let f = J(d, n);
		if (!f || !Y(f, Ii)) return {
			colorStops: e,
			valid: !1
		};
		a = "color";
		let p = u.length > 0 ? `${f} ${u.join(" ")}` : f;
		i.push(p);
	}
	return a === "color" ? {
		colorStops: i,
		valid: !0
	} : {
		colorStops: e,
		valid: !1
	};
}, Qi = "gradient", $i = {
	format: ke,
	nullable: !0
}, ea = RegExp(`^${Oe}$`, "i"), ta = (e, t = {}) => {
	if (!v(e)) return null;
	let n = e.trim(), i = _({
		namespace: Qi,
		name: "parseGradient",
		value: n
	}, t), a = h(i);
	if (a !== !1) return a.item;
	let s = c({ css: n }), l = o(s);
	if (l.length !== 1 || !r(l[0])) return m(i, null), null;
	let u = l[0], d = u.getName().toLowerCase();
	if (!ea.test(d)) return m(i, null), null;
	let f = u.value.map((e) => e.toString()).join("");
	if (f) {
		let [e, ...r] = F(f, {
			delimiter: ",",
			preserveComment: !0
		});
		if (!e) return m(i, null), null;
		let [a] = Yi(e);
		if (a && Y(F(a).join(" "), $i)) {
			r.unshift(e);
			let { colorStops: a, valid: o } = Zi(r, d, t);
			if (o) {
				let e = {
					value: n,
					type: d,
					colorStopList: a
				};
				return m(i, e), e;
			}
		} else if (r.length > 1) {
			let { line: a, valid: o } = Ji(F(e).join(" "), d), { colorStops: s, valid: c } = Zi(r, d, t);
			if (o && c) {
				let e = {
					value: n,
					type: d,
					gradientLine: a,
					colorStopList: s
				};
				return m(i, e), e;
			}
		}
	}
	return m(i, null), null;
}, na = (e, t = {}) => {
	let n = { ...t }, r = et(n);
	if (e && e.length <= r) {
		let t = ta(e, n);
		if (t) {
			let { type: e, gradientLine: n, colorStopList: r } = t;
			return n ? `${e}(${n}, ${r.join(", ")})` : `${e}(${r.join(", ")})`;
		}
	}
	return n.format === "specifiedValue" ? "" : O;
}, ra = (e, t = {}) => !!ta(e, { ...t }), ia = (e, t = {}) => J(e, { ...t }), aa = (e, t = {}) => !!Y(e, {
	...t,
	nullable: !0
}), oa = "convert", sa = new RegExp(A), ca = new RegExp(be), la = new RegExp(te), ua = (e, t) => {
	if (!v(e)) return null;
	e = e.trim();
	let n = et(t);
	if (!e || e.length > n) return null;
	let r = _({
		namespace: oa,
		name: "preProcess",
		value: e
	}, t), i = h(r);
	if (i !== !1) return i.item;
	let a = e;
	if (la.test(e)) {
		let n = pn(e, t);
		if (v(n)) a = n;
		else return m(r, null), null;
	}
	if (ca.test(a)) {
		let e = Pr(a, t);
		if (v(e)) a = e;
		else return m(r, null), null;
	} else sa.test(a) && (a = un(a, t));
	if (a.startsWith("color-mix")) {
		let e = J(a, {
			...t,
			format: M,
			nullable: !0
		});
		a = typeof e == "string" ? e : null;
	}
	return !a || a.length > n ? (m(r, null), null) : (m(r, a), a);
}, da = (e, t, n) => (r, i = {}) => {
	if (!v(r)) throw TypeError(`${r} is not a string.`);
	let a = { ...i }, o = ua(r, a);
	if (o === null) return [
		0,
		0,
		0,
		0
	];
	let s = o.toLowerCase(), c = _({
		namespace: oa,
		name: e,
		value: s
	}, a), l = h(c);
	if (l !== !1) return [...l.item];
	let u = n(s, {
		...a,
		format: t
	});
	return m(c, u), [...u];
}, fa = (e) => it(e), pa = (e, t = {}) => {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	let n = { ...t }, r = ua(e, n);
	if (r === null) return null;
	let i = r.toLowerCase(), a = _({
		namespace: oa,
		name: "colorToHex",
		value: i
	}, n), o = h(a);
	if (o !== !1) return o.item;
	let s = J(i, {
		...n,
		nullable: !0,
		format: n.alpha ? "hexAlpha" : "hex"
	});
	return v(s) ? (m(a, s), s) : (m(a, null), null);
}, ma = da("colorToHsl", "hsl", Fn), ha = da("colorToHwb", "hwb", In), ga = da("colorToLab", "lab", Ln), _a = da("colorToLch", "lch", Rn), va = da("colorToOklab", "oklab", zn), ya = da("colorToOklch", "oklch", Bn), ba = da("colorToRgb", "rgb", Nn), xa = (e, t = {}) => {
	if (!v(e)) throw TypeError(`${e} is not a string.`);
	let n = { ...t }, r = ua(e, n);
	if (r === null) return [
		0,
		0,
		0,
		0
	];
	let i = r.toLowerCase(), a = _({
		namespace: oa,
		name: "colorToXyz",
		value: i
	}, n), o = h(a);
	if (o !== !1) return [...o.item];
	let s;
	s = i.startsWith("color(") ? W(i, n) : G(i, n);
	let [, ...c] = s;
	return m(a, c), [...c];
}, Sa = {
	colorToHex: pa,
	colorToHsl: ma,
	colorToHwb: ha,
	colorToLab: ga,
	colorToLch: _a,
	colorToOklab: va,
	colorToOklch: ya,
	colorToRgb: ba,
	colorToXyz: xa,
	colorToXyzD50: (e, t = {}) => xa(e, {
		...t,
		d50: !0
	}),
	numberToHex: fa
}, Ca = {
	cssCalc: un,
	cssVar: mn,
	extractDashedIdent: tt,
	isColor: aa,
	isGradient: ra,
	resolveGradient: na,
	resolveLengthInPixels: rt,
	splitValue: F
};
//#endregion
export { Sa as convert, ia as resolve, na as resolveGradient, Ca as utils };
