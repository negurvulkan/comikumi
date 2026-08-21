import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageLayoutSchema } from "../../../shared/src/layoutSchema";
import type { LanguageDef } from "../../../shared/src/languages";
import type { Character } from "../../../shared/src/characters";
import type { GlossaryEntry } from "../../../shared/src/glossary";
import type { LetteringPreset } from "../../../shared/src/presets";
import { useEditorStore } from "../state/editorStore";
import { PageCanvas } from "../editor/PageCanvas";
import { BubbleInspector } from "../editor/BubbleInspector";
import { ImageInspector } from "../editor/ImageInspector";
import { CurvedTextInspector } from "../editor/CurvedTextInspector";
import { PanelInspector } from "../editor/PanelInspector";
import { MultiSelectInspector } from "../editor/MultiSelectInspector";
import { ExportPanel } from "../editor/ExportPanel";
import { TextListPanel } from "../editor/TextListPanel";
import { TranslatorContextPanel } from "../editor/TranslatorContextPanel";
import { MenuBar } from "../editor/MenuBar";
import type { MenuGroup } from "../editor/MenuBar";
import { ToolStrip, type DrawTool } from "../editor/ToolStrip";
import { LanguageStrip } from "../editor/LanguageStrip";
import { Modal } from "../editor/Modal";
import { SettingsForm } from "../editor/SettingsForm";
import { CharacterManager } from "../editor/CharacterManager";
import { GlossaryManager } from "../editor/GlossaryManager";
import { PresetManager } from "../editor/PresetManager";
import { ReportModal } from "../editor/ReportModal";
import { moveBubbleInReadingOrder } from "../editor/reportUtils";
import { api, downloadBlob } from "../api/client";
import { useExportRun } from "../export/useExportRun";
import { ensureFontsLoaded } from "../editor/fontLoader";
import { ensureSvgBubbleBoundaryLoaded, isSvgBubbleBoundaryCached } from "../export/svgBubbleGeometry";
import { useProject } from "../state/ProjectContext";

