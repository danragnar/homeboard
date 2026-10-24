import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the card's event boundary without Home Assistant or controlling a TV.
globalThis.HTMLElement = class {};
globalThis.customElements = {define(){}};
globalThis.window = {};
const {HomeboardTVCard} = await import('../custom_components/homeboard_tv/frontend/homeboard-tv-card.js');
function fixture() {
 const card=Object.create(HomeboardTVCard.prototype), attrs=new Set();
 const control=(left,top,width=80,height=40)=>({tagName:'BUTTON',classList:{contains:()=>false},getAttribute:()=>null,getBoundingClientRect:()=>({left,top,width,height}),click(){this.clicks=(this.clicks||0)+1;},focus(){card.shadowRoot.activeElement=this;}});
 const controls=[control(0,0),control(100,0),control(0,100),control(100,100),control(0,0,0,0)];
 card._config={keyboard_navigation:true,tv_mode:true};
 card.shadowRoot={activeElement:null,querySelectorAll:()=>controls};
 card.hasAttribute=name=>attrs.has(name);
 card.setAttribute=name=>attrs.add(name);
 card.render=()=>{card.fitted=true;};
 const key=(key,path=[card],extras={})=>{
  const event={key,target:{tagName:'BODY'},composedPath:()=>path,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extras};
  card.navigate(event); return event;
 };
 return {card,controls,key,attrs};
}
test('Arrows enter the card and choose controls in the requested direction',()=>{
 const {card,controls,key}=fixture();
 assert.equal(key('ArrowRight').defaultPrevented,true);
 assert.equal(card.shadowRoot.activeElement,controls[0]);
 key('ArrowRight'); assert.equal(card.shadowRoot.activeElement,controls[1]);
 key('ArrowDown'); assert.equal(card.shadowRoot.activeElement,controls[3]);
 key('ArrowLeft'); assert.equal(card.shadowRoot.activeElement,controls[2]);
 key('ArrowUp'); assert.equal(card.shadowRoot.activeElement,controls[0]);
});
test('Unrelated inputs, dialogs and embedded cards retain their keys',()=>{
 const {card,key}=fixture();
 for(const tagName of ['INPUT','TEXTAREA','SELECT','HA-DIALOG']) assert.equal(key('ArrowDown',[{tagName}]).defaultPrevented,undefined);
 const event={key:'ArrowRight',target:{tagName:'BUTTON'},composedPath:()=>[],preventDefault(){throw Error('Unrelated key intercepted');}};
 card.navigate(event); assert.equal(card.shadowRoot.activeElement,null);
 card.shadowRoot.activeElement={tagName:'TEXTAREA'};
 assert.equal(key('ArrowDown').defaultPrevented,undefined);
});
test('Escape exits edge-to-edge; disabled navigation leaves arrows alone',()=>{
 const {card,key,attrs}=fixture(); attrs.add('edge-to-edge');
 assert.equal(key('Escape').defaultPrevented,true);
 assert.equal(card._exitFullscreen,true); assert.equal(card.fitted,true);
 card._config.keyboard_navigation=false; assert.equal(key('ArrowDown').defaultPrevented,undefined);
});
test('Select first establishes focus, then activates once; holds do not repeat actions',()=>{
 const {card,controls,key}=fixture();
 key('Select'); assert.equal(card.shadowRoot.activeElement,controls[0]); assert.equal(controls[0].clicks,undefined);
 key('Select'); assert.equal(controls[0].clicks,1);
 key('Select',[card],{repeat:true}); assert.equal(controls[0].clicks,1);
 assert.equal(card._activationKey,'Enter');
});
test('Native TV selectors allow left/right to leave and retain native up/down',()=>{
 const {card,controls,key}=fixture(); controls[0].tagName='SELECT';card.shadowRoot.activeElement=controls[0];
 assert.equal(key('ArrowDown').defaultPrevented,undefined);
 key('ArrowRight'); assert.equal(card.shadowRoot.activeElement,controls[1]);
});
test('Full-screen mode takes arrows from covered HA controls, but leaves external dialogs alone',()=>{
 const {card,controls,key,attrs}=fixture(); attrs.add('edge-to-edge');
 key('ArrowRight',[],{target:{tagName:'A'}}); assert.equal(card.shadowRoot.activeElement,controls[0]);
 assert.equal(key('ArrowRight',[{tagName:'HA-DIALOG'}]).defaultPrevented,undefined);
});

function edgeFixture() {
 const card=Object.create(HomeboardTVCard.prototype), attrs=new Map();
 card.isConnected=true;
 card.toggleAttribute=(name,value)=>value?attrs.set(name,''):attrs.delete(name);
 card.setAttribute=(name,value)=>attrs.set(name,value);
 card.removeAttribute=name=>attrs.delete(name);
 card.hasAttribute=name=>attrs.has(name);
 card.matches=()=>Boolean(card.open);
 card.showPopover=()=>{card.opens=(card.opens||0)+1;card.open=true;};
 card.hidePopover=()=>{card.open=false;};
 return {card,attrs};
}
test('Edge-to-edge stays in the top layer across refreshes and restores normal view on exit',()=>{
 const {card,attrs}=edgeFixture();
 card.syncEdgeToEdge(true);
 assert.equal(attrs.get('popover'),'manual'); assert.equal(card.open,true);
 card.syncEdgeToEdge(true); assert.equal(card.opens,1);
 card.syncEdgeToEdge(false);
 assert.equal(card.open,false); assert.equal(attrs.has('popover'),false); assert.equal(attrs.has('edge-to-edge'),false);
});
test('Unsupported or rejected top-layer promotion leaves a visible fixed-position fallback',()=>{
 const {card,attrs}=edgeFixture();
 card.showPopover=()=>{throw new Error('Unsupported receiver');};
 card.syncEdgeToEdge(true);
 assert.equal(attrs.has('edge-to-edge'),true); assert.equal(attrs.has('popover'),false);
 card.showPopover=undefined; card.syncEdgeToEdge(true); assert.equal(attrs.has('popover'),false);
});
test('Other popover owners and disconnected cards are not promoted',()=>{
 const {card,attrs}=edgeFixture();
 attrs.set('popover','auto'); card.syncEdgeToEdge(true);
 assert.equal(attrs.get('popover'),'auto'); assert.equal(card.opens,undefined);
 attrs.delete('popover'); card.isConnected=false; card.syncEdgeToEdge(true);
 assert.equal(card.opens,undefined); assert.equal(attrs.has('popover'),false);
});
