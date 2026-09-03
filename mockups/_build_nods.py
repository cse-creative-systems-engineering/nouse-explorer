"""
Build 5 Nouse Explorer mockups with real catalog + real Nous illustrations.
Each mockup explores a different chrome/layout using one of the 6 feature
etchings, tier cards, or dithers as the hero motif.
"""
import json
from pathlib import Path

SRC_CATALOG = "/tmp/nm.json"
OUT = Path("/home/shane/projects/nous-model-explorer/mockups")
OUT.mkdir(parents=True, exist_ok=True)

with open(SRC_CATALOG) as f:
    catalog = json.load(f)["data"]

# The image you sent lists these sort options verbatim
SORT_OPTIONS = [
    "Most Popular",
    "Coding: High to Low",
    "Coding: Low to High",
    "Throughput",
    "Latency",
    "Context Length",
    "Price: Low to High",
    "Price: High to Low",
    "Intelligence: High to Low",
    "Newest",
    "Daily Usage",
    "Design Arena ELO",
]

VARIANT_OPTIONS = [
    "All Models", "Free", "Batch", "Vision", "Discounted", "Cheap",
    "Newest", "Researched",
    "Provider: Anthropic", "Provider: OpenAI",
    "Provider: Google", "Provider: DeepSeek",
]

def shape(m):
    p = m.get("pricing") or {}
    prompt = float(p.get("prompt") or 0)
    completion = float(p.get("completion") or 0)
    ctx = m.get("context_length") or 0
    arch = m.get("architecture", {}) or {}
    modality = arch.get("modality") or "text>text"
    return {
        "id": m["id"],
        "name": m.get("name") or m["id"].split("/")[-1],
        "provider": (m["id"].split("/")[0] or "Unknown").replace("-", " ").title(),
        "prompt": prompt * 1_000_000,
        "completion": completion * 1_000_000,
        "ctx": ctx,
        "ctx_label": f"{ctx/1_000_000:.1f}M".replace(".0M", "M") if ctx >= 1_000_000 else f"{ctx//1000}K",
        "modality": modality,
        "free": prompt == 0 and completion == 0,
        "batch": m["id"].endswith(":batch"),
        "vision": "vision" in m["id"].lower() or "image" in modality.lower(),
        "discount": m.get("pricing", {}).get("original") is not None,
    }

models = [shape(m) for m in catalog]
free = [m for m in models if m["free"]]
batch = [m for m in models if m["batch"]]
vision = [m for m in models if m["vision"]]
# Featured slice: highest context first
featured = sorted(models, key=lambda m: m["ctx"], reverse=True)[:24]

# ---------- shared header / filter chrome (used by all 5 mockups) ----------
def page_header(title, subtitle, art_url, art_position="right", art_w=240):
    return f"""
  <header class="page-head">
    <div class="head-left">
      <div class="eyebrow">NOUS PORTAL · MODEL INTELLIGENCE</div>
      <h1 class="masthead">{title}</h1>
      <p class="subhead">{subtitle}</p>
    </div>
    <div class="head-art" style="flex:0 0 {art_w}px;">
      <img src="{art_url}" alt="" />
    </div>
  </header>"""

def filter_bar(active_sort="Coding: High to Low", active_variant="All Models"):
    sort_options = "\n".join(
        ('<li class="on">' if o == active_sort else "<li>") + o + "</li>"
        for o in SORT_OPTIONS
    )
    variant_options = "\n".join(
        ('<li class="on">' if o == active_variant else "<li>") + o + "</li>"
        for o in VARIANT_OPTIONS
    )
    return f"""
  <div class="filterbar">
    <div class="search">
      <span class="ico">⌕</span>
      <input type="text" placeholder="search 381 models by name, provider, id" />
    </div>
    <div class="dropdown">
      <button class="dd-btn">sort: <span class="val">{active_sort}</span><span class="caret">⌄</span></button>
      <ul class="dd-menu">{sort_options}</ul>
    </div>
    <div class="dropdown">
      <button class="dd-btn">variant: <span class="val">{active_variant}</span><span class="caret">⌄</span></button>
      <ul class="dd-menu">{variant_options}</ul>
    </div>
  </div>"""

