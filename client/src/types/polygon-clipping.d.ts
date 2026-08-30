/** polygon-clipping ships no bundled TypeScript types — this covers exactly the slice of
 * its API bubbleMerge.ts uses (the default-exported `union`). See
 * https://github.com/mfogel/polygon-clipping for the full API. */
declare module "polygon-clipping" {
  export type Pair = [number, number];
  export type Ring = Pair[];
  export type Polygon = Ring[];
  export type MultiPolygon = Polygon[];
  export type Geom = Polygon | MultiPolygon;

  interface PolygonClipping {
    union(geom: Geom, ...geoms: Geom[]): MultiPolygon;
    intersection(geom: Geom, ...geoms: Geom[]): MultiPolygon;
    xor(geom: Geom, ...geoms: Geom[]): MultiPolygon;
    difference(subject: Geom, ...clips: Geom[]): MultiPolygon;
  }

  const polygonClipping: PolygonClipping;
  export default polygonClipping;
}
