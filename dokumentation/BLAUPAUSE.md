# Blaupause: Interactive Product Experience aus CAD

Vorlage für weitere Produkte (Pumpe, Ventil, Getriebe, Maschine) nach dem Muster „Turbo Charger“.
Referenzprojekt: `F:\Cloud Daten\Dropbox\Dropbox\AI Tools\Claude\TurboCharger Premium` (Code in `_quellcode`).

## Ergebnis

Eine Seite mit Preloader (Gerätewahl), Titelblock oben links im Blocksatz, drei Ebenen in einem Segmented Control, Rotate-Gizmo daneben, Bildlook-Popover und i-Hilfe. Sie läuft lokal mit Starter, als gehostete Browserversion und eingebettet per iframe.

| Ebene | Inhalt |
| --- | --- |
| 3D Ansicht | Raster-PBR, Bodenraster; Pathtracing nur auf Knopfdruck, Abbruch bei 1.024 Samples, Bewegung pausiert |
| Strömung / Funktion | Partikel auf geführten Stromlinien aus der Geometrie; Schnittkeil (Regler bis geschlossen) oder Röntgen; Regler für Drehzahl und Partikelzahl |
| Explosion | kritisch gedämpft (kein Nachfedern), greifen, werfen, einrasten; Kamera behält Blickwinkel und fährt zurück; Labels bauen sich gestaffelt auf, abschaltbar |

**Teilen mit Coworkern:** GitHub-Repo, Pages aus `docs/` mit 16:9-Rahmen, Passwortfeld im Startscreen als Sichtschutz (kein echter Schutz bei öffentlichem Repo), `noindex`. Raytracing nur als kleiner Knopf, es ist ein Nischen-Feature.

**Übergänge sind Pflicht:** Start mit weichem Ausblenden des Preloaders, Drehung in die Startansicht (2–3 s) und orangem Wireframe-Reveal; jeder Ebenenwechsel 2 s (`rig.animateTo`, `approach()`). Handsteuerung hat sich für Präsentationen nicht bewährt und ist entfernt.

## Ablauf

1. **Daten sichten:** Cinema 4D per MCP, wenn verfügbar, sonst 3DS/OBJ aus dem Projektordner. 3DS ist ideal: benannte Objekte und Materialien, kleiner als OBJ.
2. **Bauteile erkennen:** `parse3ds.py` und `build.py` verwenden, Teile einfärben und rendern (`id.html` oder `preview.py`), Rollen zuordnen. **Funktion prüfen:** Was ist Ein- und was Auslass, welches Rad gehört wozu? Den Nutzer mit einem Screenshot bestätigen lassen.
3. **Web-Geometrie:** `toglb.py` mit Polygonbudget pro Teil (hi ~750k, lo ~350k), gekantete Normalen, danach `gltf-transform meshopt`. Im Browser entquantisieren.
4. **Kanäle vermessen** (für die Strömung): `sdf.py` liefert das Distanzfeld, `centerline.py` die Mittellinien von Spiralen und Kanälen, `slice.py` und `zslice.py` vermessen Rohrachsen und Flansche. **Nie schätzen**, immer messen. Die Landmarken als Konstanten in `flow.js` eintragen.
5. **Stromlinien bauen:** Segmente Einlauf → Rad/Kammer → Kanal entlang der Mittellinie (mit Querschnitts-Offset) → Auslass → Strahl. Richtung am Ende mit `reverse()` festlegen und mit dem Nutzer abgleichen, am besten per Screenshot mit Pfeilen.
6. **Katalog anpassen** (`model.js`): Gruppen, Labels, Explosionsoffsets (entlang der Hauptachse etwa 0,5–1,0 Gehäusedurchmesser), Masse, Materialien, Schnitt- und Ghost-Flags.
7. **Einbaulage und Kamera:** Root-Quaternion so wählen, dass die Hauptachse waagerecht liegt. Startansicht schräg (Dreiviertel), weil die Explosion entlang der Blickachse unlesbar wäre. `FLOW_VIEW` so setzen, dass der Schnittkeil keine Ein- oder Auslässe trifft.
8. **Texte:** Titel und Untertitel, Panel-Texte, Hilfe und Tasten auf Deutsch.
9. **Bauen und testen:** `node build.mjs dist`, Headless-Test unter Xvfb (siehe DOKUMENTATION.md, Abschnitt 7) pro Ebene, Screenshots prüfen.
10. **Ausliefern:** in den Dropbox-Projektordner (Präsentation, Quellcode, LIESMICH, DOKUMENTATION). Browserversion mit `node build-web.mjs dist web` bauen und als Claude-Artefakt veröffentlichen; Binärdateien als base64-JSON. iframe-Code mit `allow="fullscreen"` mitgeben.

## Gestaltungsregeln

- Apple-HIG: Glas nur auf der Bedienebene (Leiste, Panels, Popover, Gizmo), System-Schrift mit Inter als Fallback, Segmented Controls, 44 px Trefferflächen.
- Akzent Equiloud-Orange nur für Primäraktion, Status und Schnittkanten.
- Reduced Motion und Reduced Transparency berücksichtigen, i-Hilfe mit Tastenliste.
- Kein Logo oben links, weil die Seite eingebettet wird. Dort steht nur der Titelblock „Produktname / Interactive Product Experience“ im Blocksatz.
- Preloader: fließende Halbton-Punkte mit Cursor-Licht, Gerätekarten, Glas-Startbutton, Wort-Reveal.
- Hintergrund dunkel graphit, prozedurales HDR-Studio, gleich für Raster und Pathtracer.

## Typische Nutzerwünsche (aus dem Turbo-Projekt)

- Raytracing nicht automatisch, sondern per Start/Stop mit Sample-Limit.
- Gizmo im Rotate-Stil (drei Achsringe), nicht verdeckt, neben der Hauptleiste.
- Schnitt muss sich schließen lassen. Röntgen als Alternative.
- Flussrichtungen exakt gemäß Skizze.
- Partikelmenge regelbar, Frischluft deutlich dominanter.
- Explosion ohne Perspektivwechsel.