def card(m, klass=""):
    badges = []
    if m["free"]: badges.append('<span class="b b-free">free</span>')
    if m["batch"]: badges.append('<span class="b">batch</span>')
    if m["vision"]: badges.append('<span class="b">vision</span>')
    if m["discount"]: badges.append('<span class="b b-discount">−20%</span>')
    return f"""
    <article class="card {klass}">
      <div class="card-id">{m['id']}</div>
      <h3 class="card-name">{m['name']}</h3>
      <div class="card-provider">{m['provider']}</div>
      <div class="card-prices">
        <div class="pr"><span class="lbl">in / 1M</span><span class="val">${m['prompt']:,.2f}</span></div>
        <div class="pr"><span class="lbl">out / 1M</span><span class="val">${m['completion']:,.2f}</span></div>
      </div>
      <div class="card-ctx">ctx: <b>{m['ctx_label']}</b> · {m['modality']}</div>
      <div class="card-badges">{"".join(badges)}</div>
    </article>"""

# Base CSS shared by all 5 mockups
SHARED_CSS = """
  :root { --ink: #0c0e4a; --cobalt: #0000ff; --cobalt-d: #1a1aff; --cobalt-p: #c2c6f7;
          --paper: #f6f1e6; --rule: #0000ff; --cream: #efe7d2; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--paper); color: var(--ink);
    font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  body { padding: 32px 48px 80px; }
  .page-head { display: flex; gap: 32px; align-items: flex-end; border-bottom: 1.5px solid var(--rule);
    padding-bottom: 16px; margin-bottom: 24px; }
  .eyebrow { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.2em;
    color: var(--cobalt); text-transform: uppercase; }
  .masthead { font-family: 'DM Serif Display', serif; font-size: 56px; line-height: 0.95;
    color: var(--ink); margin: 8px 0 4px; letter-spacing: -0.01em; }
  .masthead em { font-style: italic; color: var(--cobalt); }
  .subhead { font-family: 'DM Serif Display', serif; font-style: italic; font-size: 18px;
    color: var(--ink); max-width: 56ch; margin: 0; }
  .head-art img { width: 100%; display: block; }
  .filterbar { display: grid; grid-template-columns: 1fr auto auto; gap: 12px;
    margin-bottom: 18px; }
  .search { position: relative; }
  .search .ico { position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
    color: var(--cobalt); font-size: 16px; }
  .search input { width: 100%; padding: 12px 16px 12px 38px; border: 1px solid var(--cobalt-d);
    background: transparent; color: var(--ink); font-family: 'DM Mono', monospace;
    font-size: 13px; outline: none; }
  .search input:focus { border-color: var(--cobalt); background: rgba(0,0,255,0.04); }
  .dropdown { position: relative; }
  .dd-btn { background: transparent; border: 1px solid var(--cobalt-d); color: var(--ink);
    padding: 12px 38px 12px 14px; font-family: 'DM Mono', monospace; font-size: 12px;
    letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; min-width: 240px;
    text-align: left; }
  .dd-btn .val { color: var(--cobalt); text-transform: none; letter-spacing: 0; }
  .dd-btn .caret { position: absolute; right: 14px; color: var(--cobalt); }
  .dd-menu { position: absolute; right: 0; top: 100%; min-width: 240px; max-height: 280px;
    overflow-y: auto; margin: 0; padding: 6px 0; list-style: none; background: var(--paper);
    border: 1px solid var(--cobalt); display: none; z-index: 5; }
  .dropdown:hover .dd-menu, .dropdown:focus-within .dd-menu { display: block; }
  .dd-menu li { padding: 8px 14px; font-family: 'DM Mono', monospace; font-size: 12px;
    color: var(--ink); cursor: pointer; }
  .dd-menu li:hover, .dd-menu li.on { background: var(--cobalt); color: var(--paper); }
  .card { background: var(--cream); border: 1px solid var(--cobalt); padding: 16px;
    display: flex; flex-direction: column; gap: 8px; }
  .card-id { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--cobalt); opacity: 0.6; }
  .card-name { font-family: 'DM Serif Display', serif; font-size: 20px; line-height: 1.05;
    color: var(--ink); margin: 0; }
  .card-provider { font-family: 'DM Mono', monospace; font-size: 10px;
    color: var(--cobalt); letter-spacing: 0.1em; text-transform: uppercase; }
  .card-prices { display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
    font-family: 'DM Mono', monospace; }
  .pr .lbl { display: block; font-size: 9px; color: var(--cobalt); opacity: 0.6;
    letter-spacing: 0.15em; text-transform: uppercase; }
  .pr .val { font-size: 14px; color: var(--ink); }
  .card-ctx { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--ink);
    opacity: 0.7; }
  .card-ctx b { color: var(--cobalt); }
  .card-badges { display: flex; gap: 4px; flex-wrap: wrap; }
  .b { font-family: 'DM Mono', monospace; font-size: 9px; letter-spacing: 0.1em;
    text-transform: uppercase; border: 1px solid var(--cobalt-d); color: var(--ink);
    padding: 2px 6px; }
  .b-free { background: var(--cobalt); color: var(--paper); border-color: var(--cobalt); }
  .b-discount { border-color: var(--cobalt); color: var(--cobalt); }
"""

