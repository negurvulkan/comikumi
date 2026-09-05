// archiver@8 ships no bundled types and the community @types/archiver package still
// documents the pre-8 default-callable-function API (archiver("zip", opts)), which no
// longer matches the real ESM export shape (named classes only) — installing it back
// would silently type-check against an API that doesn't exist at runtime. This declares
// only the exact surface this project actually calls (new ZipArchive, .file, .finalize,
// plus whatever Transform/EventEmitter already provides for .pipe/.on).
declare module "archiver" {
  import { Readable, Transform } from "node:stream";

  export interface ZipArchiveOptions {
    zlib?: { level?: number };
  }

  export interface ZipEntryData {
    name: string;
    date?: Date | string;
    mode?: number;
    prefix?: string;
  }

  export class ZipArchive extends Transform {
    constructor(options?: ZipArchiveOptions);
    file(filepath: string, data: ZipEntryData): this;
    append(source: string | Buffer | Readable, data: ZipEntryData): this;
    directory(dirpath: string, destpath: string | false): this;
    finalize(): Promise<void>;
  }
}
