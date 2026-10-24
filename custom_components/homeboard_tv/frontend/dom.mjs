// Patch the static card structure instead of replacing focused DOM elements on
// every live update. The template remains escaped HTML from the card renderer.
function identity(node) {
  if (node.nodeType !== 1) return node.nodeType;
  const action = node.getAttribute('data-action');
  const key = action !== null ? `${action}:${node.getAttribute('data-index') || ''}` : node.hasAttribute('data-tv') ? 'tv-selector' : node.id || '';
  return `${node.localName}:${key}`;
}
function compatible(a,b) { return a && a.nodeType === b.nodeType && identity(a) === identity(b); }
function updateNode(current,next) {
  if (current.nodeType !== 1) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  for (const attr of [...current.attributes]) {
    if (attr.name === 'style' && current.hasAttribute('data-homeboard-fit')) continue;
    if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  }
  for (const attr of [...next.attributes]) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name,attr.value);
  patchChildren(current,next);
}
function patchChildren(parent,nextParent) {
  const nextNodes = [...nextParent.childNodes];
  let current = parent.firstChild;
  nextNodes.forEach((next,index) => {
    if (!compatible(current,next)) {
      const before = [];
      let match = current;
      while (match && !compatible(match,next)) { before.push(match); match=match.nextSibling; }
      if (!match) { parent.insertBefore(next.cloneNode(true),current); return; }
      const future = nextNodes.slice(index+1);
      if (before.every(node => node.nodeType !== 1 || !future.some(wanted => compatible(node,wanted)))) {
        for (const node of before) parent.removeChild(node);
      } else {
        // Reordering configured controls is rare; live text/notice updates keep
        // focused elements in place. The renderer restores focus after a reorder.
        parent.insertBefore(match,current);
      }
      current=match;
    }
    updateNode(current,next); current=current.nextSibling;
  });
  while (current) { const removed = current; current = current.nextSibling; parent.removeChild(removed); }
}
export function patchHTML(root,html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  patchChildren(root,template.content);
}
