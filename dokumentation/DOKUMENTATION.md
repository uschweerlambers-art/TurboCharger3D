# Technische Dokumentation · Turbo Charger

Stand: 20.11.2026. Diese Datei beschreibt Aufbau, Datenpipeline, Entscheidungen und Stolperfallen der Präsentation. Bedienung und Hosting stehen in `../LIESMICH.md`, die übertragbare Vorgehensweise in `../BLAUPAUSE.md`.

## 1. Stack

- **three.js r187**, `WebGPURenderer` mit TSL (Node-Materialien, Compute-Shader), WebGL2-Fallback automatisch
- **three-gpu-pathtracer 0.0.28**, WebGPU-Variante (`three-gpu-pathtracer/webgpu`), progressiv, gleiche Szene und gleicher Renderer
- **three-mesh-bvh 0.9** für die BVHs des Pathtracers (Worker) und für schnelle Raycasts beim Greifen
- **esbuild** zum Bündeln, Inter Variable als Fallback-Schrift auf Windows
- Gestaltung nach dem Apple-Design-Skill (github.com/dickwu/apple-design-skill): Glas nur auf der Bedienebene, System-Schrift, Segmented Controls, Federanimationen, Orange nur für Primäraktion und Status

## 2. Ordner `_quellcode`

```
build.mjs            Bündelt src/ → dist/ (app.js, BVH-Worker, Assets, wasm, Starter)
build-web.mjs        dist/ → web/: gehostete Fassung, Binärdateien als base64-JSON + fetch-Shim
package.json         npm-Abhängigkeiten (npm install)
src/index.html       Markup: Preloader, Bedienebene, Panels, Hilfe, Bildlook
src/styles.css       Design-Tokens, Glas, Controls, Gizmo, Labels
src/js/
  main.js            Orchestrierung: Preloader/Tiers, Renderer, Pipeline, Loop, Modi, UI, Gizmo, Labels
  model.js           GLB laden, entquantisieren, Bauteil-Katalog, Materialien, Schnitt-Keil, Röntgen
  rig.js             Kamera (sphärisch, gedämpft), Startansicht `home`, `animateTo()` für 2-s-Übergänge
  assembly.js        Explosion: Federn mit Masse, Greifen/Werfen/Einrasten, Raycast
  flow.js            Stromlinien aus flow_paths.json, GPU-Partikel (TSL Compute)
  pathtrace.js       Pathtracer-Spiegelszene, Einblendung in die Post-Pipeline
  look.js            Bildlook-Presets und Grading
  env.js             Prozedurale HDR-Studio-Umgebung (gleich für Raster und Pathtracer)
  audio.js           Turbopfeifen und Einrast-Klick (Web Audio)
  preloader-bg.js    Halbton-Punkte mit Cursor-Licht, Wort-Reveal
tools/               Python-Pipeline (siehe 3.)
assets/              turbo_hi.glb, turbo_lo.glb, flow_paths.json, flow_sdf.*
tests/               Headless-Tests (Chrome + Xvfb + Puppeteer)
```

Bauen: `npm install`, dann `node build.mjs dist` und für die gehostete Fassung zusätzlich `node build-web.mjs dist web`.

## 3. Datenpipeline (CAD → Web)

1. **`tools/parse3ds.py`** liest die 3DS-Datei ohne Blender: Chunks, Objekte, Materialien. 3DS teilt große Objekte in `TooBig*`-Teile, `build.py` gruppiert sie wieder zum vorangehenden benannten Objekt und verschweißt die Vertices.
2. **`tools/toglb.py`** reduziert pro Bauteil mit festem Polygonbudget (fast_simplification), berechnet gekantete Normalen (35°) und schreibt ein GLB. Danach folgt `npx gltf-transform meshopt` (Quantisierung + Meshopt, 17,6 MB → 4,1 MB). Die Stufe hi hat ~760k Dreiecke, lo ~390k (Schelle und Logo lassen sich kaum reduzieren).
   Maßstab: Modell zentriert (Wellenachse = x/z = 0), 1 Szeneneinheit = 400 CAD-Einheiten, Welle entlang +Y.