def shell(title, body, art_path=None, extra_css=""):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
{SHARED_CSS}
{extra_css}
</style>
</head>
<body>
{body}
</body>
</html>"""

# ----- A: Etched-grimoire cover (feature-tasks as the hero art) -----
A_CSS = """
  body { background: var(--paper); }
  .cover { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 32px; align-items: end; }
  .cover-art { background: #0000ff; padding: 0; }
  .cover-art img { width: 100%; display: block; }
  .meta-row { display: flex; gap: 32px; margin: 18px 0; padding: 12px 0;
    border-top: 1px solid var(--cobalt); border-bottom: 1px solid var(--cobalt);
    font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--ink); }
  .meta-row b { color: var(--cobalt); font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px; margin-top: 18px; }
"""
A_FILTER = filter_bar("Context Length", "All Models")
A_BODY = f"""
  <header class="page-head">
    <div class="head-left">
      <div class="eyebrow">N° 01 · Vol. I · Sept 2026</div>
      <h1 class="masthead">Nouse <em>Explorer</em></h1>
      <p class="subhead">A complete cabinet of every model on the Nous Portal — priced, ranked, and researched in depth.</p>
    </div>
  </header>

  <section class="cover">
    <div>
      <div class="eyebrow" style="margin-bottom:8px;">Plate I · Tasks Multiplied</div>
      <p class="subhead" style="font-size:14px;max-width:48ch;">Each model is investigated in depth, then filed under its strengths. Below: the top of the catalog ordered by context window.</p>
      {A_FILTER}
    </div>
    <div class="cover-art">
      <img src="http://127.0.0.1:8766/feature-tasks.webp" alt="Hermes — Tasks Multiplied etching" />
    </div>
  </section>

  <div class="meta-row">
    <div>catalog <b>381</b></div>
    <div>discounted <b>374</b></div>
    <div>benchmarked <b>210</b></div>
    <div>free <b>6</b></div>
    <div>researched <b>235 / 381</b> profiles</div>
  </div>

  <div class="grid">{"".join(card(m) for m in featured[:12])}</div>
