/**
 * Turns the standee designs (lib/standee.ts) into an editable .pptx in the
 * browser. pptxgenjs is large, so it is imported only here and only when the
 * studio clicks the button: it is never part of the page's own bundle.
 */
import {
  buildStandeeDesigns,
  STANDEE_HEIGHT_IN,
  STANDEE_WIDTH_IN,
  type StandeeContent,
  type StandeeObject,
} from "./standee.ts";

export type StandeeOutput = "blob" | "uint8array";

export async function buildStandeePptx(content: StandeeContent, output: StandeeOutput = "blob"): Promise<Blob | Uint8Array> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "STANDEE_2X5FT", width: STANDEE_WIDTH_IN, height: STANDEE_HEIGHT_IN });
  pptx.layout = "STANDEE_2X5FT";
  pptx.title = `QR standee designs for ${content.eventName}`;
  pptx.company = content.studioName;

  for (const design of buildStandeeDesigns(content)) {
    const slide = pptx.addSlide();
    slide.background = { color: design.background };
    for (const obj of design.objects) addObject(slide, obj);
  }
  return (await pptx.write({ outputType: output })) as Blob | Uint8Array;
}

type Slide = ReturnType<InstanceType<typeof import("pptxgenjs").default>["addSlide"]>;

function addObject(slide: Slide, o: StandeeObject): void {
  if (o.type === "image") {
    slide.addImage({ objectName: o.name, data: o.data, x: o.x, y: o.y, w: o.w, h: o.h, altText: o.name });
    return;
  }
  if (o.type === "shape") {
    slide.addText(o.text ?? "", {
      objectName: o.name,
      shape: o.shape === "roundRect" ? "roundRect" : "rect",
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      ...(o.fill ? { fill: { color: o.fill.color, transparency: o.fill.transparency ?? 0 } } : {}),
      ...(o.line ? { line: { color: o.line.color, width: o.line.width, ...(o.line.dash ? { dashType: o.line.dash } : {}) } } : {}),
      ...(o.rectRadius !== undefined ? { rectRadius: o.rectRadius } : {}),
      align: "center",
      valign: "middle",
      color: o.textColor ?? "000000",
      fontFace: o.fontFace ?? "Arial",
      fontSize: o.fontSize ?? 40,
    });
    return;
  }
  slide.addText(o.text, {
    objectName: o.name,
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    fontFace: o.fontFace,
    fontSize: o.fontSize,
    bold: o.bold ?? false,
    italic: o.italic ?? false,
    color: o.color,
    align: o.align,
    valign: o.valign,
    margin: 0,
    fit: "shrink",
  });
}
