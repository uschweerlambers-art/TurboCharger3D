# Turbo Charger · Interactive Product Experience

Interaktive Echtzeit-Präsentation eines Turboladers aus CAD-Daten. Sie läuft im Browser mit three.js und WebGPU.
Stand: 20.11.2026

## Links und Einstieg

| Was | Wo |
| --- | --- |
| **Browserversion (gehostet, zum Testen und Teilen)** | https://claude.ai/artifact/MJqaNxJVgCnXtKEeDkaUx3 |
| Lokale Präsentation | `Praesentation/index.html`, starten über `Praesentation starten.bat` (Windows) oder `Praesentation starten (Mac).command` (macOS), beide öffnen http://localhost:8737 |
| Hochladefertige Fassung für eigenes Hosting | `Browserversion/` (gleicher Inhalt wie der Link, Binärdateien als JSON) |
| Quellcode, Werkzeuge, Doku | `_quellcode/` und `_quellcode/DOKUMENTATION.md` |
| Blaupause für ähnliche Projekte | `BLAUPAUSE.md` |
| CAD-Ausgangsdaten | `3d/` (C4D, 3DS, OBJ) |

`index.html` lässt sich nicht per Doppelklick öffnen, denn Browser blockieren Module und Modelldateien über `file://`. Lokal startest du immer über die `.bat`, online über einen Webserver.

### Start auf dem Mac

1. Beim ersten Mal: `Praesentation starten (Mac).command` mit Rechtsklick → **Öffnen** → **Öffnen** starten (Gatekeeper-Abfrage, danach reicht ein Doppelklick).
2. Meldet das Terminal „Permission denied“, wurde das Ausführrecht über Dropbox nicht übertragen. Dann einmalig im Terminal ausführen: `chmod +x ` und die Datei ins Fenster ziehen, Enter.
3. Das Skript nimmt Python (Xcode-Befehlszeilenwerkzeuge), sonst Node oder Ruby. Fehlt alles: `xcode-select --install` oder die Browserversion nutzen.
4. Das Terminalfenster offen lassen, solange präsentiert wird.

## Die drei Ebenen

1. **3D Ansicht:** flüssiges Echtzeit-Rendering. Der kleine Knopf **„Raytracing“** über der Leiste (oder Taste T) rechnet ein WebGPU-Pathtracer das Bild bis **1.024 Samples** nach, das Bild entwickelt sich sichtbar zur Studioqualität. Jede Bewegung pausiert, Stillhalten setzt fort. Ein zweiter Klick oder ein Klick auf die Anzeige oben beendet die Berechnung.
2. **Strömung:** Partikel laufen entlang von Stromlinien, die aus der CAD-Geometrie abgeleitet sind.
   - **Verdichter** (Gehäuse mit V-Band-Schelle): blau-weiße Frischluft strömt axial ein, durch die Spirale und aus dem Schellenrohr hinaus.
   - **Turbine** (Gehäuse mit geradem Rohr): oranges Abgas strömt durch das Rohr ein, durch die Spirale nach innen und axial hinaus.
   - Ansicht **Schnitt** (Keil stufenlos von 0 bis 100 %, bei 0 % ist die Hülle geschlossen) oder **Röntgen** (Gehäuse als Glashülle).
   - Regler **Drehzahl** (0–200.000 U/min) und **Partikel** (5–100 % des Stufen-Maximums).
3. **Explosion:** Die Kamera behält ihren Blickwinkel und fährt nur zurück. Die Teile gleiten ohne Nachfedern auseinander, lassen sich greifen und werfen und rasten hörbar wieder ein. Die Beschriftung baut sich Teil für Teil auf, hat Führungslinien und lässt sich ausblenden (Schalter oder Taste B).

Übergänge: Nach „Präsentation starten“ blendet der Startscreen weich aus, der Turbolader dreht sich in rund 2,8 s in die Startansicht, ein orange leuchtendes Wireframe gleitet in rund 5,4 s als Reveal über die Oberfläche. Jeder Wechsel zwischen den Ebenen dauert 2 s: Kamera gleitet, Partikel blenden ein, der Schnittkeil öffnet sich langsam. In der 3D Ansicht liegt ein dünnes, halbtransparentes Bodenraster deutlich unter dem Produkt.

Dazu kommen:
- **Rotate-Gizmo** rechts neben der Leiste: blauer Ring dreht, rote und grüne Ringe kippen, die Mitte dreht frei, Doppelklick stellt die Startansicht wieder her.
- **Bildlook** (Regler-Symbol oben rechts): Presets Studio, Kino, Technik und Bühne sowie Regler für Belichtung, Glanz, Vignette, Körnung, Farbtemperatur, Sättigung und Tonwertkurve. Die letzte Einstellung wird gemerkt.
- **i-Button** mit Bedienhilfe, Vollbild, Ton (synthetisches Turbopfeifen, standardmäßig aus).

