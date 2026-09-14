import { describe, expect, it } from "vitest";
import { mapClearance } from "./map-layout";
const viewport = {top:0,bottom:874,left:0,right:402};
const header = {top:59,bottom:105,left:0,right:402};
const nav = {top:790,bottom:840,left:40,right:362};
describe("map pane clearance from host chrome", () => {
  it("does not apply the phone notch again below a static header", () => {
    expect(mapClearance({...viewport,top:114},[header],[nav],viewport,34)).toEqual({top:0,bottom:84});
  });
  it("clears a floating header when the pane extends behind it", () => {
    expect(mapClearance({...viewport,top:59},[header],[nav],viewport,34)).toEqual({top:46,bottom:84});
  });
  it("does not count a docked navbar already outside the content", () => {
    expect(mapClearance({...viewport,top:114,bottom:780},[header],[nav],viewport,34)).toEqual({top:0,bottom:0});
  });
  it("handles a hidden navbar, keyboard viewport and landscape side panes", () => {
    expect(mapClearance(viewport,[],[],viewport,34).bottom).toBe(34);
    expect(mapClearance(viewport,[],[],{...viewport,bottom:500}).bottom).toBe(374);
    expect(mapClearance({top:0,bottom:874,left:402,right:804},[],[nav],{...viewport,right:804})).toEqual({top:0,bottom:0});
  });
});
