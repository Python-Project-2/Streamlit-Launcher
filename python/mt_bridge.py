#!/usr/bin/env python3
"""
Date Skunder — jembatan MetaTrader 4/5 untuk otak LLM (Trading/MetaTrader AI).

Peran berkas ini HANYA menghubungkan ekstensi ke terminal trading:
  • MetaTrader 5: memakai paket resmi `MetaTrader5` (Windows, terminal harus login).
  • MetaTrader 4: tidak punya paket Python resmi. Jalankan jembatan ini dengan
    `--mode bridge` dan arahkan `dateSkunder.mt.bridgeUrl` ke jembatan EA/HTTP Anda
    yang menyediakan endpoint JSON yang sama (lihat daftar di README/UI).
  • Mode simulasi (`--mode sim`): harga & order palsu untuk mencoba UI tanpa MT5.

Server HTTP kecil, hanya 127.0.0.1, dengan token opsional (header X-Bridge-Token).
Semua angka (bid/ask/spread/ATR/level) berasal dari terminal — bukan karangan model.
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import random
import socket
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

try:  # pragma: no cover - hanya tersedia di Windows dengan MT5
    import MetaTrader5 as mt5  # type: ignore
except Exception:  # noqa: BLE001
    mt5 = None

TOKEN = ""
MODE = "sim"
PLATFORM = "mt5"
SYMBOLS = {}
# Status koneksi terminal MT5: dipakai untuk menyambung otomatis tanpa akun palsu.
MT5_CONN = {"ready": False, "lastTry": 0.0, "error": ""}
# MT5 & state simulasi tidak thread-safe; semua permintaan diserialkan.
GLOBAL_LOCK = threading.RLock()


def with_mt5_lock(fn):
    """Serialkan panggilan MT5 (paket MetaTrader5 tidak thread-safe)."""
    def wrapper(*args, **kwargs):
        with GLOBAL_LOCK:
            return fn(*args, **kwargs)
    return wrapper

TF_SECONDS = {
    "M1": 60, "M5": 300, "M15": 900, "M30": 1800,
    "H1": 3600, "H4": 14400, "D1": 86400, "W1": 604800, "MN1": 2592000,
}


def log(*parts):
    stamp = datetime.now().strftime("%H:%M:%S")
    print(f"[mt-bridge {stamp}]", *parts, flush=True)


def iso_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def platform_info():
    return {
        "platform": sys.platform,
        "arch": "x64" if sys.maxsize > 2 ** 32 else "x86",
        "windows": sys.platform.startswith("win"),
        "mt5Package": mt5 is not None,
    }


def find_terminals(force=False):
    """Cari terminal64.exe MT5 yang terpasang di Windows (Program Files, AppData, dll)."""
    if not sys.platform.startswith("win"):
        return []
    now = time.time()
    if not force and now - TERMINAL_CACHE["at"] < 60:
        return TERMINAL_CACHE["list"]
    patterns = []
    for root in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)"), os.environ.get("LOCALAPPDATA")):
        if not root:
            continue
        patterns += [
            os.path.join(root, "terminal64.exe"),
            os.path.join(root, "*", "terminal64.exe"),
            os.path.join(root, "*", "*", "terminal64.exe"),
        ]
    appdata = os.environ.get("APPDATA")
    if appdata:
        patterns += [
            os.path.join(appdata, "MetaQuotes", "Terminal", "*", "terminal64.exe"),
            os.path.join(appdata, "*", "terminal64.exe"),
        ]
    found = set()
    for pat in patterns:
        try:
            for p in glob.glob(pat):
                if os.path.isfile(p):
                    found.add(os.path.abspath(p))
        except Exception:  # noqa: BLE001
            continue
    TERMINAL_CACHE["list"] = sorted(found)
    TERMINAL_CACHE["at"] = now
    return TERMINAL_CACHE["list"]


TERMINAL_CACHE = {"at": 0.0, "list": []}


def mt5_not_found_message(last_error):
    info = platform_info()
    if info["arch"] != "x64":
        return ("Python yang menjalankan bridge ini 32-bit; MetaTrader5 membutuhkan Python 64-bit. "
                "Install Python 3.x 64-bit lalu pip install MetaTrader5.")
    if not info["windows"]:
        return (f"MetaTrader5 Python hanya berjalan di Windows x64, sedangkan bridge ini di {info['platform']}. "
                "Jalankan bridge di PC Windows yang ada terminal MT5-nya; HP hanya klien (VS Code Remote/code-server).")
    found = find_terminals()
    if found:
        return (f"Terminal MT5 ditemukan tetapi belum bisa dipakai (error {last_error}). "
                "Pastikan terminal sudah login ke akun broker (tutup dialog Login), lalu bridge "
                "akan menyambung otomatis tanpa akun simulasi.")
    hint = r"C:\Program Files\MetaTrader 5\terminal64.exe"
    return (f"Terminal MT5 x64 tidak ditemukan/diinisialisasi (error {last_error}). "
            f"Pasang MT5 di PC ini atau isi path terminal64.exe (contoh: {hint}). "
            f"Kandidat ditemukan: {len(found)}.")


def diag(force=False):
    info = platform_info()
    info["terminals"] = find_terminals(force)
    return info


def diag_cached():
    """Diagnostik tanpa memindai disk — dipakai /health agar tidak pernah lambat."""
    info = platform_info()
    info["terminals"] = TERMINAL_CACHE["list"]
    return info


def lan_ips():
    """Alamat IPv4 LAN yang bisa dipakai HP (VS Code code-server)."""
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
        finally:
            s.close()
        if ip and not ip.startswith("127."):
            ips.append(ip)
    except Exception:  # noqa: BLE001
        pass
    return ips


# ── akun & simbol simulasi ───────────────────────────────────────────────────
SIM_SPECS = {
    "EURUSD": {"price": 1.0850, "digits": 5, "point": 0.00001, "contract": 100000, "vol": 0.00035},
    "GBPUSD": {"price": 1.2720, "digits": 5, "point": 0.00001, "contract": 100000, "vol": 0.00040},
    "USDJPY": {"price": 156.40, "digits": 3, "point": 0.001, "contract": 100000, "vol": 0.045},
    "XAUUSD": {"price": 2350.00, "digits": 2, "point": 0.01, "contract": 100, "vol": 1.20},
    "XAGUSD": {"price": 28.00, "digits": 3, "point": 0.001, "contract": 5000, "vol": 0.05},
    "BTCUSD": {"price": 64000.0, "digits": 2, "point": 0.01, "contract": 1, "vol": 55.0},
    "ETHUSD": {"price": 2450.0, "digits": 2, "point": 0.01, "contract": 1, "vol": 6.0},
    "XRPUSD": {"price": 0.5200, "digits": 4, "point": 0.0001, "contract": 1000, "vol": 0.0040},
    "SOLUSD": {"price": 150.00, "digits": 2, "point": 0.01, "contract": 1, "vol": 2.0},
    "US30": {"price": 39000.0, "digits": 1, "point": 0.1, "contract": 1, "vol": 30.0},
    "NAS100": {"price": 18000.0, "digits": 1, "point": 0.1, "contract": 1, "vol": 20.0},
}

SIM_STATE = {
    "balance": 10000.0,
    "equity": 10000.0,
    "positions": [],
    "next_ticket": 500001,
    "last_price": {},
    "last_tick_at": {},
    "realized": 0.0,
}
SIM_LOCK = threading.Lock()


def sim_price(symbol: str) -> float:
    spec = SIM_SPECS[symbol]
    now = time.time()
    last_at = SIM_STATE["last_tick_at"].get(symbol, now - 2)
    price = SIM_STATE["last_price"].get(symbol, spec["price"])
    steps = max(1, int((now - last_at) / 2))
    for _ in range(min(steps, 120)):
        price += random.gauss(0, spec["vol"])
    if price <= 0:
        price = spec["price"]
    SIM_STATE["last_price"][symbol] = price
    SIM_STATE["last_tick_at"][symbol] = now
    return price


def sim_symbol(symbol: str):
    if symbol not in SIM_SPECS:
        raise RuntimeError(
            f"Simbol {symbol} tidak ada di mode simulasi. Tersedia: " + ", ".join(sorted(SIM_SPECS.keys()))
        )
    spec = SIM_SPECS[symbol]
    price = sim_price(symbol)
    spread_points = 12 if symbol != "BTCUSD" else 30
    spread = spread_points * spec["point"]
    return {
        "name": symbol,
        "base": symbol,
        "group": "Simulasi",
        "bid": round(price - spread / 2, spec["digits"]),
        "ask": round(price + spread / 2, spec["digits"]),
        "spread": spread_points,
        "digits": spec["digits"],
        "point": spec["point"],
        "minLot": 0.01,
        "maxLot": 100.0,
        "lotStep": 0.01,
        "contractSize": spec["contract"],
        "tradeAllowed": True,
        "stopsLevel": 0,
        "freezeLevel": 0,
        "fillingMode": 0,
        "time": int(time.time()),
    }


def sim_bars(symbol: str, timeframe: str, count: int):
    spec = SIM_SPECS[symbol]
    step = TF_SECONDS.get(timeframe, 900)
    now = int(time.time())
    start = now - step * count
    price = spec["price"]
    bars = []
    rng = random.Random(hash(symbol) & 0xFFFF)
    for i in range(count):
        drift = math.sin(i / 18.0) * spec["vol"] * 0.6
        noise = rng.gauss(0, spec["vol"])
        open_p = price
        close_p = max(spec["point"], open_p + drift + noise)
        high = max(open_p, close_p) + abs(rng.gauss(0, spec["vol"] * 0.5))
        low = min(open_p, close_p) - abs(rng.gauss(0, spec["vol"] * 0.5))
        bars.append({
            "t": start + i * step,
            "o": open_p,
            "h": high,
            "l": low,
            "c": close_p,
            "v": int(800 + abs(rng.gauss(0, 250))),
        })
        price = close_p
    # Geser seluruh seri agar penutupan terakhir = harga live saat ini (konsisten dengan quote).
    price_now = sim_price(symbol)
    delta = price_now - bars[-1]["c"]
    for b in bars:
        b["o"] += delta
        b["h"] += delta
        b["l"] += delta
        b["c"] += delta
    bars[-1]["h"] = max(bars[-1]["h"], price_now)
    bars[-1]["l"] = min(bars[-1]["l"], price_now)
    SIM_STATE["last_price"][symbol] = price_now
    SIM_STATE["last_tick_at"][symbol] = time.time()
    return bars


def sim_floating(position, price):
    spec = SIM_SPECS[position["symbol"]]
    direction = 1 if position["type"] == "buy" else -1
    return (price - position["price"]) * direction * position["volume"] * spec["contract"]


def sim_positions():
    out = []
    for p in SIM_STATE["positions"]:
        spec = SIM_SPECS[p["symbol"]]
        current = sim_symbol(p["symbol"])["bid" if p["type"] == "buy" else "ask"]
        out.append({**p, "profit": round(sim_floating(p, current), 2), "current": current, "digits": spec["digits"]})
    return out


def sim_account():
    floating = sum(p["profit"] for p in sim_positions())
    equity = SIM_STATE["balance"] + floating
    return {
        "login": 900001,
        "server": "DateSkunder-Sim",
        "currency": "USD",
        "balance": round(SIM_STATE["balance"], 2),
        "equity": round(equity, 2),
        "margin": 0.0,
        "freeMargin": round(equity, 2),
        "marginLevel": 0.0,
        "leverage": 100,
        "name": "Simulasi (bukan uang nyata)",
    }


def sim_modify(payload):
    ticket = int(payload.get("ticket") or 0)
    sl = float(payload.get("sl") or 0.0)
    tp = float(payload.get("tp") or 0.0)
    for p in SIM_STATE["positions"]:
        if p["ticket"] != ticket:
            continue
        info = sim_symbol(p["symbol"])
        if sl and p["type"] == "buy" and sl >= info["bid"]:
            raise RuntimeError("SL buy harus di bawah harga sekarang")
        if sl and p["type"] == "sell" and sl <= info["ask"]:
            raise RuntimeError("SL sell harus di atas harga sekarang")
        if sl:
            p["sl"] = sl
        if tp:
            p["tp"] = tp
        return {"ok": True, "ticket": ticket, "retcode": 0, "message": "simulasi modify", "reason": "simulasi"}
    raise RuntimeError(f"Posisi {ticket} tidak ditemukan")


# ── adaptor MT5 asli ─────────────────────────────────────────────────────────
MT5_TF = {}


def mt5_initialize(timeout=8000, **kwargs):
    """initialize dengan timeout supaya bridge tidak macet bila terminal menampilkan dialog login."""
    try:
        return mt5.initialize(timeout=timeout, **kwargs)
    except TypeError:  # versi paket lama tanpa parameter timeout
        return mt5.initialize(**kwargs)


def terminal_running():
    """Apakah terminal64.exe sedang berjalan? Mencegah bridge mencoba “menghidupkan” terminal
    berulang kali (panggilan initialize bisa membekukan proses Python)."""
    if not sys.platform.startswith("win"):
        return True
    try:
        import subprocess
        si = subprocess.STARTUPINFO()
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq terminal64.exe", "/NH"],
            capture_output=True, text=True, timeout=5, startupinfo=si,
        )
        return "terminal64.exe" in (out.stdout or "").lower()
    except Exception:  # noqa: BLE001
        return True


def mt5_ready(timeout=6000, path_timeout=15000):
    if mt5 is None:
        return False, "Paket Python MetaTrader5 belum terpasang (pip install MetaTrader5)."
    if mt5_initialize(timeout=timeout):
        return True, ""
    last = mt5.last_error()
    for candidate in find_terminals():
        try:
            # Terminal mungkin belum berjalan: beri waktu lebih untuk start + login.
            if mt5_initialize(timeout=path_timeout, path=candidate):
                return True, ""
        except Exception:  # noqa: BLE001
            pass
    return False, mt5_not_found_message(last)


def ensure_mt5(force=False):
    """Cek koneksi terminal MT5.

    force=False HANYA membaca status terakhir (tidak pernah memblokir HTTP request);
    percobaan koneksi dilakukan thread pemantau `mt5_watch_loop()` atau saat /login.
    """
    if mt5 is None:
        return False, "Paket Python MetaTrader5 belum terpasang (pip install MetaTrader5)."
    if MT5_CONN["ready"]:
        try:
            if mt5.account_info() is not None:
                return True, ""
        except Exception:  # noqa: BLE001
            pass
        MT5_CONN["ready"] = False
        MT5_CONN["error"] = "koneksi terminal MT5 terputus"
    if not force:
        return False, MT5_CONN["error"] or "menunggu terminal MetaTrader 5…"
    now = time.time()
    MT5_CONN["lastTry"] = now
    ok, err = mt5_ready()
    MT5_CONN["ready"] = ok
    MT5_CONN["error"] = "" if ok else (err or "terminal MT5 belum siap")
    if ok:
        fill_mt5_tf()
        log("terhubung ke terminal MetaTrader 5 (akun broker aktif).")
    return ok, MT5_CONN["error"]


def mt5_watch_loop():
    """Coba sambung/ulang MT5 di latar belakang — tidak memblokir permintaan UI."""
    while True:
        try:
            if not MT5_CONN["ready"]:
                if not terminal_running():
                    MT5_CONN["ready"] = False
                    MT5_CONN["error"] = ("Terminal MetaTrader 5 belum dibuka. Buka MT5, login ke akun broker, "
                                         "lalu panel menyambung otomatis (bukan akun simulasi).")
                else:
                    # Timeout pendek: initialize yang menggantung tidak boleh membekukan HTTP server.
                    ok, err = mt5_ready(timeout=2000, path_timeout=2000)
                    MT5_CONN["ready"] = ok
                    MT5_CONN["error"] = "" if ok else (err or "terminal MT5 belum siap")
                    if ok:
                        fill_mt5_tf()
                        log("terhubung ke terminal MetaTrader 5 (akun broker aktif).")
        except Exception as exc:  # noqa: BLE001
            MT5_CONN["error"] = str(exc)
        time.sleep(30 if MT5_CONN["ready"] else 15)


SYMBOL_CACHE = {"at": 0.0, "names": []}
CATALOG_CACHE = {"at": 0.0, "names": []}


def mt5_symbol_names(force=False):
    if mt5 is None:
        return []
    now = time.time()
    if not force and now - SYMBOL_CACHE["at"] < 120:
        return SYMBOL_CACHE["names"]
    try:
        names = [s.name for s in (mt5.symbols_get() or [])]
    except Exception:  # noqa: BLE001
        names = []
    SYMBOL_CACHE["names"] = names
    SYMBOL_CACHE["at"] = now
    return names


# ── normalisasi nama simbol antar-broker ────────────────────────────────────
# Broker menjual simbol yang sama dengan akhiran berbeda: ETHUSDm (micro XM/Exness),
# XAUUSDc, EURUSD.raw, US30.cash, EURUSD_i, dst. Semua dianggap satu "base" supaya
# chart, watchlist, dan order otomatis memakai nama yang benar-benar ada di akun.
QUOTE_CODES = (
    "USDT", "USDC", "USD", "EUR", "JPY", "GBP", "AUD", "NZD", "CHF", "CAD",
    "XAU", "XAG", "BTC", "ETH", "SGD", "CNH", "HKD", "MXN", "TRY", "ZAR",
)
SUFFIX_MARKERS = (
    "-ECN", "-PRO", "-RAW", "-STP", "-CASH", ".ECN", ".PRO", ".RAW", ".CASH",
    ".SPOT", ".STP", ".IDX", ".CFD", ".I", ".M", ".R", ".Z", ".A", ".B", ".C",
    ".D", ".E", "_I", "_M", "_R", "_ECN", "#",
)
SINGLE_SUFFIX = "MRIZCK"


def symbol_base(name):
    """ETHUSDm / ETHUSD.raw / ETHUSD_i → ETHUSD. Dipakai host & UI (harus sama)."""
    up = str(name or "").strip().upper()
    if not up:
        return ""
    for marker in SUFFIX_MARKERS:
        if up.endswith(marker) and len(up) - len(marker) >= 3:
            up = up[: -len(marker)]
            break
    # Akhiran satu huruf khas akun mikro/cent: ETHUSDm, XAUUSDc, EURUSDr.
    if len(up) > 4 and up[-1] in SINGLE_SUFFIX:
        head = up[:-1]
        if head.endswith(QUOTE_CODES) or head[-1:].isdigit():
            up = head
    return up


def symbol_group(path, name=""):
    """Grup Market Watch (mis. 'Crypto', 'Forex\\Major') untuk dropdown di HP."""
    raw = str(path or "").strip()
    if not raw:
        return ""
    for sep in ("\\", "/"):
        raw = raw.replace(sep, "|")
    parts = [p for p in raw.split("|") if p]
    return parts[0][:24] if parts else ""


def _symbol_rank(name, visible=None, trade_mode=None):
    """Pilih kandidat terbaik: terlihat, bisa ditradingkan, nama paling pendek."""
    score = 0
    if visible:
        score -= 4
    if trade_mode == 4 or trade_mode is None:
        score -= 2
    return (score, len(name), name)


def resolve_symbol(requested):
    """Cocokkan nama simbol broker (ETHUSD → ETHUSDm/ETHUSD.raw) agar chart tidak kosong."""
    if mt5 is None:
        return None
    name = str(requested or "").strip()
    if not name:
        return None
    try:
        info = mt5.symbol_info(name)
        if info is not None:
            return info.name
    except Exception:  # noqa: BLE001
        pass
    up = name.upper()
    base = symbol_base(up)
    names = mt5_symbol_names()
    if not names:
        return None

    def details(candidate):
        try:
            info = mt5.symbol_info(candidate)
        except Exception:  # noqa: BLE001
            return None, None
        if info is None:
            return None, None
        return bool(getattr(info, "visible", False)), int(getattr(info, "trade_mode", 4))

    buckets = [
        [n for n in names if n.upper() == up],
        [n for n in names if symbol_base(n) == base and base],
        [n for n in names if n.upper().startswith(up) and len(n) <= len(up) + 4],
        [n for n in names if symbol_base(n).startswith(base) and base and len(n) <= len(up) + 6],
    ]
    for bucket in buckets:
        if not bucket:
            continue
        ranked = []
        for candidate in bucket[:60]:
            visible, trade_mode = details(candidate)
            ranked.append((_symbol_rank(candidate, visible, trade_mode), candidate))
        ranked.sort(key=lambda row: row[0])
        return ranked[0][1]
    return None


def mt5_symbols_catalog(limit=3000):
    """Daftar simbol akun/broker (nama, grup, digit, lot) untuk dropdown di HP."""
    if mt5 is None:
        return []
    now = time.time()
    if CATALOG_CACHE["names"] and now - CATALOG_CACHE["at"] < 60:
        return CATALOG_CACHE["names"][:limit]
    try:
        rows = mt5.symbols_get() or []
    except Exception:  # noqa: BLE001
        return []
    out = []
    for row in rows:
        name = str(getattr(row, "name", "") or "")
        if not name:
            continue
        out.append({
            "name": name,
            "base": symbol_base(name),
            "group": symbol_group(getattr(row, "path", ""), name),
            "description": str(getattr(row, "description", "") or "")[:60],
            "digits": int(getattr(row, "digits", 5) or 5),
            "point": float(getattr(row, "point", 0.0) or 0.0),
            "spread": int(getattr(row, "spread", 0) or 0),
            "minLot": float(getattr(row, "volume_min", 0.01) or 0.01),
            "maxLot": float(getattr(row, "volume_max", 100.0) or 100.0),
            "lotStep": float(getattr(row, "volume_step", 0.01) or 0.01),
            "contractSize": float(getattr(row, "trade_contract_size", 1.0) or 1.0),
            "tradeAllowed": int(getattr(row, "trade_mode", 4)) == 4,
            "visible": bool(getattr(row, "visible", False)),
        })
        if len(out) >= limit:
            break
    CATALOG_CACHE["names"] = out
    CATALOG_CACHE["at"] = now
    return out


def sim_symbols_catalog():
    out = []
    for name in sorted(SIM_SPECS.keys()):
        spec = SIM_SPECS[name]
        out.append({
            "name": name,
            "base": name,
            "group": "Simulasi",
            "description": f"Simulasi {name}",
            "digits": int(spec["digits"]),
            "point": float(spec["point"]),
            "spread": 12,
            "minLot": 0.01,
            "maxLot": 100.0,
            "lotStep": 0.01,
            "contractSize": float(spec["contract"]),
            "tradeAllowed": True,
            "visible": True,
        })
    return out


def symbols_catalog(mode=None):
    current = mode or MODE
    if current == "sim":
        return sim_symbols_catalog()
    if current == "bridge":
        return []
    return mt5_symbols_catalog()


def resolve_payload(requested, mode=None):
    """Balas nama simbol yang dipakai broker + apakah benar-benar ditemukan."""
    current = mode or MODE
    want = str(requested or "").strip()
    if not want:
        return {"ok": False, "error": "symbol wajib", "requested": "", "name": ""}
    base = symbol_base(want)
    if current == "sim":
        up = want.upper()
        name = up if up in SIM_SPECS else next(
            (n for n in SIM_SPECS if symbol_base(n) == base), up
        )
        return {"ok": name in SIM_SPECS, "requested": want, "name": name,
                "base": symbol_base(name), "found": name in SIM_SPECS}
    if current == "bridge":
        return {"ok": True, "requested": want, "name": want, "base": base, "found": True}
    name = resolve_symbol(want)
    return {
        "ok": bool(name),
        "requested": want,
        "name": name or want,
        "base": symbol_base(name or want),
        "found": bool(name),
    }


def mt5_symbol(symbol: str):
    if mt5 is None:
        raise RuntimeError("MetaTrader5 tidak tersedia")
    ready, err = ensure_mt5()
    if not ready:
        raise RuntimeError(err)
    name = resolve_symbol(symbol) or symbol
    if not mt5.symbol_select(name, True):
        raise RuntimeError(f"Simbol {symbol} tidak bisa dipilih di Market Watch")
    info = mt5.symbol_info(name)
    tick = mt5.symbol_info_tick(name)
    if info is None or tick is None:
        raise RuntimeError(f"Data simbol {name} tidak tersedia")
    return {
        "name": name,
        "base": symbol_base(name),
        "group": symbol_group(getattr(info, "path", ""), name),
        "bid": float(tick.bid),
        "ask": float(tick.ask),
        "spread": int(info.spread),
        "digits": int(info.digits),
        "point": float(info.point),
        "minLot": float(info.volume_min),
        "maxLot": float(info.volume_max),
        "lotStep": float(info.volume_step),
        "contractSize": float(info.trade_contract_size),
        "tradeAllowed": bool(info.trade_mode == 4),
        "stopsLevel": int(getattr(info, "trade_stops_level", 0) or 0),
        "freezeLevel": int(getattr(info, "trade_freeze_level", 0) or 0),
        "fillingMode": int(getattr(info, "filling_mode", 0) or 0),
        "profitCurrency": str(getattr(info, "currency_profit", "") or ""),
        "marginCurrency": str(getattr(info, "currency_margin", "") or ""),
        "time": int(tick.time),
    }


def mt5_rates(symbol: str, timeframe: str, count: int):
    if mt5 is None:
        raise RuntimeError("MetaTrader5 tidak tersedia")
    ready, err = ensure_mt5()
    if not ready:
        raise RuntimeError(err)
    tf = MT5_TF.get(timeframe)
    if tf is None:
        raise RuntimeError(f"Timeframe {timeframe} tidak dikenal")
    name = resolve_symbol(symbol) or symbol
    mt5.symbol_select(name, True)
    rows = mt5.copy_rates_from_pos(name, tf, 0, count)
    if rows is None:
        raise RuntimeError(f"Gagal membaca harga {name}: {mt5.last_error()}")
    return [
        {"t": int(r["time"]), "o": float(r["open"]), "h": float(r["high"]),
         "l": float(r["low"]), "c": float(r["close"]), "v": int(r["tick_volume"])}
        for r in rows
    ]


def mt5_positions():
    if mt5 is None:
        return []
    ready, _err = ensure_mt5()
    if not ready:
        return []
    rows = mt5.positions_get() or []
    out = []
    for p in rows:
        info = mt5.symbol_info(p.symbol)
        tick = mt5.symbol_info_tick(p.symbol)
        is_buy = p.type == 0
        current = 0.0
        if tick is not None:
            current = float(tick.bid if is_buy else tick.ask)
        out.append({
            "ticket": int(p.ticket),
            "symbol": p.symbol,
            "type": "buy" if is_buy else "sell",
            "volume": float(p.volume),
            "price": float(p.price_open),
            "sl": float(p.sl),
            "tp": float(p.tp),
            "profit": float(p.profit),
            "swap": float(getattr(p, "swap", 0.0) or 0.0),
            "current": current,
            "comment": p.comment or "",
            "magic": int(p.magic),
            "digits": int(info.digits) if info else 5,
        })
    return out


def mt5_account():
    if mt5 is None:
        raise RuntimeError("MetaTrader5 tidak tersedia")
    a = mt5.account_info()
    if a is None:
        raise RuntimeError("Info akun tidak tersedia — terminal MT5 belum login ke broker.")
    return {
        "login": int(a.login),
        "server": a.server,
        "currency": a.currency,
        "balance": float(a.balance),
        "equity": float(a.equity),
        "margin": float(a.margin),
        "freeMargin": float(a.margin_free),
        "marginLevel": float(a.margin_level or 0),
        "leverage": int(a.leverage),
        "name": a.name,
    }


def mt5_size(payload):
    """Hitung lot dari risiko uang NYATA memakai kalkulator broker.

    Penting untuk akun yang mata uangnya bukan USD (mis. IDR): rumus
    lot = risiko / (SL × kontrak) tidak memperhitungkan konversi kurs, sehingga
    bisa membuka lot puluhan kali lipat dari yang aman. Di sini profit per lot
    dihitung oleh MT5 dalam mata uang akun.
    """
    if mt5 is None:
        raise RuntimeError("MetaTrader5 tidak tersedia")
    ready, err = ensure_mt5()
    if not ready:
        raise RuntimeError(err)
    symbol = resolve_symbol(str(payload.get("symbol") or "")) or str(payload.get("symbol") or "")
    side = str(payload.get("side") or "buy").lower()
    if side not in ("buy", "sell"):
        raise RuntimeError("side harus buy atau sell")
    info = mt5_symbol(symbol)
    acc = mt5_account()
    equity = float(acc.get("equity") or acc.get("balance") or 0)
    if equity <= 0:
        raise RuntimeError("ekuitas akun tidak terbaca")
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise RuntimeError(f"Harga {symbol} tidak tersedia")
    entry = float(payload.get("entry") or (tick.ask if side == "buy" else tick.bid))
    sl = float(payload.get("sl") or 0.0)
    if not sl or not entry:
        raise RuntimeError("entry dan sl wajib untuk menghitung lot")
    order_type = mt5.ORDER_TYPE_BUY if side == "buy" else mt5.ORDER_TYPE_SELL
    per_lot = mt5.order_calc_profit(order_type, symbol, 1.0, entry, sl)
    if per_lot is None:
        raise RuntimeError("broker tidak bisa menghitung risiko (order_calc_profit kosong)")
    per_lot = abs(float(per_lot))
    if per_lot <= 0:
        raise RuntimeError("risiko per lot tidak terhitung (SL terlalu kecil?)")
    risk_pct = max(0.05, float(payload.get("riskPercent") or 1.0))
    target = equity * risk_pct / 100.0
    raw = target / per_lot
    lot = normalize_volume(info, raw, floor=True)
    risk_money = per_lot * lot
    margin = None
    try:
        margin = mt5.order_calc_margin(order_type, symbol, lot, entry)
    except Exception:  # noqa: BLE001
        margin = None
    min_lot = float(info["minLot"])
    min_risk = per_lot * min_lot
    required = min_risk / (risk_pct / 100.0)
    return {
        "ok": True,
        "symbol": symbol,
        "side": side,
        "entry": entry,
        "sl": sl,
        "lot": lot,
        "rawLot": round(raw, 6),
        "riskMoney": round(risk_money, 2),
        "riskPct": round(risk_money / equity * 100, 2),
        "equity": equity,
        "currency": acc.get("currency") or "",
        "profitCurrency": info.get("profitCurrency") or "",
        "perLotRisk": round(per_lot, 4),
        "minLot": min_lot,
        "minLotRisk": round(min_risk, 2),
        "minLotRiskPct": round(min_risk / equity * 100, 2),
        "requiredEquity": round(required, 2),
        "margin": round(float(margin), 2) if margin is not None else None,
    }


def sim_size(payload):
    symbol = str(payload.get("symbol") or "").upper()
    if symbol not in SIM_SPECS:
        raise RuntimeError(f"Simbol {symbol} tidak ada di mode simulasi")
    info = sim_symbol(symbol)
    acc = sim_account()
    equity = float(acc["equity"])
    side = str(payload.get("side") or "buy").lower()
    entry = float(payload.get("entry") or (info["ask"] if side == "buy" else info["bid"]))
    sl = float(payload.get("sl") or 0.0)
    if not sl or not entry:
        raise RuntimeError("entry dan sl wajib untuk menghitung lot")
    risk_pct = max(0.05, float(payload.get("riskPercent") or 1.0))
    per_lot = abs(entry - sl) * float(info["contractSize"])
    if per_lot <= 0:
        raise RuntimeError("risiko per lot tidak terhitung")
    raw = equity * risk_pct / 100.0 / per_lot
    lot = normalize_volume({**info, "lotStep": info["lotStep"]}, raw, floor=True)
    risk_money = per_lot * lot
    min_lot = float(info["minLot"])
    min_risk = per_lot * min_lot
    return {
        "ok": True, "symbol": symbol, "side": side, "entry": entry, "sl": sl,
        "lot": lot, "rawLot": round(raw, 6), "riskMoney": round(risk_money, 2),
        "riskPct": round(risk_money / equity * 100, 2), "equity": equity,
        "currency": acc.get("currency") or "", "profitCurrency": "USD",
        "perLotRisk": round(per_lot, 4), "minLot": min_lot,
        "minLotRisk": round(min_risk, 2), "minLotRiskPct": round(min_risk / equity * 100, 2),
        "requiredEquity": round(min_risk / (risk_pct / 100.0), 2), "margin": None,
    }


def mt5_history(payload):
    """Total profit/rugi deal tertutup (untuk pagar rugi harian)."""
    if mt5 is None:
        raise RuntimeError("MetaTrader5 tidak tersedia")
    ready, err = ensure_mt5()
    if not ready:
        raise RuntimeError(err)
    days = max(1, min(30, int(payload.get("days") or 1)))
    magic = int(payload.get("magic") or 0)
    since_ts = int(payload.get("since") or 0)
    now = datetime.now(timezone.utc)
    since = datetime.fromtimestamp(since_ts, timezone.utc) if since_ts > 0 else (now - timedelta(days=days))
    rows = mt5.history_deals_get(since, now) or []
    total = 0.0
    deals = []
    for d in rows:
        if magic and int(getattr(d, "magic", 0) or 0) != magic:
            continue
        if int(getattr(d, "entry", 0) or 0) not in (1, 3):  # DEAL_ENTRY_OUT / OUT_BY
            continue
        profit = (float(getattr(d, "profit", 0) or 0)
                  + float(getattr(d, "swap", 0) or 0)
                  + float(getattr(d, "commission", 0) or 0))
        total += profit
        deals.append({
            "ticket": int(getattr(d, "ticket", 0) or 0),
            "symbol": str(getattr(d, "symbol", "") or ""),
            "profit": round(profit, 2),
            "time": int(getattr(d, "time", 0) or 0),
        })
    return {"ok": True, "total": round(total, 2), "deals": deals[-200:]}


def fill_mt5_tf():
    if mt5 is None:
        return
    for name, tf in {
        "M1": mt5.TIMEFRAME_M1, "M5": mt5.TIMEFRAME_M5, "M15": mt5.TIMEFRAME_M15,
        "M30": mt5.TIMEFRAME_M30, "H1": mt5.TIMEFRAME_H1, "H4": mt5.TIMEFRAME_H4,
        "D1": mt5.TIMEFRAME_D1, "W1": mt5.TIMEFRAME_W1, "MN1": mt5.TIMEFRAME_MN1,
    }.items():
        MT5_TF[name] = tf


@with_mt5_lock
def mt5_login(payload):
    """Login ke akun MT5 nyata (broker/server + login + password) lalu aktifkan mode live."""
    global MODE
    if mt5 is None:
        raise RuntimeError("Paket MetaTrader5 tidak terpasang (pip install MetaTrader5 di Windows).")
    login = int(payload.get("login") or 0)
    password = str(payload.get("password") or "")
    server = str(payload.get("server") or "").strip()
    path = str(payload.get("path") or "").strip()
    if not login or not password or not server:
        raise RuntimeError("server/broker, login, dan password akun MT5 wajib diisi.")

    try:
        mt5.shutdown()
    except Exception:  # noqa: BLE001
        pass

    candidates = []
    if path:
        candidates.append(path)
    candidates += find_terminals(True)
    seen = set()
    ordered = []
    for candidate in candidates:
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(candidate)
    if not ordered:
        ordered = [None]

    last = None
    for candidate in ordered:
        kwargs = {"login": login, "password": password, "server": server}
        if candidate:
            kwargs["path"] = candidate
        try:
            if mt5_initialize(timeout=30000, **kwargs):
                MODE = "live"
                MT5_CONN["ready"] = True
                MT5_CONN["error"] = ""
                MT5_CONN["lastTry"] = time.time()
                fill_mt5_tf()
                # Broker baru = daftar simbol baru; jangan pakai cache akun lama.
                SYMBOL_CACHE["at"] = 0.0
                SYMBOL_CACHE["names"] = []
                CATALOG_CACHE["at"] = 0.0
                CATALOG_CACHE["names"] = []
                account = mt5_account()
                log("login akun nyata:", account.get("login"), account.get("server"),
                    "terminal:", candidate or "(auto)")
                return account
            last = mt5.last_error()
        except Exception as exc:  # noqa: BLE001
            last = exc
        try:
            mt5.shutdown()
        except Exception:  # noqa: BLE001
            pass
    raise RuntimeError(f"Login ke {server} gagal: {mt5_not_found_message(last)}")


@with_mt5_lock
def mt5_logout():
    """Tutup sesi MT5. Mode TIDAK diturunkan ke simulasi agar UI tidak menampilkan akun palsu."""
    if mt5 is not None:
        try:
            mt5.shutdown()
        except Exception:  # noqa: BLE001
            pass
    MT5_CONN["ready"] = False
    MT5_CONN["error"] = "terputus — tekan Hubungkan atau login lagi"
    SYMBOL_CACHE["at"] = 0.0
    SYMBOL_CACHE["names"] = []
    CATALOG_CACHE["at"] = 0.0
    CATALOG_CACHE["names"] = []
    return {"ok": True, "mode": MODE}


RETCODE_TEXT = {
    10004: "harga berubah (requote) — dicoba ulang otomatis",
    10006: "permintaan ditolak broker",
    10008: "order terpasang",
    10009: "selesai",
    10013: "permintaan tidak valid (periksa volume/SL/TP)",
    10014: "volume tidak valid untuk broker ini",
    10015: "harga tidak valid",
    10016: "SL/TP ditolak broker (terlalu dekat atau salah sisi)",
    10018: "market sedang tutup",
    10019: "margin tidak cukup",
    10020: "harga berubah",
    10021: "tidak ada harga saat ini",
    10027: "AutoTrading dimatikan di terminal MetaTrader — nyalakan tombol AutoTrading",
    10030: "mode filling tidak didukung simbol ini",
    10031: "tidak ada koneksi ke trade server",
}


def retcode_text(code, fallback=""):
    try:
        return RETCODE_TEXT.get(int(code or 0), fallback or f"retcode {code}")
    except Exception:  # noqa: BLE001
        return fallback or "kesalahan broker"


def normalize_volume(info, lot, floor=False):
    """Bulatkan volume ke langkah broker — order ditolak bila lot bukan kelipatan step.

    floor=True dipakai untuk sizing (jangan menaikkan risiko melebihi target).
    """
    step = float(info.get("lotStep") or 0.01)
    vmin = float(info.get("minLot") or step or 0.01)
    vmax = float(info.get("maxLot") or 100.0)
    value = float(lot or vmin)
    if step > 0:
        steps = math.floor(value / step + 1e-9) if floor else round(value / step)
        value = round(steps * step, 8)
    if value < vmin:
        value = vmin
    return min(max(vmin, value), vmax)


def stops_min_distance(info):
    point = float(info.get("point") or 0.00001) or 0.00001
    stops = max(0.0, float(info.get("stopsLevel") or 0)) * point
    spread = max(0.0, float(info.get("spread") or 0)) * point
    return max(stops * 1.05, spread * 1.2, point * 2), point


def check_price_stops(info, side, price, sl, tp):
    """Tolak lebih awal dengan pesan jelas, bukan retcode 10016 yang membingungkan."""
    min_dist, _point = stops_min_distance(info)
    digits = int(info.get("digits") or 5)
    if sl:
        if side == "buy" and sl >= price:
            raise RuntimeError(f"SL BUY ({sl}) harus di bawah harga entry ({price}).")
        if side == "sell" and sl <= price:
            raise RuntimeError(f"SL SELL ({sl}) harus di atas harga entry ({price}).")
        if abs(price - sl) < min_dist:
            raise RuntimeError(
                f"SL terlalu dekat untuk broker ini: minimal {min_dist:.{digits}f} dari harga "
                f"(stops level {info.get('stopsLevel')} poin)."
            )
    if tp:
        if side == "buy" and tp <= price:
            raise RuntimeError(f"TP BUY ({tp}) harus di atas harga entry ({price}).")
        if side == "sell" and tp >= price:
            raise RuntimeError(f"TP SELL ({tp}) harus di bawah harga entry ({price}).")
        if abs(tp - price) < min_dist:
            raise RuntimeError(
                f"TP terlalu dekat untuk broker ini: minimal {min_dist:.{digits}f} dari harga "
                f"(stops level {info.get('stopsLevel')} poin)."
            )


def filling_candidates(info):
    """Ikuti mode filling yang diizinkan simbol, lalu cadangan umum."""
    mode = int(info.get("fillingMode") or 0)
    out = []
    if mode & 1:
        out.append(mt5.ORDER_FILLING_FOK)
    if mode & 2:
        out.append(mt5.ORDER_FILLING_IOC)
    out += [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]
    seen, uniq = set(), []
    for value in out:
        if value not in seen:
            seen.add(value)
            uniq.append(value)
    return uniq


def mt5_order(payload):
    if mt5 is None:
        raise RuntimeError("MetaTrader5 tidak tersedia")
    ready, err = ensure_mt5()
    if not ready:
        raise RuntimeError(err)
    symbol = resolve_symbol(str(payload.get("symbol") or "")) or str(payload.get("symbol") or "")
    side = str(payload.get("side") or "").lower()
    if side not in ("buy", "sell"):
        raise RuntimeError("side harus buy atau sell")
    info = mt5_symbol(symbol)
    if not info["tradeAllowed"]:
        raise RuntimeError(f"{symbol} tidak bisa ditradingkan di akun ini (mode simbol bukan full).")
    volume = normalize_volume(info, payload.get("lot"))
    sl = float(payload.get("sl") or 0.0)
    tp = float(payload.get("tp") or 0.0)
    order_type = mt5.ORDER_TYPE_BUY if side == "buy" else mt5.ORDER_TYPE_SELL

    # Pagar anti-MC: margin level sehat + margin order tidak menghabiskan free margin.
    acc = mt5.account_info()
    if acc is not None:
        level = float(acc.margin_level or 0)
        if level > 0 and level < 150:
            raise RuntimeError(f"Margin level {level:.0f}% < 150% — order diblokir agar tidak MC. Tutup posisi dulu.")

    last = None
    price = 0.0
    for attempt in range(2):
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            raise RuntimeError(f"Harga {symbol} tidak tersedia dari terminal.")
        price = float(tick.ask if side == "buy" else tick.bid)
        check_price_stops(info, side, price, sl, tp)
        if acc is not None:
            try:
                required = mt5.order_calc_margin(order_type, symbol, volume, price)
            except Exception:  # noqa: BLE001
                required = None
            if required and float(required) > float(acc.margin_free) * 0.8:
                raise RuntimeError(
                    f"Margin order {float(required):.2f} > 80% free margin ({float(acc.margin_free):.2f}). "
                    "Kurangi lot atau tambah modal agar tidak MC."
                )
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": price,
            "sl": sl,
            "tp": tp,
            "deviation": int(payload.get("deviation") or 20),
            "magic": int(payload.get("magic") or 0),
            "comment": str(payload.get("comment") or "DateSkunder AI")[:26],
            "type_time": mt5.ORDER_TIME_GTC,
        }
        for filling in filling_candidates(info):
            request["type_filling"] = filling
            last = mt5.order_send(request)
            if last is None:
                break
            if last.retcode != 10030:  # 10030 = filling mode tidak didukung → coba mode lain
                break
        if last is None:
            raise RuntimeError("order_send tidak mengembalikan hasil")
        # Requote / harga bergerak → sekali lagi dengan harga terbaru.
        if last.retcode in (10004, 10020, 10021) and attempt == 0:
            time.sleep(0.25)
            continue
        break

    ok = last.retcode in (10009, 10008)
    reason = retcode_text(last.retcode, str(last.comment or ""))
    if not ok and last.retcode == 10019 and volume > info["minLot"]:
        reason += " — coba lot lebih kecil."
    return {
        "ok": bool(ok),
        "ticket": int(getattr(last, "order", 0) or getattr(last, "deal", 0) or 0),
        "price": float(getattr(last, "price", price) or price),
        "retcode": int(last.retcode),
        "message": str(last.comment or ""),
        "reason": reason,
        "volume": volume,
        "request_price": price,
    }


def mt5_close(ticket: int, deviation: int):
    if mt5 is None:
        raise RuntimeError("MetaTrader5 tidak tersedia")
    rows = mt5.positions_get(ticket=ticket)
    if not rows:
        raise RuntimeError(f"Posisi {ticket} tidak ditemukan")
    p = rows[0]
    tick = mt5.symbol_info_tick(p.symbol)
    if tick is None:
        raise RuntimeError(f"Harga {p.symbol} tidak tersedia")
    info = mt5_symbol(p.symbol)
    is_buy = p.type == 0
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": p.symbol,
        "volume": float(p.volume),
        "type": mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
        "position": int(p.ticket),
        "price": float(tick.bid if is_buy else tick.ask),
        "deviation": int(deviation or 20),
        "magic": int(p.magic or 0),
        "comment": "DateSkunder close",
        "type_time": mt5.ORDER_TIME_GTC,
    }
    last = None
    for filling in filling_candidates(info):
        request["type_filling"] = filling
        last = mt5.order_send(request)
        if last is None:
            break
        if last.retcode != 10030:
            break
    if last is None:
        raise RuntimeError("order_send tidak mengembalikan hasil")
    return {
        "ok": last.retcode in (10009, 10008),
        "ticket": int(p.ticket),
        "retcode": int(last.retcode),
        "message": str(last.comment or ""),
        "reason": retcode_text(last.retcode, str(last.comment or "")),
    }


def mt5_modify(payload):
    """Pindahkan SL/TP posisi terbuka (break-even / trailing)."""
    if mt5 is None:
        raise RuntimeError("MetaTrader5 tidak tersedia")
    ready, err = ensure_mt5()
    if not ready:
        raise RuntimeError(err)
    ticket = int(payload.get("ticket") or 0)
    if not ticket:
        raise RuntimeError("ticket wajib")
    rows = mt5.positions_get(ticket=ticket)
    if not rows:
        raise RuntimeError(f"Posisi {ticket} tidak ditemukan")
    p = rows[0]
    info = mt5_symbol(p.symbol)
    tick = mt5.symbol_info_tick(p.symbol)
    if tick is None:
        raise RuntimeError(f"Harga {p.symbol} tidak tersedia")
    is_buy = p.type == 0
    price = float(tick.bid if is_buy else tick.ask)
    sl = float(payload.get("sl") or 0.0)
    tp = float(payload.get("tp") or 0.0) or float(p.tp or 0.0)
    check_price_stops(info, "buy" if is_buy else "sell", price, sl, tp)
    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "symbol": p.symbol,
        "position": ticket,
        "sl": sl,
        "tp": tp,
        "magic": int(p.magic or 0),
    }
    last = mt5.order_send(request)
    if last is None:
        raise RuntimeError("order_send tidak mengembalikan hasil")
    return {
        "ok": last.retcode in (10009, 10008),
        "ticket": ticket,
        "retcode": int(last.retcode),
        "message": str(last.comment or ""),
        "reason": retcode_text(last.retcode, str(last.comment or "")),
    }


# ── order simulasi ───────────────────────────────────────────────────────────
def sim_order(payload):
    symbol = str(payload.get("symbol") or "").upper()
    if symbol not in SIM_SPECS:
        raise RuntimeError(f"Simbol {symbol} tidak ada di mode simulasi")
    side = str(payload.get("side") or "").lower()
    if side not in ("buy", "sell"):
        raise RuntimeError("side harus buy atau sell")
    info = sim_symbol(symbol)
    lot = normalize_volume({**info, "lotStep": 0.01}, payload.get("lot"))
    if lot < info["minLot"] or lot > info["maxLot"]:
        raise RuntimeError(f"Lot {lot} di luar batas {info['minLot']}–{info['maxLot']}")
    sl = float(payload.get("sl") or 0.0)
    tp = float(payload.get("tp") or 0.0)
    entry = info["ask"] if side == "buy" else info["bid"]
    if sl and side == "buy" and sl >= entry:
        raise RuntimeError("SL buy harus di bawah harga entry")
    if sl and side == "sell" and sl <= entry:
        raise RuntimeError("SL sell harus di atas harga entry")
    ticket = SIM_STATE["next_ticket"]
    SIM_STATE["next_ticket"] += 1
    SIM_STATE["positions"].append({
        "ticket": ticket, "symbol": symbol, "type": side, "volume": lot,
        "price": entry, "sl": sl, "tp": tp, "comment": str(payload.get("comment") or "sim"),
        "magic": int(payload.get("magic") or 0),
    })
    return {"ok": True, "ticket": ticket, "price": entry, "retcode": 0, "message": "simulasi", "reason": "simulasi"}


def sim_close(ticket: int):
    for i, p in enumerate(SIM_STATE["positions"]):
        if p["ticket"] == ticket:
            price = sim_symbol(p["symbol"])["bid" if p["type"] == "buy" else "ask"]
            profit = sim_floating(p, price)
            SIM_STATE["balance"] += profit
            SIM_STATE["realized"] += profit
            SIM_STATE["positions"].pop(i)
            return {"ok": True, "ticket": ticket, "price": price, "retcode": 0, "message": "simulasi close"}
    raise RuntimeError(f"Posisi {ticket} tidak ditemukan")


def sim_history(payload):
    return {"ok": True, "total": round(float(SIM_STATE.get("realized") or 0.0), 2), "deals": []}


# ── HTTP ─────────────────────────────────────────────────────────────────────
def json_bytes(obj):
    return json.dumps(obj, ensure_ascii=False).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "DateSkunderMT/1.0"

    def log_message(self, fmt, *args):  # noqa: A003 - senyap; log sendiri
        return

    def _send(self, status, obj):
        body = json_bytes(obj)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _auth(self):
        if not TOKEN:
            return True
        return self.headers.get("X-Bridge-Token", "") == TOKEN

    def _fail(self, err, status=400):
        self._send(status, {"ok": False, "error": str(err)})

    def do_GET(self):  # noqa: N802
        if not self._auth():
            return self._fail("token tidak valid", 401)
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        try:
            with GLOBAL_LOCK:
                return self._dispatch_get(url, q)
        except Exception as exc:  # noqa: BLE001
            log("GET", url.path, "error:", exc)
            return self._fail(exc, 500)

    def _dispatch_get(self, url, q):
            if url.path == "/health":
                if MODE == "sim":
                    return self._send(200, {
                        "ok": True, "mode": "sim", "platform": PLATFORM, "connected": True, "simulated": True,
                        "hint": "Mode SIMULASI (uang palsu). Untuk akun broker nyata: pip install MetaTrader5 (Python 64-bit), "
                                "buka terminal MT5 & login, lalu jalankan ulang bridge.",
                        "account": sim_account(), "time": int(time.time()), "bridge": iso_now(), "diag": diag_cached(),
                    })
                if MODE == "bridge":
                    return self._send(200, {
                        "ok": True, "mode": "bridge", "platform": PLATFORM, "connected": True,
                        "account": {}, "time": int(time.time()), "bridge": iso_now(), "diag": diag_cached(),
                    })
                ready, err = ensure_mt5()
                if not ready:
                    # Bukan akun palsu: beri tahu terminal belum siap, biar UI menunggu & mencoba lagi.
                    return self._send(200, {
                        "ok": True, "mode": "live", "platform": "mt5", "connected": False,
                        "error": err, "time": int(time.time()), "diag": diag_cached(),
                    })
                try:
                    account = mt5_account()
                except Exception as exc:  # noqa: BLE001
                    MT5_CONN["ready"] = False
                    MT5_CONN["error"] = str(exc)
                    return self._send(200, {
                        "ok": True, "mode": "live", "platform": "mt5", "connected": False,
                        "error": str(exc), "time": int(time.time()), "diag": diag_cached(),
                    })
                return self._send(200, {
                    "ok": True, "mode": "live", "platform": "mt5", "connected": True, "simulated": False,
                    "account": account, "time": int(time.time()), "bridge": iso_now(), "diag": diag_cached(),
                })
            if url.path == "/terminals":
                return self._send(200, {"ok": True, **diag(True)})
            if url.path == "/symbol":
                symbol = str(q.get("symbol") or "")
                if not symbol:
                    return self._fail("symbol wajib")
                if MODE == "sim":
                    return self._send(200, {"ok": True, "symbol": sim_symbol(symbol.upper())})
                return self._send(200, {"ok": True, "symbol": mt5_symbol(symbol)})
            if url.path == "/rates":
                symbol = str(q.get("symbol") or "")
                tf = str(q.get("timeframe") or "M15").upper()
                count = int(q.get("count") or 300)
                count = max(40, min(3000, count))
                if MODE == "sim":
                    return self._send(200, {"ok": True, "bars": sim_bars(symbol.upper(), tf, count)})
                return self._send(200, {"ok": True, "bars": mt5_rates(symbol, tf, count)})
            if url.path == "/account":
                if MODE == "sim":
                    return self._send(200, {"ok": True, "account": sim_account()})
                ready, err = ensure_mt5()
                if not ready:
                    return self._fail(err, 503)
                return self._send(200, {"ok": True, "account": mt5_account()})
            if url.path == "/positions":
                if MODE == "sim":
                    return self._send(200, {"ok": True, "positions": sim_positions()})
                return self._send(200, {"ok": True, "positions": mt5_positions()})
            if url.path == "/specs":
                if MODE == "sim":
                    return self._send(200, {"ok": True, "symbols": sorted(SIM_SPECS.keys())})
                return self._send(200, {"ok": True, "symbols": mt5_symbol_names(True)[:3000]})
            if url.path == "/symbols":
                # Katalog broker untuk dropdown di HP: nama asli (ETHUSDm), grup, digit, lot.
                items = symbols_catalog()
                return self._send(200, {
                    "ok": True, "mode": MODE, "count": len(items),
                    "symbols": items[:3000], "time": int(time.time()),
                })
            if url.path == "/resolve":
                symbol = str(q.get("symbol") or "")
                return self._send(200, {"ok": True, **resolve_payload(symbol)})
            return self._fail("endpoint tidak dikenal", 404)

    def do_POST(self):  # noqa: N802
        if not self._auth():
            return self._fail("token tidak valid", 401)
        url = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:  # noqa: BLE001
            return self._fail("JSON tidak valid")
        try:
            with GLOBAL_LOCK:
                return self._dispatch_post(url, payload)
        except Exception as exc:  # noqa: BLE001
            log("POST", url.path, "error:", exc)
            return self._fail(exc, 500)

    def _dispatch_post(self, url, payload):
            if url.path == "/login":
                return self._send(200, {"ok": True, "account": mt5_login(payload), "mode": "live"})
            if url.path == "/logout":
                return self._send(200, mt5_logout())
            if url.path == "/order":
                if MODE == "sim":
                    return self._send(200, sim_order(payload))
                result = mt5_order(payload)
                log("order", payload.get("symbol"), payload.get("side"), payload.get("lot"), "→", result.get("retcode"))
                return self._send(200, result)
            if url.path == "/close":
                ticket = int(payload.get("ticket") or 0)
                if not ticket:
                    return self._fail("ticket wajib")
                if MODE == "sim":
                    return self._send(200, sim_close(ticket))
                return self._send(200, mt5_close(ticket, int(payload.get("deviation") or 20)))
            if url.path == "/modify":
                # Break-even / trailing: pindahkan SL/TP posisi yang sudah terbuka.
                if MODE == "sim":
                    return self._send(200, sim_modify(payload))
                result = mt5_modify(payload)
                log("modify", payload.get("ticket"), "sl", payload.get("sl"), "→", result.get("retcode"))
                return self._send(200, result)
            if url.path == "/size":
                # Lot dari risiko uang nyata (konversi mata uang dihitung broker).
                if MODE == "sim":
                    return self._send(200, sim_size(payload))
                return self._send(200, mt5_size(payload))
            if url.path == "/history":
                # Realisasi profit/rugi hari ini (pagar rugi harian).
                if MODE == "sim":
                    return self._send(200, sim_history(payload))
                return self._send(200, mt5_history(payload))
            if url.path == "/close_all":
                symbol = str(payload.get("symbol") or "")
                magic = int(payload.get("magic") or 0)
                rows = sim_positions() if MODE == "sim" else mt5_positions()
                done = []
                for p in rows:
                    if symbol and p["symbol"] != symbol:
                        continue
                    if magic and int(p.get("magic") or 0) != magic:
                        continue
                    res = sim_close(p["ticket"]) if MODE == "sim" else mt5_close(p["ticket"], int(payload.get("deviation") or 20))
                    done.append({"ticket": p["ticket"], "ok": res.get("ok")})
                return self._send(200, {"ok": True, "closed": done})
            return self._fail("endpoint tidak dikenal", 404)


def main():
    global TOKEN, MODE, PLATFORM
    parser = argparse.ArgumentParser(description="Date Skunder MetaTrader bridge")
    parser.add_argument("--port", type=int, default=8770)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--token", default="")
    parser.add_argument("--mode", choices=["auto", "live", "sim", "bridge"], default="auto")
    parser.add_argument("--platform", choices=["mt5", "mt4"], default="mt5")
    args = parser.parse_args()

    TOKEN = args.token or ""
    PLATFORM = args.platform
    if args.host not in ("127.0.0.1", "localhost", "::1") and not TOKEN:
        log("menolak bind ke", args.host, "tanpa --token. Set token yang kuat untuk akses LAN/HP.")
        sys.exit(2)
    mode = args.mode
    if mode == "auto":
        if mt5 is None:
            mode = "sim"
            log("paket MetaTrader5 tidak terpasang → mode SIMULASI (uang palsu, ditandai SIM di UI). "
                "Untuk akun nyata: pip install MetaTrader5 lalu jalankan ulang.")
        else:
            # Jangan pernah diam-diam memakai akun simulasi saat MT5 tersedia:
            # lebih baik UI menampilkan “terminal belum siap” dan menyambung otomatis.
            mode = "live"
            log("mode live: menyambung otomatis ke terminal MetaTrader 5 di latar belakang "
                "(TANPA akun simulasi). Bila terminal belum login, panel akan menunggu.")
    MODE = mode

    if MODE == "live" and mt5 is None:
        log("mode live membutuhkan paket Python MetaTrader5 (pip install MetaTrader5).")
        sys.exit(2)

    if MODE == "live":
        fill_mt5_tf()
        threading.Thread(target=mt5_watch_loop, daemon=True).start()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    log(f"siap di http://{args.host}:{args.port} · mode={MODE} · platform={PLATFORM}"
        + (" · token aktif" if TOKEN else ""))
    for ip in lan_ips():
        log(f"akses dari HP/LAN: http://{ip}:{args.port}" + (" (pakai token)" if TOKEN else ""))
    log("endpoint: /health /terminals /account /symbol /symbols /resolve /rates /positions /order /close /modify /size /history /close_all /login /logout")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("dihentikan pengguna")
    finally:
        server.server_close()
        if mt5 is not None and MODE == "live":
            try:
                mt5.shutdown()
            except Exception:  # noqa: BLE001
                pass


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        log("fatal:", exc)
        sys.exit(1)
