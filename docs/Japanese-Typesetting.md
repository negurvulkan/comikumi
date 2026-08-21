# Japanisches (vertikales) Lettering

Für Bubbles mit `direction: "vertical-rl"` (Spalten von rechts nach links,
Standard für japanisches Manga-Lettering) wendet das Tool automatisch mehrere
typografische Verbesserungen an. Das JSON-Format selbst ändert sich dadurch
nicht (siehe [JSON-Format.md](JSON-Format.md)) — alles wird beim Rendern aus dem
normalen `text`-Feld herausgelesen.

## Automatisch (kein Zutun nötig)

- **Manuelle Zeilenumbrüche.** Ein `\n` im Text erzwingt jetzt einen echten
  Spaltenumbruch, statt (wie zuvor) stillschweigend entfernt zu werden.
- **Kinsoku Shori (禁則処理).** Eine Spalte beginnt nie mit Satzzeichen/kleinen
  Kana (、。ー」ゃゅょっ...) und endet nie mit einer öffnenden Klammer (「『（...)
  — solche Zeichen wandern automatisch in die Nachbarspalte.
- **ー/〜-Rotation.** Der lange Vokal-Strich (ー) und die Wellenlinie (〜) werden
  um 90° gedreht, damit sie als vertikaler Strich statt als quer liegender
  Strich in der Spalte erscheinen.
- **Satzzeichen (、。「」『』（）).** Werden durch ihre eigenen Unicode-„Vertical
  Forms“-Codepoints ersetzt (z. B. 、→ ︑, 。→ ︒) — echte, vom Font selbst
  korrekt oben rechts positionierte bzw. gedrehte Glyphen, kein manueller
  Trick. Das Tool prüft das pro Schriftart einmalig per Pixel-Probe (rendert
  das Ersatzzeichen und vergleicht dessen Tinten-Bounding-Box mit dem
  Originalzeichen); hat eine Schriftart diese Glyphen nicht, fällt das Tool
  automatisch auf den manuellen Versatz nach oben rechts zurück.
- **Kleine Kana.** っゃゅょ (und Katakana-Pendants) sowie ぁぃぅぇぉ werden leicht
  nach oben rechts in ihrer Zelle versetzt — eine Annäherung an die
  dedizierten vertikalen Glyphvarianten (die dieses Tool mangels nativer
  `writing-mode`-Textauslagerung nicht direkt nutzen kann, da jedes Zeichen
  einzeln auf Canvas gezeichnet wird; für sie gibt es anders als bei 、。「」
  keine eigenen Vertical-Forms-Codepoints).
- **Tate-chū-yoko (縦中横).** Kurze Läufe aus genau 2 Halbbreite-Ziffern/
  Buchstaben (z. B. „21“, „MP“) werden aufrecht und nebeneinander in einer
  einzigen Zelle gesetzt statt einzeln gestapelt. Läufe mit ungerader Länge
  behalten das letzte Zeichen als normales Einzelzeichen.
- **Wortzusammenhalt (Katakana/Kanji).** Zusammenhängende Katakana-Läufe (Namen,
  Lehnwörter) und Kanji-Läufe (Komplexbegriffe) werden beim Spaltenumbruch nie
  mitten getrennt — z. B. bleibt „ケイト“ als Ganzes in einer Spalte, statt als
  „ケイ“/„ト“ auf zwei Spalten aufgeteilt zu werden. Einzelne Kanji oder
  Hiragana-Übergänge (z. B. bei 食べる zwischen 食べ und る) bleiben weiterhin
  reguläre, zulässige Umbruchstellen.
- **Einheitliche Ausrichtung.** Alle Spalten eines Textblocks teilen sich einen
  gemeinsamen oberen Startpunkt, statt sich (wie zuvor) jede für sich an ihrer
  eigenen Zeichenzahl vertikal zu zentrieren — das verhinderte, dass Spalten
  unterschiedlicher Länge (z. B. bei mehreren `\n`-getrennten Sätzen) sichtbar
  „treppenförmig“ versetzt wirkten. Zusätzlich wirkt die „Ausrichtung“-Einstellung
  (links/zentriert/rechts) jetzt auch bei vertikalem Text: Sie verschiebt den
  gesamten Spaltenblock horizontal innerhalb der Box, statt (wie zuvor) ignoriert
  zu werden.

## Manuell: Furigana

Lesehilfen über Kanji werden inline im Text markiert:

```
{漢字|かんじ}
```

`漢字` (der Basis-Text) wird normal in der Spalte gesetzt, `かんじ` (die Lesung)
erscheint kleiner, rechts daneben, gleichmäßig über die Höhe des Basis-Laufs
verteilt. Enthält eine Bubble mindestens eine Furigana-Markierung, wird der
Spaltenabstand für den gesamten Textblock etwas großzügiger reserviert, damit
die Lesungen Platz haben (eine pauschale, nicht pro Spalte optimierte Lücke —
einfacher und robuster als eine exakt bedarfsgerechte Berechnung).

Nicht erkannte/unvollständige `{...}`-Ausdrücke (z. B. vergessene `|`) werden
als normaler Text behandelt, es gibt keinen Absturz.

## Bewusste Vereinfachungen

- Die Kinsoku-Anpassung optimiert Lesbarkeit, nicht perfekte Spaltenhöhe —
  eine Spalte kann dadurch ein bis zwei Zeichen länger werden als rechnerisch
  vorgesehen. Das ist der übliche Kompromiss auch in anderen (nicht rein
  professionellen) Satzwerkzeugen.
- Tate-chū-yoko gruppiert feste 2er-Läufe; längere Zahlen (z. B. Jahreszahlen)
  werden bewusst nicht gruppiert, da sie im echten Manga-Lettering meist auch
  einzeln gesetzt werden.
- Furigana-Spaltenabstand ist pauschal für den ganzen Textblock, nicht nur an
  den Stellen mit tatsächlicher Furigana.
- Der Wortzusammenhalt erkennt Katakana-/Kanji-Läufe rein anhand der
  Unicode-Skriptzugehörigkeit (kein Wörterbuch/Morphologie-Analyse) — er
  verhindert das Auftrennen zusammenhängender Skript-Läufe, bevorzugt aber
  (noch) keine Umbrüche direkt nach Partikeln (は/が/を/に/で/と). Eine
  echte Bunsetsu-Erkennung bräuchte einen Tokenizer wie TinySegmenter.