### Tasten

| Taste | Funktion |
| --- | --- |
| 1–3 | Ebene: 3D Ansicht, Strömung, Explosion |
| T | Raytracing starten / stoppen |
| E | Zerlegen / Zusammensetzen |
| X | Röntgenansicht (Strömung) |
| B | Beschriftung ein/aus |
| L | Bildlook |
| R | Ansicht zurücksetzen |
| F | Vollbild |
| M | Ton |
| I | Hilfe |
| ← → ↑ ↓ | Drehen, wenn das Gizmo fokussiert ist |

## Qualitätsstufen (Auswahl im Preloader)

| Stufe | Modell | Partikel (Maximum) | Raytracing-Auflösung | Extras |
| --- | --- | --- | --- | --- |
| Workstation | 760k Dreiecke | 900.000 | 85 % | Ambient Occlusion, Bloom |
| Laptop | 760k Dreiecke | 450.000 | 65 % | Bloom |
| Tablet & Smartphone | 390k Dreiecke | 140.000 | 50 % | – |

Die Empfehlung kommt aus der erkannten Grafikkarte und lässt sich ändern. Der Partikelregler startet bei 60 %, rund 78 % der Partikel sind Frischluft.

## Einbetten in WordPress (Uncode, Domain Factory)

Den Inhalt von `Praesentation/` (mit echten Binärdateien) oder von `Browserversion/` auf den Webspace laden, zum Beispiel nach `/praesentationen/turbo-charger/`. Dann im Uncode-Builder ein Raw-HTML-Element einfügen:

```html
<div style="position:relative;width:100%;aspect-ratio:16/9;border-radius:18px;overflow:hidden;background:#000">
  <iframe src="/praesentationen/turbo-charger/index.html"
          style="position:absolute;inset:0;width:100%;height:100%;border:0"
          allow="fullscreen; autoplay" allowfullscreen loading="lazy"
          title="Turbo Charger – Interactive Product Experience"></iframe>
</div>
```

- Ohne `allow="fullscreen"` sperrt der Browser im iframe den Vollbildmodus.
- Ein Logo oben links gibt es bewusst nicht, weil die Seite eingebettet wird. Oben links steht nur der Titelblock.

## Browser

Chrome oder Edge in aktueller Version (WebGPU) werden empfohlen. Ohne WebGPU laufen Modell und Explosion, aber Raytracing und Strömung fehlen.

## Bekannte Grenzen und offene Punkte

- Getestet wurde in einer Software-GPU (headless Chrome). Die Bildrate auf echter Hardware, besonders bei 900.000 Partikeln und beim Raytracing, ist noch zu prüfen.
- Die Handsteuerung wurde entfernt (23.11.2026). Der Ordner `Praesentation/assets/mediapipe` wird nicht mehr gebraucht und kann gelöscht werden.
- `Praesentation/assets/flow_sdf.bin` und `flow_sdf.json` werden nicht mehr gebraucht und können gelöscht werden. Sie bleiben nur noch in `_quellcode/assets` als Grundlage für `centerline.py`.
- Der Produktname lautet „Turbo Charger“. Der Garrett-Schriftzug ist Teil der CAD-Geometrie.

## GitHub Pages und Passwort (25.11.2026)

- Repo: `uschweerlambers-art/TurboCharger3D`. Die Seite liegt im Ordner `docs/`: `docs/index.html` zeigt die Präsentation in einem 16:9-Rahmen, `docs/praesentation/` ist die Präsentation selbst.
- Einschalten: im Repo unter **Settings → Pages** als Quelle „Deploy from a branch“, Branch `main`, Ordner `/docs` wählen. Die Adresse lautet dann `https://uschweerlambers-art.github.io/TurboCharger3D/`.
- Neu bauen: `npm install`, dann `npm run pages`, committen und pushen.
- Der Startscreen fragt ein Passwort ab (Groß- und Kleinschreibung egal). Es gilt für die Browser-Sitzung, ein Neuladen fragt nicht erneut.
- **Wichtig:** Das Passwort ist nur ein Vorhang gegen zufällige Besucher. Das Repo ist öffentlich, Code und 3D-Modell lassen sich dort direkt herunterladen. Echten Schutz gibt es nur mit privatem Repo und einem Hosting mit Zugangsschutz.
- Beide Seiten tragen `noindex`, Suchmaschinen sollen sie nicht aufnehmen.
