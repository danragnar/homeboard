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
