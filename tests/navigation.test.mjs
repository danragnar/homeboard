import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the card's event boundary without Home Assistant or controlling a TV.
globalThis.HTMLElement = class {};
globalThis.customElements = {define(){}};
globalThis.window = {};
const {HomeboardTVCard} = await import('../custom_components/homeboard_tv/frontend/homeboard-tv-card.js');
function fixture() {
 const card=Object.create(HomeboardTVCard.prototype);
 const control=(left,top,width=80,height=40)=>({tagName:'BUTTON',getBoundingClientRect:()=>({left,top,width,height}),focus(){card.shadowRoot.activeElement=this;}});
 const controls=[control(0,0),control(100,0),control(0,100),control(100,100),control(0,0,0,0)];
 card._config={keyboard_navigation:true,tv_mode:true};
 card.shadowRoot={activeElement:null,querySelectorAll:()=>controls};
 card.hasAttribute=name=>name==='edge-to-edge';
 card.render=()=>{card.fitted=true;};
 const key=(key,path=[card])=>{
  const event={key,target:{tagName:'BODY'},composedPath:()=>path,preventDefault(){this.defaultPrevented=true;}};
  card.navigate(event); return event;
 };
 return {card,controls,key};
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
test('Text fields, selects, dialogs and unrelated cards retain their keys',()=>{
 const {card,key}=fixture();
 for(const tagName of ['INPUT','TEXTAREA','SELECT','HA-DIALOG']) assert.equal(key('ArrowDown',[{tagName},card]).defaultPrevented,undefined);
 const event={key:'ArrowRight',target:{tagName:'BUTTON'},composedPath:()=>[],preventDefault(){throw Error('Unrelated key intercepted');}};
 card.navigate(event); assert.equal(card.shadowRoot.activeElement,null);
 card._drawer=true; assert.equal(key('ArrowDown').defaultPrevented,undefined);
});
test('Escape returns from edge-to-edge display and disabled navigation leaves keys alone',()=>{
 const {card,key}=fixture();
 assert.equal(key('Escape').defaultPrevented,true);
 assert.equal(card._exitFullscreen,true); assert.equal(card.fitted,true);
 card._config.keyboard_navigation=false; assert.equal(key('ArrowDown').defaultPrevented,undefined);
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