export function Editor() {
  const { volumeId = "", page = "" } = useParams();
  const navigate = useNavigate();
  const { project } = useProject();
  const store = useEditorStore();
  const [drawTool, setDrawTool] = useState<DrawTool | null>(null);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showTextPanel, setShowTextPanel] = useState(false);
  const [showContextPanel, setShowContextPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCharacters, setShowCharacters] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [presets, setPresets] = useState<LetteringPreset[]>([]);
  // Independent of the page's own activeLanguage tab on purpose — lets the
  // panel show e.g. the Japanese source while the inspector below keeps
  // editing the German translation, see TextListPanel.tsx. Seeded once from
  // the page's active language so it starts in sync, then drifts freely.
  const [textPanelLanguage, setTextPanelLanguage] = useState(store.activeLanguage);
  const importInputRef = useRef<HTMLInputElement>(null);
  // Bumped once the real (uploaded) fonts finish loading, so bubbles that were
  // first painted with a browser fallback font get force-remounted and redrawn
  // with the correct glyphs — otherwise the canvas just keeps the stale look.
  const [fontsVersion, setFontsVersion] = useState(0);
  const [languages, setLanguages] = useState<LanguageDef[]>([]);

  useEffect(() => {
    store.loadPage(volumeId, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeId, page]);

  useEffect(() => {
    ensureFontsLoaded().then(() => setFontsVersion((v) => v + 1));
  }, []);

  useEffect(() => {
    api.listLanguages().then(setLanguages);
  }, []);

  useEffect(() => {
    api.listCharacters().then(setCharacters);
  }, []);

  useEffect(() => {
    api.listGlossary().then(setGlossary);
  }, []);

  useEffect(() => {
    api.listPresets().then(setPresets);
  }, []);

  // Once languages are known, make sure the active tab actually exists — the
  // store defaults to "de" before we know whether that language still exists.
  useEffect(() => {
    if (languages.length === 0) return;
    if (!languages.some((l) => l.code === store.activeLanguage)) {
      store.setActiveLanguage(languages[0].code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languages]);

  const { layout, loading, error, selectedBubbleIds, selectedImageIds, selectedCurvedTextIds, selectedPanelIds, activeLanguage, dirty, saving, past } = store;

  // Global keyboard shortcuts — Escape/Delete/arrow-nudge/duplicate/undo-redo.
  // Reads fresh state via useEditorStore.getState() instead of closing over
  // the `store` snapshot from the hook, so this effect only needs to run
  // once (an empty dep array) instead of re-subscribing on every store change.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }

    function handleKeyDown(e: KeyboardEvent) {
      // While a text field has focus, let the browser's own native
      // undo/typing/selection behavior handle every key — none of these
      // shortcuts should hijack e.g. Ctrl+Z while editing bubble text.
      if (isTypingTarget(e.target)) return;

      const s = useEditorStore.getState();
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        s.undo();
        return;
      }
      if (ctrlOrCmd && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        s.redo();
        return;
      }
      if (ctrlOrCmd && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicateSelected();
        return;
      }
      if (e.key === "Escape") {
        s.deselectAll();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.removeSelected();
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        s.nudgeSelected(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        s.nudgeSelected(step, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        s.nudgeSelected(0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        s.nudgeSelected(0, step);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // SVG bubble contours are parsed asynchronously and cached (see
  // svgBubbleGeometry.ts) — a Konva sceneFunc can't await, so this preloads
  // every referenced file (base form + any per-language formOverride) and
  // bumps fontsVersion (already used to force-remount bubbles once a real
  // font finishes loading) once done, so a freshly-picked SVG appears
  // without needing a manual re-select.
  useEffect(() => {
    if (!layout) return;
    const fileNames = new Set<string>();
    for (const bubble of layout.bubbles) {
      if (bubble.svgFileName) fileNames.add(bubble.svgFileName);
      for (const override of Object.values(bubble.formOverride ?? {})) {
        if (override.svgFileName) fileNames.add(override.svgFileName);
      }
    }
    const uncached = [...fileNames].filter((fileName) => !isSvgBubbleBoundaryCached(fileName));
    if (uncached.length === 0) return;
    Promise.all(uncached.map((fileName) => ensureSvgBubbleBoundaryLoaded(fileName))).then(() => {
      setFontsVersion((v) => v + 1);
    });
  }, [layout]);
  const selectedCount = selectedBubbleIds.length + selectedImageIds.length + selectedCurvedTextIds.length + selectedPanelIds.length;
  // The detailed per-field inspectors only make sense for a single selected
  // element — with more than one selected, MultiSelectInspector (bulk
  // duplicate/delete) takes over instead.
  const selectedBubble = selectedCount === 1 ? layout?.bubbles.find((b) => b.id === selectedBubbleIds[0]) ?? null : null;
  const selectedImage = selectedCount === 1 ? layout?.images.find((img) => img.id === selectedImageIds[0]) ?? null : null;
  const selectedCurvedText = selectedCount === 1 ? layout?.curvedTexts.find((el) => el.id === selectedCurvedTextIds[0]) ?? null : null;
  const selectedPanelIndex = selectedCount === 1 ? layout?.panels.findIndex((p) => p.id === selectedPanelIds[0]) ?? -1 : -1;
  const selectedPanel = selectedPanelIndex >= 0 ? layout?.panels[selectedPanelIndex] ?? null : null;
  const activeLangDef = languages.find((l) => l.code === activeLanguage) ?? languages[0];
  const { exporting, exportMsg, setExportMsg, runExport } = useExportRun(volumeId, languages);

  function handleDownloadJson() {
    if (!layout) return;
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${page}.json`);
  }

  async function handleImportJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setExportMsg(null);
    try {
      const text = await file.text();
      const parsed = PageLayoutSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        setExportMsg("Fehler: Datei entspricht nicht dem erwarteten Layout-Format.");
        return;
      }
      store.importBubbles(parsed.data.bubbles);
      setExportMsg(`JSON importiert: ${parsed.data.bubbles.length} Bubble(s). Nicht vergessen zu speichern.`);
    } catch (err) {
      setExportMsg(`Fehler beim Import: ${(err as Error).message}`);
    }
  }

  if (loading) return <p>Lade Seite…</p>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!layout) return null;

  const menuGroups: MenuGroup[] = [
    {
      key: "seite",
      label: "Seite",
      entries: [
        { type: "action", label: saving ? "Speichert…" : "Speichern", onClick: () => store.save(), disabled: saving || !dirty },
        { type: "separator" },
        { type: "sublabel", label: "Import" },
        { type: "action", label: "JSON", onClick: () => importInputRef.current?.click() },
        { type: "separator" },
        { type: "sublabel", label: "Export" },
        { type: "action", label: "Bild…", onClick: () => setShowExportPanel(true), disabled: languages.length === 0 },
        { type: "action", label: "JSON", onClick: handleDownloadJson },
        { type: "separator" },
        { type: "action", label: "Bericht anzeigen", onClick: () => setShowReport(true) },
        { type: "separator" },
        { type: "action", label: "Schließen", onClick: () => navigate(`/volumes/${encodeURIComponent(volumeId)}`) },
      ],
    },
    {
      key: "bearbeiten",
      label: "Bearbeiten",
      entries: [
        { type: "action", label: "Rückgängig", onClick: () => store.undo(), disabled: past.length === 0 },
        { type: "action", label: "Löschen", onClick: () => store.removeSelected(), disabled: selectedCount === 0 },
        { type: "action", label: "Duplizieren", onClick: () => store.duplicateSelected(), disabled: selectedCount === 0 },
      ],
    },
    {
      key: "projekt",
      label: "Projekt",
      entries: [
        { type: "action", label: "Wechseln", onClick: () => navigate("/project") },
        { type: "action", label: "Charaktere", onClick: () => setShowCharacters(true) },
        { type: "action", label: "Glossar", onClick: () => setShowGlossary(true) },
        { type: "action", label: "Presets", onClick: () => setShowPresets(true) },
        { type: "action", label: "Einstellungen", onClick: () => setShowSettings(true) },
      ],
    },
    {
      key: "hilfe",
      label: "Hilfe",
      entries: [{ type: "action", label: "Noch keine Einträge", onClick: () => {}, disabled: true }],
    },
  ];

  return (
    <div className="page">
      <MenuBar
        groups={menuGroups}
        trailing={<span className="pill">{saving ? "Speichert…" : dirty ? "Ungespeichert" : "Gespeichert"}</span>}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportJsonFile}
        style={{ display: "none" }}
      />
      {exportMsg && <div className="error-banner" style={{ background: "#1f3a2a", borderColor: "#2f7a48", color: "#b3ffc0" }}>{exportMsg}</div>}
      {showExportPanel && (
        <Modal onClose={() => setShowExportPanel(false)}>
          <ExportPanel
            languages={languages}
            currentPage={page}
            exporting={exporting}
            onExport={(selection, onlyTranslated, languageFilter) =>
              runExport(selection, onlyTranslated, languageFilter, layout ? { page, layout } : null)
            }
            onClose={() => setShowExportPanel(false)}
          />
        </Modal>
      )}
      {showSettings && (
        <Modal onClose={() => setShowSettings(false)}>
          <SettingsForm onClose={() => setShowSettings(false)} />
        </Modal>
      )}
      {showCharacters && (
        <Modal onClose={() => setShowCharacters(false)}>
          <CharacterManager characters={characters} onChange={setCharacters} onClose={() => setShowCharacters(false)} />
        </Modal>
      )}
      {showGlossary && (
        <Modal onClose={() => setShowGlossary(false)}>
          <GlossaryManager glossary={glossary} languages={languages} onChange={setGlossary} onClose={() => setShowGlossary(false)} />
        </Modal>
      )}
      {showPresets && (
        <Modal onClose={() => setShowPresets(false)}>
          <PresetManager presets={presets} onChange={setPresets} onClose={() => setShowPresets(false)} />
        </Modal>
      )}
      {showReport && (
        <Modal onClose={() => setShowReport(false)}>
          <ReportModal
            bubbles={layout.bubbles}
            panels={layout.panels}
            characters={characters}
            activeLanguage={activeLanguage}
            onClose={() => setShowReport(false)}
          />
        </Modal>
      )}
      <div className="editor-body">
        <ToolStrip
          drawTool={drawTool}
          onSetDrawTool={setDrawTool}
          onInsertImage={(fileName, w, h) => store.addImage(fileName, w, h, languages.map((l) => l.code))}
          onAddCurvedText={() => store.addCurvedText()}
          textPanelOpen={showTextPanel}
          onToggleTextPanel={() => {
            setShowTextPanel((v) => !v);
            setShowContextPanel(false);
          }}
          textPanelDisabled={languages.length === 0}
          contextPanelOpen={showContextPanel}
          onToggleContextPanel={() => {
            setShowContextPanel((v) => !v);
            setShowTextPanel(false);
          }}
        />
        <TextListPanel
          open={showTextPanel}
          bubbles={layout.bubbles}
          curvedTexts={layout.curvedTexts}
          languages={languages}
          panelLanguage={textPanelLanguage}
          onPanelLanguageChange={setTextPanelLanguage}
          onSelectBubble={(id) => store.selectBubble(id)}
          onSelectCurvedText={(id) => store.selectCurvedText(id)}
          onClose={() => setShowTextPanel(false)}
        />
        <TranslatorContextPanel
          open={showContextPanel}
          volumeId={volumeId}
          page={page}
          layout={layout}
          characters={characters}
          languages={languages}
          selectedBubbleId={selectedBubbleIds[0] ?? null}
          onSelectBubble={(id) => store.selectBubble(id)}
          onMove={(direction) => {
            const bubbleId = selectedBubbleIds[0];
            if (!bubbleId) return;
            const patches = moveBubbleInReadingOrder(layout.bubbles, layout.panels, activeLanguage, bubbleId, direction);
            patches.forEach(({ id, readingOrderOverride }) => store.updateBubble(id, { readingOrderOverride }));
          }}
          onClose={() => setShowContextPanel(false)}
        />
        <LanguageStrip languages={languages} active={activeLanguage} onChange={store.setActiveLanguage} onLanguagesChange={setLanguages} />
        <div className="editor-layout">
          <PageCanvas
            projectName={project?.name}
            volumeId={volumeId}
            page={page}
            imageUrl={api.pageImageUrl(volumeId, page)}
            imageWidth={layout.imageWidth}
            imageHeight={layout.imageHeight}
            bubbles={layout.bubbles}
            images={layout.images}
            curvedTexts={layout.curvedTexts}
            panels={layout.panels}
            characters={characters}
            presets={presets}
            selectedIds={selectedBubbleIds}
            selectedImageIds={selectedImageIds}
            selectedCurvedTextIds={selectedCurvedTextIds}
            selectedPanelIds={selectedPanelIds}
            activeLanguage={activeLanguage}
            fontsVersion={fontsVersion}
            drawTool={drawTool}
            onSelect={store.selectBubble}
            onChange={store.updateBubble}
            onCreate={(shape, box) => {
              store.addBubble(shape, box);
              setDrawTool(null);
            }}
            onSelectImage={store.selectImage}
            onChangeImage={store.updateImage}
            onSelectCurvedText={store.selectCurvedText}
            onChangeCurvedText={store.updateCurvedText}
            onSelectPanel={store.selectPanel}
            onChangePanel={store.updatePanel}
            onCreatePanel={(points) => {
              store.addPanel(points);
              setDrawTool(null);
            }}
            onDeselectAll={store.deselectAll}
            onDuplicateSelected={() => store.duplicateSelected()}
            onDeleteSelected={() => store.removeSelected()}
          />
          {selectedCount > 1 ? (
            <MultiSelectInspector
              bubbleCount={selectedBubbleIds.length}
              imageCount={selectedImageIds.length}
              curvedTextCount={selectedCurvedTextIds.length}
              panelCount={selectedPanelIds.length}
              onDuplicate={() => store.duplicateSelected()}
              onDelete={() => store.removeSelected()}
            />
          ) : selectedBubble ? (
            <BubbleInspector
              bubble={selectedBubble}
              activeLanguage={activeLanguage}
              panels={layout.panels}
              characters={characters}
              glossary={glossary}
              presets={presets}
              onChange={(patch) => store.updateBubble(selectedBubble.id, patch)}
              onDelete={() => store.removeBubble(selectedBubble.id)}
            />
          ) : selectedImage ? (
            <ImageInspector
              element={selectedImage}
              activeLanguage={activeLanguage}
              activeLanguageLabel={activeLangDef?.label ?? activeLanguage}
              onChange={(patch) => store.updateImage(selectedImage.id, patch)}
              onDelete={() => store.removeImage(selectedImage.id)}
            />
          ) : selectedCurvedText ? (
            <CurvedTextInspector
              element={selectedCurvedText}
              activeLanguage={activeLanguage}
              glossary={glossary}
              presets={presets}
              onChange={(patch) => store.updateCurvedText(selectedCurvedText.id, patch)}
              onDelete={() => store.removeCurvedText(selectedCurvedText.id)}
            />
          ) : selectedPanel ? (
            <PanelInspector
              panel={selectedPanel}
              index={selectedPanelIndex}
              onChange={(patch) => store.updatePanel(selectedPanel.id, patch)}
              onDelete={() => store.removePanel(selectedPanel.id)}
            />
          ) : (
            <div className="inspector">
              <p style={{ color: "var(--text-muted)", margin: 0 }}>
                Bubble, Bild oder Kurventext auswählen, oder mit einem der Werkzeuge links neu anlegen.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
