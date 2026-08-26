# Skript-JSON-Format

*[English version](Script-JSON-Format.md)*

Ein Band kann optional eine Skript-Datei haben (`<band><scriptSuffix>.json`, Standard-
Suffix `_script`, z. B. `Volume_01_script.json`, konfigurierbar über Projekt →
Einstellungen) — Plot, grobe Panel-Aufteilung, Bildkomposition und mehrsprachiger
Dialogtext für die Planungsphase, unabhängig vom später gescannten Seitenbild und
dessen Sprechblasen/Panels (siehe [FEATURES.de.md → Skript-Editor & Skript-Sidebar](FEATURES.de.md#skript-editor--skript-sidebar)).
Anders als beim [Seiten-Layout](JSON-Format.de.md) gibt es hier **keine Pixel-Geometrie** —
eine Skript-Seite braucht kein Bild, um zu existieren.

Das Schema ist in [`shared/src/script.ts`](../shared/src/script.ts) als
[Zod](https://zod.dev)-Schema definiert; diese Datei beschreibt es in Prosa. Ein
maschinenlesbares JSON-Schema (draft-07, aus demselben Zod-Schema generiert) liegt unter
[`script.schema.json`](script.schema.json) — geeignet, um es direkt einer KI als
strukturierte Referenz mitzugeben (siehe unten, "Für KI-gestützte Erzeugung").

## Grundgerüst (`ScriptDocument`)

```jsonc
{
  "pages": [ /* ScriptPage[] */ ]
}
```

Ein leeres Dokument ist `{ "pages": [] }` — genau das liefert `GET .../script`, wenn für
den Band noch keine Skript-Datei gespeichert wurde.

## ScriptPage

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `id` | string | – | eindeutige ID (uuid) |
| `label` | string | `""` | Anzeigename der Seite. Leer = automatische Nummerierung ("Seite N" nach Array-Position) |
| `notes` | string | `""` | Freitext-Notizfeld für die ganze Seite |
| `panels` | `ScriptPanel[]` | `[]` | Die Panels dieser Skript-Seite, in Erzählreihenfolge |
| `linkedPage` | string \| `null` | `null` | Name einer echten gescannten Seite (z. B. `"page_03"`), mit der diese Skript-Seite über die Skript-Sidebar verknüpft ist. `null` = noch keine Verknüpfung — der Normalfall für jede im Skript-Editor neu angelegte Seite |

## ScriptPanel

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `id` | string | – | eindeutige ID (uuid) |
| `sizeHint` | `"small" \| "medium" \| "large"` | `"medium"` | Grobe Größenangabe für die spätere Layout-Planung — rein informativ, hat keine Pixel-Auswirkung |
| `composition` | string | `""` | Bildkomposition — was im Panel zu sehen ist, Kameraperspektive/Framing |
| `action` | string | `""` | Handlung — was in diesem Panel passiert |
| `dialogue` | `ScriptDialogueLine[]` | `[]` | Dialogzeilen dieses Panels, in Sprechreihenfolge |

## ScriptDialogueLine

| Feld | Typ | Default | Bedeutung |
|---|---|---|---|
| `id` | string | – | eindeutige ID (uuid) |
| `characterId` | string \| `null` | `null` | Referenz auf einen Eintrag der projektweiten [Charakterverwaltung](FEATURES.de.md#charakterverwaltung) (`type === "character"` in der Story Bible). `null` = kein Sprecher zugeordnet; eine veraltete/gelöschte ID wird wie `null` behandelt |
| `text` | `Record<Sprachcode, string>` | `{}` | Dialogtext pro Projektsprache — derselbe Aufbau wie `Bubble.text` im Seiten-Layout, siehe [JSON-Format.md → Bubble](JSON-Format.de.md#bubble). Fehlt ein Sprachcode, gilt der Text für diese Sprache als noch nicht übersetzt |
| `note` | string | `""` | Freie Regieanweisung, z. B. `"off-panel"`, `"genuschelt"` |

## Für KI-gestützte Erzeugung

Dieses Schema eignet sich gut, um es zusammen mit einem unformatierten Fließtext-Skript
einer KI zu übergeben und daraus ein valides `ScriptDocument` generieren zu lassen — im
Gegensatz zum Seiten-Layout braucht keine Panel-/Blasen-Geometrie geschätzt zu werden,
nur die inhaltliche Struktur (Seite → Panel → Dialogzeile). Sinnvoller Ablauf:

1. `script.schema.json` (oder diese Datei) sowie die Liste der im Projekt bereits
   angelegten Sprachcodes (siehe [Sprachverwaltung](FEATURES.de.md#sprachverwaltung)) und
   Charaktere (Name → `id`, aus der [Charakterverwaltung](FEATURES.de.md#charakterverwaltung))
   der KI als Kontext mitgeben.
2. Die KI erzeugt `ScriptDocument`-JSON mit `linkedPage: null` (noch keine echte Seite
   vorhanden) und `text`-Feldern nur für die Ausgangssprache — Übersetzungen können
   danach im Skript-Editor selbst oder in einem zweiten KI-Durchlauf ergänzt werden
   (siehe unten).
3. Das Ergebnis lässt sich validieren, indem man es gegen `script.schema.json` prüft,
   bevor es per `PUT /api/[p/:projectId/]volumes/:id/script` gespeichert wird — dieselbe
   Route, die auch der Skript-Editor beim Speichern verwendet, inklusive
   `ScriptDocumentSchema.safeParse()`-Validierung serverseitig (`server/src/routes/script.ts`).

Dasselbe Muster funktioniert auch für **Übersetzungen**: eine bestehende
`ScriptDocument`- oder [`PageLayout`](JSON-Format.de.md)-Datei zusammen mit den gewünschten
Ziel-Sprachcodes an eine KI übergeben, die dann fehlende Einträge in den jeweiligen
`text`-Records ergänzt, ohne Struktur, IDs oder bereits vorhandene Übersetzungen zu
verändern.