"""
(OUT / "nod-a.html").write_text(shell("Nouse Explorer — Nod A", A_BODY, extra_css=A_CSS))

# ----- B: Mystic-mosaic 3x3 (etching in each corner) -----
B_CSS = """
  body { background: var(--paper); }
  .mosaic-head { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
    margin-bottom: 24px; }
  .mosaic-head .art { background: #0000ff; aspect-ratio: 1; overflow: hidden; }
  .mosaic-head .art img { width: 100%; height: 100%; object-fit: cover; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px; }
"""
B_BODY = f"""
  <header class="page-head">
    <div class="head-left">
      <div class="eyebrow">Vol. I · Plate II · Triptych</div>
      <h1 class="masthead">Nouse <em>Explorer</em></h1>
      <p class="subhead">Three plates from the Hermes alchemical series. Browse, Browse the Web, Isolated Sandboxing — a nod to the source.</p>
    </div>
  </header>

  <section class="mosaic-head">
    <div class="art"><img src="http://127.0.0.1:8766/feature-memory.webp" alt="" /></div>
    <div class="art"><img src="http://127.0.0.1:8766/feature-browse.webp" alt="" /></div>
    <div class="art"><img src="http://127.0.0.1:8766/feature-sandbox.webp" alt="" /></div>
  </section>

  {filter_bar("Most Popular", "All Models")}

  <div class="grid">{"".join(card(m) for m in featured[2:18])}</div>
"""
(OUT / "nod-b.html").write_text(shell("Nouse Explorer — Nod B", B_BODY, extra_css=B_CSS))

# ----- C: Tier-card constellation (4 tier illustrations framing) -----
C_CSS = """
  body { background: var(--paper); }
  .constellation { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 26px; }
  .tier-art { background: #000; padding: 0; }
  .tier-art img { width: 100%; display: block; }
  .tier-label { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 12px;
    background: rgba(0,0,0,0.7); color: #f6f1e6; font-family: 'DM Mono', monospace;
    font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; }
  .tier-art { position: relative; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px; }
"""
C_BODY = f"""
  <header class="page-head">
    <div class="head-left">
      <div class="eyebrow">Tiers · Free / Plus / Super / Ultra</div>
      <h1 class="masthead">Nouse <em>Explorer</em></h1>
      <p class="subhead">Four portrait-studies frame the catalog — one per Portal tier. The art is from the source; the models are live.</p>
    </div>
  </header>

  <section class="constellation">
    <div class="tier-art"><img src="http://127.0.0.1:8766/tier-free.webp" alt="" />
      <div class="tier-label">Plate I · Free Tier</div></div>
    <div class="tier-art"><img src="http://127.0.0.1:8766/tier-plus.webp" alt="" />
      <div class="tier-label">Plate II · Plus Tier</div></div>
    <div class="tier-art"><img src="http://127.0.0.1:8766/tier-super.webp" alt="" />
      <div class="tier-label">Plate III · Super Tier</div></div>
    <div class="tier-art"><img src="http://127.0.0.1:8766/tier-ultra.webp" alt="" />
      <div class="tier-label">Plate IV · Ultra Tier</div></div>
  </section>

  {filter_bar("Intelligence: High to Low", "All Models")}

  <div class="grid">{"".join(card(m) for m in featured[1:17])}</div>
"""
(OUT / "nod-c.html").write_text(shell("Nouse Explorer — Nod C", C_BODY, extra_css=C_CSS))

# ----- D: Dithered-codex scroll (dithers as full-bleed motifs) -----
D_CSS = """
  body { background: var(--paper); }
  .scroll-art { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-bottom: 22px; }
  .scroll-art .art { background: #fff; aspect-ratio: 4/3; overflow: hidden; }
  .scroll-art .art img { width: 100%; height: 100%; object-fit: cover; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px; }
"""
D_BODY = f"""
  <header class="page-head">
    <div class="head-left">
      <div class="eyebrow">Dithers · Three Plates</div>
      <h1 class="masthead">Nouse <em>Explorer</em></h1>
      <p class="subhead">The Portal's halftone duotone dithers, full-bleed. Below: the model cabinet, with the same duo treatment on every card.</p>
    </div>
  </header>

  <section class="scroll-art">
    <div class="art"><img src="http://127.0.0.1:8766/dither-19.webp" alt="" /></div>
    <div class="art"><img src="http://127.0.0.1:8766/dither-edits-93.webp" alt="" /></div>
    <div class="art"><img src="http://127.0.0.1:8766/dither-edits-23.webp" alt="" /></div>
  </section>

  {filter_bar("Price: Low to High", "Free")}

  <div class="grid">{"".join(card(m) for m in (free + featured)[:16])}</div>
"""
(OUT / "nod-d.html").write_text(shell("Nouse Explorer — Nod D", D_BODY, extra_css=D_CSS))

# ----- E: Hand-of-nous hero (the tiny classical bust as a crest) -----
E_CSS = """
  body { background: var(--paper); }
  .crest { display: flex; align-items: center; gap: 24px; }
  .crest img { width: 200px; height: 100px; image-rendering: pixelated; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px; }
"""
E_BODY = f"""
  <header class="page-head">
    <div class="crest">
      <img src="http://127.0.0.1:8766/nous-hand.png" alt="Nous Hand" />
      <div>
        <div class="eyebrow">A Nod, By Way Of Introduction</div>
        <h1 class="masthead">Nouse <em>Explorer</em></h1>
        <p class="subhead">The hand of Nous, kept on every page — small, classical, silent. Below: the catalog, ranked by intelligence.</p>
      </div>
    </div>
  </header>

  {filter_bar("Intelligence: High to Low", "Vision")}

  <div class="grid">{"".join(card(m) for m in (vision + featured)[:18])}</div>
"""
(OUT / "nod-e.html").write_text(shell("Nouse Explorer — Nod E", E_BODY, extra_css=E_CSS))

# Quick gallery page that links to all 5
gallery = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Nouse Explorer — 5 Nods</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
<style>
  body { background: #f6f1e6; color: #0c0e4a; font-family: 'Inter', sans-serif; padding: 48px; margin: 0; }
  h1 { font-family: 'DM Serif Display', serif; font-size: 56px; margin: 0 0 8px; }
  h1 em { color: #0000ff; font-style: italic; }
  .lede { font-family: 'DM Serif Display', serif; font-style: italic; font-size: 20px; max-width: 60ch; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; margin-top: 32px; }
  .card { border: 1px solid #0000ff; background: #efe7d2; padding: 16px; }
  .card .art { background: #0000ff; aspect-ratio: 16/9; overflow: hidden; }
  .card .art img { width: 100%; height: 100%; object-fit: cover; }
  .card h2 { font-family: 'DM Serif Display', serif; font-size: 24px; margin: 14px 0 4px; }
  .card p { font-family: 'DM Mono', monospace; font-size: 12px; color: #0c0e4a; opacity: 0.8; }
  .card a { display: inline-block; margin-top: 10px; padding: 8px 14px; border: 1px solid #0000ff;
    font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;
    text-decoration: none; color: #0c0e4a; }
  .card a:hover { background: #0000ff; color: #f6f1e6; }
</style>
</head>
<body>
  <h1>Nouse <em>Explorer</em></h1>
  <p class="lede">Five "nods" to the source. Each mockup uses real Nous illustrations (feature etchings, tier portraits, halftone dithers, the hand) over the live 381-model catalog.</p>
  <div class="grid">
    <div class="card">
      <div class="art"><img src="http://127.0.0.1:8766/feature-tasks.webp" /></div>
      <h2>A · Etched-grimoire cover</h2>
      <p>The Tasks Multiplied serpent as a full-bleed hero. 1.1 : 0.9 split, catalog below.</p>
      <a href="nod-a.html">open nod A →</a>
    </div>
    <div class="card">
      <div class="art"><img src="http://127.0.0.1:8766/feature-memory.webp" /></div>
      <h2>B · Mystic-mosaic 3×3</h2>
      <p>Memory / Browse / Sandbox etchings triptyched across the top.</p>
      <a href="nod-b.html">open nod B →</a>
    </div>
    <div class="card">
      <div class="art"><img src="http://127.0.0.1:8766/tier-plus.webp" /></div>
      <h2>C · Tier-card constellation</h2>
      <p>The four tier portrait-studies frame the catalog like a planetarium.</p>
      <a href="nod-c.html">open nod C →</a>
    </div>
    <div class="card">
      <div class="art"><img src="http://127.0.0.1:8766/dither-19.webp" /></div>
      <h2>D · Dithered-codex scroll</h2>
      <p>Three halftone dithers full-bleed, then the catalog.</p>
      <a href="nod-d.html">open nod D →</a>
    </div>
    <div class="card">
      <div class="art"><img src="http://127.0.0.1:8766/nous-hand.png" style="object-fit:contain;background:#0000ff;padding:24px;" /></div>
      <h2>E · Hand-of-nous hero</h2>
      <p>The tiny classical bust as a crest, masthead beside it.</p>
      <a href="nod-e.html">open nod E →</a>
    </div>
  </div>
</body>
</html>
"""
(OUT / "nods.html").write_text(gallery)

print("OK — wrote 5 mockups + gallery:")
for f in sorted(OUT.glob("nod-*.html")) + [OUT / "nods.html"]:
    print(f"  {f.name:14s} {f.stat().st_size:>7} bytes")