3. **Im Browser** werden Positionen und Normalen auf Float32 entquantisiert und die Node-Matrix eingebacken (`model.js › dequantize`), weil Pathtracer-BVH und Raycasts echte Geometrie brauchen.
4. **`tools/sdf.py`** voxelisiert die Gehäuseflächen (1 cm-Raster) und berechnet ein Distanzfeld (`flow_sdf.bin`, uint8).
5. **`tools/centerline.py`** schneidet die Gehäuse in 2°-Halbebenen um die Welle. Pro Winkel sucht es im Distanzfeld den eingeschlossenen Hohlraum der Spirale und dessen zentralsten Punkt. Ergebnis sind die Mittellinien beider Spiralgehäuse mit Querschnittsradius (`flow_paths.json`). `slice.py` und `zslice.py` zeigen Schnitte als ASCII, damit lassen sich Rohrachsen und Flansche vermessen.

**Gemessene Landmarken (Modellraum):**

| Landmarke | Wert |
| --- | --- |
| Turbinen-Auslassrohr („comp“-Tabelle, oberes Gehäuse) | Achse (0, 0, −1), Öffnung bei (−0,38; 0,32; −0,53), Rohr beginnt bei z ≈ −0,12 |
| Verdichter-Auslass mit V-Band (unteres Gehäuse) | Flansch bei (0,86; −0,305; 0,432), Achse ±X |

**Bauteile (Mesh-Namen aus dem CAD):**

| Gruppe | Meshes | Rolle |
| --- | --- | --- |
| compHousing | Tube, Path_1 | **Turbinengehäuse** (Path_1 = Schriftzug) |
| compWheel | Cylinder_1 | **Turbinenrad** |
| turbHousing | Tube_1 | **Verdichtergehäuse** (größer, mit V-Band) |
| turbWheel | Cylinder | **Verdichterrad** (Ø größer) |
| center | midle_1 | Lagergehäuse |
| shaft | blades | Welle mit Mutter |
| clamp | tie | V-Band-Schelle |
| tip1, tip2 | tip1, tip2 | Öl-Anschlüsse (eloxiert orange) |

> **Achtung, Verwechslung:** Die internen Schlüssel `comp*`/`turb*` stammen aus einer ersten, falschen Zuordnung. Die Beschriftungen und Strömungsrichtungen sind korrigiert, die Schlüssel blieben aus Kompatibilitätsgründen.

## 4. Orientierung und Kameras

- Einbaulage: `model.root` wird um X um −90° gedreht (`main.js › start`). Damit liegt die Welle waagerecht, die Verdichterseite mit V-Band-Rohr zeigt zum Betrachter, die Rohröffnung nach rechts.
- Startansicht: `rig.js › home = { az: 0.72, pol: 1.38, dist: 5.8, target: (0, −0.36, 0) }`.
- Strömungsansicht: `FLOW_VIEW` in `main.js`. Der Schnittkeil richtet sich per `aimCut()` automatisch zur Kamera aus, im Modellraum um die Welle.
- Explosion: kein Kameraschwenk, nur `rig.distExtra = Explosionsgrad × 3.1`.

## 5. Funktionsweise der Ebenen

**Raster-Rendering:** `RenderPipeline` mit Scene-Pass (MSAA), optional GTAO (Workstation) und Bloom. Das Grading aus `look.js` läuft im linearen Licht vor dem Output-Transform, Tone Mapping ist Neutral, AgX oder ACES.

**Pathtracing (auf Anforderung):** `pathtrace.js` baut eine Spiegelszene mit denselben Geometrien und klassischen `MeshPhysicalMaterial`s. Der Pathtracer rendert mit `renderToCanvas = false` in ein eigenes Ziel. Dieses wird in der Pipeline bilinear abgetastet und als vormultiplizierte Farbe über das Rasterbild gelegt. Ein transparenter 1×1-Hintergrund liefert Alpha 0 für den Hintergrund. Die Einblendung wächst mit der Samplezahl. Schluss ist bei 1.024 Samples, eine Bewegung setzt `pause` und bei der Rückkehr gibt es `updateCamera`/`updateTransforms`. Hintergrund-BVH-Bau im Worker (`generateMeshBVH.worker.js`), Fortschritt im Panel.

