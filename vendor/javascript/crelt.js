// crelt@1.0.7 downloaded from https://ga.jspm.io/npm:crelt@1.0.7/index.js

function e(){var e=arguments[0];typeof e==`string`&&(e=document.createElement(e));var n=1,r=arguments[1];if(r&&typeof r==`object`&&r.nodeType==null&&!Array.isArray(r)){for(var i in r)if(Object.prototype.hasOwnProperty.call(r,i)){var a=r[i];typeof a==`string`?e.setAttribute(i,a):a!=null&&(e[i]=a)}n++}for(;n<arguments.length;n++)t(e,arguments[n]);return e}function t(e,n){if(typeof n==`string`)e.appendChild(document.createTextNode(n));else if(n!=null)if(n.nodeType!=null)e.appendChild(n);else if(Array.isArray(n))for(var r=0;r<n.length;r++)t(e,n[r]);else throw RangeError(`Unsupported child node: `+n)}export{e as default};

