import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationKey,directionalTarget} from '../custom_components/homeboard_tv/frontend/navigation.mjs';
test('TV key aliases and unidentified Android key codes normalize consistently',()=>{
 for(const [key,expected] of [['Select','Enter'],['Accept','Enter'],['NumpadEnter','Enter'],['Up','ArrowUp'],['Spacebar',' ']]) assert.equal(navigationKey({key}),expected);
 assert.equal(navigationKey({key:'Unidentified',keyCode:23}),'Enter');
 assert.equal(navigationKey({key:'Unidentified',keyCode:20}),'ArrowDown');
 assert.equal(navigationKey({key:'b',keyCode:66}),'b');
 assert.equal(navigationKey({key:'BrowserBack'}),'BrowserBack');
});
test('Spatial navigation stays in the row or column before taking a diagonal',()=>{
 const box=(left,top,width=80,height=40)=>({left,top,width,height});
 const from=box(100,100);
 const aligned={el:'aligned',box:box(260,100)}, diagonal={el:'diagonal',box:box(110,170)}, behind={el:'behind',box:box(0,100)};
 assert.equal(directionalTarget(from,[diagonal,behind,aligned],'ArrowRight'),'aligned');
 assert.equal(directionalTarget(from,[aligned],'ArrowLeft'),null);
 assert.equal(directionalTarget(from,[behind,aligned],'ArrowLeft'),'behind');
});
