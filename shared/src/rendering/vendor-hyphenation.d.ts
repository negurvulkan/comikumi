// Minimal ambient types for the (untyped) hypher hyphenation library and its per-language
// pattern packages. Pulled into the program via the triple-slash reference at the top of
// hyphenation.ts, so it works under both the client (Vite) and server (tsc) builds without
// depending on either tsconfig's `include` globs.
declare module "hypher" {
  export default class Hypher {
    constructor(patterns: unknown);
    hyphenate(word: string): string[];
  }
}
declare module "hyphenation.en-us" {
  const patterns: unknown;
  export default patterns;
}
declare module "hyphenation.de" {
  const patterns: unknown;
  export default patterns;
}
declare module "hyphenation.fr" {
  const patterns: unknown;
  export default patterns;
}
declare module "hyphenation.es" {
  const patterns: unknown;
  export default patterns;
}
declare module "hyphenation.it" {
  const patterns: unknown;
  export default patterns;
}
