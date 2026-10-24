// Browser key names vary across Android WebView, Gecko, and remote adapters.
export function navigationKey(event) {
  const aliases = {Up:'ArrowUp',Down:'ArrowDown',Left:'ArrowLeft',Right:'ArrowRight',Select:'Enter',Accept:'Enter',NumpadEnter:'Enter',Spacebar:' '};
  const key = aliases[event.key] || event.key;
  if (key && key !== 'Unidentified') return key;
  return ({13:'Enter',23:'Enter',32:' ',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',19:'ArrowUp',20:'ArrowDown',21:'ArrowLeft',22:'ArrowRight',66:'Enter'})[event.keyCode] || '';
}

export function directionalTarget(from, candidates, key) {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
  const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
  const cx = box => box.left + box.width / 2, cy = box => box.top + box.height / 2;
  return candidates.map(item => {
    const box = item.box;
    const delta = (horizontal ? cx(box)-cx(from) : cy(box)-cy(from)) * sign;
    const crossGap = horizontal ? Math.max(0,box.top-(from.top+from.height),from.top-(box.top+box.height)) : Math.max(0,box.left-(from.left+from.width),from.left-(box.left+box.width));
    const cross = Math.abs(horizontal ? cy(box)-cy(from) : cx(box)-cx(from));
    return {...item,delta,beam:crossGap === 0,score:delta+crossGap*4+cross*.1};
  }).filter(item => item.delta > 1).sort((a,b) => Number(b.beam)-Number(a.beam) || a.score-b.score)[0]?.el || null;
}
