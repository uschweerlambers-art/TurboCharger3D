# Turbo Charger · Interactive Product Experience

Interaktive Echtzeit-3D-Präsentation eines Garrett-Turboladers aus CAD-Daten – three.js WebGPU, Equiloud / Uwe Schweer-Lambers.

**Ansehen:** https://uschweerlambers-art.github.io/TurboCharger3D/ (Passwort beim Projektinhaber erfragen) · am besten in aktuellem Chrome oder Edge.

## Was drin ist

- **3D Ansicht** – Echtzeit-PBR, optional Pathtracing bis 1.024 Samples, Bodenraster
- **Strömung** – Partikel auf Stromlinien aus der Geometrie, Schnittkeil oder Röntgen, Drehzahl- und Partikelregler
- **Explosion** – Teile zerlegen, greifen, werfen, einrasten; Beschriftung mit Führungslinien
- Preloader mit Gerätewahl und Passwort, Bildlook-Presets, Rotate-Gizmo, Bedienhilfe (i)

## Ordner

| Ordner | Inhalt |
| --- | --- |
| `docs/` | GitHub-Pages-Seite: `index.html` (16:9-Rahmen) und `praesentation/` (gebaute Präsentation) |
| `src/` | Quellcode (HTML, CSS, JS-Module) |
| `assets/` | Web-Modelle (glb), Strömungspfade, Distanzfeld |
| `tools/` | Python-Pipeline: 3DS einlesen, Teile gruppieren, glb erzeugen, Kanäle vermessen |
| `tests/` | Headless-Tests (Chrome unter Xvfb) |
| `extra/` | Starter für die lokale Vorführung (Windows/Mac) |
| `dokumentation/` | LIESMICH, technische Dokumentation, Blaupause für ähnliche Projekte |

## Bauen

```bash
npm install
npm run pages   # baut docs/praesentation für GitHub Pages
npm run build   # baut dist/ mit lokalen Startern
```

Details in [`dokumentation/LIESMICH.md`](dokumentation/LIESMICH.md) und [`dokumentation/DOKUMENTATION.md`](dokumentation/DOKUMENTATION.md).

© Uwe Schweer-Lambers. Alle Rechte vorbehalten. Das Modell darf nicht weiterverwendet werden.
