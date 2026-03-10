window.addEventListener('error', function(e) {
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.bottom = '10px';
  el.style.left = '10px';
  el.style.background = 'red';
  el.style.color = 'white';
  el.style.padding = '10px';
  el.style.zIndex = '999999';
  el.innerHTML = e.message + " at " + e.filename + ":" + e.lineno;
  document.body.appendChild(el);
});