**Strömung:** `flow.js` erzeugt je Seite 96 Stromlinien aus Teilsegmenten: Einlauf, Rad, Diffusor, Spirale entlang der Mittellinie mit Querschnitts-Offset, Auslassrohr und Strahl. Danach werden die Linien auf 160 Punkte nach Bogenlänge neu abgetastet und **in Flussrichtung umgedreht** (`pts.reverse()`). Die Partikel liegen in Storage-Buffern. Ein Compute-Kernel schiebt pro Frame den Fortschritt u weiter und interpoliert die Position, dazu kommt etwas Wobble und Jitter. Die Darstellung sind additive Sprites, die Farbe hängt von u ab. 78 % sind Luft, verteilt per Hash, damit der Partikelregler (`sprite.count`) das Verhältnis hält.

**Schnitt und Röntgen:** Der Schnitt ist ein Keil um die Welle (`model.js › wedgeNodes`, `maskNode` und orange Schnittkanten über `emissiveNode`). Er läuft im Modellraum (`positionLocal`), sein Öffnungsgrad ist der Uniform `cut.amount` aus dem Regler. Röntgen tauscht die Gehäusematerialien gegen ein additives Fresnel-Glas (`useGhostMaterials`). Räder und Welle bleiben massiv.

**Explosion:** Pro Gruppe gibt es eine kritisch gedämpfte Feder (ω = 3,2, ζ = 1, kein Nachschwingen) und eine kritisch gedämpfte Drehfeder. Das Auseinanderfahren ist gestaffelt. Gegriffen wird über BVH-Raycast, der Drag läuft auf einer Kamera-Ebene. Beim Loslassen ergibt die Geschwindigkeit der letzten 90 ms den Wurf, der Hebelarm den Spin. Ein `snap`-Event löst Klick und Vibration aus. Die Labels stehen in zwei Reihen über und unter dem Produkt, gekoppelt über SVG-Führungslinien. Sie bauen sich gestaffelt auf (0,18 s pro Label): Punkt, wachsende Linie, dann das Label.

**Übergänge:** Intro: Preloader blendet in 1,6 s weich aus, `rig.animateTo(home, 2.8)` aus einer gedrehten Startpose, dazu ein Reveal-Shader in `model.js` (`reveal.front`, 5,4 s, Welt-x-Sweep: hinter der Front sichtbar, an der Front orange Wireframe-Linien aus `fract(positionWorld*22)` plus heller Rand). Moduswechsel: `rig.animateTo(…, 2)`, Schnittkeil per linearem `approach()` in 2 s (Regler 0,35 s), Partikel 2 s ein / 0,8 s aus, Röntgen 1,4 s. **Bodenraster:** `makeFloorGrid()` in `main.js`, Ebene bei y = −1,7, fwidth-Linien (0,25 und 1,0), radial ausgeblendet, nur in der 3D Ansicht.

**Rotate-Gizmo:** SVG mit drei Weltachs-Ringen, die mit der Kamerarotation projiziert und in Vorder- und Rückhälfte geteilt werden. Ein Hit-Test entscheidet zwischen Ring und freier Rotation.

## 6. Gehostete Fassung (Claude-Artefakt)

- Der Host liefert keine `.glb`, `.bin` oder `.wasm`. `build-web.mjs` legt sie als `*.json` (base64) ab, ein Inline-Shim in `index.html` fängt `fetch` auf `assets/**/*.(glb|bin|wasm|task)` ab, auch HEAD-Anfragen.
- Die Dateien dürfen höchstens 20 MiB groß sein (Modelle als base64-JSON).
- Artefakt-Slug: `a4745a5e-365d-4575-bfbb-e3d22ecde35c`. Neu veröffentlicht wird mit publish_files, `base_version` = letzte Version.

## 7. Tests

`tests/test.mjs` öffnet die Seite in Chrome unter Xvfb (headful) mit SwiftShader-Vulkan-WebGPU, wählt eine Stufe, startet und macht Screenshots pro Ebene. `dbg.mjs` führt beliebiges JavaScript gegen `window.__app` aus (URL-Parameter `?debug`).

Nützliche URL-Parameter:

