/* The record's size and spiral for a song of a given length: a 7-inch (90 mm) up to 40 s,
   12-inch (150 mm) beyond; 45 rpm up to 2 min, 33⅓ beyond; the spiral fills the side, its
   pitch capped at 2 mm. The pet reads the stylus's radius from these, and the vinyl shader
   draws its fake groove band over the same span. No audio is ever cut into anything.
   Runs in the page (window.VinylCore) or Node (require, for the unit tests). */
(function(root){
'use strict';
function parameters(duration){
 const radius=duration<=40?90:150,label=radius===90?27:43,rpm=duration<=120?45:33.3333333333,start=radius-4,lead=.35;
 const turns=duration*rpm/60,fitted=(start-label-3)/(turns+lead+.5),pitch=Math.min(fitted,2);
 return {rpm_cut:rpm,pitch_mm:pitch,r_start_mm:start,disc_radius_mm:radius,label_radius_mm:label,
  amp_mm:Math.min(.30,pitch*.16),groove_width_mm:Math.min(.8,pitch*.5),groove_depth_mm:.45,
  thickness_mm:2.5,duration_sec:duration,lead_in_turns:lead,lead_out_turns:.5};
}
const api={parameters};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VinylCore=api;
})(typeof self!=='undefined'?self:globalThis);
