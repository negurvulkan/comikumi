import fs from "node:fs/promises";
import { PDFName, PDFString, type PDFDocument, type PDFPage } from "pdf-lib";

export type PdfXVersion = "x1a" | "x4";

/**
 * Reads the generic CMYK ICC profile bytes for OutputIntent embedding, from a path the
 * server operator supplies via `PDFX_ICC_PROFILE_PATH` — this environment has no
 * bundled ICC profile of its own (unlike, say, a real color-management install), and a
 * PDF/X OutputIntent's `DestOutputProfile` is only meaningful with a genuine, properly
 * licensed print profile (e.g. an ECI/FOGRA one) the user has to obtain themselves, not
 * one this tool could safely fabricate or bundle. Returns null (not an error) when
 * unset/unreadable — callers must then skip the OutputIntent/XMP PDF/X stamp entirely
 * rather than emit a technically non-compliant "PDF/X" file missing its mandatory
 * DestOutputProfile.
 */
export async function loadConfiguredIccProfile(): Promise<Buffer | null> {
  const path = process.env.PDFX_ICC_PROFILE_PATH;
  if (!path) return null;
  try {
    return await fs.readFile(path);
  } catch {
    return null;
  }
}

/** Builds the XMP packet declaring this PDF's PDF/X conformance level — only meaningful
 * (and only called) alongside a real OutputIntent, see applyPdfXMetadata. */
function buildXmpPacket(version: PdfXVersion): string {
  const gtsVersion = version === "x1a" ? "PDF/X-1a:2003" : "PDF/X-4";
  const conformance = version === "x1a" ? `\n      <pdfxid:GTS_PDFXConformance>PDF/X-1a:2003</pdfxid:GTS_PDFXConformance>` : "";
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/">
      <pdfxid:GTS_PDFXVersion>${gtsVersion}</pdfxid:GTS_PDFXVersion>${conformance}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export interface ApplyPdfXMetadataOptions {
  version: PdfXVersion;
  /** From loadConfiguredIccProfile() — pass null to produce a plain (non-PDF/X-stamped)
   * print-ready PDF instead of a falsely-labeled one. */
  iccProfileBytes: Buffer | null;
  pageWidthPt: number;
  pageHeightPt: number;
}

/** Result flag surfaced up to the API/UI layer — see this module's doc comment on
 * loadConfiguredIccProfile for why "not actually PDF/X" is a real, expected outcome. */
export interface ApplyPdfXMetadataResult {
  pdfxStamped: boolean;
}

/**
 * Applies the print-production metadata PDF/X-1a/X-4 requires: a TrimBox (always, safe
 * regardless of the ICC situation below), and — only when a real ICC profile is
 * available — an OutputIntent dictionary plus the matching XMP PDF/X-version
 * declaration. Also sets basic document info (Producer) unconditionally.
 *
 * Deliberately does NOT attempt full self-certification: an OutputIntent without a
 * `DestOutputProfile` is not valid PDF/X, so with no ICC profile configured this
 * produces a well-formed, real-vector, CMYK-content print PDF that simply isn't stamped
 * as certified PDF/X — surfaced via the returned `pdfxStamped: false` flag rather than
 * silently claiming compliance it can't back up. See docs/FEATURES.md for the
 * recommended manual preflight step (veraPDF/Acrobat) before delivering to a printer.
 */
export function applyPdfXMetadata(pdfDoc: PDFDocument, page: PDFPage, opts: ApplyPdfXMetadataOptions): ApplyPdfXMetadataResult {
  page.setTrimBox(0, 0, opts.pageWidthPt, opts.pageHeightPt);
  pdfDoc.setProducer("ComiKumi Vektor-PDF-Export");
  pdfDoc.setCreationDate(new Date());

  if (!opts.iccProfileBytes) {
    return { pdfxStamped: false };
  }

  const context = pdfDoc.context;
  const profileStream = context.stream(opts.iccProfileBytes, { N: 4 }); // N=4 -> CMYK component count
  const profileRef = context.register(profileStream);
  const outputIntentRef = context.register(
    context.obj({
      Type: "OutputIntent",
      S: "GTS_PDFX",
      OutputConditionIdentifier: PDFString.of("Custom"),
      Info: PDFString.of("User-supplied CMYK ICC profile (PDFX_ICC_PROFILE_PATH)"),
      DestOutputProfile: profileRef,
    })
  );
  pdfDoc.catalog.set(PDFName.of("OutputIntents"), context.obj([outputIntentRef]));

  const xmp = buildXmpPacket(opts.version);
  const metadataRef = context.register(context.stream(xmp, { Type: "Metadata", Subtype: "XML" }));
  pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);

  return { pdfxStamped: true };
}