| Parameter | Wirkung |
| --- | --- |
| `?debug` | `window.__app` bereitstellen |
| `?nopt` | Pathtracer nicht vorbereiten |
| `?noflow` | Strömung aus |
| `?noao` | GTAO aus |
| `?simfast=4` | Strömung beschleunigt, für Tests |

Aufruf: `xvfb-run -a -s "-screen 0 1600x1000x24" node tests/test.mjs light flow,wait8,keyx`

## 8. Stolperfallen (gelernt)

- Headless-Chrome rendert WebGPU-Canvas weiß. Abhilfe: headful unter Xvfb mit `--use-webgpu-adapter=swiftshader`.
- Ein TSL-`Fn` mit Parametern, denen zugewiesen wird (z. B. Storage-Elemente), schreibt nicht zurück. Spawn-Logik deshalb als normale JS-Funktion inline.
- TSL-`Loop` mit 3D-Texture-Sampling hat SwiftShader aufgehängt. Mehrere Dispatches statt Schleife verwenden.
- Physikalische Strömung im Distanzfeld war unzuverlässig (Tunneln durch dünne Wände, falsche Richtungen). Geführte Stromlinien aus vermessenen Mittellinien sind robust und lesbar.
- Die Richtung von Auslassrohren gehört vermessen (Querschnitte), nicht geschätzt.
- Verdichter und Turbine prüfen: Der Verdichter hat das größere Rad und das größere Gehäuse, die Luft strömt axial ein und tangential aus.
- Explosion entlang der Blickachse ist unlesbar, die Startansicht muss schräg sein.
- three-gpu-pathtracer: Quantisierte Attribute vorher entquantisieren. Hintergrund mit Alpha 0 über eine 1×1-Textur. `renderToCanvas = false` plus eigene Einblendung, sonst gibt es einen harten Wechsel.

## 9. Verlauf (20.11.2026)

1. Grundaufbau mit vier Ebenen, Preloader mit Gerätewahl, Bildlook mit Presets.
2. Apple-Design-Skill angewendet, kein Logo oben links (wird eingebettet).
3. Browserversion als Artefakt.
4. Einbaulage waagerecht, Röntgen, Halbton-Preloader, „Turbo Charger · Interactive Product Experience“.
5. Strömung auf geführte Stromlinien umgestellt, Auslassrohr vermessen, Richtungen umgekehrt, Verdichter und Turbine korrigiert.
6. Raytracing nur auf Knopfdruck (1.024 Samples), Rotate-Gizmo neben der Leiste, Schnittregler bis geschlossen.
7. Explosion in der Startansicht mit Kamerafahrt, Führungslinien, Beschriftung abschaltbar, Titelblock im Blocksatz.
8. Mehr Frischluft-Partikel, Partikelregler, Handsteuerung in der Browserversion.
10. Passwort-Abfrage im Startscreen (SHA-256-Vergleich, sessionStorage `tc-pass`), Raytracing als kleiner Knopf über der Leiste, kompakter Preloader bei niedriger Höhe, GitHub-Repo mit Pages aus `docs/` im 16:9-Rahmen (25.11.2026).
9. Feintuning (23.11.2026): graue Preloader-Punkte, weicher Start mit Wireframe-Reveal, „3D Ansicht“ statt „Fotoreal“, 2-s-Übergänge, langsamere Drehung, Explosion ohne Federn, gestaffelte Beschriftung, Handsteuerung entfernt, Bodenraster.

## Passwort und GitHub Pages

- `main.js`: `PASS_HASH` ist der SHA-256 des kleingeschriebenen Passworts. Neues Passwort: `python3 -c "import hashlib;print(hashlib.sha256(b'neu').hexdigest())"` und den Wert eintragen (plus den Fallback in `checkPass` für Browser ohne `crypto.subtle`). Das Formular `#pl-gate` erhält nach Erfolg die Klasse `open`.
- Das ist bewusst nur ein Sichtschutz: Alle Dateien sind öffentlich abrufbar.
- `npm run pages` baut nach `docs/praesentation` (ohne Starter). `docs/index.html` ist der 16:9-Rahmen mit Link „Eigenes Fenster“. `docs/.nojekyll` schaltet Jekyll ab.
